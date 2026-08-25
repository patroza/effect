---
"effect": patch
---

Preserve named inheriting `Brand` types through `Brand.Unbranded` and `Schema.fromBrand`. A narrower brand such as `NonEmptyString50` stays assignable to parents such as `NonEmptyString255`, remains opaque to siblings, and does not expand into a reconstructed key intersection. Type-only brands can use `Schema.fromBrand<Named>("id")` without `Brand.nominal`. This changes `fromBrand`'s return from `brand<S, Keys<A>>` to `brand<S, A>`.
