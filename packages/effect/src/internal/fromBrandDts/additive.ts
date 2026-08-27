import * as Brand from "../../Brand.ts"
import * as Schema from "../../Schema.ts"
import type * as Types from "../../Types.ts"

/** Alias side: fromBrand Type=A, no interface. */
export type Alias50 =
  & string
  & Brand.Brand<"NonEmptyString50">
  & Brand.Brand<"NonEmptyString255">
  & Brand.Brand<"NonEmptyString">
export const Alias50 = Schema.String.pipe(Schema.fromBrand<Alias50>("NonEmptyString50"))

/** Interface side: Unbranded + Type=A, plus a child that `extends` the parent brand. */
export interface IfaceNonEmptyBrand extends Brand.Brand<"NonEmptyString"> {}
export interface Iface255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & IfaceNonEmptyBrand> {}
export interface Iface50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & Iface255Brand> {}
export type Iface50 = string & Iface50Brand
export const Iface50 = Schema.String.pipe(Schema.fromBrand<Iface50>("NonEmptyString50"))

export interface UserIdBrand extends Types.Simplify<Brand.Brand<"UserId"> & Iface50Brand> {}
export type UserId = string & UserIdBrand
export const UserId = Schema.String.pipe(Schema.fromBrand<UserId>("UserId"))

export const bothStructValue = Schema.Struct({
  alias: Alias50,
  iface: Iface50,
  user: UserId
}).make({
  alias: "hello" as Alias50,
  iface: "hello" as Iface50,
  user: "hello" as UserId
})

export class BothPerson extends Schema.Class<BothPerson>("BothPerson")({
  alias: Alias50,
  iface: Iface50
}) {}
export const bothPersonAlias = BothPerson.make({
  alias: "hello" as Alias50,
  iface: "hello" as Iface50
}).alias
export const bothPersonIface = BothPerson.make({
  alias: "hello" as Alias50,
  iface: "hello" as Iface50
}).iface
