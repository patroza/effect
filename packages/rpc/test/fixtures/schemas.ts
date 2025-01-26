import { Headers } from "@effect/platform"
import { RpcTest } from "@effect/rpc"
import * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import * as RpcMiddleware from "@effect/rpc/RpcMiddleware"
import * as RpcSchema from "@effect/rpc/RpcSchema"
import * as RpcServer from "@effect/rpc/RpcServer"
import { Context, Effect, Layer, Mailbox, Schema } from "effect"

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

class StreamUsers extends Schema.TaggedRequest<StreamUsers>()("StreamUsers", {
  success: RpcSchema.Stream({
    success: User,
    failure: Schema.Never
  }),
  failure: Schema.Never,
  payload: {
    id: Schema.String
  }
}) {}

class CurrentUser extends Context.Tag("CurrentUser")<CurrentUser, User>() {}

class AuthMiddleware extends RpcMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  provides: CurrentUser,
  requiredForClient: true
}) {}

export const UserRpcs = RpcGroup
  .make(
    Rpc.make("GetUser", {
      success: User,
      payload: { id: Schema.String }
    }),
    Rpc.fromTaggedRequest(StreamUsers),
    Rpc.make("GetInterrupts", {
      success: Schema.Number
    }),
    Rpc.make("GetEmits", {
      success: Schema.Number
    }),
    Rpc.make("ProduceDefect"),
    Rpc.make("Never")
  )
  .middleware(AuthMiddleware)

const AuthLive = Layer.succeed(
  AuthMiddleware,
  AuthMiddleware.of((options) =>
    Effect.succeed(
      new User({ id: options.headers.userid ?? "1", name: options.headers.name ?? "Fallback name" })
    )
  )
)

const UsersLive = UserRpcs.toLayer(Effect.gen(function*() {
  let interrupts = 0
  let emits = 0
  return {
    GetUser: (_) =>
      CurrentUser.pipe(
        Rpc.fork
      ),
    StreamUsers: Effect.fnUntraced(function*(req) {
      const mailbox = yield* Mailbox.make<User>(0)

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          interrupts++
        })
      )

      yield* mailbox.offer(new User({ id: req.id, name: "John" })).pipe(
        Effect.tap(() => {
          emits++
        }),
        Effect.delay(100),
        Effect.forever,
        Effect.forkScoped
      )

      return mailbox
    }),
    GetInterrupts: () => Effect.sync(() => interrupts),
    GetEmits: () => Effect.sync(() => emits),
    ProduceDefect: () => Effect.die("boom"),
    Never: () => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => interrupts++)))
  }
}))

export const RpcLive = RpcServer.layer(UserRpcs).pipe(
  Layer.provide([
    UsersLive,
    AuthLive
  ])
)

const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ request }) =>
  Effect.succeed({
    ...request,
    headers: Headers.set(request.headers, "name", "Logged in user")
  }))

export class UsersClient extends Context.Tag("UsersClient")<
  UsersClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>>
>() {
  static layer = Layer.scoped(UsersClient, RpcClient.make(UserRpcs)).pipe(
    Layer.provide(AuthClient)
  )
  static layerTest = Layer.scoped(UsersClient, RpcTest.makeClient(UserRpcs)).pipe(
    Layer.provide([UsersLive, AuthLive, AuthClient])
  )
}
