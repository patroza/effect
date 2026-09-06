import { describe, it } from "@effect/vitest"
import { match, ok } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const snapshotDir = join(dirname(fileURLToPath(import.meta.url)), "fromBrand-dts")
const read = (name: string) => readFileSync(join(snapshotDir, name), "utf8")

describe("fromBrand declaration emit", () => {
  it("fromBrand Type=A keeps a type-alias brand", () => {
    const dts = read("alias.dts.snap")
    match(dts, /export declare const alias50Value: Alias50;/)
    match(dts, /readonly title: Alias50;/)
    match(dts, /export declare const aliasArrayValue: readonly Alias50\[\];/)
    match(dts, /export declare const aliasPersonTitle: Alias50;/)
    match(dts, /export declare const emailValue: string & Brand\.Brand<"Email">;/)
    ok(!/alias50Value: string & Brand/.test(dts))
  })

  it("named-interface Unbranded peels to string; Type=A keeps Iface50", () => {
    const dts = read("interface.dts.snap")
    match(dts, /export declare const unbrandedIface50Value: string;/)
    match(dts, /export declare const iface50Value: Iface50;/)
    match(dts, /readonly title: Iface50;/)
    ok(!/iface50Value: string & Iface50Brand/.test(dts))
  })

  it("additive: alias + interface + child extends in one Struct/Class", () => {
    const dts = read("additive.dts.snap")
    match(dts, /export interface UserIdBrand extends Types\.Simplify<Brand\.Brand<"UserId"> & Iface50Brand>/)
    match(dts, /readonly alias: Alias50;/)
    match(dts, /readonly iface: Iface50;/)
    match(dts, /readonly user: UserId;/)
    match(dts, /export declare const bothPersonAlias: Alias50;/)
    match(dts, /export declare const bothPersonIface: Iface50;/)
  })
})
