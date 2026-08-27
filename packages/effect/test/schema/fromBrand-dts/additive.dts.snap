import * as Brand from "../../Brand.ts";
import * as Schema from "../../Schema.ts";
import type * as Types from "../../Types.ts";
/** Alias side: fromBrand Type=A, no interface. */
export type Alias50 = string & Brand.Brand<"NonEmptyString50"> & Brand.Brand<"NonEmptyString255"> & Brand.Brand<"NonEmptyString">;
export declare const Alias50: Schema.brand<Schema.String, Alias50>;
/** Interface side: Unbranded + Type=A, plus a child that `extends` the parent brand. */
export interface IfaceNonEmptyBrand extends Brand.Brand<"NonEmptyString"> {
}
export interface Iface255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & IfaceNonEmptyBrand> {
}
export interface Iface50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & Iface255Brand> {
}
export type Iface50 = string & Iface50Brand;
export declare const Iface50: Schema.brand<Schema.String, Iface50>;
export interface UserIdBrand extends Types.Simplify<Brand.Brand<"UserId"> & Iface50Brand> {
}
export type UserId = string & UserIdBrand;
export declare const UserId: Schema.brand<Schema.String, UserId>;
export declare const bothStructValue: {
    readonly alias: Alias50;
    readonly iface: Iface50;
    readonly user: UserId;
};
declare const BothPerson_base: Schema.Class<BothPerson, Schema.Struct<{
    readonly alias: Schema.brand<Schema.String, Alias50>;
    readonly iface: Schema.brand<Schema.String, Iface50>;
}>, {}>;
export declare class BothPerson extends BothPerson_base {
}
export declare const bothPersonAlias: Alias50;
export declare const bothPersonIface: Iface50;
export {};
