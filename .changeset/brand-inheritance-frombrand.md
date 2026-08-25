---
"effect": patch
---

Preserve Brand name aliases and inheritance through `Brand.Unbranded` and `Schema.fromBrand`. `fromBrand<NonEmptyString255>("NonEmptyString255")` keeps schema Type as `NonEmptyString255` instead of `string & Brand<"NonEmptyString255"> & Brand<"NonEmptyString">`. A narrower brand such as `NonEmptyString50` stays assignable to that parent. Type-only brands can use `Schema.fromBrand<Named>("id")` without `Brand.nominal`. This changes `fromBrand`'s return from `brand<S, Keys<A>>` to `brand<S, A>`.
