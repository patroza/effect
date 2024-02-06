/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipe } from "effect"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { Class, CommitPrototype, EffectPrototype, StructuralClass, StructuralCommitPrototype } from "effect/Effectable"
import * as Either from "effect/Either"
import * as Option from "effect/Option"
import * as ReadonlyArray from "effect/ReadonlyArray"

const toNonEmptyArray = <A>(a: ReadonlyArray<A>) =>
  a.length ? Option.some(a as ReadonlyArray.NonEmptyReadonlyArray<A>) : Option.none

const settings = {
  enumerable: false,
  configurable: true,
  writable: true
}

/**
 * useful in e.g frontend projects that do not use tsplus, but still has the most useful extensions installed.
 */
const installFluentExtensions = () => {
  // somehow individual prototypes don't stick in vite, so we still do some global ;/
  // we should however not do `map` as it breaks fast-check, etc

  // individual
  // effects
  ;[
    ...[Effect.unit, Effect.fail(1), Effect.step(Effect.unit), Cause.empty, Config.succeed(1), Context.Tag()].map((
      effect
    ) => Object.getPrototypeOf(effect)),
    StructuralClass.prototype,
    Class.prototype,
    EffectPrototype, // get's spread into many
    CommitPrototype,
    StructuralCommitPrototype
    // STM.fail(1) // Stream?
  ]
    .forEach((effect) => {
      Object.assign(effect, {
        andThen(arg: any): any {
          return Effect.andThen(this as any, arg)
        },
        tap(arg: any): any {
          return Effect.tap(this as any, arg)
        },
        map(arg: any): any {
          return Effect.map(this as any, arg)
        }
      })
      // Object.defineProperty(effect, "andThen", {
      //   ...settings,
      //   value(arg: any) {
      //     return Effect.andThen(this, arg)
      //   }
      // })
      // Object.defineProperty(effect, "tap", {
      //   ...settings,
      //   value(arg: any) {
      //     return Effect.tap(this, arg)
      //   }
      // })
      // Object.defineProperty(effect, "map", {
      //   ...settings,
      //   value(arg: any) {
      //     return Effect.map(this, arg)
      //   }
      // })
    })

  const opt = Object.getPrototypeOf(Object.getPrototypeOf(Option.none()))
  Object.assign(opt, {
    andThen(arg: any): any {
      return Option.andThen(this as any, arg)
    },
    tap(arg: any): any {
      return Option.tap(this as any, arg)
    },
    map(arg: any): any {
      return Option.map(this as any, arg)
    },
    getOrElse(arg: () => any): any {
      return Option.getOrElse(this as any, arg)
    }
  })
  // Object.defineProperty(opt, "andThen", {
  //   ...settings,
  //   value(arg: any) {
  //     return Option.andThen(this, arg)
  //   }
  // })
  // Object.defineProperty(opt, "tap", {
  //   ...settings,
  //   value(arg: any) {
  //     return Option.tap(this, arg)
  //   }
  // })
  // Object.defineProperty(opt, "map", {
  //   ...settings,
  //   value(arg: any) {
  //     return Option.map(this, arg)
  //   }
  // })
  // Object
  //   .defineProperty(opt, "getOrElse", {
  //     ...settings,
  //     value(arg: () => any) {
  //       return Option.getOrElse(this, arg)
  //     }
  //   })

  const either = Object.getPrototypeOf(Object.getPrototypeOf(Either.left(1)))
  Object.assign(either, {
    andThen(arg: any): any {
      return Either.andThen(this as any, arg)
    },
    map(arg: any): any {
      return Either.map(this as any, arg)
    }
  })
  // Object.defineProperty(either, "andThen", {
  //   ...settings,
  //   value(arg: any) {
  //     return Either.andThen(this, arg)
  //   }
  // })
  // Object.defineProperty(either, "map", {
  //   ...settings,
  //   value(arg: any) {
  //     return Either.map(this, arg)
  //   }
  // })

  // built-ins
  // pipe on Object seems to interfeir with some libraries like undici
  Object
    .defineProperty(Array.prototype, "pipe", {
      ...settings,
      value(...args: [any, ...Array<any>]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return pipe(this, ...args as [any])
      }
    })
  ;[Array.prototype, Map.prototype, Set.prototype]
    .forEach((proto) =>
      Object.defineProperty(proto, "forEachEffect", {
        ...settings,
        value(arg: () => any) {
          return Effect.forEach(this, arg)
        }
      })
    )

  Object.defineProperty(Array.prototype, "findFirstMap", {
    ...settings,
    value(arg: () => any) {
      return ReadonlyArray.findFirst(this, arg)
    }
  })

  Object.defineProperty(Array.prototype, "filterMap", {
    ...settings,
    value(arg: () => any) {
      return ReadonlyArray.filterMap(this, arg)
    }
  })

  Object.defineProperty(Array.prototype, "toNonEmpty", {
    enumerable: false,
    configurable: true,
    get() {
      return toNonEmptyArray(this)
    }
  })
}

let patched = false

export function patch() {
  if (patched) {
    return
  }

  installFluentExtensions()

  patched = true
}

patch()

export {}
