---
"effect": patch
---

Preserve named inheriting `Brand` types through `Brand.Unbranded`, `Schema.brand<Named>("id")`, and `Schema.fromBrand`. A narrower brand such as `NonEmptyString50` stays assignable to parents such as `NonEmptyString255`, remains opaque to siblings, and does not expand into a reconstructed key intersection. Type-only brands no longer need `Brand.nominal` — `Schema.brand<Named>("id")` or `Schema.fromBrand<Named>("id")` is enough.
