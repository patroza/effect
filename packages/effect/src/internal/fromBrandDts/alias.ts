import * as Brand from "../../Brand.ts"
import * as Schema from "../../Schema.ts"

/**
 * fromBrand Type=A only. A type-alias intersection stays the alias in .d.ts.
 * No named interface.
 */
export type Alias50 =
  & string
  & Brand.Brand<"NonEmptyString50">
  & Brand.Brand<"NonEmptyString255">
  & Brand.Brand<"NonEmptyString">

export const Alias50 = Schema.String.pipe(Schema.fromBrand<Alias50>("NonEmptyString50"))
export const alias50Value = Alias50.make("hello")
export const aliasStructValue = Schema.Struct({ title: Alias50 }).make({
  title: "hello" as Alias50
})
export const aliasArrayValue = Schema.Array(Alias50).make(["hello" as Alias50])

export class AliasPerson extends Schema.Class<AliasPerson>("AliasPerson")({
  title: Alias50
}) {}
export const aliasPersonTitle = AliasPerson.make({ title: "hello" as Alias50 }).title

/** Control: string-key Schema.brand stays `string & Brand<"Email">`. */
export const Email = Schema.String.pipe(Schema.brand("Email"))
export const emailValue = Email.make("a@b.c")
