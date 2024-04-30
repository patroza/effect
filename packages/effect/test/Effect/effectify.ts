import type * as Effect from "effect/Effect"

export declare const effectify: <T extends {}>(something: T) => Effectified<T>

export type Effectified<T, Errors extends { [k: keyof T]: () => any }> = {
  [P in keyof T]: T[P] extends () => Promise<infer R> ?
    Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown> :
    T[P] extends (...args: infer A) => Promise<infer R> ?
      (...args: A) => Effect.Effect<R, keyof Errors extends P ? ReturnType<Errors[P]> : unknown>
    : T[P]
}

export interface SomeService {
  doSomethingPromise(): Promise<void>
  withSomethingPromise(a: number): Promise<string>
  withSomething(a: number): string
  someValue: number
  doSomething(): void
}

export interface DoSomethingError {}
export type EffectifiedSomeService = Effectified<SomeService, { doSomethingPromise: (e: unknown) => DoSomethingError }>
