import { RpcResolver, RpcResolverNoStream, RpcRouter } from "@effect/rpc"
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
import { Console, Layer, Option } from "effect"
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

/**
 * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
 * Unless omitted
 */
export type ContextMapInverted<Key, Service, E> = [Key, Service, E, false]

export class UserProfile extends Effect.Tag("UserProfile")<UserProfile, {
  sub: string
  displayName: string
}>() {
}

// export class MagentoSession extends Effect.Tag("MagentoSession")<MagentoSession, {
//   sessionKey: string
// }>() {
// }

export class Unauthenticated extends Schema.TaggedError<Unauthenticated>("Unauthenticated")("Unauthenticated", {}) {}

export type CTXMap = {
  allowAnonymous: ContextMapInverted<"userProfile", UserProfile, Unauthenticated>
  // magentoSession: ContextMapInverted<"magentoSession", MagentoSession, Unauthenticated>
}
export const makeRpc = () => {
  return {
    // TODO: add error schema to the Request on request creation, make available to the handler, the type and the client
    // taggedRequest,
    effect: <T extends { config?: { allowAnonymous?: true } }, Req extends Schema.TaggedRequest.All, R>(
      schema: T & Schema.Schema<Req, any, never>,
      handler: (
        request: Req
      ) => Effect.Effect<
        EffectRequest.Request.Success<Req>,
        EffectRequest.Request.Error<Req>,
        R
      >
    ) =>
      Rpc.effect<Req, Exclude<R, T["config"] extends { allowAnonymous: true } ? never : UserProfile>>(
        schema,
        (req) =>
          Effect.gen(function*() {
            const headers = yield* Rpc.currentHeaders
            let ctx = Context.empty()
            const authorization = Headers.get("authorization")(headers)
            if (Option.isSome(authorization)) {
              ctx = ctx.pipe(Context.add(UserProfile, { sub: "sub", displayName: "displayName" }))
            } else if ("config" in schema && !schema.config.allowAnonymous) {
              return yield* new Unauthenticated()
            }

            return yield* handler(req).pipe(Effect.provide(ctx))
          }) as any
      )
  }
}

const RPC = makeRpc()

class SomeError extends S.TaggedError<SomeError>()("SomeError", {
  message: S.String
}) {}

class Post extends S.Class<Post>("Post")({
  id: S.Number,
  body: S.String
}) {}

class CreatePost extends S.TaggedRequest<CreatePost>()("CreatePost", {
  failure: S.Never,
  success: Post,
  payload: {
    body: S.String
  }
}) {}

const posts = RpcRouter.make(
  RPC.effect(
    CreatePost,
    ({ body }) =>
      UserProfile.pipe(Effect.andThen(Console.log), Effect.andThen(Effect.succeed(new Post({ id: 1, body }))))
  )
)

class Greet extends S.TaggedRequest<Greet>()("Greet", {
  failure: S.Never,
  success: S.String,
  payload: {
    name: S.String
  }
}) {}

class Fail extends S.TaggedRequest<Fail>()("Fail", {
  failure: SomeError,
  success: S.Void,
  payload: {
    name: S.String
  }
}) {}

class FailNoInput
  extends S.TaggedRequest<FailNoInput>()("FailNoInput", { failure: SomeError, success: S.Void, payload: {} })
{}

class EncodeInput extends S.TaggedRequest<EncodeInput>()("EncodeInput", {
  failure: S.Never,
  success: S.Date,
  payload: {
    date: S.Date
  }
}) {}

class EncodeDate extends S.TaggedRequest<EncodeDate>()("EncodeDate", {
  failure: SomeError,
  success: S.Date,
  payload: {
    date: S.String
  }
}) {}

class Refined extends S.TaggedRequest<Refined>()("Refined", {
  failure: S.Never,
  success: S.Number,
  payload: {
    number: pipe(S.Number, S.int(), S.greaterThan(10))
  }
}) {}

class SpanName extends S.TaggedRequest<SpanName>()("SpanName", { failure: S.Never, success: S.String, payload: {} }) {}

class GetName extends S.TaggedRequest<GetName>()("GetName", { failure: S.Never, success: S.String, payload: {} }) {}

class EchoHeaders extends S.TaggedRequest<EchoHeaders>()("EchoHeaders", {
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
  RPC.effect(Greet, ({ name }) => Effect.succeed(`Hello, ${name}!`)),
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
const handlerArray = (u: ReadonlyArray<unknown>) =>
  handler(u.map((request, i) => ({
    request,
    traceId: "traceId",
    spanId: `spanId${i}`,
    sampled: true,
    headers: { authorization: "bogus" }
  }))).pipe(
    Stream.runCollect,
    Effect.map(flow(
      Array.fromIterable,
      Array.map(([, response]) => response),
      Array.filter((_): _ is S.ExitEncoded<any, any, unknown> => Array.isArray(_) === false)
    ))
  )
const handlerEffectArray = (u: ReadonlyArray<unknown>) =>
  handlerEffect(u.map((request, i) => ({
    request,
    traceId: "traceId",
    spanId: `spanId${i}`,
    sampled: true,
    headers: { authorization: "bogus" }
  }))).pipe(
    Effect.map(Array.filter((_): _ is S.ExitEncoded<any, any, unknown> => Array.isArray(_) === false))
  )
const resolver = RpcResolver.make(handler)<typeof router>()
const resolverEffect = RpcResolverNoStream.make(handlerEffect)<typeof router>()
const resolverWithHeaders = RpcResolver.annotateHeadersEffect(
  resolver,
  Effect.succeed({
    BAZ: "qux"
  })
)
const client = RpcResolver.toClient(resolver)

describe("Router", () => {
  it("handler/", async () => {
    const date = new Date()
    const result = await Effect.runPromise(
      handlerArray([
        { _tag: "Greet", name: "John" },
        { _tag: "Fail", name: "" },
        { _tag: "FailNoInput" },
        { _tag: "EncodeInput", date: date.toISOString() },
        { _tag: "EncodeDate", date: date.toISOString() },
        { _tag: "Refined", number: 11 },
        { _tag: "CreatePost", body: "hello" },
        { _tag: "SpanName" },
        { _tag: "GetName" }
      ])
    )

    assert.deepStrictEqual(result, [{
      _tag: "Success",
      value: "Hello, John!"
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Success",
      value: date.toISOString()
    }, {
      _tag: "Success",
      value: date.toISOString()
    }, {
      _tag: "Success",
      value: 11
    }, {
      _tag: "Success",
      value: {
        id: 1,
        body: "hello"
      }
    }, {
      _tag: "Success",
      value: "Rpc.router SpanName"
    }, {
      _tag: "Success",
      value: "John"
    }])
  })

  it("handlerEffect", async () => {
    const date = new Date()
    const result = await Effect.runPromise(
      handlerEffectArray([
        { _tag: "Greet", name: "John" },
        { _tag: "Fail", name: "" },
        { _tag: "FailNoInput" },
        { _tag: "EncodeInput", date: date.toISOString() },
        { _tag: "EncodeDate", date: date.toISOString() },
        { _tag: "Refined", number: 11 },
        { _tag: "CreatePost", body: "hello" },
        { _tag: "SpanName" },
        { _tag: "GetName" }
      ])
    )

    assert.deepStrictEqual(result, [{
      _tag: "Success",
      value: "Hello, John!"
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Failure",
      cause: { _tag: "Fail", error: { _tag: "SomeError", message: "fail" } }
    }, {
      _tag: "Success",
      value: date.toISOString()
    }, {
      _tag: "Success",
      value: date.toISOString()
    }, {
      _tag: "Success",
      value: 11
    }, {
      _tag: "Success",
      value: {
        id: 1,
        body: "hello"
      }
    }, {
      _tag: "Success",
      value: "Rpc.router SpanName"
    }, {
      _tag: "Success",
      value: "John"
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
