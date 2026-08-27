import * as Brand from "../../Brand.ts";
import * as Schema from "../../Schema.ts";
import type * as Types from "../../Types.ts";
/**
 * Unbranded of a named-interface brand is `string`, so fromBrand can take
 * Schema.String. Type=A then keeps the `Iface50` alias on values.
 */
export interface IfaceNonEmptyBrand extends Brand.Brand<"NonEmptyString"> {
}
export interface Iface255Brand extends Types.Simplify<Brand.Brand<"NonEmptyString255"> & IfaceNonEmptyBrand> {
}
export interface Iface50Brand extends Types.Simplify<Brand.Brand<"NonEmptyString50"> & Iface255Brand> {
}
export type Iface50 = string & Iface50Brand;
export type UnbrandedIface50 = Brand.Brand.Unbranded<Iface50>;
export declare const unbrandedIface50Value: string;
export declare const Iface50: Schema.brand<Schema.String, Iface50>;
export declare const iface50Value: Iface50;
export declare const ifaceStructValue: {
    readonly title: Iface50;
};
