import { HttpMiddleware, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, flow, Layer } from "effect"
import { createServer } from "http"

class Service1 extends Effect.Service<Service1>()("Service1", { succeed: { a: 1 } }) {}
class Service2 extends Effect.Service<Service2>()("Service2", {
  effect: Effect.gen(function*() {
    const service1 = yield* Service1
    return {
      a: service1.a * 2
    }
  }),
  dependencies: [Service1.Default]
}) {}

class ServiceWithRequestLevelDep extends Effect.Service<ServiceWithRequestLevelDep>()("ServiceWithRequestLevelDep", {
  accessors: true,
  effect: Effect.gen(function*() {
    const service1 = yield* Service2
    return {
      get: Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest
        return {
          a: service1.a,
          message: `Hello ${request.remoteAddress}`
        }
      })
    }
  }),
  dependencies: [Service2.Default]
}) {}

class MiddlewareDependency extends Effect.Tag("MiddlewareDependency")<MiddlewareDependency, { message: string }>() {}

// You can define router instances using `HttpRouter.Tag`
class UserRouter extends HttpRouter.Tag("UserRouter")<UserRouter, MiddlewareDependency>() {}

// Create `Layer`'s for your routes with `UserRouter.use`
const GetUsers = UserRouter.use((router) =>
  Effect.gen(function*() {
    const requestDep = yield* ServiceWithRequestLevelDep
    yield* router.get(
      "/",
      requestDep.get.pipe(Effect.flatMap((r) => HttpServerResponse.text("got users: " + r.message)))
    )
  })
).pipe(Layer.provide(ServiceWithRequestLevelDep.Default))

const CreateUser = UserRouter.use((router) =>
  Effect.gen(function*() {
    yield* router.post(
      "/",
      MiddlewareDependency.pipe(Effect.flatMap((mw) => HttpServerResponse.text("created user: " + mw.message)))
    )
  })
)

// Merge all the routes together with `Layer.mergeAll`
const AllUserRoutes = Layer.mergeAll(GetUsers, CreateUser).pipe(
  Layer.provideMerge(UserRouter.Live)
)

class RootRouter extends HttpRouter.Tag("RootRouter")<UserRouter, MiddlewareDependency>() {}
const AllRoutes = RootRouter.use((router) =>
  Effect.gen(function*() {
    yield* router.mount("/users", yield* UserRouter.router)
  })
).pipe(Layer.provide(AllUserRoutes))

// can use the Default router too, only if we eliminate the Request level dependencies.
// const AllRoutes = HttpRouter.Default.use((router) =>
//   Effect.gen(function*() {
//     yield* router.mount(
//       "/users",
//       yield* UserRouter.router.pipe(
//         // eliminate the middleware dependency
//         Effect.map(
//           HttpRouter.use(
//             Effect.provideServiceEffect(
//               MiddlewareDependency,
//               Effect.sync(() => ({ message: "hello from middleware at " + new Date() }))
//             )
//           )
//         )
//       )
//     )
//   })
// ).pipe(Layer.provide(AllUserRoutes))

const ServerLive = NodeHttpServer.layer(createServer, { port: 3000 })

// use the `.unwrap` api to turn the underlying `HttpRouter` into another layer.
// Here we use `HttpServer.serve` to create a server from the `HttpRouter`.
const HttpLive = RootRouter.unwrap(
  HttpServer.serve(
    flow(
      HttpMiddleware.logger,
      Effect.provideServiceEffect(
        MiddlewareDependency,
        Service2.pipe(Effect.andThen((s) => ({ message: "hello from middleware at " + new Date() + s.a })))
      )
    )
  )
).pipe(
  Layer.provide(Service2.Default), // for the middleware
  Layer.provide(AllRoutes),
  Layer.provide(ServerLive)
)

NodeRuntime.runMain(Layer.launch(HttpLive))
