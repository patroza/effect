---
"effect": patch
---

Make `Brand.Unbranded` and `Schema.fromBrand` work with named-interface brands so the folded name (`NonEmptyString50`) is kept. Type-alias intersections already form a hierarchy; the interface style is what failed to Unbrand (Effect-TS/effect#2268, #7490).
