import * as Effect from "effect/Effect"
import { Either } from "../../src/index.js"
import { expect, it } from "../utils/extend.js"

export const effectify: <T extends {}, Errors extends { [K in keyof T]?: (e: unknown) => any }>(
  data: T,
  errors?: Errors
) => Effectified<T, Errors> = (data, errors = {}) => {
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
            .catch((e) => cb(k in errors ? Effect.suspend(() => Effect.fail(errors[k](e))) : Effect.fail(e)))
        } else {
          cb(Effect.succeed(maybePromise))
        }
      } catch (e) {
        cb(k in errors ? Effect.suspend(() => Effect.fail(errors[k](e))) : Effect.fail(e))
      }
    })
    acc[k] = Object.setPrototypeOf(
      Object.assign(
        (...args) =>
          Effect.async<any, any>((cb) => {
            try {
              const maybePromise = data[k](...args)
              if (maybePromise instanceof Promise) {
                maybePromise.then((_) => cb(Effect.succeed(_)))
                  .catch((e) => cb(k in errors ? Effect.suspend(() => Effect.fail(errors[k](e))) : Effect.fail(e)))
              } else {
                cb(Effect.succeed(maybePromise))
              }
            } catch (e) {
              cb(k in errors ? Effect.suspend(() => Effect.fail(errors[k](e))) : Effect.fail(e))
            }
          }),
        eff
      ),
      eff
    )
    return acc
  }, {})
}

export type Effectified<T, Errors extends { [K in keyof T]?: (e: unknown) => any }> = {
  [P in keyof T]: T[P] extends () => Promise<infer R> ?
    Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown> :
    T[P] extends (...args: infer A) => Promise<infer R> ?
      (...args: A) => Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown>
    : T[P] extends () => infer R ? Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown> :
    T[P] extends (...args: infer A) => infer R ?
      (...args: A) => Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown>
    : Effect.Effect<T[P]>
}

export interface SomeService {
  doSomethingPromise(): Promise<void>
  withSomethingPromise(a: number): Promise<string>
  withSomething(a: number): string
  someValue: number
  doSomething(): void
}

export class DoSomethingError {}
export type EffectifiedSomeService = Effectified<SomeService, { doSomethingPromise: (e: unknown) => DoSomethingError }>

it.effect(
  "works",
  () =>
    Effect.gen(function*() {
      const result: Array<string> = []
      const s: SomeService = {
        doSomethingPromise: () => Promise.resolve(),
        withSomethingPromise: (a) => Promise.resolve(`${a}`),
        withSomething: (a) => `${a}`,
        someValue: 1,
        doSomething: () => {
          result.push("I did something")
        }
      }
      const svc = effectify(s)
      const s2 = {
        a: () => Promise.reject("I failed"),
        b: () => Promise.reject("I failed")
      }
      const svc2 = effectify(s2, { a: (e) => ({ e }) })

      expect(yield* svc.doSomething).toBe(undefined)
      expect(result).toEqual(["I did something"])
      expect(yield* svc.doSomethingPromise).toBe(undefined)
      expect(yield* svc.someValue).toBe(1)
      expect(yield* svc.withSomething(1)).toBe("1")
      expect(yield* svc.withSomethingPromise(1)).toBe("1")

      expect(yield* svc2.a.pipe(Effect.either)).toStrictEqual(Either.left({ e: "I failed" }))
      expect(yield* svc2.b.pipe(Effect.either)).toStrictEqual(Either.left("I failed"))
    })
)
