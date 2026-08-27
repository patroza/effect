---
"effect": patch
---

Make `Schema.fromBrand<A>` use `A` as Type so a type alias (`NonEmptyString50`) is kept. Also Unbrand named-interface brands so that style can still pipe `Schema.String` (Effect-TS/effect#2268, #7490).
