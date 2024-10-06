import { Headers } from "@effect/platform"
import { RpcRouter } from "@effect/rpc"
import * as Rpc from "@effect/rpc/Rpc"
import { Schema } from "@effect/schema"
import * as S from "@effect/schema/Schema"
import { Console, Option } from "effect"
import * as Array from "effect/Array"
import * as Chunk from "effect/Chunk"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { flow } from "effect/Function"
import type * as EffectRequest from "effect/Request"
import * as Stream from "effect/Stream"
import { assert, describe, expect, it, test } from "vitest"
import type { ContextMap, ContextMapCustom, ContextMapInverted, GetEffectContext } from "./DynamicMiddleware.js"
import { makeRpcClient } from "./DynamicMiddleware.js"

// TODO: parameterise the Middleware handler and extract to DynamicMiddlware.ts?..
export const makeRpc = <CTXMap extends Record<string, [string, any, S.Schema.Any, any]>>() => {
  return {
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

const RPC = makeRpc<CTXMap>()

export type RequestConfig = {
  /** Disable authentication requirement */
  allowAnonymous?: true
  /// ** Control the roles that are required to access the resource */
  requireRoles?: ReadonlyArray<string>

  /** Enable Magento shop authentication requirement */
  requireMagentoSession?: true
}
const RPClient = makeRpcClient<RequestConfig, CTXMap>({
  allowAnonymous: Unauthenticated,
  requireRoles: Unauthorized,
  requireMagentoSession: Unauthenticated
})

interface Name {
  readonly _: unique symbol
}
const Name = Context.GenericTag<Name, string>("Name")

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

class FailRole extends RPClient.TaggedRequest<FailRole>()("FailRole", {
  name: S.String
}, {
  failure: SomeError,
  success: S.Void,
  requireRoles: ["admin"]
}) {
}

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
  RPC.effect(FailRole, () => Effect.succeed({})),
  Rpc.stream(Counts, () =>
    Stream.make(1, 2, 3, 4, 5).pipe(
      Stream.tap((_) => Effect.sleep(10))
    )),
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
        { _tag: "FailRole", name: "" },
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
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "Unauthorized" } }
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
