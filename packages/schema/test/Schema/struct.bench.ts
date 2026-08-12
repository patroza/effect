import * as S from "@effect/schema/Schema"
import { Context, Duration, Effect, Exit, Layer, pipe, ReadonlyArray, Request, RequestResolver } from "effect"
import { bench, describe } from "vitest"

class a extends S.Class<a>()({
  id: S.string,
  a: S.number
}) {}

const makeUser = (id: string) => Effect.sync(() => new a({ id, a: 1 }))
const testItems = ReadonlyArray.replicate({ a: "a", b: 2 }, 5000)

const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    Request.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)

interface GetUserById extends Request.Request<a, never> {
  readonly _tag: "GetUserById"
  readonly id: string
}
const GetUserById = Request.tagged<GetUserById>("GetUserById")

const getUserByIdResolver = RequestResolver
  .make<GetUserById, never>((requests) =>
    pipe(
      requests.flat(),
      Effect.forEach(
        (r) => {
          return makeUser(r.id).pipe(
            Effect.exit,
            Effect.andThen((_) =>
              Request.complete(
                r,
                _
              )
            )
          )
        },
        { discard: true }
      )
    )
  )
  .pipe(
    RequestResolver.batchN(25)
  )

class resolver extends Context.Tag("resolver")<resolver, (userId: string) => Effect.Effect<a>>() {}
const getUserByIdResolverLayer = Layer.effect(
  resolver,
  Effect.succeed(getUserByIdResolver)
    .pipe(Effect.andThen(
      (resolver) => (id: string) => Effect.request(GetUserById({ id }), resolver)
    ))
)

const bWithRequest = S.struct({
  a: S.string.pipe(
    S.transformOrFail(a, (id) => resolver.pipe(Effect.andThen((_) => _(id))), (_) => Effect.succeed(_.id))
  ),
  b: S.number
})

///////////////////

describe("schema just for reference", () => {
  bench("just a schema, no transform/effect", async () => {
    const bwithoutRequest = S.struct({
      a: S.string,
      b: S.number
    })

    await Effect.runPromise(S.decode(S.array(bwithoutRequest))(testItems))
  })

  bench("basic sync effect transform", async () => {
    const bwithoutRequest = S.struct({
      a: S.string.pipe(S.transformOrFail(S.string, (_) => Effect.succeed(_), (_) => Effect.succeed(_))),
      b: S.number
    })

    await Effect.runPromise(S.decode(S.array(bwithoutRequest))(testItems))
  })
})

describe("schema", () => {
  bench("without request", async () => {
    const bwithoutRequest = S.struct({
      a: S.string.pipe(S.transformOrFail(a, makeUser, (_) => Effect.succeed(_.id))),
      b: S.number
    })

    await Effect.runPromise(S.decode(S.array(bwithoutRequest))(testItems))
  })

  bench("with request", async () => {
    await Effect.runPromise(
      pipe(
        S.decode(S.array(bWithRequest))(testItems),
        Effect.provide(getUserByIdResolverLayer)
      )
    )
  })

  bench("with request batched etc", async () => {
    await Effect.runPromise(
      pipe(
        S.decode(S.array(bWithRequest))(testItems),
        Effect.provide(getUserByIdResolverLayer),
        Effect.provide(RequestCacheLayers)
      )
    )
  })
})

describe("plain", () => {
  bench("without request", async () => {
    await Effect.runPromise(
      Effect.forEach(testItems, (_) => makeUser(_.a))
    )
  })

  bench("with request via context", async () => {
    await Effect.runPromise(
      pipe(
        Effect.forEach(testItems, (item) => resolver.pipe(Effect.andThen((_) => _(item.a)))),
        Effect.provide(getUserByIdResolverLayer)
      )
    )
  })

  bench("with request via context batched etc", async () => {
    await Effect.runPromise(
      pipe(
        Effect.forEach(testItems, (item) => resolver.pipe(Effect.andThen((_) => _(item.a))), {
          concurrency: "unbounded",
          batching: true
        }),
        Effect.provide(getUserByIdResolverLayer),
        Effect.provide(RequestCacheLayers)
      )
    )
  })

  bench("with request", async () => {
    await Effect.runPromise(
      pipe(
        Effect.forEach(testItems, (_) => Effect.request(GetUserById({ id: _.a }), getUserByIdResolver)),
        Effect.provide(getUserByIdResolverLayer)
      )
    )
  })
  bench("with request batched etc", async () => {
    await Effect.runPromise(
      pipe(
        Effect.forEach(testItems, (_) => Effect.request(GetUserById({ id: _.a }), getUserByIdResolver), {
          concurrency: "unbounded",
          batching: true
        }),
        Effect.provide(getUserByIdResolverLayer),
        Effect.provide(RequestCacheLayers)
      )
    )
  })
})
