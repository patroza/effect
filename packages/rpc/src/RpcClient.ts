/**
 * @since 1.0.0
 */
import * as Headers from "@effect/platform/Headers"
import * as HttpBody from "@effect/platform/HttpBody"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as Socket from "@effect/platform/Socket"
import * as Transferable from "@effect/platform/Transferable"
import * as Worker from "@effect/platform/Worker"
import type { WorkerError } from "@effect/platform/WorkerError"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Cause from "effect/Cause"
import * as Chunk from "effect/Chunk"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberRef from "effect/FiberRef"
import { constVoid, dual, identity } from "effect/Function"
import { globalValue } from "effect/GlobalValue"
import * as Layer from "effect/Layer"
import * as Mailbox from "effect/Mailbox"
import * as Option from "effect/Option"
import type { ParseError } from "effect/ParseResult"
import * as Pool from "effect/Pool"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type { Span } from "effect/Tracer"
import type { Mutable } from "effect/Types"
import { withRun } from "./internal/utils.js"
import * as Rpc from "./Rpc.js"
import type * as RpcGroup from "./RpcGroup.js"
import type { FromClient, FromClientEncoded, FromServer, FromServerEncoded, Request, RequestId } from "./RpcMessage.js"
import { constPing } from "./RpcMessage.js"
import type * as RpcMiddleware from "./RpcMiddleware.js"
import * as RpcSchema from "./RpcSchema.js"
import * as RpcSerialization from "./RpcSerialization.js"
import * as RpcWorker from "./RpcWorker.js"

/**
 * @since 1.0.0
 * @category client
 */
export type RpcClient<Rpcs extends Rpc.Any, E = never> = {
  readonly [Current in Rpcs as Current["_tag"]]: <const AsMailbox extends boolean = false, const Discard = false>(
    input: Rpc.PayloadConstructor<Current>,
    options?: Rpc.Success<Current> extends Stream.Stream<infer _A, infer _E, infer _R> ? {
        readonly asMailbox?: AsMailbox | undefined
        readonly streamBufferSize?: number | undefined
        readonly headers?: Headers.Input | undefined
        readonly context?: Context.Context<never> | undefined
      } :
      {
        readonly headers?: Headers.Input | undefined
        readonly context?: Context.Context<never> | undefined
        readonly discard?: Discard | undefined
      }
  ) => Rpc.Success<Current> extends Stream.Stream<infer _A, infer _E, infer _R>
    ? AsMailbox extends true ? Effect.Effect<
        Mailbox.ReadonlyMailbox<_A, _E | Rpc.Error<Current> | E>,
        never,
        Scope.Scope
      >
    : Stream.Stream<_A, _E | Rpc.Error<Current> | E>
    : Effect.Effect<
      Discard extends true ? void : Rpc.Success<Current>,
      Discard extends true ? never : Rpc.Error<Current> | E
    >
}

/**
 * @since 1.0.0
 * @category client
 */
export type FromGroup<Group> = RpcClient<RpcGroup.Rpcs<Group>>

/**
 * @since 1.0.0
 * @category client
 */
export const makeNoSerialization: <Rpcs extends Rpc.Any, E>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromClient: (
      options: {
        readonly message: FromClient<Rpcs>
        readonly context: Context.Context<never>
        readonly discard: boolean
      }
    ) => Effect.Effect<void, E>
    readonly supportsAck?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
  }
) => Effect.Effect<
  {
    readonly client: RpcClient<Rpcs, E>
    readonly write: (message: FromServer<Rpcs>) => Effect.Effect<void>
  },
  never,
  Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any, E>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromClient: (
      options: {
        readonly message: FromClient<Rpcs>
        readonly context: Context.Context<never>
        readonly discard: boolean
      }
    ) => Effect.Effect<void, E>
    readonly supportsAck?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
  }
) {
  const spanPrefix = options?.spanPrefix ?? "RpcClient"
  const supportsAck = options?.supportsAck ?? true
  const disableTracing = options?.disableTracing ?? false
  let requestId = BigInt(0)
  const generateRequestId = options.generateRequestId ?? (() => requestId++ as RequestId)

  const context = yield* Effect.context<Rpc.MiddlewareClient<Rpcs> | Scope.Scope>()
  const scope = Context.get(context, Scope.Scope)

  type ClientEntry = {
    readonly _tag: "Effect"
    readonly rpc: Rpc.AnyWithProps
    readonly context: Context.Context<never>
    resume: (_: Exit.Exit<any, any>) => void
  } | {
    readonly _tag: "Mailbox"
    readonly rpc: Rpc.AnyWithProps
    readonly mailbox: Mailbox.Mailbox<any, any>
    readonly scope: Scope.Scope
    readonly context: Context.Context<never>
  }
  const entries = new Map<RequestId, ClientEntry>()

  const clearEntries = Effect.fnUntraced(function*(exit: Exit.Exit<never>) {
    for (const entry of entries.values()) {
      if (entry._tag === "Mailbox") {
        yield* entry.mailbox.done(exit)
      } else {
        entry.resume(exit)
      }
    }
    entries.clear()
  })

  yield* Scope.addFinalizer(
    scope,
    Effect.fiberIdWith((fiberId) => clearEntries(Exit.interrupt(fiberId)))
  )

  const onRequest = (rpc: Rpc.AnyWithProps) => {
    const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
    const middleware = getRpcClientMiddleware(rpc)
    return (payload: any, options?: {
      readonly asMailbox?: boolean | undefined
      readonly streamBufferSize?: number | undefined
      readonly headers?: Headers.Input | undefined
      readonly context?: Context.Context<never> | undefined
      readonly discard?: boolean | undefined
    }) => {
      const headers = options?.headers ? Headers.fromInput(options.headers) : Headers.empty
      if (!isStream) {
        const effect = Effect.useSpan(
          `${spanPrefix}.${rpc._tag}`,
          (span) =>
            onEffectRequest(
              rpc,
              middleware,
              span,
              payload ? rpc.payloadSchema.make(payload) : {},
              headers,
              options?.context ?? Context.empty(),
              options?.discard ?? false
            )
        )
        return disableTracing ? Effect.withTracerEnabled(effect, false) : effect
      }
      const mailbox = Effect.suspend(() =>
        onStreamRequest(
          rpc,
          middleware,
          payload ? rpc.payloadSchema.make(payload) : {},
          headers,
          options?.streamBufferSize ?? 16,
          options?.context ?? Context.empty()
        )
      )
      if (options?.asMailbox) return mailbox
      return Stream.unwrapScoped(Effect.map(mailbox, Mailbox.toStream))
    }
  }

  const onEffectRequest = (
    rpc: Rpc.AnyWithProps,
    middleware: (request: Request<Rpcs>) => Effect.Effect<Request<Rpcs>>,
    span: Span,
    payload: any,
    headers: Headers.Headers,
    context: Context.Context<never>,
    discard: boolean
  ) =>
    Effect.withFiberRuntime<any, any, any>((fiber) => {
      const id = generateRequestId()
      let result: Exit.Exit<any, any> | undefined
      const entry: ClientEntry = {
        _tag: "Effect",
        rpc,
        context,
        resume(_) {
          result = _
        }
      }
      const send = middleware({
        _tag: "Request",
        id,
        tag: rpc._tag as Rpc.Tag<Rpcs>,
        payload,
        traceId: span.traceId,
        spanId: span.spanId,
        sampled: span.sampled,
        headers: Headers.merge(fiber.getFiberRef(currentHeaders), headers)
      })
      if (discard) {
        return Effect.flatMap(send, (message) =>
          options.onFromClient({
            message,
            context,
            discard
          }))
      }
      entries.set(id, entry)
      return send.pipe(
        Effect.flatMap((request) =>
          Effect.fork(options.onFromClient({
            message: request,
            context,
            discard
          }))
        ),
        Effect.flatMap((fiber) =>
          Effect.async<any, any>((resume) => {
            if (result) {
              resume(result)
              return
            }
            entry.resume = resume
            fiber.addObserver((exit) => {
              exit._tag === "Failure" && resume(exit)
            })
          })
        ),
        Effect.onInterrupt(() => {
          entries.delete(id)
          return sendInterrupt(id, context)
        })
      )
    })

  const onStreamRequest = Effect.fnUntraced(function*(
    rpc: Rpc.AnyWithProps,
    middleware: (request: Request<Rpcs>) => Effect.Effect<Request<Rpcs>>,
    payload: any,
    headers: Headers.Headers,
    streamBufferSize: number,
    context: Context.Context<never>
  ) {
    const span = yield* Effect.makeSpanScoped(`${spanPrefix}.${rpc._tag}`).pipe(
      disableTracing ? Effect.withTracerEnabled(false) : identity
    )
    const fiber = Option.getOrThrow(Fiber.getCurrentFiber())
    const id = generateRequestId()

    const scope = Context.unsafeGet(fiber.currentContext, Scope.Scope)
    yield* Scope.addFinalizer(
      scope,
      Effect.suspend(() => {
        if (!entries.has(id)) return Effect.void
        entries.delete(id)
        return sendInterrupt(id, context)
      })
    )

    const mailbox = yield* Mailbox.make<any, any>(streamBufferSize)
    entries.set(id, {
      _tag: "Mailbox",
      rpc,
      mailbox,
      scope,
      context
    })

    yield* middleware({
      _tag: "Request",
      id,
      tag: rpc._tag as Rpc.Tag<Rpcs>,
      traceId: span.traceId,
      payload,
      spanId: span.spanId,
      sampled: span.sampled,
      headers: Headers.merge(fiber.getFiberRef(currentHeaders), headers)
    }).pipe(
      Effect.flatMap(
        (request) =>
          options.onFromClient({
            message: request,
            context,
            discard: false
          })
      ),
      Effect.catchAllCause((error) => mailbox.failCause(error)),
      Effect.interruptible,
      Effect.forkIn(scope)
    )

    return mailbox
  })

  const getRpcClientMiddleware = (rpc: Rpc.AnyWithProps): (request: Request<Rpcs>) => Effect.Effect<Request<Rpcs>> => {
    const middlewares: Array<RpcMiddleware.RpcMiddlewareClient> = []
    for (const tag of rpc.middlewares.values()) {
      const middleware = context.unsafeMap.get(`${tag.key}/Client`)
      if (!middleware) continue
      middlewares.push(middleware)
    }
    return middlewares.length === 0
      ? Effect.succeed
      : function(request) {
        let i = 0
        return Effect.map(
          Effect.whileLoop({
            while: () => i < middlewares.length,
            body: () =>
              middlewares[i]({
                rpc,
                request
              }) as Effect.Effect<Request<Rpcs>>,
            step(nextRequest) {
              request = nextRequest
              i++
            }
          }),
          () => request
        )
      }
  }

  const sendInterrupt = (requestId: RequestId, context: Context.Context<never>): Effect.Effect<void> =>
    options.onFromClient({ message: { _tag: "Interrupt", requestId }, context, discard: false }).pipe(
      Effect.ignore,
      Effect.interruptible,
      Effect.fork,
      Effect.flatMap((fiber) =>
        Effect.async<void>((resume) => {
          fiber.addObserver(resume)
          // on interrupt, apply timeout of 1 second
          return Effect.suspend(() =>
            Effect.flatten(Effect.timeoutTo(Fiber.await(fiber), {
              duration: 1000,
              onSuccess: () => Effect.void,
              onTimeout: () => Fiber.interrupt(fiber)
            }))
          )
        })
      )
    )

  const write = (message: FromServer<Rpcs>): Effect.Effect<void> => {
    switch (message._tag) {
      case "Chunk": {
        const requestId = parseRequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry || entry._tag !== "Mailbox") return Effect.void
        return entry.mailbox.offerAll(message.values).pipe(
          supportsAck
            ? Effect.zipRight(
              options.onFromClient({
                message: { _tag: "Ack", requestId: message.requestId },
                context: entry.context,
                discard: false
              })
            )
            : identity,
          Effect.onError((cause) => entry.mailbox.done(Exit.failCause(cause))),
          Effect.forkIn(entry.scope)
        )
      }
      case "Exit": {
        const requestId = parseRequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry) return Effect.void
        entries.delete(requestId)
        if (entry._tag === "Effect") {
          entry.resume(message.exit)
          return Effect.void
        }
        return entry.mailbox.done(Exit.asVoid(message.exit))
      }
      case "Defect": {
        return clearEntries(Exit.die(message.defect))
      }
      case "ClientEnd": {
        return Effect.void
      }
    }
  }

  const client = {} as Mutable<RpcClient<Rpcs>>
  for (const rpc of group.requests.values()) {
    ;(client as any)[rpc._tag] = onRequest(rpc as any)
  }

  return {
    client: client as RpcClient<Rpcs>,
    write
  } as const
})

/**
 * @since 1.0.0
 * @category client
 */
export const make: <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly spanPrefix?: string | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
  } | undefined
) => Effect.Effect<
  RpcClient<Rpcs>,
  never,
  Protocol | Rpc.Context<Rpcs> | Rpc.MiddlewareClient<Rpcs> | Scope.Scope
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly spanPrefix?: string | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
  } | undefined
) {
  const context = yield* Effect.context<Rpc.Context<Rpcs>>()
  const { run, send, supportsAck, supportsTransferables } = yield* Protocol

  type ClientEntry = {
    readonly rpc: Rpc.AnyWithProps
    readonly decodeChunk:
      | ((chunk: ReadonlyArray<unknown>) => Effect.Effect<NonEmptyReadonlyArray<any>, ParseError, unknown>)
      | undefined
  }
  const entries = new Map<RequestId, ClientEntry>()

  const { client, write } = yield* makeNoSerialization(group, {
    ...options,
    supportsAck,
    onFromClient({ message }) {
      switch (message._tag) {
        case "Request": {
          const rpc = group.requests.get(message.tag)! as any as Rpc.AnyWithProps
          const schemas = RpcSchema.getStreamSchemas(rpc.successSchema.ast)
          const collector = supportsTransferables ? Transferable.unsafeMakeCollector() : undefined
          const entry: ClientEntry = {
            rpc,
            decodeChunk: Option.isSome(schemas)
              ? Schema.decodeUnknown(Schema.NonEmptyArray(schemas.value.success))
              : undefined
          }
          entries.set(message.id, entry)
          return Schema.encode(rpc.payloadSchema)(message.payload).pipe(
            Effect.locally(
              FiberRef.currentContext,
              collector ? Context.add(context, Transferable.Collector, collector) : context
            ),
            Effect.orDie,
            Effect.flatMap((payload) =>
              send({
                ...message,
                payload,
                headers: Object.entries(message.headers)
              }, collector && collector.unsafeClear())
            )
          ) as Effect.Effect<void>
        }
        case "Ack": {
          const entry = entries.get(message.requestId)
          if (!entry) return Effect.void
          return send(message) as Effect.Effect<void>
        }
        case "Interrupt": {
          const entry = entries.get(message.requestId)
          if (!entry) return Effect.void
          entries.delete(message.requestId)
          return send(message) as Effect.Effect<void>
        }
        case "Eof": {
          return Effect.void
        }
      }
    }
  })

  yield* run((message) => {
    switch (message._tag) {
      case "Chunk": {
        const requestId = parseRequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry || !entry.decodeChunk) return Effect.void
        return entry.decodeChunk(message.values).pipe(
          Effect.locally(FiberRef.currentContext, context),
          Effect.orDie,
          Effect.flatMap((chunk) =>
            write({ _tag: "Chunk", clientId: 0, requestId: parseRequestId(message.requestId), values: chunk })
          ),
          Effect.onError((cause) =>
            write({
              _tag: "Exit",
              clientId: 0,
              requestId: parseRequestId(message.requestId),
              exit: Exit.failCause(cause)
            })
          )
        ) as Effect.Effect<void>
      }
      case "Exit": {
        const requestId = parseRequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry) return Effect.void
        entries.delete(requestId)
        return Schema.decode(Rpc.exitSchema(entry.rpc as any))(message.exit).pipe(
          Effect.locally(FiberRef.currentContext, context),
          Effect.orDie,
          Effect.matchCauseEffect({
            onSuccess: (exit) => write({ _tag: "Exit", clientId: 0, requestId, exit }),
            onFailure: (cause) => write({ _tag: "Exit", clientId: 0, requestId, exit: Exit.failCause(cause) })
          })
        ) as Effect.Effect<void>
      }
      case "Defect": {
        return write({ _tag: "Defect", clientId: 0, defect: decodeDefect(message.defect) })
      }
      default: {
        return Effect.void
      }
    }
  }).pipe(
    Effect.catchAllCause(Effect.logError),
    Effect.interruptible,
    Effect.forkScoped
  )

  return client
})

const parseRequestId = (input: string | bigint): RequestId => typeof input === "string" ? BigInt(input) : input as any

/**
 * @since 1.0.0
 * @category headers
 */
export const currentHeaders: FiberRef.FiberRef<Headers.Headers> = globalValue(
  "@effect/rpc/RpcClient/currentHeaders",
  () => FiberRef.unsafeMake(Headers.empty)
)

/**
 * @since 1.0.0
 * @category headers
 */
export const withHeaders: {
  (headers: Headers.Input): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, headers: Headers.Input): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, headers: Headers.Input): Effect.Effect<A, E, R> =>
    Effect.locallyWith(effect, currentHeaders, Headers.merge(Headers.fromInput(headers)))
)

/**
 * @since 1.0.0
 * @category headers
 */
export const withHeadersEffect: {
  <E2, R2>(
    headers: Effect.Effect<Headers.Input, E2, R2>
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, E2, R2>(
    effect: Effect.Effect<A, E, R>,
    headers: Effect.Effect<Headers.Input, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, E2, R2>(
    effect: Effect.Effect<A, E, R>,
    headers: Effect.Effect<Headers.Input, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> => Effect.flatMap(headers, (headers) => withHeaders(effect, headers))
)

/**
 * @since 1.0.0
 * @category protocol
 */
export class Protocol extends Context.Tag("@effect/rpc/RpcClient/Protocol")<Protocol, {
  readonly run: (
    f: (data: FromServerEncoded) => Effect.Effect<void>
  ) => Effect.Effect<never>
  readonly send: (
    request: FromClientEncoded,
    transferables?: ReadonlyArray<globalThis.Transferable>
  ) => Effect.Effect<void>
  readonly supportsAck: boolean
  readonly supportsTransferables: boolean
}>() {
  /**
   * @since 1.0.0
   */
  static make = withRun<Protocol["Type"]>()
}

/**
 * @since 1.0.0
 * @category protocol
 */
export const makeProtocolHttp = (client: HttpClient.HttpClient): Effect.Effect<
  Protocol["Type"],
  never,
  RpcSerialization.RpcSerialization
> =>
  Protocol.make(Effect.fnUntraced(function*(writeResponse) {
    const serialization = yield* RpcSerialization.RpcSerialization

    const send = (request: FromClientEncoded): Effect.Effect<void> => {
      if (request._tag !== "Request") {
        return Effect.void
      }

      const parser = serialization.unsafeMake()
      if (!serialization.supportsBigInt) transformBigInt(request)

      const encoded = parser.encode(request)
      const body = typeof encoded === "string" ?
        HttpBody.text(encoded, serialization.contentType) :
        HttpBody.uint8Array(encoded, serialization.contentType)

      return client.post("/", { body }).pipe(
        Effect.flatMap((r) =>
          Stream.runForEachChunk(r.stream, (chunk) => {
            const responses = Chunk.toReadonlyArray(chunk).flatMap(parser.decode) as Array<FromServerEncoded>
            if (responses.length === 0) return Effect.void
            let i = 0
            return Effect.whileLoop({
              while: () => i < responses.length,
              body: () => writeResponse(responses[i++]),
              step: constVoid
            })
          })
        ),
        Effect.scoped,
        Effect.orDie
      )
    }

    return {
      send,
      supportsAck: false,
      supportsTransferables: false
    }
  }))

/**
 * @since 1.0.0
 * @category protocol
 */
export const layerProtocolHttp = (options: {
  readonly url: string
  readonly transformClient?: <E, R>(client: HttpClient.HttpClient.With<E, R>) => HttpClient.HttpClient.With<E, R>
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpClient.HttpClient> =>
  Layer.scoped(
    Protocol,
    Effect.flatMap(
      HttpClient.HttpClient,
      (client) => {
        client = HttpClient.mapRequest(client, HttpClientRequest.prependUrl(options.url))
        return makeProtocolHttp(options.transformClient ? options.transformClient(client) : client)
      }
    )
  )

/**
 * @since 1.0.0
 * @category protocol
 */
export const makeProtocolSocket: Effect.Effect<
  Protocol["Type"],
  never,
  Scope.Scope | RpcSerialization.RpcSerialization | Socket.Socket
> = Protocol.make(Effect.fnUntraced(function*(writeResponse) {
  const socket = yield* Socket.Socket
  const serialization = yield* RpcSerialization.RpcSerialization

  const write = yield* socket.writer

  let parser = serialization.unsafeMake()

  yield* Effect.suspend(() => {
    parser = serialization.unsafeMake()
    return socket.runRaw((message) => {
      try {
        const responses = parser.decode(message) as Array<FromServerEncoded>
        if (responses.length === 0) return
        let i = 0
        return Effect.whileLoop({
          while: () => i < responses.length,
          body: () => writeResponse(responses[i++]),
          step: constVoid
        })
      } catch (defect) {
        return writeResponse({ _tag: "Defect", defect })
      }
    })
  }).pipe(
    Effect.zipRight(Effect.fail(
      new Socket.SocketCloseError({
        reason: "Close",
        code: 1000
      })
    )),
    Effect.tapErrorCause((cause) => writeResponse({ _tag: "Defect", defect: Cause.squash(cause) })),
    Effect.retry(Schedule.spaced(1000)),
    Effect.annotateLogs({
      module: "RpcClient",
      method: "makeProtocolSocket"
    }),
    Effect.interruptible,
    Effect.forkScoped
  )

  yield* Effect.suspend(() => write(parser.encode(constPing))).pipe(
    Effect.delay("30 seconds"),
    Effect.ignore,
    Effect.forever,
    Effect.interruptible,
    Effect.forkScoped
  )

  return {
    send(request) {
      if (!serialization.supportsBigInt) transformBigInt(request)
      return Effect.orDie(write(parser.encode(request)))
    },
    supportsAck: true,
    supportsTransferables: false
  }
}))

/**
 * @since 1.0.0
 * @category protocol
 */
export const makeProtocolWorker = (
  options: {
    readonly size: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
  } | {
    readonly minSize: number
    readonly maxSize: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
    readonly timeToLive: Duration.DurationInput
  }
): Effect.Effect<
  Protocol["Type"],
  WorkerError,
  Scope.Scope | Worker.PlatformWorker | Worker.Spawner
> =>
  Protocol.make(Effect.fnUntraced(function*(writeResponse) {
    const worker = yield* Worker.PlatformWorker
    const scope = yield* Effect.scope
    let workerId = 0
    const initialMessage = yield* Effect.serviceOption(RpcWorker.InitialMessage)

    const entries = new Map<string | bigint, {
      readonly worker: Worker.BackingWorker<FromClientEncoded | RpcWorker.InitialMessage.Encoded, FromServerEncoded>
      readonly scope: Scope.CloseableScope
    }>()

    yield* Scope.addFinalizerExit(
      scope,
      (exit) =>
        Effect.forEach(entries, ([_, entry]) => Scope.close(entry.scope, exit), {
          discard: true,
          concurrency: "unbounded"
        })
    )

    const acquire = Effect.gen(function*() {
      const id = workerId++
      const backing = yield* worker.spawn<FromClientEncoded | RpcWorker.InitialMessage.Encoded, FromServerEncoded>(id)
      const readyLatch = yield* Effect.makeLatch()

      yield* backing.run((message) => {
        if (message[0] === 0) {
          return readyLatch.open
        }
        const response = message[1]
        if (response._tag === "Exit") {
          const entry = entries.get(response.requestId)
          if (entry) {
            entries.delete(response.requestId)
            return Effect.ensuring(writeResponse(response), Scope.close(entry.scope, Exit.void))
          }
        } else if (response._tag === "Defect") {
          return Effect.zipRight(
            Effect.forEach(entries, ([requestId, entry]) => {
              entries.delete(requestId)
              return Scope.close(entry.scope, Exit.die(response.defect))
            }, { discard: true }),
            writeResponse(response)
          )
        }
        return writeResponse(response)
      }).pipe(
        Effect.tapErrorCause((cause) => writeResponse({ _tag: "Defect", defect: Cause.squash(cause) })),
        Effect.retry(Schedule.spaced(1000)),
        Effect.annotateLogs({
          module: "RpcClient",
          method: "makeProtocolWorker"
        }),
        Effect.interruptible,
        Effect.forkScoped
      )

      yield* readyLatch.await

      if (Option.isSome(initialMessage)) {
        const [value, transfers] = yield* initialMessage.value
        yield* backing.send({ _tag: "InitialMessage", value }, transfers)
      }

      return backing
    })

    const pool = "minSize" in options ?
      yield* Pool.makeWithTTL({
        acquire,
        min: options.minSize,
        max: options.maxSize,
        concurrency: options.concurrency,
        targetUtilization: options.targetUtilization,
        timeToLive: options.timeToLive
      }) :
      yield* Pool.make({
        acquire,
        size: options.size,
        concurrency: options.concurrency,
        targetUtilization: options.targetUtilization
      })

    const send = (request: FromClientEncoded, transferables?: ReadonlyArray<globalThis.Transferable>) => {
      switch (request._tag) {
        case "Request": {
          return Scope.make().pipe(
            Effect.flatMap((scope) =>
              Effect.flatMap(Scope.extend(pool.get, scope), (worker) => {
                entries.set(request.id, { worker, scope })
                return Effect.orDie(worker.send(request, transferables))
              })
            ),
            Effect.orDie
          )
        }
        case "Interrupt": {
          const entry = entries.get(request.requestId)
          if (!entry) return Effect.void
          entries.delete(request.requestId)
          return Effect.ensuring(
            Effect.orDie(entry.worker.send(request)),
            Scope.close(entry.scope, Exit.void)
          )
        }
        case "Ack": {
          const entry = entries.get(request.requestId)
          if (!entry) return Effect.void
          return Effect.orDie(entry.worker.send(request))
        }
      }
      return Effect.void
    }

    yield* Effect.scoped(pool.get)

    return {
      send,
      supportsAck: true,
      supportsTransferables: true
    }
  }))

/**
 * @since 1.0.0
 * @category protocol
 */
export const layerProtocolWorker = (
  options: {
    readonly size: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
  } | {
    readonly minSize: number
    readonly maxSize: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
    readonly timeToLive: Duration.DurationInput
  }
): Layer.Layer<Protocol, WorkerError, Worker.PlatformWorker | Worker.Spawner> =>
  Layer.scoped(Protocol, makeProtocolWorker(options))

/**
 * @since 1.0.0
 * @category protocol
 */
export const layerProtocolSocket: Layer.Layer<Protocol, never, Socket.Socket | RpcSerialization.RpcSerialization> =
  Layer.scoped(Protocol, makeProtocolSocket)

// internal

const decodeDefect = Schema.decodeSync(Schema.Defect)

const transformBigInt = (request: FromClientEncoded) => {
  if (request._tag === "Request") {
    ;(request as any).id = request.id.toString()
  } else if ("requestId" in request) {
    ;(request as any).requestId = request.requestId.toString()
  }
}
