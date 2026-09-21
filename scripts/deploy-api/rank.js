/**
 * 랭킹 API  (Vercel 서버리스 함수 · /api/rank)
 *
 *   GET  /api/rank?game=quiz&mode=      상위 10명
 *   POST /api/rank  {game, mode, nickname, score}
 *
 * 저장소는 Vercel Blob 이다. 게임·난이도별로 JSON 한 덩어리를 두고 통째로 읽고 쓴다.
 *
 * --- 이 방식의 한계를 알고 쓴다 ---
 * 읽고-고쳐-쓰기라서, 두 사람이 같은 순간에 등록하면 나중 쓰기가 먼저 것을 덮어
 * 한 건이 사라질 수 있다. 원자적 증가를 주는 Redis 계열이면 없을 문제다.
 * 지금은 하루 수십 건 규모라 이 확률을 받아들이고, 대신 코드를 단순하게 둔다.
 * 동시 등록이 실제로 잦아지면 그때 Upstash 로 옮긴다.
 *
 * 목록은 상위 100건만 남긴다. 순위표는 10등까지만 보여주고, 나머지는 커지기만 한다.
 */

import { head, put, BlobNotFoundError } from "@vercel/blob"

/** 랭킹을 나누는 축. 여기 없는 값은 받지 않는다 — 오타로 유령 순위표가 생기는 걸 막는다. */
const MODES_BY_GAME = {
  quiz: ["", "hard"],
  hollywood: ["", "hard"],
  grid: ["easy", "hard", "hollywood-easy", "hollywood-hard"],
  highlow: ["", "all", "fresh50"],
}

const NICK_MAX = 12
const SCORE_MAX = 1000
const KEEP = 100
const TOP = 10

const pathOf = (game, mode) => `rank/${game}${mode ? "-" + mode : ""}.json`

/** 저장된 목록. 아직 아무도 등록하지 않았으면 빈 배열이다. */
async function load(game, mode) {
  try {
    const meta = await head(pathOf(game, mode))
    const res = await fetch(meta.url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Ranking read failed: HTTP ${res.status}`)
    const rows = await res.json()
    if (!Array.isArray(rows)) throw new Error("Invalid ranking data")
    return rows
  } catch (error) {
    // 실제로 없는 순위표만 새로 만든다. 읽기 장애 때 기존 기록을 덮어쓰지 않는다.
    if (error instanceof BlobNotFoundError) return []
    throw error
  }
}

async function save(game, mode, rows) {
  await put(pathOf(game, mode), JSON.stringify(rows), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  })
}

/** 점수 내림차순, 같으면 먼저 올린 쪽이 위. */
const ranked = (rows) =>
  rows.slice().sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)))

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).json({ error: "method not allowed" })
  }

  let body = {}
  if (req.method === "POST") {
    try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {} }
    catch { return res.status(400).json({ error: "invalid JSON" }) }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "invalid body" })
    }
  }
  const url = new URL(req.url, "http://x")
  const game = String(url.searchParams.get("game") ?? body.game ?? "")
  const mode = String(url.searchParams.get("mode") ?? body.mode ?? (game === "grid" ? "easy" : ""))

  if (!Object.hasOwn(MODES_BY_GAME, game) || !MODES_BY_GAME[game].includes(mode)) {
    return res.status(400).json({ error: "unknown game or mode" })
  }

  try {
    if (req.method === "GET") {
      const rows = ranked(await load(game, mode)).slice(0, TOP)
      return res.status(200).json({ rows: rows.map(({ id, nickname, score }) => ({ id, nickname, score })) })
    }

    const nickname = String(body.nickname ?? "").trim().slice(0, NICK_MAX)
    const score = Math.round(Number(body.score))

    if (!nickname) return res.status(400).json({ error: "nickname required" })
    if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
      return res.status(400).json({ error: "score out of range" })
    }

    const rows = await load(game, mode)
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nickname, score, at: new Date().toISOString() }
    rows.push(entry)
    await save(game, mode, ranked(rows).slice(0, KEEP))

    const top = ranked(rows).slice(0, TOP)
    return res.status(200).json({
      id: entry.id,
      rows: top.map(({ id, nickname, score }) => ({ id, nickname, score })),
    })
  } catch (error) {
    console.error("Ranking storage failure", { game, mode, method: req.method, message: error.message })
    return res.status(503).json({ error: "ranking unavailable", message: "랭킹을 저장하거나 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." })
  }
}
