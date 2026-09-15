import test from "node:test"
import assert from "node:assert/strict"
import { cleanCasting, encodeCasting, decodeCasting } from "./casting-data.mjs"

const project = { id: "avengers-2012", roles: [{ id: "ironman" }, { id: "thor" }, { id: "widow" }] }
const actors = [{ id: "10055626" }, { id: "20170901" }, { id: "10061467" }]

test("a completed casting survives sharing, independent of object key order", () => {
  const picks = { widow: "10061467", ironman: "10055626", thor: "20170901" }
  assert.deepEqual(decodeCasting(encodeCasting(picks, project, actors), project, actors), picks)
})

test("partial and empty drafts preserve empty roles", () => {
  for (const picks of [{}, { thor: "20170901" }]) {
    assert.deepEqual(decodeCasting(encodeCasting(picks, project, actors), project, actors), picks)
  }
})

test("stored drafts discard unknown actors, roles, and duplicate casting", () => {
  assert.deepEqual(cleanCasting({ ironman: "10055626", thor: "10055626", widow: "deleted", other: "10061467" }, project.roles, actors), { ironman: "10055626" })
  for (const value of [null, [], "bad", 42]) assert.deepEqual(cleanCasting(value, project.roles, actors), {})
})

test("malformed, mismatched, or manipulated shared links are rejected", () => {
  for (const hash of ["", "#cast=other:10055626.-.-", "#cast=avengers-2012:10055626", "#cast=avengers-2012:10055626.-.-.-", "#cast=avengers-2012:10055626.10055626.-", "#cast=avengers-2012:9999.-.-", "#cast=avengers-2012:<script>.-.-", "#cast=avengers-2012:" + "0".repeat(501)]) {
    assert.equal(decodeCasting(hash, project, actors), null, hash)
  }
})

test("invalid values cannot be carried into a generated sharing link", () => {
  assert.equal(encodeCasting({ ironman: '<img src=x onerror=alert(1)>', thor: "20170901" }, project, actors), "#cast=avengers-2012:-.20170901.-")
})
