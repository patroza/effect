---
"effect": patch
---

Make `Brand.Unbranded` and `Schema.fromBrand` work with the named-interface pattern so a folded type name (`NonEmptyString50`) is kept in the IDE / error messages. Type-alias intersections already form a hierarchy; the interface style is what failed to Unbrand (Effect-TS/effect#2268, #7490).
