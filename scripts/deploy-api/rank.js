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

import { head, put } from "@vercel/blob"

/** 랭킹을 나누는 축. 여기 없는 값은 받지 않는다 — 오타로 유령 순위표가 생기는 걸 막는다. */
const GAMES = ["quiz", "hollywood", "highlow"]
const MODES = ["", "fresh50"]

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
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    // head 는 파일이 없으면 던진다. '아직 없음' 과 '읽기 실패' 를 여기서는 같게 다룬다.
    return []
  }
}

async function save(game, mode, rows) {
  await put(pathOf(game, mode), JSON.stringify(rows), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}

/** 점수 내림차순, 같으면 먼저 올린 쪽이 위. */
const ranked = (rows) =>
  rows.slice().sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)))

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x")
  const game = String(url.searchParams.get("game") ?? req.body?.game ?? "")
  const mode = String(url.searchParams.get("mode") ?? req.body?.mode ?? "")

  if (!GAMES.includes(game) || !MODES.includes(mode)) {
    return res.status(400).json({ error: "unknown game or mode" })
  }

  if (req.method === "GET") {
    const rows = ranked(await load(game, mode)).slice(0, TOP)
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ rows: rows.map(({ id, nickname, score }) => ({ id, nickname, score })) })
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}
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
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({
      id: entry.id,
      rows: top.map(({ id, nickname, score }) => ({ id, nickname, score })),
    })
  }

  res.setHeader("Allow", "GET, POST")
  return res.status(405).json({ error: "method not allowed" })
}
