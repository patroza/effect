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

  it("Unbranded of named inheriting brand interfaces", () => {
    interface NonEmptyBrand extends Brand.Brand<"NonEmptyString"> {}
    type NonEmptyString = string & NonEmptyBrand

    interface NonEmptyString255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & NonEmptyBrand> {}
    type NonEmptyString255 = string & NonEmptyString255Brand

    expect<Brand.Brand.Unbranded<NonEmptyString>>().type.toBe<string>()
    expect<Brand.Brand.Unbranded<NonEmptyString255>>().type.toBe<string>()
  })

  it("named inheriting brand interfaces are assignable child to parent", () => {
    interface NonEmptyBrand extends Brand.Brand<"NonEmptyString"> {}
    type NonEmptyString = string & NonEmptyBrand

    interface NonEmptyString64kBrand extends Types.Simplify<Brand.Brand<"NonEmptyString64k"> & NonEmptyBrand> {}
    type NonEmptyString64k = string & NonEmptyString64kBrand

    interface NonEmptyString255Brand
      extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & NonEmptyString64kBrand>
    {}
    type NonEmptyString255 = string & NonEmptyString255Brand

    interface NonEmptyString50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & NonEmptyString255Brand> {}
    type NonEmptyString50 = string & NonEmptyString50Brand

    expect<NonEmptyString50>().type.toBeAssignableTo<NonEmptyString255>()
    expect<NonEmptyString50>().type.toBeAssignableTo<NonEmptyString64k>()
    expect<NonEmptyString50>().type.toBeAssignableTo<NonEmptyString>()
    expect<NonEmptyString255>().type.toBeAssignableTo<NonEmptyString64k>()
    expect<NonEmptyString255>().type.toBeAssignableTo<NonEmptyString>()
    expect<NonEmptyString64k>().type.toBeAssignableTo<NonEmptyString>()
    expect<NonEmptyString>().type.not.toBeAssignableTo<NonEmptyString50>()
  })

  it("named inheriting brand interfaces stay opaque", () => {
    interface NonEmptyBrand extends Brand.Brand<"NonEmptyString"> {}
    type NonEmptyString = string & NonEmptyBrand

    interface NonEmptyString255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & NonEmptyBrand> {}
    type NonEmptyString255 = string & NonEmptyString255Brand

    interface NonEmptyString50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & NonEmptyString255Brand> {}
    type NonEmptyString50 = string & NonEmptyString50Brand

    interface EmailBrand extends Types.Simplify<Brand.Brand<"Email"> & NonEmptyBrand> {}
    type Email = string & EmailBrand

    expect<Email>().type.not.toBeAssignableTo<NonEmptyString50>()
    expect<NonEmptyString50>().type.not.toBeAssignableTo<Email>()
    expect<Email>().type.toBeAssignableTo<NonEmptyString>()
    expect<NonEmptyString>().type.not.toBeAssignableTo<Email>()
    expect<Brand.Brand<"A">>().type.not.toBeAssignableTo<Brand.Brand<"B">>()
    expect<Brand.Brand<"B">>().type.not.toBeAssignableTo<Brand.Brand<"A">>()
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
