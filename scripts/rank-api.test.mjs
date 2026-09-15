import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createContext, SourceTextModule, SyntheticModule } from "node:vm"

const source = await readFile(new URL("./deploy-api/rank.js", import.meta.url), "utf8")

async function api({ readError, writeError, invalidData } = {}) {
  const records = new Map(), writes = [], errors = []
  class BlobNotFoundError extends Error {}
  const context = createContext({
    URL,
    console: { error: (...message) => errors.push(message) },
    fetch: async (url) => ({
      ok: !readError, status: readError ? 500 : 200,
      json: async () => invalidData ? { wrong: true } : records.get(new URL(url).pathname.slice(1)),
    }),
  })
  const blob = new SyntheticModule(["head", "put", "BlobNotFoundError"], function () {
    this.setExport("BlobNotFoundError", BlobNotFoundError)
    this.setExport("head", async (path) => {
      if (!records.has(path)) throw new BlobNotFoundError()
      return { url: "https://example.invalid/" + path }
    })
    this.setExport("put", async (path, data, options) => {
      assert.ok(options.cacheControlMaxAge >= 60)
      if (writeError) throw new Error("storage unavailable")
      writes.push(path)
      records.set(path, JSON.parse(data))
    })
  }, { context })
  const module = new SourceTextModule(source, { context })
  await module.link(() => blob)
  await module.evaluate()
  async function request(method, url, body) {
    const res = {
      headers: {}, code: 0, body: null,
      setHeader(key, value) { this.headers[key] = value },
      status(code) { this.code = code; return this },
      json(body) { this.body = JSON.parse(JSON.stringify(body)); return this },
    }
    await module.namespace.default({ method, url, body }, res)
    return res
  }
  return { request, records, writes, errors }
}

test("every current game/mode can register and retrieve a score", async () => {
  const { request, records } = await api()
  const combinations = { quiz: ["", "hard"], hollywood: ["", "hard"], grid: ["easy", "hard"], highlow: ["", "all", "fresh50"] }
  for (const [game, modes] of Object.entries(combinations)) {
    for (const mode of modes) {
      const path = `/api/rank?game=${game}&mode=${mode}`
      assert.deepEqual((await request("GET", path)).body.rows, [])
      const posted = await request("POST", "/api/rank", { game, mode, nickname: "검증", score: 7 })
      assert.equal(posted.code, 200, `${game}/${mode}`)
      assert.ok(posted.body.id)
      const read = await request("GET", path)
      assert.equal(read.code, 200)
      assert.equal(read.body.rows[0].score, 7)
      assert.equal(read.headers["Cache-Control"], "no-store")
    }
  }
  assert.equal(records.size, 9)
})

test("string JSON bodies are parsed before game and mode validation", async () => {
  const { request, records } = await api()
  const result = await request("POST", "/api/rank", JSON.stringify({ game: "grid", nickname: "격자", score: 9 }))
  assert.equal(result.code, 200)
  assert.equal(records.get("rank/grid-easy.json")[0].score, 9)
})

test("invalid requests never reach storage", async () => {
  const { request, writes } = await api()
  for (const body of ["{", "null", "[]", { game: "grid", mode: "all" }, { game: "quiz", nickname: "", score: 7 }, { game: "quiz", nickname: "닉", score: -1 }]) {
    assert.equal((await request("POST", "/api/rank", body)).code, 400)
  }
  assert.equal((await request("GET", "/api/rank?game=__proto__")).code, 400)
  assert.equal((await request("DELETE", "/api/rank?game=quiz")).code, 405)
  assert.equal(writes.length, 0)
})

test("a failed or corrupt read never overwrites an existing leaderboard", async () => {
  for (const options of [{ readError: true }, { invalidData: true }]) {
    const { request, records, writes } = await api(options)
    records.set("rank/quiz.json", [{ id: "existing", nickname: "기존", score: 50, at: "2026-09-15" }])
    assert.equal((await request("POST", "/api/rank", { game: "quiz", nickname: "신규", score: 30 })).code, 503)
    assert.equal(writes.length, 0)
    assert.equal(records.get("rank/quiz.json")[0].id, "existing")
  }
})

test("save errors are reported as retryable errors without claiming success", async () => {
  const { request } = await api({ writeError: true })
  const result = await request("POST", "/api/rank", { game: "hollywood", nickname: "닉", score: 80 })
  assert.equal(result.code, 503)
  assert.equal(result.body.id, undefined)
})
