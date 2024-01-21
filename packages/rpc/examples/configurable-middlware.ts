import * as Client from "@effect/rpc/Client"
import * as Resolver from "@effect/rpc/Resolver"
import * as Router from "@effect/rpc/Router"
import * as RpcSchema from "@effect/rpc/Schema"
import * as Server from "@effect/rpc/Server"
import * as Schema from "@effect/schema/Schema"
import * as Chunk from "effect/Chunk"
import * as Context from "effect/Context"
import { TaggedError } from "effect/Data"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

// Post schema
const PostId = pipe(
  Schema.number,
  Schema.positive(),
  Schema.int(),
  Schema.brand("PostId")
)
type PostId = Schema.Schema.To<typeof PostId>

const Post = Schema.struct({
  id: PostId,
  body: Schema.string
})
const CreatePost = pipe(Post, Schema.omit("id"))

interface Config {
  allowAnonymous?: true
  requireRoles?: Array<string>
}

export interface UserProfile {
  id: string
  roles: ReadonlyArray<string>
}
export class NotLoggedInError extends TaggedError("NotLoggedInError") {}
export class ForbiddenError extends TaggedError("ForbiddenError") {}

const TryAuth = Context.Tag<Option.Option<UserProfile>>()
const TryAuthLayer = Layer.succeed(TryAuth, Option.none()) // TODO: grab authentication data from the headers if available, provide the userprofile Optionally
const Auth = Context.Tag<UserProfile, UserProfile>()
const AuthLayer = TryAuth.pipe(
  Effect.flatten,
  Effect.catchTag("NoSuchElementException", () => new NotLoggedInError()),
  Layer.effect(Auth)
)

export type AllowAnonymous<A> = A extends { allowAnonymous: true } ? true : false

const configHandler = <Cfg extends Config>(config: Cfg) => <R, E, A>(handler: Effect.Effect<R, E, A>) => {
  let h: Effect.Effect<any, any, any> = handler
  if (!config.allowAnonymous) h = Effect.provide(h, Layer.provide(AuthLayer, TryAuthLayer))

  const { requireRoles } = config
  if (requireRoles) {
    h = Effect.andThen(
      Effect.gen(function*($) {
        const user = yield* $(TryAuth)
        const roles = user.pipe(Option.map((_) => _.roles), Option.getOrElse((): ReadonlyArray<string> => []))
        if (!requireRoles.some((r) => roles.includes(r))) yield* $(new ForbiddenError())
      }),
      h
    )
  }

  // TODO: RequiredContext of the various middleware layers
  type ProvidedContext = AllowAnonymous<Cfg> extends true ? never : UserProfile

  return h as Effect.Effect<Exclude<R, ProvidedContext>, E, A>
}

// TODO: extend error Schema to include Forbidden/NotLoggedIn?

// Post service schema
const posts = RpcSchema.make({
  create: {
    input: CreatePost,
    output: Post,
    // metadata can also be used on the client side, e.g to hide actions or also execute particular behaviour, provide layers etc.
    config: {
      requireRoles: ["admin"]
    }
  },
  list: {
    output: Schema.chunk(Post),
    config: {
      allowAnonymous: true
    }
  }
})

// Post service router
const postsRouter = Router.make(posts, {
  create: (post) =>
    Auth.pipe(Effect.andThen((userProfile) => ({
      ...post,
      id: PostId(1),
      userId: userProfile.id
    }))),

  list: Effect.succeed(
    Chunk.fromIterable([
      {
        id: PostId(1),
        body: "Hello world!"
      }
    ])
  )
}, {
  // TODO; execute middleware and update R, E types accordingly
  configHandler
})

// Root service schema
const schema = RpcSchema.make({
  // Add nested post service
  posts,

  greet: {
    input: Schema.string,
    output: Schema.string
  },

  currentTime: {
    output: Schema.DateFromString
  }
})

// Root service router
const router = Router.make(schema, {
  greet: (name) => Effect.succeed(`Hello ${name}!`),
  currentTime: Effect.sync(() => new Date()),
  posts: postsRouter
})

const handler = Server.handler(router)

// Create client
const client = Client.make(schema, Resolver.make(handler))

Effect.runPromise(client.posts.create({ body: "Hello!" })).then(console.log)
