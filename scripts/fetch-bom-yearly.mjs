/**
 * Box Office Mojo 연도별 흥행 목록 수집
 *
 * boxofficemojo.com/year/{YYYY}/ 페이지에서 연도별 북미 흥행 상위 100편을
 * 긁어 JSON 파일로 저장한다. KOBIS(한국 관객수)와 짝을 이루는 북미 매출 축이다.
 *
 * 실행:
 *   node scripts/fetch-bom-yearly.mjs
 *   node scripts/fetch-bom-yearly.mjs --from=2020 --to=2024
 *   node scripts/fetch-bom-yearly.mjs --force        # 이어받기 무시하고 전체 재수집
 *
 * API 키가 필요 없다. 다만 BOM 은 아마존 인프라 위에 있어서 기본 Node fetch 의
 * user-agent 로는 봇으로 걸린다. 브라우저처럼 보이는 UA + accept-language 를
 * 보내야 200 이 돌아온다.
 *
 * 여기서 얻는 bomId(rl########)는 BOM 개별 작품 페이지의 키다.
 * 주의: BOM 은 배우/포스터를 제공하지 않는다. 흥행 수치 전용 소스다.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const BASE = "https://www.boxofficemojo.com/year"

/** 프로젝트가 다루는 범위. BOM 은 더 옛날 데이터도 있지만 KOBIS 범위와 맞춘다. */
const MIN_YEAR = 2005
const MAX_YEAR = 2024

/** 페이지에는 200편이 실린다. 그 아래는 흥행이라 부르기 어려워 100편에서 자른다. */
const TOP_N = 100

/** 아마존 쪽 rate limit 을 건드리지 않도록 요청 간격을 둔다. */
const DELAY_MS = 1000

const DEFAULT_OUT = "data/bom-yearly.json"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ============================================
// HTML 파싱
//
// BOM 은 각 <td> 에 mojo-field-type-* 클래스를 붙인다. 컬럼 순서가 바뀌어도
// 안전하도록 위치 대신 클래스로 값을 뽑는다. 다만 money 타입만은 클래스로
// 구분이 안 된다(아래 pickGross 참고).
// ============================================

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

/** 태그를 걷어내고 공백을 정리한 텍스트 */
function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim()
}

/** "$380,270,577" → 380270577, "-" 나 빈 값이면 null */
function toNumber(s) {
  if (!s || s === "-") return null
  const n = Number(s.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** BOM 은 값 없는 칸을 "-" 로 채운다. 빈 문자열 대신 null 로 통일한다. */
function orNull(s) {
  return !s || s === "-" ? null : s
}

/** <td> 를 [{ cls, html }] 로 쪼갠다. studio 칸에 인라인 <svg> 가 들어있지만
 *  그 안에 </td> 는 없으므로 non-greedy 매칭으로 안전하다. */
function splitCells(row) {
  const out = []
  const re = /<td\b([^>]*)>([\s\S]*?)<\/td>/g
  let m
  while ((m = re.exec(row))) {
    out.push({ cls: m[1].match(/class="([^"]*)"/)?.[1] ?? "", html: m[2] })
  }
  return out
}

/**
 * 함정: Gross 와 Total Gross 는 클래스가 완전히 동일하다
 * (`mojo-field-type-money mojo-estimatable`). Budget 칸도 money 타입인데
 * 얘만 `hidden` 이 붙는다. 즉 hidden 을 걸러낸 뒤 남는 두 개 중
 * 첫 번째가 해당 연도 매출(Gross), 두 번째가 누적(Total Gross)이다.
 * 클래스만 보고 첫 money 를 집으면 Budget("-")을 집게 된다.
 */
function pickGross(cells) {
  const money = cells.filter((c) => /mojo-field-type-money/.test(c.cls) && !/\bhidden\b/.test(c.cls))
  return money.length ? toNumber(textOf(money[0].html)) : null
}

function parseRows(html, year) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) || []

  const movies = []
  for (const row of rows) {
    const cells = splitCells(row)
    if (!cells.length) continue // 헤더 행은 <th> 뿐이라 여기서 걸러진다

    const byType = (type) => cells.find((c) => c.cls.includes(`mojo-field-type-${type}`))

    const releaseCell = byType("release")
    // /release/rl2943583745/?ref_=... 에서 rl 아이디만
    const bomId = releaseCell?.html.match(/\/release\/(rl\d+)\//)?.[1] ?? null
    const title = releaseCell ? textOf(releaseCell.html) : null

    // 작품 링크나 제목이 없으면 데이터 행이 아니다.
    if (!bomId || !title) continue

    movies.push({
      year,
      rank: toNumber(textOf(byType("rank")?.html ?? "")),
      title,
      bomId,
      gross: pickGross(cells),
      // 함정: 이 칸에는 연도가 없다("May 19"). 전년도 말 개봉작이 이듬해
      // 목록에 오르기도 하므로 year 를 붙여 추측하지 않고 원문 그대로 둔다.
      releaseDate: orNull(textOf(byType("date")?.html ?? "")),
      distributor: orNull(textOf(byType("studio")?.html ?? "")),
    })
  }

  return movies.slice(0, TOP_N)
}

// ============================================
// 수집
// ============================================

async function fetchYear(year) {
  const res = await fetch(`${BASE}/${year}/`, {
    headers: {
      // 기본 Node UA 로는 403 이 온다. 브라우저처럼 보여야 한다.
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "accept-language": "en-US,en;q=0.9",
    },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseRows(await res.text(), year)
}

// ============================================
// 진입점
// ============================================

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

if (flags.help) {
  console.log(`
사용법: node scripts/fetch-bom-yearly.mjs [옵션]

  --from=2005        시작 연도 (기본 ${MIN_YEAR})
  --to=2024          종료 연도 (기본 ${MAX_YEAR})
  --force            기존 파일을 무시하고 전체 재수집
  --out=경로         출력 파일 (기본 ${DEFAULT_OUT})
`)
  process.exit(0)
}

const from = Math.max(MIN_YEAR, Number(flags.from || MIN_YEAR))
const to = Math.min(MAX_YEAR, Number(flags.to || MAX_YEAR))
const force = flags.force === true
const outPath = flags.out === true || !flags.out ? DEFAULT_OUT : flags.out

if (from > to) {
  console.error(`시작 연도(${from})가 종료 연도(${to})보다 큽니다.`)
  process.exit(1)
}

// ---- 이어받기: 기존 파일에서 이미 채워진 연도를 읽는다 ----
// TOP_N 을 다 못 채운 연도는 중간에 끊긴 것으로 보고 다시 받는다.
// 그렇지 않으면 실패한 연도가 영원히 반쪽짜리로 남는다.
let existing = []
if (!force) {
  try {
    const prev = JSON.parse(await readFile(outPath, "utf8"))
    if (Array.isArray(prev.movies)) existing = prev.movies
  } catch {
    // 파일이 없거나 깨졌으면 그냥 처음부터 받는다.
  }
}

const doneYears = new Set()
for (const year of new Set(existing.map((m) => m.year))) {
  if (existing.filter((m) => m.year === year).length >= TOP_N) doneYears.add(year)
}

const targets = []
for (let year = from; year <= to; year++) {
  if (!doneYears.has(year)) targets.push(year)
}

console.log(`\nBox Office Mojo 연도별 흥행 수집`)
console.log(`  범위: ${from}~${to}년, 연도당 상위 ${TOP_N}편`)
if (doneYears.size) console.log(`  이어받기: ${doneYears.size}개 연도는 이미 수집됨 → 건너뜀`)
console.log(`  받을 연도: ${targets.length}개, 간격 ${DELAY_MS}ms\n`)

// 다시 받는 연도의 기존 데이터는 새 결과로 교체한다.
const targetSet = new Set(targets)
const all = existing.filter((m) => !targetSet.has(m.year))
const failures = []

for (const [i, year] of targets.entries()) {
  try {
    const rows = await fetchYear(year)
    all.push(...rows)

    const top = rows[0]
    console.log(
      `  ${year}년  ${String(rows.length).padStart(3)}편` +
        (top ? `  1위: ${top.title} ($${top.gross?.toLocaleString() ?? "?"})` : "")
    )
  } catch (err) {
    failures.push({ year, reason: err.message })
    console.error(`  ${year}년  실패: ${err.message}`)
  }

  if (i < targets.length - 1) await sleep(DELAY_MS)
}

all.sort((a, b) => a.year - b.year || a.rank - b.rank)

const years = [...new Set(all.map((m) => m.year))].sort((a, b) => a - b)
const perYear = {}
for (const m of all) perYear[m.year] = (perYear[m.year] ?? 0) + 1

const payload = {
  generatedAt: new Date().toISOString(),
  source: "boxofficemojo.com/year",
  years,
  count: all.length,
  movies: all,
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8")

console.log(`\n수집 완료`)
console.log(`  총 ${all.length}편 / ${years.length}개 연도`)
console.log(`  연도별: ${years.map((y) => `${y}:${perYear[y]}`).join("  ")}`)
if (failures.length) console.log(`  실패한 연도: ${failures.map((f) => f.year).join(", ")}`)
console.log(`  저장: ${outPath}\n`)
