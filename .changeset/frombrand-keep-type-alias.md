---
"effect": patch
---

`Schema.fromBrand<A>` uses `A` as Type so a type alias stays `NonEmptyString50` in `.d.ts` (make, Struct, Class fields). Named-interface brands Unbrand to `string` so they can still pipe `Schema.String`, and a child can `extends` the parent brand (Effect-TS/effect#2268, #7490).
