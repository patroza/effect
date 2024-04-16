/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipe } from "effect"
import * as Array from "effect/Array"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { Class, CommitPrototype, EffectPrototype, StructuralClass, StructuralCommitPrototype } from "effect/Effectable"
import * as Either from "effect/Either"
import * as Option from "effect/Option"
import { dual, isFunction } from "./Function.js"

const toNonEmptyArray = <A>(a: Array<A>) => a.length ? Option.some(a as Array.NonEmptyArray<A>) : Option.none()

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
    ...[
      Effect.void,
      Effect.fail(1),
      Effect.step(Effect.void),
      Cause.empty,
      Config.succeed(1),
      Context.GenericTag("random-tag-id-for-fluent-extensions-dont-use-me")
    ].map((
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
        },
        flatMap(arg: any): any {
          return Effect.flatMap(this as any, arg)
        }
      })
      Object.defineProperty(effect, "asVoid", {
        enumerable: false,
        configurable: true,
        value() {
          return Effect.asVoid(this as any)
        }
      })
      Object.defineProperty(effect, "orDie", {
        enumerable: false,
        configurable: true,
        value() {
          return Effect.orDie(this as any)
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
    flatMap(arg: any): any {
      return Option.flatMap(this as any, arg)
    },
    getOrElse(arg: () => any): any {
      return Option.getOrElse(this as any, arg)
    }
  })
  Object.defineProperty(opt, "asVoid", {
    enumerable: false,
    configurable: true,
    value() {
      return Effect.asVoid(this as any)
    }
  })
  Object.defineProperty(opt, "orDie", {
    enumerable: false,
    configurable: true,
    value() {
      return Effect.orDie(this as any)
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

  // Somehow this works but don't ask me why.
  // perhaps it's better just to have `andThen` always go to Effect?
  const andThen = /*#__PURE__*/ dual(2, (self, f) =>
    Either.flatMap(self, (a): any => {
      if (isFunction(f)) {
        const b = f(a)
        if (Either.isEither(b)) {
          return b
        }
        if (Effect.isEffect(b)) {
          return b
        }
        return Either.right(b)
      }
      if (Either.isEither(f)) {
        return f
      }
      if (Effect.isEffect(f)) {
        return f
      }
      return Either.right(f)
    }))

  const either = Object.getPrototypeOf(Object.getPrototypeOf(Either.left(1)))
  Object.assign(either, {
    andThen(arg: any): any {
      return andThen(this as any, arg)
    },
    map(arg: any): any {
      return Either.map(this as any, arg)
    },
    flatMap(arg: any): any {
      return Either.flatMap(this as any, arg)
    }
  })
  Object.defineProperty(either, "asVoid", {
    enumerable: false,
    configurable: true,
    value() {
      return Effect.asVoid(this as any)
    }
  })
  Object.defineProperty(either, "orDie", {
    enumerable: false,
    configurable: true,
    value() {
      return Effect.orDie(this as any)
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
    .defineProperty(global.Array.prototype, "pipe", {
      ...settings,
      value(...args: [any, ...Array<any>]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return pipe(this, ...args as [any])
      }
    })
  ;[global.Array.prototype, Map.prototype, Set.prototype]
    .forEach((proto) =>
      Object.defineProperty(proto, "forEachEffect", {
        ...settings,
        value(...args: [any, ...Array<any>]) {
          return Effect.forEach(
            this,
            ...args
          )
        }
      })
    )

  Object.defineProperty(global.Array.prototype, "findFirstMap", {
    ...settings,
    value(...args: [any, ...Array<any>]) {
      return Array.findFirst(
        this,
        // @ts-expect-error
        ...args
      )
    }
  })

  Object.defineProperty(global.Array.prototype, "filterMap", {
    ...settings,
    value(...args: [any, ...Array<any>]) {
      return Array.filterMap(
        this,
        // @ts-expect-error
        ...args
      )
    }
  })

  Object.defineProperty(global.Array.prototype, "toNonEmpty", {
    enumerable: false,
    configurable: true,
    value() {
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
