/**
 * KOBIS 연도별 박스오피스 수집
 *
 * 영화진흥위원회 영화관입장권통합전산망(KOBIS)의 연도별 박스오피스 상위 50편을
 * 연도별로 긁어 JSON 파일로 저장한다.
 *
 * 실행:
 *   node scripts/fetch-kobis-boxoffice.mjs
 *   node scripts/fetch-kobis-boxoffice.mjs --from=2015 --to=2026
 *   node scripts/fetch-kobis-boxoffice.mjs --nation=K        # 한국영화만
 *
 * API 키가 필요 없다. 공개 통계 페이지를 그대로 요청한다.
 * 여기서 얻는 movieCd 가 이후 KOBIS 오픈API(출연진 조회)의 입력 키가 된다.
 *
 * 주의: KOBIS 는 배우 사진을 제공하지 않는다. 사진은 별도로 TMDB 에서 붙여야 한다.
 */

import { writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const BASE = "https://www.kobis.or.kr/kobis/business/stat/boxs/findYearlyBoxOfficeList.do"

/** KOBIS 가 연도별 데이터를 제공하는 범위 (페이지의 연도 선택 옵션 기준) */
const MIN_YEAR = 2004
const MAX_YEAR = 2026

/** 공공 서버에 부담을 주지 않도록 요청 간격을 둔다. */
const DELAY_MS = 1000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ============================================
// HTML 파싱
//
// KOBIS 는 각 <td> 에 고정된 id(td_rank, td_movie ...)를 부여한다.
// 컬럼 순서가 바뀌어도 안전하도록 위치 대신 id 로 값을 뽑는다.
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
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

/** 태그를 걷어내고 공백을 정리한 텍스트 */
function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim()
}

/** "139,651,845,516" → 139651845516, 빈 값이면 null */
function toNumber(s) {
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

function parseRows(html, year) {
  const tbody = html.match(/<tbody[\s\S]*?<\/tbody>/)
  if (!tbody) return []

  const rows = tbody[0].match(/<tr[\s\S]*?<\/tr>/g) || []

  return rows
    .map((row) => {
      // id 로 각 셀을 찾는다.
      const cell = (id) => {
        const m = row.match(new RegExp(`<td[^>]*id="${id}"[^>]*>([\\s\\S]*?)</td>`))
        return m ? textOf(m[1]) : null
      }

      const movieCd = row.match(/mstView\('movie','(\d+)'\)/)?.[1] ?? null
      const title = cell("td_movie")

      // 제목이나 movieCd 가 없으면 데이터 행이 아니다 (안내 문구 행 등).
      if (!movieCd || !title) return null

      return {
        year,
        rank: toNumber(cell("td_rank")),
        movieCd,
        title,
        openDt: cell("td_openDt") || null,
        salesAcc: toNumber(cell("td_salesAcc")),
        salesShare: cell("td_salesShare") || null,
        audiAcc: toNumber(cell("td_audiAcc")),
        scrnCnt: toNumber(cell("td_scrnCnt")),
        showCnt: toNumber(cell("td_showCnt")),
      }
    })
    .filter(Boolean)
}

// ============================================
// 수집
// ============================================

async function fetchYear(year, nation) {
  const url = new URL(BASE)
  url.searchParams.set("loadEnd", "0")
  url.searchParams.set("searchType", "search")
  url.searchParams.set("sSearchFrom", "")
  url.searchParams.set("sSearchYearFrom", String(year))
  url.searchParams.set("sSearchYearTo", String(year))
  url.searchParams.set("sMultiMovieYn", "")
  url.searchParams.set("sRepNationCd", nation || "")
  url.searchParams.set("sWideAreaCd", "")

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; movie-quiz-catalog/1.0)",
      "Accept-Language": "ko-KR,ko;q=0.9",
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
사용법: node scripts/fetch-kobis-boxoffice.mjs [옵션]

  --from=2004        시작 연도 (기본 ${MIN_YEAR})
  --to=2026          종료 연도 (기본 ${MAX_YEAR})
  --nation=K|F       K=한국영화, F=외국영화, 생략 시 전체
  --out=경로         출력 파일 (기본 data/kobis-boxoffice.json)
`)
  process.exit(0)
}

const from = Math.max(MIN_YEAR, Number(flags.from || MIN_YEAR))
const to = Math.min(MAX_YEAR, Number(flags.to || MAX_YEAR))
const nation = flags.nation === true ? "" : flags.nation || ""
const outPath = flags.out === true || !flags.out ? "data/kobis-boxoffice.json" : flags.out

if (from > to) {
  console.error(`시작 연도(${from})가 종료 연도(${to})보다 큽니다.`)
  process.exit(1)
}

const nationLabel = nation === "K" ? "한국영화" : nation === "F" ? "외국영화" : "전체"
console.log(`\nKOBIS 연도별 박스오피스 수집`)
console.log(`  범위: ${from}~${to}년 (${to - from + 1}개 연도), 구분: ${nationLabel}`)
console.log(`  간격: ${DELAY_MS}ms\n`)

const all = []
const perYear = {}
const failures = []

for (let year = from; year <= to; year++) {
  try {
    const rows = await fetchYear(year, nation)
    all.push(...rows)
    perYear[year] = rows.length

    const top = rows[0]
    console.log(
      `  ${year}년  ${String(rows.length).padStart(2)}편` +
        (top ? `  1위: ${top.title} (${top.audiAcc?.toLocaleString() ?? "?"}명)` : "")
    )
  } catch (err) {
    failures.push({ year, reason: err.message })
    console.error(`  ${year}년  실패: ${err.message}`)
  }

  if (year < to) await sleep(DELAY_MS)
}

// 같은 영화가 개봉 연도와 이듬해 양쪽 순위에 오를 수 있다(연말 개봉작).
// movieCd 기준 고유 편수를 함께 기록한다.
const uniqueCodes = new Set(all.map((m) => m.movieCd))

const payload = {
  source: BASE,
  fetchedAt: new Date().toISOString(),
  params: { from, to, nation: nation || null },
  totalRows: all.length,
  uniqueMovieCount: uniqueCodes.size,
  perYear,
  failures,
  movies: all,
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8")

console.log(`\n수집 완료`)
console.log(`  총 ${all.length}행, 고유 영화 ${uniqueCodes.size}편`)
if (failures.length) console.log(`  실패한 연도: ${failures.map((f) => f.year).join(", ")}`)
console.log(`  저장: ${outPath}\n`)
