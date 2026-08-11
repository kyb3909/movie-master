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
import { readFile, stat } from "node:fs/promises"
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

const server = createServer(async (req, res) => {
  // 쿼리스트링을 떼고, 상위 디렉터리 탈출을 막는다.
  const raw = decodeURIComponent(req.url.split("?")[0])
  const rel = normalize(raw === "/" ? INDEX : raw.replace(/^\/+/, ""))

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
