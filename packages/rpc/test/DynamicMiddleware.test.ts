import { RpcRouter } from "@effect/rpc"
import * as Rpc from "@effect/rpc/Rpc"
import { Schema } from "@effect/schema"
import * as S from "@effect/schema/Schema"
import * as Array from "effect/Array"
import * as Chunk from "effect/Chunk"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { flow, pipe } from "effect/Function"
import * as Stream from "effect/Stream"
import { assert, describe, expect, it, test } from "vitest"

import { Headers } from "@effect/platform"
import { Console, Option } from "effect"
import type * as EffectRequest from "effect/Request"

interface Name {
  readonly _: unique symbol
}
const Name = Context.GenericTag<Name, string>("Name")

/**
 * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
 * Unless configured as `true`
 */
export type ContextMap<Key, Service, E> = [Key, Service, E, true]

export type ContextMapCustom<Key, Service, E, Custom> = [Key, Service, E, Custom]

/**
 * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
 * Unless omitted
 */
export type ContextMapInverted<Key, Service, E> = [Key, Service, E, false]

export class UserProfile extends Effect.Tag("UserProfile")<UserProfile, {
  sub: string
  displayName: string
  roles: ReadonlyArray<string>
}>() {
}

export class MagentoSession extends Effect.Tag("MagentoSession")<MagentoSession, {
  sessionKey: string
}>() {
}

export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", { message: S.String }) {}

export class Unauthorized extends Schema.TaggedError<Unauthenticated>()("Unauthorized", {}) {}

export type CTXMap = {
  allowAnonymous: ContextMapInverted<"userProfile", UserProfile, typeof Unauthenticated>
  requireMagentoSession: ContextMap<"magentoSession", MagentoSession, typeof Unauthenticated>
  // TODO: not boolean but `string[]`
  requireRoles: ContextMapCustom<"", void, typeof Unauthorized, Array<string>>
}

type Values<T extends Record<any, any>> = T[keyof T]

export type GetEffectContext<CTXMap extends Record<string, [string, any, S.Schema.All, any]>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
>
export type ValuesOrNeverSchema<T extends Record<any, any>> = Values<T> extends never ? typeof S.Never : Values<T>
export type GetEffectError<CTXMap extends Record<string, [string, any, S.Schema.All, any]>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
>

export type RequestConfig = {
  /** Disable authentication requirement */
  allowAnonymous?: true
  /// ** Control the roles that are required to access the resource */
  requireRoles?: ReadonlyArray<string>

  /** Enable Magento shop authentication requirement */
  requireMagentoSession?: true
}

type GetFailure1<F1> = F1 extends S.Schema.Any ? F1 : typeof S.Never
type GetFailure<F1, F2> = F1 extends S.Schema.Any ? F2 extends S.Schema.Any ? S.Union<[F1, F2]> : F1 : F2

export const makeRpcClient = <
  RequestConfig extends object,
  CTXMap extends Record<string, [string, any, S.Schema.All, any]>
>(
  errors: { [K in keyof CTXMap]: S.Schema.Any }
) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc...
  type Context = { success: S.Schema.Any; failure: S.Schema.Any }
  function TaggedRequest<Self>(): {
    <Tag extends string, Payload extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof config["success"],
        GetEffectError<CTXMap, C> extends never ? typeof config["failure"] :
          GetFailure<typeof config["failure"], GetEffectError<CTXMap, C>>
      > // typeof config["failure"]
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { success: S.Schema.Any }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof config["success"],
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { failure: S.Schema.Any }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
      tag: Tag,
      fields: Payload,
      config: C & RequestConfig
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        GetFailure1<GetEffectError<CTXMap, C>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields>(
      tag: Tag,
      fields: Payload
    ): S.TaggedRequestClass<
      Self,
      Tag,
      { readonly _tag: S.tag<Tag> } & Payload,
      typeof S.Void,
      typeof S.Never
    >
  } {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(errors)
    return (<Tag extends string, Fields extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Fields,
      config?: C
    ) => {
      const req = S.TaggedRequest<Self>()(tag, {
        payload: fields,
        failure: merge(config?.failure, errorSchemas),
        success: config?.success ?? S.Void
      })
      const req2 = Object.assign(req, { config })
      return req2
    }) as any
  }

  return {
    TaggedRequest
  }
}

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union(a, ...b) : a !== undefined ? a : b.length ? S.Union(...b) : S.Never

const RPClient = makeRpcClient<RequestConfig, CTXMap>({
  allowAnonymous: Unauthenticated,
  requireRoles: Unauthorized,
  requireMagentoSession: Unauthenticated
})

export const makeRpc = <CTXMap extends Record<string, [string, any, S.Schema.Any, any]>>() => {
  return {
    // TODO: add error schema to the Request on request creation, make available to the handler, the type and the client
    /** @deprecated use RPClient.TaggedRequest */
    TaggedRequest: S.TaggedRequest,
    effect: <T extends { config?: { [K in keyof CTXMap]?: any } }, Req extends Schema.TaggedRequest.All, R>(
      schema: T & Schema.Schema<Req, any, never>,
      handler: (
        request: Req
      ) => Effect.Effect<
        EffectRequest.Request.Success<Req>,
        EffectRequest.Request.Error<Req>,
        R
      >
    ) =>
      Rpc.effect<Req, Exclude<R, GetEffectContext<CTXMap, T["config"]>>>(
        schema,
        (req) =>
          Effect.gen(function*() {
            const headers = yield* Rpc.currentHeaders
            let ctx = Context.empty()

            const config = "config" in schema ? schema.config : undefined

            let userProfile: Context.Tag.Service<UserProfile> | undefined
            const authorization = Headers.get("authorization")(headers)
            if (Option.isSome(authorization) && authorization.value === "bogus") {
              const up = { sub: "id", displayName: "Jan", roles: ["user"] }
              userProfile = up
              ctx = ctx.pipe(Context.add(UserProfile, up))
            } else if (config && !config.allowAnonymous) {
              return yield* new Unauthenticated({ message: "no auth" })
            }

            // actually comes from cookie in http
            const phpsessid = Headers.get("x-magento-id")(headers)
            if (Option.isSome(phpsessid)) {
              ctx = ctx.pipe(Context.add(MagentoSession, { sessionKey: phpsessid.value }))
            } else if (config && config.requireMagentoSession) {
              return yield* new Unauthenticated({ message: "no phpid" })
            }

            if (config?.requireRoles) {
              // TODO
              if (
                !userProfile || !(config.requireRoles as any).every((role: any) => userProfile.roles.includes(role))
              ) {
                return yield* new Unauthorized({})
              }
            }

            return yield* handler(req).pipe(Effect.provide(ctx))
          }) as any
      )
  }
}

const RPC = makeRpc<CTXMap>()

class SomeError extends S.TaggedError<SomeError>()("SomeError", {
  message: S.String
}) {}

class Post extends S.Class<Post>("Post")({
  id: S.Number,
  body: S.String
}) {}

class CreatePost extends RPClient.TaggedRequest<CreatePost>()("CreatePost", {
  body: S.String
}, {
  success: Post
}) {}

const posts = RpcRouter.make(
  RPC.effect(
    CreatePost,
    ({ body }) =>
      UserProfile.use(Console.log)
        .pipe(Effect.andThen(Effect.succeed(new Post({ id: 1, body }))))
  )
)

class Greet extends RPClient.TaggedRequest<Greet>()("Greet", {
  name: S.String
}, {
  allowAnonymous: true,
  failure: S.Never,
  success: S.String
}) {}

class Fail extends RPClient.TaggedRequest<Fail>()("Fail", {
  name: S.String
}, {
  failure: SomeError,
  success: S.Void,
  allowAnonymous: true,
  requireMagentoSession: true
}) {
}

class FailNoInput
  extends RPC.TaggedRequest<FailNoInput>()("FailNoInput", { failure: SomeError, success: S.Void, payload: {} })
{}

class EncodeInput extends RPC.TaggedRequest<EncodeInput>()("EncodeInput", {
  failure: S.Never,
  success: S.Date,
  payload: {
    date: S.Date
  }
}) {}

class EncodeDate extends RPC.TaggedRequest<EncodeDate>()("EncodeDate", {
  failure: SomeError,
  success: S.Date,
  payload: {
    date: S.String
  }
}) {}

class Refined extends RPC.TaggedRequest<Refined>()("Refined", {
  failure: S.Never,
  success: S.Number,
  payload: {
    number: pipe(S.Number, S.int(), S.greaterThan(10))
  }
}) {}

class SpanName
  extends RPC.TaggedRequest<SpanName>()("SpanName", { failure: S.Never, success: S.String, payload: {} })
{}

class GetName extends RPC.TaggedRequest<GetName>()("GetName", { failure: S.Never, success: S.String, payload: {} }) {}

class EchoHeaders extends RPC.TaggedRequest<EchoHeaders>()("EchoHeaders", {
  failure: S.Never,
  success: S.Record({ key: S.String, value: S.Union(S.String, S.Undefined) }),
  payload: {}
}) {}

class Counts extends Rpc.StreamRequest<Counts>()(
  "Counts",
  { failure: S.Never, success: S.Number, payload: {} }
) {}

class FailStream extends Rpc.StreamRequest<FailStream>()(
  "FailStream",
  { failure: SomeError, success: S.Number, payload: {} }
) {}

const router = RpcRouter.make(
  posts,
  RPC.effect(
    Greet,
    ({ name }) =>
      Effect.all({ up: Effect.serviceOption(UserProfile), ms: Effect.serviceOption(MagentoSession) }).pipe(
        Effect.andThen(({ ms, up }) =>
          Effect.succeed(
            `Hello, ${name} (${Option.map(up, (u) => u.displayName).pipe(Option.getOrElse(() => "not logged in"))}, ${
              Option.map(ms, (u) => u.sessionKey).pipe(Option.getOrElse(() => "no magento session"))
            })!`
          )
        )
      )
  ),
  RPC.effect(Fail, () =>
    new SomeError({
      message: "fail"
    })),
  RPC.effect(FailNoInput, () => new SomeError({ message: "fail" })),
  RPC.effect(EncodeInput, ({ date }) => Effect.succeed(date)),
  RPC.effect(EncodeDate, ({ date }) =>
    Effect.try({
      try: () => new Date(date),
      catch: () => new SomeError({ message: "fail" })
    })),
  RPC.effect(Refined, ({ number }) => Effect.succeed(number)),
  RPC.effect(SpanName, () =>
    Effect.currentSpan.pipe(
      Effect.map((span) => span.name),
      Effect.orDie
    )),
  RPC.effect(GetName, () => Name),
  Rpc.stream(Counts, () =>
    Stream.make(1, 2, 3, 4, 5).pipe(
      Stream.tap((_) => Effect.sleep(10))
    )),
  RPC.effect(EchoHeaders, () =>
    Rpc.schemaHeaders(S.Struct({
      foo: Schema.String,
      baz: Schema.optional(Schema.String)
    })).pipe(Effect.orDie)),
  Rpc.stream(FailStream, () =>
    Stream.range(0, 10).pipe(
      Stream.mapEffect((i) => i === 3 ? Effect.fail(new SomeError({ message: "fail" })) : Effect.succeed(i))
    ))
).pipe(
  RpcRouter.provideService(Name, "John")
)

const handler = RpcRouter.toHandler(router)
const handlerEffect = RpcRouter.toHandlerNoStream(router)
const handlerUndecoded = RpcRouter.toHandlerUndecoded(router)
const handlerArray = (
  u: ReadonlyArray<unknown>,
  headers: Record<string, string> = { authorization: "bogus", "x-magento-id": "some-magento-id" }
) =>
  handler(u.map((request, i) => ({
    request,
    traceId: "traceId",
    spanId: `spanId${i}`,
    sampled: true,
    headers
  }))).pipe(
    Stream.runCollect,
    Effect.map(flow(
      Array.fromIterable,
      Array.map(([, response]) => response),
      Array.filter((_): _ is S.ExitEncoded<any, any, unknown> => Array.isArray(_) === false)
    ))
  )
const handlerEffectArray = (
  u: ReadonlyArray<unknown>,
  headers: Record<string, string> = { authorization: "bogus", "x-magento-id": "some-magento-id" }
) =>
  handlerEffect(u.map((request, i) => ({
    request,
    traceId: "traceId",
    spanId: `spanId${i}`,
    sampled: true,
    headers
  }))).pipe(
    Effect.map(Array.filter((_): _ is S.ExitEncoded<any, any, unknown> => Array.isArray(_) === false))
  )
// const resolver = RpcResolver.make(handler)<typeof router>()
// const resolverEffect = RpcResolverNoStream.make(handlerEffect)<typeof router>()
// const resolverWithHeaders = RpcResolver.annotateHeadersEffect(
//   resolver,
//   Effect.succeed({
//     BAZ: "qux"
//   })
// )
// const client = RpcResolver.toClient(resolver)

describe("Router", () => {
  it("handler/", async () => {
    const result = await Effect.runPromise(
      handlerArray([
        { _tag: "Greet", name: "John" },
        { _tag: "Fail", name: "" },
        { _tag: "CreatePost", body: "hello" }
      ])
    )

    assert.deepStrictEqual(result, [{
      _tag: "Success",
      value: "Hello, John (Jan, some-magento-id)!"
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Success",
      value: {
        id: 1,
        body: "hello"
      }
    }])
  })

  it("handlerEffect", async () => {
    const result = await Effect.runPromise(
      handlerEffectArray([
        { _tag: "Greet", name: "John" },
        { _tag: "Fail", name: "" },
        { _tag: "CreatePost", body: "hello" }
      ])
    )

    assert.deepStrictEqual(result, [{
      _tag: "Success",
      value: "Hello, John (Jan, some-magento-id)!"
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Success",
      value: {
        id: 1,
        body: "hello"
      }
    }])
  })

  it("handlerEffect no headers", async () => {
    const result = await Effect.runPromise(
      handlerEffectArray([
        { _tag: "Greet", name: "John" },
        { _tag: "Fail", name: "" },
        { _tag: "CreatePost", body: "hello" }
      ], {})
    )

    assert.deepStrictEqual(result, [{
      _tag: "Success",
      value: "Hello, John (not logged in, no magento session)!"
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "Unauthenticated", message: "no phpid" } }
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "Unauthenticated", message: "no auth" } }
    }])
  })

  it("stream", async () => {
    const result = await Effect.runPromise(
      handler([{
        request: { _tag: "Counts" },
        traceId: "traceId",
        spanId: "spanId",
        sampled: true,
        headers: {}
      }]).pipe(
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray)
      )
    )
    expect(result.length).toEqual(6)
    assert.deepStrictEqual(result, [
      [0, [{ _tag: "Success", value: 1 }]],
      [0, [{ _tag: "Success", value: 2 }]],
      [0, [{ _tag: "Success", value: 3 }]],
      [0, [{ _tag: "Success", value: 4 }]],
      [0, [{ _tag: "Success", value: 5 }]],
      [0, [{ _tag: "Failure", cause: { _tag: "Empty" } }]]
    ])
  })

  it("handlerEffect/ stream", async () => {
    const result = await Effect.runPromise(
      handlerEffect([{
        request: { _tag: "Counts" },
        traceId: "traceId",
        spanId: "spanId",
        sampled: true,
        headers: {}
      }])
    )
    assert.deepStrictEqual(result, [[
      { _tag: "Success", value: 1 },
      { _tag: "Success", value: 2 },
      { _tag: "Success", value: 3 },
      { _tag: "Success", value: 4 },
      { _tag: "Success", value: 5 }
    ]])
  })

  test("handlerUndecoded", () =>
    Effect.gen(function*(_) {
      const result = yield* _(
        handlerUndecoded(new CreatePost({ body: "hello" })),
        Rpc.annotateHeaders({ authorization: "bogus" })
      )
      assert.deepStrictEqual(result, {
        id: 1,
        body: "hello"
      })
    }).pipe(Effect.runPromise))
})
