import * as S from "@effect/schema/Schema"
import * as Util from "@effect/schema/test/TestUtils"
import { jestExpect as expect } from "@jest/expect"
import { describe, it } from "vitest"

describe("decodeSync", () => {
  const schema = S.Struct({ a: Util.NumberFromChar })

  it("should throw on invalid values", () => {
    expect(S.decodeSync(schema)({ a: "1" })).toEqual({ a: 1 })
    expect(() => S.decodeSync(schema)({ a: "10" })).toThrow(
      new Error(`{ readonly a: NumberFromChar }
└─ ["a"]
   └─ NumberFromChar
      └─ Encoded side transformation failure
         └─ Char
            └─ Predicate refinement failure
               └─ Expected Char (a single character), actual "10"`)
    )
  })

  it("should throw on async", () => {
    expect(() => S.decodeSync(Util.AsyncString)("a")).toThrow(
      new Error(
        `AsyncString
└─ cannot be be resolved synchronously, this is caused by using runSync on an effect that performs async work`
      )
    )
  })

  it("should respect outer/inner options", () => {
    const input = { a: "1", b: "b" }
    expect(() => S.decodeSync(schema)(input, { onExcessProperty: "error" })).toThrow(
      new Error(`{ readonly a: NumberFromChar }
└─ ["b"]
   └─ is unexpected, expected "a"`)
    )
    expect(() => S.decodeSync(schema, { onExcessProperty: "error" })(input)).toThrow(
      new Error(`{ readonly a: NumberFromChar }
└─ ["b"]
   └─ is unexpected, expected "a"`)
    )
    expect(S.decodeSync(schema, { onExcessProperty: "error" })(input, { onExcessProperty: "ignore" }))
      .toEqual({ a: 1 })
  })
})
