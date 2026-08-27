import { Brand, Schema, type Types } from "effect"
import { describe, expect, it } from "tstyche"

describe("Brand", () => {
  it("FromConstructor", () => {
    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))
    expect<Brand.Brand.FromConstructor<typeof Positive>>().type.toBe<Positive>()
  })

  it("Unbranded", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Unbranded<Positive>>().type.toBe<number>()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Unbranded<PositiveInt>>().type.toBe<number>()
  })

  it("type-alias intersections already form a hierarchy", () => {
    type NonEmptyString = string & Brand.Brand<"NonEmptyString">
    type NonEmptyString255 = string & Brand.Brand<"NonEmptyString255"> & Brand.Brand<"NonEmptyString">
    type NonEmptyString50 =
      & string
      & Brand.Brand<"NonEmptyString50">
      & Brand.Brand<"NonEmptyString255">
      & Brand.Brand<"NonEmptyString">

    expect<NonEmptyString50>().type.toBeAssignableTo<NonEmptyString255>()
    expect<NonEmptyString50>().type.toBeAssignableTo<NonEmptyString>()
    expect<Brand.Brand.Unbranded<NonEmptyString50>>().type.toBe<string>()
  })

  it("named-interface pattern Unbrands and keeps a folded type name", () => {
    type WithType = Brand.Brand<"B"> & Brand.Brand<"A">
    expect<Brand.Brand.Unbranded<string & WithType>>().type.toBe<string>()

    interface WithInterface extends Types.Simplify<Brand.Brand<"B"> & Brand.Brand<"A">> {}
    expect<Brand.Brand.Unbranded<string & WithInterface>>().type.toBe<string>()

    interface NonEmptyBrand extends Brand.Brand<"NonEmptyString"> {}
    type NonEmptyString = string & NonEmptyBrand
    interface NonEmptyString255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & NonEmptyBrand> {}
    type NonEmptyString255 = string & NonEmptyString255Brand

    expect<Brand.Brand.Unbranded<NonEmptyString255>>().type.toBe<string>()
    expect<NonEmptyString255>().type.toBeAssignableTo<NonEmptyString>()
    expect<Brand.Brand.Unbranded<Brand.Brand<"X">>>().type.toBe<Brand.Brand<"X">>()
  })

  it("Keys", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Keys<Positive>>().type.toBe<"Positive">()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Keys<PositiveInt>>().type.toBe<"Int" | "Positive">()
  })

  it("Brands", () => {
    type Positive = number & Brand.Brand<"Positive">
    expect<Brand.Brand.Brands<Positive>>().type.toBe<Brand.Brand<"Positive">>()

    type PositiveInt = number & Brand.Brand<"Int"> & Brand.Brand<"Positive">
    expect<Brand.Brand.Brands<PositiveInt>>().type.toBe<Brand.Brand<"Int"> & Brand.Brand<"Positive">>()
  })

  it("EnsureCommonBase", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.check<Int>(Schema.isInt())

    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

    expect<Brand.Brand.EnsureCommonBase<[typeof Positive, typeof Int]>>().type.toBe<[typeof Positive, typeof Int]>()

    type MyString = string & Brand.Brand<"MyString">
    const MyString = Brand.nominal<MyString>()

    expect<Brand.Brand.EnsureCommonBase<[typeof MyString, typeof Int]>>().type.toBe<
      [typeof MyString, "ERROR: All brands should have the same base type"]
    >()
  })
})
