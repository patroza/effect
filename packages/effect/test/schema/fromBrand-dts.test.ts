import { describe, it } from "@effect/vitest"
import { deepStrictEqual } from "node:assert"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const snapshotDir = join(here, "fromBrand-dts")
const emittedDir = join(here, "../../dist/internal/fromBrandDts")

const stripMap = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("//# sourceMappingURL="))
    .join("\n")
    .replace(/\s+$/, "") + "\n"

describe("fromBrand declaration emit", () => {
  it("matches alias / interface / additive .d.ts snapshots", () => {
    const names = readdirSync(snapshotDir).filter((name) => name.endsWith(".d.ts")).sort()
    deepStrictEqual(names, ["additive.d.ts", "alias.d.ts", "interface.d.ts"])
    for (const name of names) {
      const emitted = stripMap(readFileSync(join(emittedDir, name), "utf8"))
      const snapshot = stripMap(readFileSync(join(snapshotDir, name), "utf8"))
      deepStrictEqual(emitted, snapshot, name)
    }
  })
})
