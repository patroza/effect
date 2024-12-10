---
"effect": patch
---

JSONSchema: represent `never` as `{"not":{}}`

Before

```ts
import { JSONSchema, Schema } from "effect"

const schema = Schema.Never

console.log(JSON.stringify(JSONSchema.make(schema), null, 2))
/*
throws:
Error: Missing annotation
details: Generating a JSON Schema for this schema requires a "jsonSchema" annotation
schema (NeverKeyword): never
*/
```

After

```ts
import { JSONSchema, Schema } from "effect"

const schema = Schema.Never

console.log(JSON.stringify(JSONSchema.make(schema), null, 2))
/*
{
  "$id": "/schemas/never",
  "not": {},
  "title": "never",
  "$schema": "http://json-schema.org/draft-07/schema#"
}
*/
```