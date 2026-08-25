---
"effect": patch
---

Fix `Brand.Unbranded` / `Schema.fromBrand` for named inheriting brands (Effect-TS/effect#2268). `fromBrand<NonEmptyString50>` keeps Type as `NonEmptyString50` (name alias + assignable to `NonEmptyString255`), not a reconstructed `Brand<K>` intersection.
