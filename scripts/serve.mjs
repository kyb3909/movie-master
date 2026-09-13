/**
 * 로컬 미리보기 서버
 *
 * 실행:
 *   node scripts/serve.mjs          → http://localhost:8899
 *   node scripts/serve.mjs --port=3100
 *
 * data/ 의 정적 파일을 서빙한다.
 * 캐시를 끄기 때문에 퀴즈를 재생성하면 새로고침만으로 바로 반영된다.
 */

import { createServer } from "node:http"
import { readFile, writeFile, stat } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}
const PORT = Number(flags.port || 8899)

// 기본은 data/ 지만, 배포 폴더(deploy/noorung-quiz)를 그대로 확인할 때도 쓴다.
// 그쪽은 index.html 이 랜딩이라 기본 문서도 함께 바뀌어야 한다.
const ROOT = String(flags.root || "data")
const INDEX = String(flags.index || (ROOT === "data" ? "quiz-play.html" : "index.html"))

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
}

/** 검수 페이지가 저장을 누르면 여기로 보낸다. */
const OVERRIDES_PATH = "data/quiz-overrides.json"

/**
 * 검수 결과를 파일로 남긴다.
 *
 * 내려받기 방식으로 하면 사용자가 Downloads 에서 파일을 찾아 data/ 로 옮겨야 한다.
 * 어차피 이 서버는 내 컴퓨터에서만 도는 검수용이므로 바로 쓰는 편이 낫다.
 */
async function saveOverrides(req, res) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 2_000_000) { res.writeHead(413).end('{"ok":false}'); return }
  }

  try {
    const incoming = JSON.parse(body)

    // 기존 파일의 제목 교정 같은 손으로 넣은 값은 지우지 않는다.
    let prev = {}
    try { prev = JSON.parse(await readFile(OVERRIDES_PATH, "utf8")) } catch {}

    const next = {
      ...prev,
      updatedAt: new Date().toISOString(),
      excluded: {
        quiz: [...new Set(incoming.quiz ?? [])],
        hollywood: [...new Set(incoming.hollywood ?? [])],
      },
    }

    await writeFile(OVERRIDES_PATH, JSON.stringify(next, null, 2) + "\n", "utf8")

    const n = next.excluded.quiz.length + next.excluded.hollywood.length
    console.log(`  저장됨 — 제외 ${n}편 (한국 ${next.excluded.quiz.length} · 헐리우드 ${next.excluded.hollywood.length})`)

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
    res.end(JSON.stringify({ ok: true, count: n }))
  } catch (err) {
    console.error(`  저장 실패: ${err.message}`)
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
    res.end(JSON.stringify({ ok: false, error: err.message }))
  }
}

const server = createServer(async (req, res) => {
  // 쿼리스트링을 떼고, 상위 디렉터리 탈출을 막는다.
  const raw = decodeURIComponent(req.url.split("?")[0])
  const rel = normalize(raw === "/" ? INDEX : raw.replace(/^\/+/, ""))

  if (req.method === "POST" && raw === "/api/overrides") {
    await saveOverrides(req, res)
    return
  }

  if (rel.startsWith("..")) {
    res.writeHead(403).end("forbidden")
    return
  }

  // Vercel 의 cleanUrls 를 흉내 낸다.
  // 랜딩이 /quiz 처럼 확장자 없이 링크하므로, 로컬에서도 .html 을 찾아줘야
  // 배포 전에 링크를 눌러볼 수 있다. 안 그러면 로컬에서만 404 가 난다.
  let file = join(ROOT, rel)
  if (!extname(file)) {
    try {
      const withHtml = file + ".html"
      if ((await stat(withHtml)).isFile()) file = withHtml
    } catch { /* 없으면 원래 경로로 진행해 404 를 낸다 */ }
  }

  try {
    const s = await stat(file)
    if (!s.isFile()) throw new Error("not a file")

    const body = await readFile(file)
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      // 재생성 후 새로고침만으로 반영되도록 캐시를 끈다.
      "Cache-Control": "no-store, must-revalidate",
    })
    res.end(body)
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
    res.end(`<meta charset="utf-8"><p>없는 파일: ${rel}</p>
      <p><a href="/">${INDEX}</a></p>`)
  }
})

server.listen(PORT, () => {
  console.log(`\n로컬 서버 실행 중  (${ROOT}/)`)
  console.log(`  http://localhost:${PORT}/  →  ${INDEX}`)
  console.log(`\n  종료하려면 Ctrl+C\n`)
})
