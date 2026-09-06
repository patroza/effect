import * as Brand from "../../Brand.ts";
import * as Schema from "../../Schema.ts";
/**
 * fromBrand Type=A only. A type-alias intersection stays the alias in .d.ts.
 * No named interface.
 */
export type Alias50 = string & Brand.Brand<"NonEmptyString50"> & Brand.Brand<"NonEmptyString255"> & Brand.Brand<"NonEmptyString">;
export declare const Alias50: Schema.brand<Schema.String, Alias50>;
export declare const alias50Value: Alias50;
export declare const aliasStructValue: {
    readonly title: Alias50;
};
export declare const aliasArrayValue: readonly Alias50[];
declare const AliasPerson_base: Schema.Class<AliasPerson, Schema.Struct<{
    readonly title: Schema.brand<Schema.String, Alias50>;
}>, {}>;
export declare class AliasPerson extends AliasPerson_base {
}
export declare const aliasPersonTitle: Alias50;
/** Control: string-key Schema.brand stays `string & Brand<"Email">`. */
export declare const Email: Schema.brand<Schema.String, "Email">;
export declare const emailValue: string & Brand.Brand<"Email">;
export {};
