import * as Effect from "effect/Effect"
import { Cause, Data, Either } from "../../src/index.js"
import { expect, it } from "../utils/extend.js"

const defaultDefaultError = (e: unknown, k: string) => new Cause.UnknownException(e, `${k} produced an error`)

/**
 * Converts an object with properties or methods that might return promises into an object with properties and methods that return effects.
 * Useful to convert an existing service object into an effectified service object.
 * Will type the error channel as `Cause.UnknownException` if no error mapper is provided.
 */
export const effectify: <
  T extends {},
  Errors extends { [K in keyof T]?: (e: unknown) => any },
  DefaultError = Cause.UnknownException
>(
  data: T,
  errors?: Errors,
  defaultError?: (e: unknown, k: keyof T) => DefaultError
) => Effectified<T, Errors, DefaultError> = (data: any, errors: any = {}, defaultError: any = defaultDefaultError) => {
  return Object.entries(data).reduce((acc, [k, v]) => {
    if (typeof v !== "function") {
      acc[k] = Effect.sync(() => data[k])
      return acc
    }
    const eff = Effect.async<any, any>((cb) => {
      try {
        const maybePromise = data[k]()
        if (maybePromise instanceof Promise) {
          maybePromise.then((_) => cb(Effect.succeed(_)))
            .catch((e) =>
              cb(
                k in errors
                  ? Effect.suspend(() => Effect.fail(errors[k](e)))
                  : Effect.fail(defaultError(e, k))
              )
            )
        } else {
          cb(Effect.succeed(maybePromise))
        }
      } catch (e) {
        cb(
          k in errors
            ? Effect.suspend(() => Effect.fail(errors[k](e)))
            : Effect.fail(defaultError(e, k))
        )
      }
    })
    acc[k] = Object.setPrototypeOf(
      Object.assign(
        (...args: Array<any>) =>
          Effect.async<any, any>((cb) => {
            try {
              const maybePromise = data[k](...args)
              if (maybePromise instanceof Promise) {
                maybePromise.then((_) => cb(Effect.succeed(_)))
                  .catch((e) =>
                    cb(
                      k in errors
                        ? Effect.suspend(() => Effect.fail(errors[k](e)))
                        : Effect.fail(defaultError(e, k))
                    )
                  )
              } else {
                cb(Effect.succeed(maybePromise))
              }
            } catch (e) {
              cb(
                k in errors
                  ? Effect.suspend(() => Effect.fail(errors[k](e)))
                  : Effect.fail(defaultError(e, k))
              )
            }
          }),
        eff
      ),
      eff
    )
    return acc
  }, {} as any) as any
}

type OrReturnType<T, DefaultError> = T extends ((...args: any) => any) ? ReturnType<T> : DefaultError

export type Effectified<
  T,
  Errors extends { [K in keyof T]?: (e: unknown) => any },
  DefaultError = Cause.UnknownException
> = {
  [P in keyof T]: T[P] extends () => Promise<infer R> ? Effect.Effect<
      R,
      P extends keyof Errors ? OrReturnType<Errors[P], DefaultError> : DefaultError
    > :
    T[P] extends (...args: infer A) => Promise<infer R> ?
      (...args: A) => Effect.Effect<R, P extends keyof Errors ? OrReturnType<Errors[P], DefaultError> : DefaultError>
    : T[P] extends () => infer R ?
      Effect.Effect<R, P extends keyof Errors ? OrReturnType<Errors[P], DefaultError> : DefaultError> :
    T[P] extends (...args: infer A) => infer R ?
      (...args: A) => Effect.Effect<R, P extends keyof Errors ? OrReturnType<Errors[P], DefaultError> : DefaultError>
    : Effect.Effect<T[P]>
}

// Test

export interface SomeService {
  doSomethingPromise(): Promise<void>
  withSomethingPromise(a: number): Promise<string>
  withSomething(a: number): string
  someValue: number
  doSomething(): void
}

export class DoSomethingError extends Data.TaggedError("DoSomethingError")<{}> {}
export type EffectifiedSomeService = Effectified<SomeService, { doSomethingPromise: (e: unknown) => DoSomethingError }>

it.effect(
  "works",
  () =>
    Effect.gen(function*() {
      const result: Array<string> = []
      const s: SomeService = {
        someValue: 1,
        withSomethingPromise: (a: number) => Promise.resolve(`${a}`),
        withSomething: (a: number) => `${a}`,
        doSomethingPromise: async () => {
          result.push("I did something promise")
        },
        doSomething: () => {
          result.push("I did something")
        }
      }
      const svc = effectify(s, { doSomethingPromise: () => new DoSomethingError() })
      const s2 = {
        a: () => Promise.reject("I failed a"),
        b: () => Promise.reject("I failed b")
      }
      const svc2 = effectify(s2, { a: (e) => ({ e }) })
      const svc3 = effectify(s2, { a: (e) => ({ e }) }, (e, k) => ({ e, k }))

      expect(yield* svc.doSomething).toBe(undefined)
      expect(result[0]).toEqual("I did something")
      expect(yield* svc.doSomethingPromise).toBe(undefined)
      expect(result[1]).toEqual("I did something promise")
      expect(yield* svc.someValue).toBe(1)
      expect(yield* svc.withSomething(1)).toBe("1")
      expect(yield* svc.withSomethingPromise(1)).toBe("1")

      expect(yield* svc2.a.pipe(Effect.either)).toStrictEqual(Either.left({ e: "I failed a" }))
      expect(yield* svc2.b.pipe(Effect.either)).toStrictEqual(
        Either.left(new Cause.UnknownException("I failed b", "b produced an error"))
      )

      expect(yield* svc3.a.pipe(Effect.either)).toStrictEqual(Either.left({ e: "I failed a" }))
      expect(yield* svc3.b.pipe(Effect.either)).toStrictEqual(Either.left({ e: "I failed b", k: "b" }))
    })
)
