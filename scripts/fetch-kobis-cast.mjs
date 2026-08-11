/**
 * KOBIS 영화별 출연진 수집
 *
 * data/kobis-boxoffice.json 의 movieCd 목록을 읽어, 영화마다 출연진을 받아온다.
 *
 * 실행:
 *   node scripts/fetch-kobis-cast.mjs
 *   node scripts/fetch-kobis-cast.mjs --limit=50      # 앞의 50편만 (시험용)
 *
 * 중단해도 안전하다. 이미 받은 영화는 건너뛰고 이어서 받는다.
 *
 * --- 엔드포인트 메모 ---
 * POST /kobis/business/mast/mvie/searchMovActorLists.do
 *   body: movieCd, CSRFToken
 *   Accept: application/json, text/javascript ...  ← 이 헤더가 없으면
 *                                                    빈 HTML 껍데기가 돌아온다
 * 응답은 JSON 배열. sortSeq 가 출연 비중 순서(1=주연 첫번째)라
 * 퀴즈 힌트 순서로 그대로 쓸 수 있다.
 *
 * 주의: KOBIS 는 인물 사진을 제공하지 않는다. 사진은 별도 소스가 필요하다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const LIST_URL =
  "https://www.kobis.or.kr/kobis/business/stat/boxs/findYearlyBoxOfficeList.do"
const CAST_URL =
  "https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovActorLists.do"

const IN_PATH = "data/kobis-boxoffice.json"
const OUT_PATH = "data/kobis-cast.json"

const DELAY_MS = 1000
/** 토큰이 만료될 수 있으므로 주기적으로 새로 받는다. */
const TOKEN_REFRESH_EVERY = 100
/** 중간에 끊겨도 손실을 줄이기 위해 주기적으로 저장한다. */
const SAVE_EVERY = 25

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getToken() {
  const res = await fetch(LIST_URL, { headers: { "User-Agent": UA } })
  const html = await res.text()
  const token = html.match(/name="CSRFToken"[^>]*value="([^"]+)"/)?.[1]
  if (!token) throw new Error("CSRFToken 을 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다.")
  return token
}

/** 필요한 필드만 남긴다. repFilmo 등은 제어문자가 섞여 있어 버린다. */
function slim(p) {
  return {
    peopleCd: p.peopleCd,
    name: p.peopleNm,
    nameEn: p.peopleNmEn || null,
    cast: p.cast || null,
    sortSeq: p.sortSeq,
    actorGb: p.actorGb, // 1=주연, 2=조연, 3=?, 5=단역
    birth: p.birYrMmdd || null,
  }
}

async function fetchCast(movieCd, token) {
  const res = await fetch(CAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      // 이 Accept 헤더가 JSON 응답을 결정한다.
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
      Referer: LIST_URL,
    },
    body: new URLSearchParams({ movieCd, CSRFToken: token }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const text = (await res.text()).trim()

  // 토큰이 만료되면 JSON 대신 HTML 껍데기가 돌아온다.
  if (!text.startsWith("[")) throw new Error("INVALID_RESPONSE")

  return JSON.parse(text).map(slim)
}

// ============================================

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

const boxoffice = JSON.parse(await readFile(IN_PATH, "utf8"))

// movieCd 기준 고유 영화 목록 (같은 영화가 두 해에 오를 수 있다)
const movies = [...new Map(boxoffice.movies.map((m) => [m.movieCd, m])).values()]
const targets = flags.limit ? movies.slice(0, Number(flags.limit)) : movies

// 이어받기: 기존 결과를 읽어 이미 받은 영화는 건너뛴다.
let out = { fetchedAt: null, movieCount: 0, castByMovie: {}, failures: [] }
if (existsSync(OUT_PATH)) {
  out = JSON.parse(await readFile(OUT_PATH, "utf8"))
  out.failures = [] // 실패 목록은 이번 실행 기준으로 다시 쌓는다
}

const todo = targets.filter((m) => !out.castByMovie[m.movieCd])

console.log(`\nKOBIS 출연진 수집`)
console.log(`  대상 ${targets.length}편 중 ${todo.length}편 남음 (완료 ${targets.length - todo.length}편)`)
console.log(`  예상 소요 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 수집되었습니다.\n")
  process.exit(0)
}

let token = await getToken()
let done = 0
let peopleTotal = 0

async function save() {
  out.fetchedAt = new Date().toISOString()
  out.movieCount = Object.keys(out.castByMovie).length
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const movie of todo) {
  if (done > 0 && done % TOKEN_REFRESH_EVERY === 0) {
    token = await getToken()
  }

  try {
    let cast
    try {
      cast = await fetchCast(movie.movieCd, token)
    } catch (err) {
      // 토큰 만료로 보이면 한 번만 갱신 후 재시도한다.
      if (err.message === "INVALID_RESPONSE") {
        token = await getToken()
        cast = await fetchCast(movie.movieCd, token)
      } else {
        throw err
      }
    }

    out.castByMovie[movie.movieCd] = cast
    peopleTotal += cast.length

    const lead = cast.filter((c) => c.actorGb === "1").length
    console.log(
      `  [${String(++done).padStart(4)}/${todo.length}] ${movie.title} — ${cast.length}명 (주연 ${lead})`
    )
  } catch (err) {
    out.failures.push({ movieCd: movie.movieCd, title: movie.title, reason: err.message })
    console.error(`  [${String(++done).padStart(4)}/${todo.length}] ${movie.title} — 실패: ${err.message}`)
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const allPeople = new Set()
for (const cast of Object.values(out.castByMovie)) {
  for (const p of cast) allPeople.add(p.peopleCd)
}

console.log(`\n수집 완료`)
console.log(`  영화 ${out.movieCount}편, 출연 기록 ${peopleTotal}건`)
console.log(`  고유 배우 ${allPeople.size}명`)
if (out.failures.length) console.log(`  실패 ${out.failures.length}편`)
console.log(`  저장: ${OUT_PATH}\n`)
