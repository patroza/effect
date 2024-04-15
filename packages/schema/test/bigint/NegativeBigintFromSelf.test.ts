import * as S from "@effect/schema/Schema"
import * as Util from "@effect/schema/test/util"
import { describe, it } from "vitest"

describe("bigint > NegativeBigintFromSelf", () => {
  const schema = S.NegativeBigIntFromSelf

  it("decoding", async () => {
    await Util.expectDecodeUnknownFailure(
      schema,
      0n,
      `NegativeBigintFromSelf
└─ Predicate refinement failure
   └─ Expected NegativeBigintFromSelf (a negative bigint), actual 0n`
    )
    await Util.expectDecodeUnknownFailure(
      schema,
      1n,
      `NegativeBigintFromSelf
└─ Predicate refinement failure
   └─ Expected NegativeBigintFromSelf (a negative bigint), actual 1n`
    )
  })

  it("encoding", async () => {
    await Util.expectEncodeSuccess(schema, -1n, -1n)
  })
})
