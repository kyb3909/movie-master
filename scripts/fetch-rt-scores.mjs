/**
 * OMDb 로 로튼토마토 지수 수집
 *
 * data/hollywood-catalog.json 의 영화 목록을 읽어, imdbId 로 OMDb 를 조회하고
 * 로튼토마토 지수(tomatometer) 를 모은다. 하이/로우 게임의 원천 데이터다.
 *
 * 실행:
 *   node --env-file=.env scripts/fetch-rt-scores.mjs              # 하루 예산(900편)만큼
 *   node --env-file=.env scripts/fetch-rt-scores.mjs --limit=200  # 더 적게
 *   node --env-file=.env scripts/fetch-rt-scores.mjs --force      # 이미 받은 것도 다시
 *   node scripts/fetch-rt-scores.mjs --self-test                  # 네트워크 없이 파싱 검증
 *
 * --- 제목 검색을 쓰지 않는 이유 ---
 * 이 저장소는 예전에 '이름으로 검색' 하다가 동명이인 사진이 뒤섞이는 사고를 겪었다.
 * OMDb 도 ?t=제목 검색을 지원하지만 같은 제목의 다른 영화(리메이크·동명 TV영화)가
 * 조용히 섞여 들어온다. 여기서는 오직 ?i=imdbID 직접 조회만 쓴다.
 * imdbId 가 없는 영화는 추측하지 않고 건너뛰고, 그 수를 보고한다.
 *
 * --- 이어받기가 이 스크립트의 핵심인 이유 ---
 * OMDb 무료 티어는 하루 1,000 요청이다. 2,000편이면 최소 이틀에 나눠 받아야 한다.
 * 그래서 (1) 이미 조회한 imdbId 는 건너뛰고, (2) 로튼 지수가 '없다'는 사실도
 * 기록해서 다음 실행 때 다시 부르지 않으며, (3) 50편마다 중간 저장해서
 * 중간에 끊겨도 이미 태운 요청이 날아가지 않게 한다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const OMDB_URL = "https://www.omdbapi.com/"

const IN_PATH = "data/hollywood-catalog.json"
const OUT_PATH = "data/rt-scores.json"

/** OMDb 는 명시적 rate limit 이 없지만 무료 키를 예의 있게 쓰기 위한 간격 */
const DELAY_MS = 200
const SAVE_EVERY = 50
const DEFAULT_LIMIT = 900

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

// ============================================
// 파싱
// ============================================

/**
 * 예산 소진/키 무효처럼 '더 돌려봐야 소용없는' 상황.
 * 일반 오류와 구분해서, 만나는 즉시 루프를 세우고 저장한 뒤 이유를 출력한다.
 */
class BudgetError extends Error {}

/** "88%" → 88, "N/A" → null. 0~100 범위를 벗어나면 버린다. */
function parsePercent(value) {
  const n = Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null
}

/** "7.6" → 7.6, "N/A" → null */
function parseNumber(value) {
  const n = Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? n : null
}

/**
 * OMDb 응답 → 저장 레코드.
 *
 * 로튼 지수는 최상위 필드가 아니라 Ratings 배열 안에 Source 로 구분돼 들어온다.
 * (ingest-catalog.mjs 의 ingestRottenScores 와 같은 방식)
 *
 * Metascore / imdbRating 도 함께 저장한다. 나중에 다른 게임에 쓸 수 있고,
 * 로튼이 없는 영화의 대체 지표로 쓸지 검토하려면 지금 같이 받아둬야 한다.
 * (나중에 따로 받으려면 요청 예산을 한 번 더 태워야 한다.)
 *
 * status:
 *   ok        - 로튼 지수를 얻었다
 *   no-rt     - 영화는 있는데 로튼 지수가 없다
 *   not-found - OMDb 가 Response:"False" 로 답했다 (해당 imdbID 없음 등)
 */
function parseOmdb(json) {
  if (!json || json.Response === "False") {
    return {
      tomatometer: null,
      metascore: null,
      imdbRating: null,
      status: "not-found",
    }
  }

  // Ratings 필드 자체가 없는 응답도 있다. 배열로 정규화하고 본다.
  const ratings = Array.isArray(json.Ratings) ? json.Ratings : []
  const rt = ratings.find((r) => r?.Source === "Rotten Tomatoes")
  const tomatometer = rt ? parsePercent(rt.Value) : null

  return {
    tomatometer,
    metascore: parsePercent(json.Metascore),
    imdbRating: parseNumber(json.imdbRating),
    status: tomatometer === null ? "no-rt" : "ok",
  }
}

// ============================================
// 셀프 테스트 (네트워크 없이 파싱만 검증)
// ============================================

const FIXTURES = [
  {
    name: "로튼 있음 (The Matrix)",
    input: {
      Title: "The Matrix",
      Year: "1999",
      Metascore: "73",
      imdbRating: "8.7",
      Ratings: [
        { Source: "Internet Movie Database", Value: "8.7/10" },
        { Source: "Rotten Tomatoes", Value: "83%" },
        { Source: "Metacritic", Value: "73/100" },
      ],
      Response: "True",
    },
    expect: { tomatometer: 83, metascore: 73, imdbRating: 8.7, status: "ok" },
  },
  {
    name: "로튼 없이 IMDb 만",
    input: {
      Title: "Some Obscure Film",
      Year: "1974",
      Metascore: "N/A",
      imdbRating: "6.1",
      Ratings: [{ Source: "Internet Movie Database", Value: "6.1/10" }],
      Response: "True",
    },
    expect: { tomatometer: null, metascore: null, imdbRating: 6.1, status: "no-rt" },
  },
  {
    name: 'Response:"False"',
    input: { Response: "False", Error: "Incorrect IMDb ID." },
    expect: { tomatometer: null, metascore: null, imdbRating: null, status: "not-found" },
  },
  {
    name: "Ratings 필드 자체가 없음",
    input: {
      Title: "No Ratings Film",
      Year: "1981",
      Metascore: "N/A",
      imdbRating: "N/A",
      Response: "True",
    },
    expect: { tomatometer: null, metascore: null, imdbRating: null, status: "no-rt" },
  },
]

function runSelfTest() {
  console.log(`\nOMDb 파싱 셀프 테스트 (네트워크 없음)\n`)

  let failed = 0
  for (const f of FIXTURES) {
    const got = parseOmdb(f.input)
    const diffs = Object.entries(f.expect)
      .filter(([k, v]) => got[k] !== v)
      .map(([k, v]) => `${k}: 기대 ${JSON.stringify(v)} / 실제 ${JSON.stringify(got[k])}`)

    if (diffs.length === 0) {
      console.log(`  ✓ ${f.name}`)
      console.log(`      → ${JSON.stringify(got)}`)
    } else {
      failed++
      console.log(`  ✗ ${f.name}`)
      for (const d of diffs) console.log(`      ${d}`)
    }
  }

  console.log(`\n${FIXTURES.length - failed}/${FIXTURES.length} 통과\n`)
  process.exit(failed ? 1 : 0)
}

if (flags["self-test"]) runSelfTest()

// ============================================
// 수집
// ============================================

const OMDB_KEY = process.env.OMDB_API_KEY
if (!OMDB_KEY) {
  console.error(`
환경변수 OMDB_API_KEY 가 없습니다.

  1) https://www.omdbapi.com/apikey.aspx 에서 무료 키를 발급받으세요 (하루 1,000 요청)
  2) .env 파일에 OMDB_API_KEY=발급받은키 를 추가하세요
  3) 아래처럼 --env-file 로 실행하세요

     node --env-file=.env scripts/fetch-rt-scores.mjs

키 없이 파싱 로직만 확인하려면: node scripts/fetch-rt-scores.mjs --self-test
`)
  process.exit(1)
}

if (!existsSync(IN_PATH)) {
  console.error(`
입력 파일이 없습니다: ${IN_PATH}

헐리우드 카탈로그를 먼저 만들어야 합니다. 이 스크립트는 카탈로그를 만들지 않고
읽기만 합니다.
`)
  process.exit(1)
}

async function fetchOne(imdbId) {
  const url = new URL(OMDB_URL)
  url.searchParams.set("apikey", OMDB_KEY)
  url.searchParams.set("i", imdbId)

  const res = await fetch(url)

  // 401 = 키 무효, 429 = 요청 초과. 조용히 흘려보내면 남은 영화가 전부
  // not-found 로 기록돼 영구히 오염된다. 즉시 멈춘다.
  if (res.status === 401) throw new BudgetError("OMDb 401 — API 키가 무효하거나 비활성 상태입니다.")
  if (res.status === 429) throw new BudgetError("OMDb 429 — 요청 한도를 초과했습니다.")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = await res.json()

  // 한도 초과는 200 + Response:"False" + Error:"Request limit reached!" 로도 온다.
  if (json.Response === "False" && /limit/i.test(json.Error || "")) {
    throw new BudgetError(`OMDb — ${json.Error}`)
  }

  return parseOmdb(json)
}

const catalog = JSON.parse(await readFile(IN_PATH, "utf8"))
const movies = Array.isArray(catalog.movies) ? catalog.movies : []

// imdbId 가 없으면 조회할 방법이 없다. 제목으로 추측하지 않는다.
const noImdbId = movies.filter((m) => !m?.imdbId).length

// 같은 imdbId 가 두 번 들어 있으면 요청을 두 번 태우게 되므로 여기서 줄인다.
const byId = new Map()
for (const m of movies) if (m?.imdbId && !byId.has(m.imdbId)) byId.set(m.imdbId, m)

let out = { generatedAt: null, count: 0, byImdbId: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))
if (!out.byImdbId) out.byImdbId = {}

const force = Boolean(flags.force)
const limit = Number(flags.limit || DEFAULT_LIMIT)

const pending = [...byId.keys()].filter((id) => force || !out.byImdbId[id])
const todo = pending.slice(0, limit)

console.log(`\n로튼토마토 지수 수집 (OMDb)`)
console.log(`  카탈로그 ${movies.length}편 / imdbId 있음 ${byId.size}편 / imdbId 없어 건너뜀 ${noImdbId}편`)
console.log(`  이미 조회 ${Object.keys(out.byImdbId).length}편${force ? " (--force 로 무시)" : ""}`)
console.log(`  남은 대상 ${pending.length}편 중 이번 실행 ${todo.length}편 (--limit=${limit})`)
console.log(`  예상 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("조회할 영화가 없습니다.\n")
  process.exit(0)
}

const stat = { ok: 0, noRt: 0, notFound: 0, error: 0 }
let done = 0
let stopReason = null

async function save() {
  out.generatedAt = new Date().toISOString()
  out.count = Object.keys(out.byImdbId).length
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const imdbId of todo) {
  const movie = byId.get(imdbId)
  const label = movie.titleEn || movie.titleKo || imdbId

  try {
    const record = await fetchOne(imdbId)
    out.byImdbId[imdbId] = { ...record, fetchedAt: new Date().toISOString() }

    if (record.status === "ok") stat.ok++
    else if (record.status === "no-rt") stat.noRt++
    else stat.notFound++

    if (done < 5 || done % 50 === 0) {
      console.log(
        `  [${String(done + 1).padStart(4)}/${todo.length}] ${label} — ` +
          (record.status === "ok" ? `${record.tomatometer}%` : record.status) +
          ` (누적 확보 ${stat.ok})`
      )
    }
  } catch (err) {
    if (err instanceof BudgetError) {
      stopReason = err.message
      break
    }
    // 일시적 오류는 기록하지 않는다. 기록하면 다음 실행 때 재시도하지 못한다.
    stat.error++
    console.error(`  [${String(done + 1).padStart(4)}/${todo.length}] ${label} — 오류: ${err.message}`)
  }

  done++
  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const stillPending = [...byId.keys()].filter((id) => !out.byImdbId[id]).length

if (stopReason) {
  console.error(`\n중단: ${stopReason}`)
  console.error(`  ${done}편까지 저장했습니다. 한도가 풀리면(보통 다음 날) 그대로 다시 실행하세요.`)
}

console.log(`\n수집 ${stopReason ? "중단" : "완료"}`)
console.log(`  로튼 지수 확보 ${stat.ok}편 / 지수 없음 ${stat.noRt}편 / OMDb 에 없음 ${stat.notFound}편 / 일시 오류 ${stat.error}편`)
if (stat.ok + stat.noRt > 0) {
  console.log(`  이번 실행 로튼 확보율 ${Math.round((stat.ok / (stat.ok + stat.noRt)) * 100)}%`)
}
console.log(`  누적 저장 ${Object.keys(out.byImdbId).length}편`)
console.log(`  남은 영화 ${stillPending}편${stillPending > 0 ? " — 내일 같은 명령으로 이어받으세요" : ""}`)
console.log(`  저장: ${OUT_PATH}\n`)

// 키 소진/무효로 멈춘 것은 정상 종료가 아니다. 스크립트로 감쌌을 때 성공으로
// 보이지 않도록 0 이 아닌 코드로 끝낸다.
if (stopReason) process.exit(1)
