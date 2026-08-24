---
"effect": patch
---

Preserve named inheriting `Brand` types through `Brand.Unbranded` and `Schema.fromBrand`, so a narrower brand such as `NonEmptyString50` stays assignable to parents such as `NonEmptyString255`, remains opaque to siblings, and does not expand into a reconstructed key intersection.
