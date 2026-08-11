/**
 * KOBIS 영화 포스터 수집
 *
 * data/kobis-boxoffice.json 의 movieCd 목록을 읽어 영화별 포스터 URL 을 모은다.
 *
 * 실행:
 *   node scripts/fetch-kobis-posters.mjs
 *   node scripts/fetch-kobis-posters.mjs --limit=20
 *
 * 중단해도 안전하다. 이미 받은 영화는 건너뛴다.
 *
 * --- 메모 ---
 * 상세 페이지 응답(searchMovieDtl.do)에 포스터가 들어 있다. 출연진과 달리
 * CSRF 토큰이나 Accept 헤더가 필요 없다.
 *
 *   fn_photoDtl('<경로>','<제목>','post')  → 썸네일(thumb_x640) 경로
 *   orgsrc="<경로>"                        → 원본 경로
 *
 * 원본은 해상도가 높지만 용량이 크다. 둘 다 저장해 두고 쓰는 쪽에서 고른다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const DTL_URL = "https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieDtl.do"
const HOST = "https://www.kobis.or.kr"

const IN_PATH = "data/kobis-boxoffice.json"
const OUT_PATH = "data/kobis-posters.json"

const DELAY_MS = 1000
const SAVE_EVERY = 25
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0 Safari/537.36"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

async function fetchPosters(movieCd) {
  const res = await fetch(DTL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
    },
    body: new URLSearchParams({
      code: movieCd,
      sType: "",
      titleYN: "Y",
      etcParam: "",
      isOuterReq: "false",
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

  // 썸네일 경로 (포스터만, 스틸컷 제외)
  const thumbs = [
    ...html.matchAll(/fn_photoDtl\('([^']+)','[^']*',\s*'post'\)/g),
  ].map((m) => m[1])

  // 원본 경로. 썸네일 파일명(thn_<hash>.jpg)과 <hash> 로 짝지어진다.
  const origs = [...html.matchAll(/orgsrc="([^"]+)"/g)].map((m) => m[1])
  const origByHash = new Map()
  for (const o of origs) {
    const hash = o.match(/\/([a-f0-9]{32})\.(?:jpg|jpeg|png)$/i)?.[1]
    if (hash) origByHash.set(hash, o)
  }

  return thumbs.map((t) => {
    const hash = t.match(/thn_([a-f0-9]{32})\./i)?.[1]
    return {
      thumb: HOST + t,
      original: hash && origByHash.has(hash) ? HOST + origByHash.get(hash) : null,
    }
  })
}

// ============================================

const boxoffice = JSON.parse(await readFile(IN_PATH, "utf8"))
const movies = [...new Map(boxoffice.movies.map((m) => [m.movieCd, m])).values()]
const targets = flags.limit ? movies.slice(0, Number(flags.limit)) : movies

let out = { fetchedAt: null, byMovieCd: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))

const todo = targets.filter((m) => !out.byMovieCd[m.movieCd])

console.log(`\nKOBIS 포스터 수집`)
console.log(`  대상 ${targets.length}편 중 ${todo.length}편 남음`)
console.log(`  예상 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 수집되었습니다.\n")
  process.exit(0)
}

let done = 0
let withPoster = 0
const failures = []

async function save() {
  out.fetchedAt = new Date().toISOString()
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const movie of todo) {
  done++
  try {
    const posters = await fetchPosters(movie.movieCd)
    out.byMovieCd[movie.movieCd] = { title: movie.title, posters }
    if (posters.length) withPoster++

    if (done % 50 === 0 || posters.length === 0) {
      console.log(
        `  [${String(done).padStart(4)}/${todo.length}] ${movie.title} — 포스터 ${posters.length}장`
      )
    }
  } catch (err) {
    failures.push({ movieCd: movie.movieCd, title: movie.title, reason: err.message })
    console.error(`  [${String(done).padStart(4)}/${todo.length}] ${movie.title} — 실패: ${err.message}`)
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const total = Object.values(out.byMovieCd).reduce((n, v) => n + v.posters.length, 0)
console.log(`\n수집 완료`)
console.log(`  영화 ${Object.keys(out.byMovieCd).length}편, 포스터 ${total}장`)
console.log(`  포스터 있는 영화 ${withPoster}편`)
if (failures.length) console.log(`  실패 ${failures.length}편`)
console.log(`  저장: ${OUT_PATH}\n`)
