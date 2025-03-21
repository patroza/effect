/**
 * @since 1.0.0
 */
import type { Headers } from "@effect/platform/Headers"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { ReadonlyMailbox } from "effect/Mailbox"
import { type Pipeable } from "effect/Pipeable"
import type * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import type { Scope } from "effect/Scope"
import type * as Stream from "effect/Stream"
import * as Rpc from "./Rpc.js"
import type * as RpcMiddleware from "./RpcMiddleware.js"

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@effect/rpc/RpcGroup")

/**
 * @since 1.0.0
 * @category type ids
 */
export type TypeId = typeof TypeId

/**
 * @since 1.0.0
 * @category groups
 */
export interface RpcGroup<in out Rpcs extends Rpc.Any> extends Pipeable {
  new(_: never): {}

  readonly [TypeId]: TypeId
  readonly requests: ReadonlyMap<string, Rpcs>
  readonly annotations: Context.Context<never>

  /**
   * Add one or more procedures to the group.
   */
  add<const Rpcs2 extends ReadonlyArray<Rpc.Any>>(
    ...rpcs: Rpcs2
  ): RpcGroup<Rpcs | Rpcs2[number]>

  /**
   * Merge this group with another group.
   */
  merge<Rpcs2 extends Rpc.Any>(
    that: RpcGroup<Rpcs2>
  ): RpcGroup<Rpcs | Rpcs2>

  /**
   * Add middleware to all the procedures added to the group until this point.
   */
  middleware<M extends RpcMiddleware.TagClassAny>(middleware: M): RpcGroup<Rpc.AddMiddleware<Rpcs, M>>

  /**
   * Implement the handlers for the procedures in this group, returning a
   * context object.
   */
  toHandlersContext<
    Handlers extends HandlersFrom<Rpcs>,
    EX = never,
    RX = never
  >(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ): Effect.Effect<
    Context.Context<Rpc.ToHandler<Rpcs>>,
    EX,
    | RX
    | HandlersContext<Rpcs, Handlers>
  >

  /**
   * Implement the handlers for the procedures in this group.
   */
  toLayer<
    Handlers extends HandlersFrom<Rpcs>,
    EX = never,
    RX = never
  >(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ): Layer.Layer<
    Rpc.ToHandler<Rpcs>,
    EX,
    | Exclude<RX, Scope>
    | HandlersContext<Rpcs, Handlers>
  >

  /**
   * Annotate the group with a value.
   */
  annotate<I, S>(tag: Context.Tag<I, S>, value: S): RpcGroup<Rpcs>

  /**
   * Annotate the Rpc's above this point with a value.
   */
  annotateRpcs<I, S>(tag: Context.Tag<I, S>, value: S): RpcGroup<Rpcs>

  /**
   * Annotate the group with a context object.
   */
  annotateContext<S>(context: Context.Context<S>): RpcGroup<Rpcs>

  /**
   * Annotate the Rpc's above this point with a context object.
   */
  annotateRpcsContext<S>(context: Context.Context<S>): RpcGroup<Rpcs>
}

/**
 * @since 1.0.0
 * @category groups
 */
export type HandlersFrom<Rpc extends Rpc.Any> = {
  readonly [Current in Rpc as Current["_tag"]]: (
    payload: Rpc.Payload<Current>,
    headers: Headers
  ) => ResultFrom<Current> | Rpc.Fork<ResultFrom<Current>>
}

/**
 * @since 1.0.0
 * @category groups
 */
export type ResultFrom<Rpc extends Rpc.Any> = Rpc.Success<Rpc> extends Stream.Stream<infer _A, infer _E, infer _R> ?
    | Stream.Stream<
      _A,
      _E | Rpc.Error<Rpc>,
      any
    >
    | Effect.Effect<ReadonlyMailbox<_A, _E | Rpc.Error<Rpc>>, _E | Rpc.Error<Rpc>, any> :
  Effect.Effect<
    Rpc.Success<Rpc>,
    Rpc.Error<Rpc>,
    any
  >

/**
 * @since 1.0.0
 * @category groups
 */
export type HandlersContext<Rpcs extends Rpc.Any, Handlers> = keyof Handlers extends infer K ?
  K extends keyof Handlers & string ? [Rpc.IsStream<Rpcs, K>] extends [true] ? Handlers[K] extends (...args: any) =>
        | Stream.Stream<infer _A, infer _E, infer _R>
        | Rpc.Fork<Stream.Stream<infer _A, infer _E, infer _R>>
        | Effect.Effect<
          ReadonlyMailbox<infer _A, infer _E>,
          infer _EX,
          infer _R
        >
        | Rpc.Fork<
          Effect.Effect<
            ReadonlyMailbox<infer _A, infer _E>,
            infer _EX,
            infer _R
          >
        > ? Exclude<Rpc.ExcludeProvides<_R, Rpcs, K>, Scope> :
      never :
    Handlers[K] extends (
      ...args: any
    ) => Effect.Effect<infer _A, infer _E, infer _R> | Rpc.Fork<Effect.Effect<infer _A, infer _E, infer _R>> ?
      Rpc.ExcludeProvides<_R, Rpcs, K>
    : never
  : never
  : never

/**
 * @since 1.0.0
 * @category groups
 */
export type Rpcs<Group> = Group extends RpcGroup<infer R> ? R : never

const RpcGroupProto = {
  add(this: RpcGroup<any>, ...rpcs: Array<any>) {
    return makeProto({
      requests: resolveInput(
        ...this.requests.values(),
        ...rpcs
      ),
      annotations: this.annotations
    })
  },
  merge(this: RpcGroup<any>, that: RpcGroup<any>) {
    const requests = new Map(this.requests)
    for (const rpc of that.requests.values()) {
      requests.set(rpc._tag, rpc)
    }
    return makeProto({
      requests,
      annotations: Context.merge(this.annotations, that.annotations)
    })
  },
  middleware(this: RpcGroup<any>, middleware: RpcMiddleware.TagClassAny) {
    const requests = new Map<string, any>()
    for (const [tag, rpc] of this.requests) {
      requests.set(tag, rpc.middleware(middleware))
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  },
  toHandlersContext(this: RpcGroup<any>, build: Effect.Effect<Record<string, (request: any) => any>>) {
    return Effect.gen(this, function*() {
      const context = yield* Effect.context<never>()
      const handlers = Effect.isEffect(build) ? yield* build : build
      const contextMap = new Map<string, unknown>()
      for (const [tag, handler] of Object.entries(handlers)) {
        const rpc = this.requests.get(tag)!
        contextMap.set(rpc.key, {
          handler,
          context
        })
      }
      return Context.unsafeMake(contextMap)
    })
  },
  toLayer(this: RpcGroup<any>, build: Effect.Effect<Record<string, (request: any) => any>>) {
    return Layer.scopedContext(this.toHandlersContext(build))
  },
  annotate(this: RpcGroup<any>, tag: Context.Tag<any, any>, value: any) {
    return makeProto({
      requests: this.requests,
      annotations: Context.add(this.annotations, tag, value)
    })
  },
  annotateRpcs(this: RpcGroup<any>, tag: Context.Tag<any, any>, value: any) {
    return this.annotateRpcsContext(Context.make(tag, value))
  },
  annotateContext(this: RpcGroup<any>, context: Context.Context<any>) {
    return makeProto({
      requests: this.requests,
      annotations: Context.merge(this.annotations, context)
    })
  },
  annotateRpcsContext(this: RpcGroup<any>, context: Context.Context<any>) {
    const requests = new Map<string, any>()
    for (const [tag, rpc] of this.requests) {
      requests.set(tag, rpc.annotateContext(Context.merge(context, rpc.annotations)))
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  }
}

const makeProto = <Rpcs extends Rpc.Any>(options: {
  readonly requests: ReadonlyMap<string, Rpcs>
  readonly annotations: Context.Context<never>
}): RpcGroup<Rpcs> =>
  Object.assign(function() {}, RpcGroupProto, {
    requests: options.requests,
    annotations: options.annotations
  }) as any

const resolveInput = <Rpcs extends ReadonlyArray<Rpc.Any>>(
  ...rpcs: Rpcs
): ReadonlyMap<string, Rpcs[number]> => {
  const requests = new Map<string, Rpcs[number]>()
  for (const rpc of rpcs) {
    requests.set(rpc._tag, Schema.isSchema(rpc) ? Rpc.fromTaggedRequest(rpc as any) : rpc as any)
  }
  return requests
}

/**
 * @since 1.0.0
 * @category groups
 */
export const make = <const Rpcs extends ReadonlyArray<Rpc.Any>>(
  ...rpcs: Rpcs
): RpcGroup<Rpcs[number]> =>
  makeProto({
    requests: resolveInput(...rpcs),
    annotations: Context.empty()
  })
