import { Brand, hole, Schema, type Types } from "effect"
import { describe, expect, it } from "tstyche"

/**
 * Named inheriting brands — the effect-app length/email pattern.
 *
 * A child interface extends the parent brand payload, so a value that passed
 * the tighter check is usable anywhere the wider parent is required, while
 * siblings that share a parent stay opaque to each other.
 */
interface NonEmptyStringBrand extends Brand.Brand<"NonEmptyString"> {}
type NonEmptyString = string & NonEmptyStringBrand

interface NonEmptyString64kBrand extends Types.Simplify<Brand.Brand<"NonEmptyString64k"> & NonEmptyStringBrand> {}
type NonEmptyString64k = string & NonEmptyString64kBrand

interface NonEmptyString255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & NonEmptyString64kBrand> {}
type NonEmptyString255 = string & NonEmptyString255Brand

interface NonEmptyString50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & NonEmptyString255Brand> {}
type NonEmptyString50 = string & NonEmptyString50Brand

interface EmailBrand extends Types.Simplify<Brand.Brand<"Email"> & NonEmptyStringBrand> {}
type Email = string & EmailBrand

const NonEmptyString50 = Brand.nominal<NonEmptyString50>()
const NonEmptyString255 = Brand.nominal<NonEmptyString255>()
const Email = Brand.nominal<Email>()

const NonEmptyString50Schema = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(50)),
  Schema.fromBrand<NonEmptyString50>("NonEmptyString50")
)
const NonEmptyString255Schema = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(255)),
  Schema.fromBrand<NonEmptyString255>("NonEmptyString255")
)
const EmailSchema = Schema.String.pipe(Schema.fromBrand<Email>("Email"))

describe("inheriting Brand interfaces", () => {
  it("lets a tighter length brand be used as every wider parent", () => {
    const take50 = (value: NonEmptyString50) => value
    const take255 = (value: NonEmptyString255) => value
    const take64k = (value: NonEmptyString64k) => value
    const takeNonEmpty = (value: NonEmptyString) => value

    const title = hole<NonEmptyString50>()
    take50(title)
    take255(title)
    take64k(title)
    takeNonEmpty(title)

    const summary = hole<NonEmptyString255>()
    take255(summary)
    take64k(summary)
    takeNonEmpty(summary)
    expect(take50).type.not.toBeCallableWith(summary)

    const notes = hole<NonEmptyString>()
    takeNonEmpty(notes)
    expect(take255).type.not.toBeCallableWith(notes)
    expect(take50).type.not.toBeCallableWith(notes)
    expect(take50).type.not.toBeCallableWith("raw")
  })

  it("keeps sibling brands that share a parent opaque to each other", () => {
    const takeTitle = (value: NonEmptyString50) => value
    const takeEmail = (value: Email) => value
    const takeNonEmpty = (value: NonEmptyString) => value

    const title = hole<NonEmptyString50>()
    const email = hole<Email>()
    takeTitle(title)
    takeEmail(email)
    takeNonEmpty(title)
    takeNonEmpty(email)
    expect(takeTitle).type.not.toBeCallableWith(email)
    expect(takeEmail).type.not.toBeCallableWith(title)
  })

  it("Unbranded of a named inheriting interface is the base type", () => {
    expect<Brand.Brand.Unbranded<NonEmptyString50>>().type.toBe<string>()
    expect<Brand.Brand.Unbranded<NonEmptyString255>>().type.toBe<string>()
    expect<Brand.Brand.Unbranded<Email>>().type.toBe<string>()
    expect<Brand.Brand.Unbranded<number & Brand.Brand<"Int"> & Brand.Brand<"Positive">>>().type.toBe<number>()
  })

  it("fromBrand keeps the named Type without a nominal constructor", () => {
    expect(Schema.String.pipe).type.toBeCallableWith(Schema.fromBrand<NonEmptyString50>("NonEmptyString50"))
    expect(Schema.String.pipe).type.toBeCallableWith(Schema.fromBrand("NonEmptyString50", NonEmptyString50))
    expect(Schema.Number.pipe).type.not.toBeCallableWith(Schema.fromBrand<NonEmptyString50>("NonEmptyString50"))
    expect(Schema.String.pipe).type.not.toBeCallableWith(
      Schema.fromBrand("NonEmptyString50", Brand.check<number & Brand.Brand<"Int">>(Schema.isInt()))
    )

    expect(Schema.revealCodec(NonEmptyString50Schema)).type.toBe<Schema.Codec<NonEmptyString50, string>>()
    expect(Schema.revealCodec(EmailSchema)).type.toBe<Schema.Codec<Email, string>>()
    expect(Schema.String.pipe(Schema.brand("a"))).type.toBe<Schema.brand<Schema.String, "a">>()
  })

  it("Struct fields keep named brands so a short title fills a wider name slot", () => {
    const CreatePost = Schema.Struct({
      title: NonEmptyString50Schema,
      body: NonEmptyString255Schema
    })

    expect<typeof CreatePost.Type>().type.toBe<{
      readonly title: NonEmptyString50
      readonly body: NonEmptyString255
    }>()

    const takeName = (value: NonEmptyString255) => value
    const post = hole<typeof CreatePost.Type>()
    takeName(post.title)
    takeName(post.body)
  })

  it("Opaque structs branded with inheriting interfaces stay opaque to siblings", () => {
    class ShortName extends Schema.Opaque<ShortName, NonEmptyString50Brand>()(
      Schema.Struct({ name: Schema.String })
    ) {}
    class EmailAddress extends Schema.Opaque<EmailAddress, EmailBrand>()(
      Schema.Struct({ name: Schema.String })
    ) {}

    const takeShort = (value: ShortName) => value
    const takeEmail = (value: EmailAddress) => value
    const takeParent = (value: { readonly name: string } & NonEmptyStringBrand) => value

    takeShort(ShortName.make({ name: "a" }))
    takeEmail(EmailAddress.make({ name: "a" }))
    takeParent(ShortName.make({ name: "a" }))
    takeParent(EmailAddress.make({ name: "a" }))
    expect(takeShort).type.not.toBeCallableWith(EmailAddress.make({ name: "a" }))
    expect(takeEmail).type.not.toBeCallableWith(ShortName.make({ name: "a" }))
  })
})
