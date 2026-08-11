/**
 * KOBIS 영화정보검색 크롤링 — 헐리우드 영화의 한국 개봉 제목 확보
 *
 * data/bom-yearly.json 의 영문 제목으로 KOBIS 를 검색해
 * 한국 개봉 제목 / 영화코드 / 한글 감독명을 data/kobis-titles.json 에 모은다.
 *
 * 실행:
 *   node scripts/crawl-kobis-titles.mjs                # 전체(1864편)
 *   node scripts/crawl-kobis-titles.mjs --limit=30     # 앞의 30편만 (검증용)
 *   node scripts/crawl-kobis-titles.mjs --force        # 기존 결과 무시하고 다시
 *   node scripts/crawl-kobis-titles.mjs --headed       # 브라우저 창을 띄운다
 *
 * 중단해도 안전하다. 이미 판정이 끝난 bomId 는 건너뛴다.
 * 단 타임아웃·네트워크 오류는 기록하지 않는다 → 다음 실행에서 다시 시도한다.
 * (not-found 는 "찾아봤지만 없더라"는 결론이므로 기록해서 두 번 부르지 않는다.)
 *
 * ============================================================
 * 실측으로 확인한 KOBIS 검색의 함정 — 이 스크립트 설계의 근거
 * ============================================================
 * 1) 결과는 페이지당 10건. "총 12건" 이어도 첫 화면엔 10건뿐이라 정답이 2페이지에
 *    숨는다. pagingForm.curPage 로 넘긴다.
 *
 * 2) 검색이 "문자열 부분 일치"다. 토큰 AND 가 아니다.
 *      "Charlie the Chocolate" → 0건 (그런 연속 문자열이 없으므로)
 *      "Old Virgin"           → "The 40 Year-Old Virgin" 히트
 *    그래서 제목 표기가 한 글자만 달라도 검색 자체가 빗나간다. 검색어를 여러 형태로
 *    바꿔가며 던지고, 그래도 안 되면 제목의 가장 긴 단어 하나 + 제작연도로 좁힌다.
 *
 * 3) 검색어가 매우 헐겁게 걸린다. "Up" 은 1,522건(Hooking Up, Supernova 까지).
 *    몇 페이지를 봐도 못 찾을 수 있으므로 제작연도(sPrdtYearS/E)로 좁혀 재검색한다.
 *
 * 4) ★ SQL 인젝션 필터가 있다. 앞뒤에 단어가 붙은 and/or/union/from/select/where 가
 *    검색어에 있으면 결과 대신 "허용되지 않은 태그가 포함되어 있습니다" 페이지가 뜬다.
 *      "Harry Potter and the Goblet of Fire"  → 차단
 *      "Spider-Man: Far From Home"            → 차단
 *    → 해당 단어로 제목을 쪼개 가장 긴 조각만 검색어로 쓴다.
 *      ("the Goblet of Fire" 로 검색하면 정확히 1건 나온다)
 *
 * 5) 영문 제목 표기가 KOBIS 마음대로다. 비교는 반드시 정규화 후에 한다.
 *      Spider-Man(2002)       → "Spiderman"                 (하이픈 없음)
 *      Spider-Man 2           → "Spider-Man II"             (로마숫자)
 *      Saw II                 → "Saw Ⅱ"                     (★유니코드 로마숫자 U+2161)
 *      Mr. & Mrs. Smith       → "Mr. And Mrs. Smith"        (& → And)
 *      The Amazing Spider-Man → "The Amazing Spider - Man"  (공백)
 *      Star Wars: Episode III → "Star Wars: Episode Iii ..." (제목 케이스 붕괴)
 *      Star Wars: Episode VII - The Force Awakens → "Star Wars : The Force Awakens"
 *    완전일치만 고집하면 위 마지막 같은 건 놓친다. 그래서 matchStage 로 단계를 나눈다:
 *    완전일치 → (없을 때만) 접두/접미 일치 → 부제 일치. 느슨한 단계는 길이비 하한과
 *    제작연도 근접(±1)을 함께 걸어 속편 오매칭(Toy Story vs Toy Story 3)을 막는다.
 *
 * 5-1) ★ 같은 영문 제목의 단편·미개봉 레코드가 진짜 개봉작보다 먼저 걸린다.
 *    "Brave" 는 단편 "용기"(기타, 2011)와 "메리다와 마법의 숲"(개봉, 2011)이 함께 나온다.
 *    BOM 은 미국 극장 흥행작 목록이므로 제작상태 "개봉"인 쪽을 우선하고,
 *    "개봉" 후보를 찾기 전에는 검색을 멈추지 않는다.
 *
 * 6) 제작연도가 빈 레코드가 있다(예: Spider-Man 3). 연도로 검증할 수 없으므로
 *    confidence 를 낮춰 기록한다.
 *
 * 7) 한국어 제목 자리에 로마자만 들어간 레코드가 있다 → no-korean 으로 남긴다.
 *
 * 8) ★ 입력(BOM) 쪽 함정: 재개봉 꼬리표가 공백 없이 제목에 붙어 있다(20편).
 *      "Titanic2012 3D Release", "Coraline15th Anniversary", "Avatar2022 Re-release"
 *    그대로 검색하면 0건이다. 꼬리표를 떼고 검색한다. 더 중요한 건 그 행의 year 가
 *    재개봉 연도라는 점 — 제작연도 근접 판정에 쓰면 엉뚱한 작품이 걸린다
 *    (Avatar@2022 로 맞추면 "아바타: 물의 길"). 그래서 이 행들은 연도를 아예 믿지 않고
 *    제작상태 "개봉" 위주로 고르며, 개봉 후보가 둘 이상이면 ambiguous 로 뺀다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { chromium } from "playwright"

const SEARCH_URL = "https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieList.do"

const DEFAULT_IN = "data/bom-yearly.json"
const DEFAULT_OUT = "data/kobis-titles.json"

/** 공공 서버 부담을 줄인다. 페이지 이동 하나마다 이만큼 쉰다. */
const DELAY_MS = 1600
/** 중간에 끊겨도 손실을 줄이기 위해 주기적으로 저장한다. */
const SAVE_EVERY = 25
/** 한 검색에서 훑어볼 최대 페이지 수 (페이지당 10건) */
const MAX_PAGES = 3
/** 연도로 좁힌 검색은 결과가 적으므로 조금 더 본다. */
const MAX_PAGES_NARROW = 5
/** 결과가 이보다 많으면 페이지를 넘겨봐야 헛수고다. 첫 페이지만 보고 넘어간다. */
const HOPELESS_TOTAL = 300
/** 이만큼 연속으로 오류가 나면 차단으로 보고 멈춘다. */
const MAX_CONSECUTIVE_ERRORS = 10
/**
 * 페이지 이동 대기 시간.
 * "It", "Up", "Cars" 처럼 결과가 수천 건인 검색은 KOBIS 응답이 30초를 넘긴다.
 * 넉넉히 준다 — 여기서 끊기면 그 영화는 통째로 다음 실행으로 밀린다.
 */
const NAV_TIMEOUT = 60000
/** 제작연도가 BOM 연도와 이 이상 벌어지면 다른 영화로 본다(리메이크·동명이작). */
const MAX_YEAR_GAP = 3
/** 완전일치를 못 찾았을 때만 허용하는 접두/접미 일치의 길이비 하한 */
const MIN_AFFIX_RATIO = 0.55
/** 접두/접미 일치는 위험하므로 제작연도가 이만큼 안쪽일 때만 인정한다. */
const MAX_AFFIX_YEAR_GAP = 1

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ============================================
// 제목 정규화 / 비교
// ============================================

/** 다중 문자 로마숫자만 아라비아로. i, v, x, m 같은 한 글자는 오탐이 커서 건드리지 않는다. */
const ROMAN = {
  ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8",
  ix: "9", xi: "11", xii: "12", xiii: "13",
}

/**
 * 두 영문 제목이 "같은 영화"인지 비교하기 위한 정규화.
 * 양쪽에 똑같이 적용하므로 과하게 깎아도 비대칭 오탐은 생기지 않는다.
 * NFKD 를 쓰는 이유: 유니코드 로마숫자(Ⅱ)를 ASCII(II)로 풀어준다. KOBIS 가 실제로 쓴다.
 */
function normalizeTitle(s) {
  if (!s) return ""
  let t = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // 발음부호 제거 (Amélie → Amelie)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  t = t.split(" ").map((w) => ROMAN[w] ?? w).join(" ")
  t = t.replace(/^(the|a|an) /, "") // 선행 관사 무시

  return t.replace(/ /g, "")
}

const hasHangul = (s) => /[가-힣]/.test(s || "")

/**
 * BOM 제목에 공백 없이 들러붙은 재개봉 꼬리표를 뗀다.
 *   "Titanic2012 3D Release" → "Titanic",  "Coraline15th Anniversary" → "Coraline"
 * 꼬리표가 있으면 그 행의 year 는 재개봉 연도라 제작연도 판정에 쓰면 안 된다.
 */
function stripReissueTag(title) {
  const clean = title
    .replace(/(?:19|20)\d{2}\s*(?:3D\s*)?(?:Re-?)?[Rr]elease\s*$/, "")
    .replace(/\d{1,3}(?:st|nd|rd|th)?\s*(?:Year\s*)?Anniversary\s*$/i, "")
    .trim()
  return { title: clean || title, reissue: clean !== title.trim() }
}

/**
 * 두 정규화 제목이 같은 작품인지 단계적으로 본다.
 *   "exact" — 완전 일치
 *   "affix" — 한쪽이 다른 쪽의 접두/접미 (부제 유무 차이). 완전일치가 없을 때만 쓴다.
 * 속편 오매칭(Toy Story ⊂ Toy Story 3)을 막으려고 길이비 하한과
 * "남는 꼬리가 숫자로 시작하면 탈락" 규칙을 함께 건다.
 */
function matchStage(bomTitle, kobisTitle) {
  const a = normalizeTitle(bomTitle)
  const b = normalizeTitle(kobisTitle)
  if (!a || !b) return null
  if (a === b) return "exact"

  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const isPrefix = long.startsWith(short)
  if (isPrefix || long.endsWith(short)) {
    if (short.length / long.length >= MIN_AFFIX_RATIO) {
      // 남는 꼬리가 속편 표시면 다른 작품이다 (Toy Story vs Toy Story 3, GotG vs GotG Vol. 2)
      const rest = isPrefix ? long.slice(short.length) : long.slice(0, long.length - short.length)
      if (!/^(?:\d|vol|volume|part|chapter|episode|book)/.test(rest)) return "affix"
    }
  }

  // 부제 일치: KOBIS 가 제목 가운데를 줄여 등록한 경우.
  //   BOM   "Star Wars: Episode VII - The Force Awakens"
  //   KOBIS "Star Wars : The Force Awakens"
  // 앞 조각과 뒤 조각이 양쪽 끝에 그대로 있어야 하므로 속편끼리 붙을 위험이 낮다.
  // ("Kill Bill: Vol. 2" 의 뒤 조각 "vol2" 는 "Kill Bill" 에 없으므로 탈락)
  const parts = bomTitle.split(/\s*:\s*|\s+-\s+/).map(normalizeTitle).filter(Boolean)
  if (parts.length >= 2) {
    const head = parts[0]
    const tail = parts[parts.length - 1]
    if (b.startsWith(head) && b.endsWith(tail) && (head.length + tail.length) / b.length >= MIN_AFFIX_RATIO) {
      return "subtitle"
    }
  }

  return null
}

// ============================================
// 검색어 만들기
// ============================================

/** 앞뒤에 단어가 붙으면 SQL 인젝션 필터에 걸리는 단어들 (실측) */
const BLOCKED = /(?<=\S\s)\b(and|or|union|from|select|where)\b(?=\s\S)/i

const isBlockedQuery = (q) => BLOCKED.test(q)

/** 위험 단어와 &(=and) 로 제목을 쪼개 가장 긴 조각을 돌려준다. */
function longestFragment(title) {
  return title
    .split(/\b(?:and|or|union|from|select|where)\b|&/i)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .sort((a, b) => b.length - a.length)[0] || title
}

/** 문장부호를 공백으로. "Spider-Man" → "Spider Man" (KOBIS 등록명 "Spiderman" 히트) */
const spaced = (title) => title.replace(/[^A-Za-z0-9가-힣 ]+/g, " ").replace(/\s+/g, " ").trim()

/** 부제를 뗀다. "Star Wars: Episode III - Revenge of the Sith" → "Star Wars" */
const withoutSubtitle = (title) => title.split(/\s*:\s*|\s+-\s+/)[0].trim()

/** 최후의 보루: 제목에서 가장 긴 단어 하나. 부분 일치 검색이라 이게 제일 안전하다. */
function longestWord(title) {
  const words = title.normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
  if (!words.length) return title
  return words.sort((a, b) => b.length - a.length)[0]
}

/**
 * 짧은 한 단어 제목("It", "Up", "Cars")인가?
 * 이런 검색어는 부분 일치로 수천 건이 걸려 KOBIS 가 응답을 못 준다(60초 초과).
 * 연도로 좁히지 않은 검색은 아예 던지지 않는다.
 */
const isGeneric = (q) => q.trim().split(/\s+/).length === 1 && q.replace(/[^A-Za-z0-9]/g, "").length <= 6

/**
 * 한 영화에 대해 순서대로 시도할 검색 계획.
 * 앞에서 답이 나오면 뒤는 실행하지 않는다 — 대부분 1번에서 끝난다.
 *
 * 연도로 좁힌 검색을 맨 앞에 둔다. 결과가 작아 서버도 빠르고 오답도 적다.
 * 연도를 넓히는(=결과가 커지는) 검색은 뒤로 미룬다.
 */
function buildPlan(movie) {
  const title = movie.searchTitle
  const plan = []
  const seen = new Set()
  const add = (query, extra = {}) => {
    // SQL 필터에 걸릴 검색어는 던져봐야 에러 페이지다. 미리 조각으로 바꾼다.
    if (isBlockedQuery(query)) query = longestFragment(query)
    const key = `${query}|${extra.yearFrom ?? ""}-${extra.yearTo ?? ""}`
    if (!query || seen.has(key)) return
    seen.add(key)
    plan.push({ query, maxPages: MAX_PAGES, ...extra })
  }
  const narrow = (from, to) => ({ maxPages: MAX_PAGES_NARROW, yearFrom: String(from), yearTo: String(to) })

  const dated = movie.year !== null // 재개봉 행은 year 가 재개봉 연도라 연도를 못 쓴다

  // 1) 원본 + 제작연도 ±1 — 대부분 여기서 한 번에 끝난다
  if (dated) add(title, narrow(movie.year - 1, movie.year + 1))

  // 2~5) 연도를 풀고 제목 표기를 바꿔가며. 흔한 한 단어 제목은 결과가 수천 건이라 건너뛴다.
  if (!dated || !isGeneric(title)) {
    add(title)
    add(spaced(title)) // 문장부호를 공백으로 ("Spider-Man" → "Spider Man")
    add(longestFragment(title)) // and/& 로 쪼갠 조각 ("Mr. & Mrs. Smith" → "Mrs. Smith")
    add(withoutSubtitle(title)) // 부제를 뗀 형태
  }

  // 6~7) 최후: 제목의 대표 단어 하나 + 단일 제작연도 (동명이작이 많은 제목용)
  if (dated) {
    const word = longestWord(title)
    add(word, narrow(movie.year, movie.year))
    add(word, narrow(movie.year - 1, movie.year - 1))
  }

  return plan
}

// ============================================
// 페이지 조작
// ============================================

/** SQL 필터에 걸리면 표 대신 에러 페이지가 온다. 30초를 기다리지 말고 즉시 판정한다. */
const BLOCK_TEXT = "허용되지 않은"

async function assertNotBlocked(page) {
  const blocked = await page.evaluate(
    (t) => Boolean(document.body?.innerText.includes(t)) && !document.querySelector("table.tbl_comm"),
    BLOCK_TEXT
  )
  if (blocked) throw new Error("BLOCKED_QUERY")
}

/** 결과 표를 읽는다. "검색된 데이터가 존재하지 않습니다." 안내 행은 걸러진다. */
async function readResults(page) {
  return page.evaluate(() => {
    const totalText = document.body?.innerText.match(/총\s*([\d,]+)\s*건/)?.[1] ?? "0"
    const rows = [...document.querySelectorAll("table.tbl_comm tbody tr")]
      .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim()))
      .filter((c) => c.length >= 9)
      .map((c) => ({
        titleKo: c[0],
        titleEn: c[1],
        movieCd: c[2],
        prdtYear: c[3],
        // "미국(1)" 의 (1)은 공동제작국 수. 대표 국가만 남긴다.
        nation: c[4].replace(/\(\d+\)\s*$/, "").trim(),
        movieType: c[5],
        genre: c[6],
        status: c[7],
        directors: c[8].split(/\s*,\s*/).map((d) => d.trim()).filter(Boolean),
      }))
    return { total: Number(totalText.replace(/,/g, "")), rows }
  })
}

/** 결과 페이지의 pagingForm 을 재사용한다. 검색 첫 페이지를 다시 받지 않아 요청 하나를 아낀다. */
async function submitPagingForm(page, { query, page: curPage, yearFrom, yearTo }) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }),
    page.evaluate(
      ([query, curPage, yearFrom, yearTo]) => {
        const f = document.pagingForm
        f.sMovName.value = query
        f.sPrdtYearS.value = yearFrom
        f.sPrdtYearE.value = yearTo
        f.curPage.value = String(curPage)
        f.submit()
      },
      [query, String(curPage), yearFrom ?? "", yearTo ?? ""]
    ),
  ])
  await assertNotBlocked(page)
  await page.waitForSelector("table.tbl_comm tbody", { timeout: NAV_TIMEOUT })
}

/** 첫 진입이거나 직전 페이지가 망가졌을 때(에러 페이지 등) 쓰는 경로. */
async function submitTopForm(page, query) {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
  await page.fill("#inp_solrSearch", query)
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }),
    page.evaluate(() => document.searchMainTopMovie.submit()),
  ])
  await assertNotBlocked(page)
  await page.waitForSelector("table.tbl_comm tbody", { timeout: NAV_TIMEOUT })
}

/**
 * 검색 한 번. 필요하면 페이지를 넘겨가며 최대 maxPages 까지 행을 모은다.
 * truncated 는 "더 있는데 못 봤다"는 뜻 → 연도로 좁혀 재시도할 신호.
 */
async function search(page, { query, yearFrom, yearTo, maxPages }, counters) {
  const hasPagingForm = await page.evaluate(() => Boolean(document.pagingForm))

  if (hasPagingForm) {
    await submitPagingForm(page, { query, page: 1, yearFrom, yearTo })
  } else {
    // 상단 검색창에는 연도 칸이 없다. 먼저 검색한 뒤 결과 페이지에서 연도를 걸어야 한다.
    await submitTopForm(page, query)
    if (yearFrom) {
      counters.requests++
      await sleep(DELAY_MS)
      await submitPagingForm(page, { query, page: 1, yearFrom, yearTo })
    }
  }
  counters.requests++
  await sleep(DELAY_MS)

  const first = await readResults(page)
  const rows = [...first.rows]
  // 결과가 수백 건이면 몇 페이지를 더 넘겨봐야 정답을 만날 확률이 거의 없다.
  // ("It" 은 Spirit·Little 처럼 it 이 들어간 모든 제목에 걸린다) 요청만 낭비하고
  // 서버 응답도 느려지므로 첫 페이지만 보고 다음 검색어로 넘어간다.
  const pages = first.total > HOPELESS_TOTAL ? 1 : Math.min(maxPages, Math.ceil(first.total / 10))

  for (let p = 2; p <= pages; p++) {
    await submitPagingForm(page, { query, page: p, yearFrom, yearTo })
    counters.requests++
    await sleep(DELAY_MS)
    const next = await readResults(page)
    rows.push(...next.rows)
  }

  return { total: first.total, rows, truncated: first.total > rows.length }
}

// ============================================
// 후보 판정
// ============================================

/**
 * 제목이 맞는 행만 후보로 추려 그 중 하나를 고른다.
 * 검색 결과 1행을 그대로 믿으면 안 된다 — 부분 일치가 잔뜩 딸려온다.
 */
function pickBest(rows, movie) {
  const gapOf = (r) => {
    const y = Number(r.prdtYear)
    // 재개봉 행(movie.year === null)은 BOM 연도가 재개봉 연도라 비교 자체가 무의미하다.
    if (movie.year === null || !Number.isFinite(y) || y <= 0) return null
    return Math.abs(y - movie.year)
  }

  // 중복 제거: 같은 영화가 여러 검색 시도에서 중복으로 쌓인다.
  const uniq = [...new Map(rows.map((r) => [r.movieCd, r])).values()]

  let scored = uniq
    .map((r) => ({ row: r, gap: gapOf(r), stage: matchStage(movie.searchTitle, r.titleEn) }))
    .filter((c) => c.stage)

  // 완전일치가 하나라도 있으면 느슨한 후보는 쳐다보지 않는다.
  const exact = scored.filter((c) => c.stage === "exact")
  if (!exact.length && movie.year !== null) {
    // 느슨한 매칭엔 연도 확인이 필수다. (재개봉 행은 연도가 없으니 이 검사를 못 한다 —
    // 대신 경쟁 후보가 하나뿐일 때만 인정하도록 classify 에서 걸러진다)
    scored = scored.filter((c) => c.gap !== null && c.gap <= MAX_AFFIX_YEAR_GAP)
  } else if (exact.length) {
    scored = exact
  }

  if (scored.length === 0) return null

  // 연도 차를 "거의 같음(0~1) / 좀 벌어짐 / 알 수 없음" 세 칸으로만 본다.
  // 칸이 같으면 실제 한국 개봉작(제작상태 "개봉")을 우선한다 —
  // BOM 은 미국 극장 흥행작이므로 한국에서도 개봉한 쪽이 정답일 확률이 압도적이다.
  // (실측: "Brave" 는 단편 "용기"(기타)와 "메리다와 마법의 숲"(개봉)이 같은 제작연도로 걸린다)
  const bucket = (c) => (c.gap === null ? 2 : c.gap <= 1 ? 0 : 1)
  const openRank = (c) => (c.row.status === "개봉" ? 0 : 1)

  scored.sort(
    (a, b) =>
      bucket(a) - bucket(b) || openRank(a) - openRank(b) || (a.gap ?? 99) - (b.gap ?? 99)
  )

  const best = scored[0]
  // 최선과 같은 조건(연도 칸·개봉 여부)인 경쟁 후보 수 — 진짜 애매한지 판단하는 근거
  const tied = scored.filter((c) => bucket(c) === bucket(best) && openRank(c) === openRank(best)).length

  return { best, tied, candidates: scored.map((c) => ({ ...c.row, stage: c.stage })) }
}

/**
 * 더 찾아볼 필요가 없는 결과인가?
 * 제작상태가 "개봉"이 아니면 아직 진짜를 못 찾은 것으로 보고 계속 찾는다 —
 * 흥행 헐리우드 영화의 정답 레코드는 거의 항상 "개봉"이다.
 */
function isConclusive(picked, movie) {
  if (!picked || picked.best.stage !== "exact") return false
  if (picked.best.row.status !== "개봉") return false
  // 재개봉 행은 연도로 확인할 방법이 없다. 경쟁 후보가 없으면 그걸로 끝낸다.
  if (movie.year === null) return picked.tied === 1
  return picked.best.gap !== null && picked.best.gap <= MAX_YEAR_GAP
}

/**
 * 고른 행을 최종 판정으로 바꾼다.
 * sawTruncated: 검색 결과를 끝까지 못 본 적이 있는가(뒤에 정답이 남아 있을 수 있다).
 */
function classify(picked, movie, sawTruncated) {
  if (!picked) return { result: "not-found", reason: "어떤 검색어로도 제목이 맞는 행을 못 찾음" }

  const { best, tied, candidates } = picked
  const row = best.row
  const stageLabel = {
    exact: "영문 제목 완전 일치",
    affix: "영문 제목 접두/접미 일치",
    subtitle: "영문 제목 부제 일치",
  }[best.stage]

  if (best.gap !== null && best.gap > MAX_YEAR_GAP) {
    return {
      row,
      candidates,
      result: "ambiguous",
      reason: `${stageLabel}이나 제작연도 ${row.prdtYear} vs BOM ${movie.year} (${best.gap}년 차) — 리메이크/동명이작 의심`,
    }
  }

  // 재개봉 행은 연도로 거를 수 없다. 같은 조건의 후보가 여럿이면 사람이 봐야 한다.
  if (movie.year === null && tied > 1) {
    return {
      row,
      candidates,
      result: "ambiguous",
      reason: `재개봉 표기라 BOM 연도를 못 믿는데 동급 후보가 ${tied}건 — 사람 확인 필요`,
    }
  }

  if (!hasHangul(row.titleKo)) {
    return { row, candidates, result: "no-korean", reason: `한국어 제목에 한글 없음: "${row.titleKo}"` }
  }

  // 고른 게 한국 개봉작이 아닌데 검색 결과를 끝까지 보지도 못했다면, 진짜 개봉 레코드가
  // 뒤에 남아 있을 수 있다. ok 로 단정하지 말고 후보를 담아 사람에게 넘긴다.
  // (실측: "It" 은 Spirit·Little 등에 다 걸려 결과가 수백 건이라 "그것"까지 못 가고
  //  동명의 "아이.티."(2016, 기타)를 집는다)
  if (row.status !== "개봉" && sawTruncated) {
    return {
      row,
      candidates,
      result: "ambiguous",
      reason: `제작상태 "${row.status}"인데 검색 결과를 다 보지 못함 — 진짜 개봉 레코드가 뒤에 있을 수 있음`,
    }
  }

  const notes = []
  if (best.stage !== "exact") notes.push("느슨한 매칭이라 사람 확인 권장")
  if (movie.year === null) notes.push("재개봉 표기 — BOM 연도 검증 불가")
  else if (best.gap === null) notes.push("KOBIS 제작연도 없음")
  else if (best.gap > 1) notes.push(`제작연도 ${best.gap}년 차`)
  if (tied > 1) notes.push(`동급 후보 ${tied}건`)
  if (row.status !== "개봉") notes.push(`제작상태 "${row.status}"`)

  return {
    row,
    candidates,
    result: "ok",
    confidence: notes.length ? "low" : "high",
    reason: notes.length ? `${stageLabel} / ${notes.join(", ")}` : `${stageLabel} + 제작연도 일치`,
  }
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
사용법: node scripts/crawl-kobis-titles.mjs [옵션]

  --limit=N     앞의 N편만 처리 (검증용)
  --force       기존 결과를 무시하고 전부 다시 크롤링
  --headed      브라우저 창을 띄운다
  --in=경로     입력 (기본 ${DEFAULT_IN})
  --out=경로    출력 (기본 ${DEFAULT_OUT})
`)
  process.exit(0)
}

const IN_PATH = typeof flags.in === "string" ? flags.in : DEFAULT_IN
const OUT_PATH = typeof flags.out === "string" ? flags.out : DEFAULT_OUT

const bom = JSON.parse(await readFile(IN_PATH, "utf8"))

// 연말 개봉작은 두 해의 순위에 모두 오른다. bomId 로 중복을 없애되,
// 대표 행은 순위가 높은(숫자가 작은) 쪽을 쓴다.
const byId = new Map()
for (const m of bom.movies) {
  const prev = byId.get(m.bomId)
  if (!prev || m.rank < prev.rank) byId.set(m.bomId, m)
}
// 재개봉 꼬리표를 떼고, 그런 행은 year 를 null 로 만들어 "연도를 믿지 말라"고 표시한다.
const unique = [...byId.values()].map((m) => {
  const { title, reissue } = stripReissueTag(m.title)
  return { ...m, searchTitle: title, reissue, year: reissue ? null : m.year }
})
const targets = flags.limit ? unique.slice(0, Number(flags.limit)) : unique

let out = { generatedAt: null, count: 0, byBomId: {} }
if (existsSync(OUT_PATH) && !flags.force) {
  out = JSON.parse(await readFile(OUT_PATH, "utf8"))
}

const todo = targets.filter((m) => !out.byBomId[m.bomId])

console.log(`\nKOBIS 한국 개봉 제목 크롤링`)
console.log(`  BOM ${bom.movies.length}행 → 고유 ${unique.length}편`)
console.log(`  대상 ${targets.length}편 중 ${todo.length}편 남음 (완료 ${targets.length - todo.length}편)`)
console.log(`  요청 간격 ${DELAY_MS}ms\n`)

if (todo.length === 0) {
  console.log("이미 모두 처리되었습니다.\n")
  process.exit(0)
}

async function save() {
  out.generatedAt = new Date().toISOString()
  out.count = Object.keys(out.byBomId).length
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf8")
}

const browser = await chromium.launch({ headless: !flags.headed })
const context = await browser.newContext({ userAgent: UA, locale: "ko-KR" })

// 표의 텍스트만 필요하다. 이미지·폰트·스타일은 받지 않는다.
await context.route("**/*", (route) => {
  const type = route.request().resourceType()
  if (type === "image" || type === "font" || type === "media" || type === "stylesheet") route.abort()
  else route.continue()
})

const page = await context.newPage()

const counters = { requests: 0 }
const stats = { ok: 0, ambiguous: 0, "not-found": 0, "no-korean": 0, error: 0 }
const startedAt = Date.now()
let done = 0
let consecutiveErrors = 0
let aborted = null

for (const movie of todo) {
  try {
    // 시도할 검색을 순서대로 돌리되, 답이 확정되면 즉시 멈춘다.
    // 행은 시도마다 쌓아둔다 — 앞 시도에서 본 후보가 뒤 시도의 후보보다 나을 수 있다.
    const pool = []
    let picked = null
    let usedQuery = null
    let lastTotal = 0
    let sawTruncated = false
    /** 결과를 끝까지 다 본 검색어. 같은 검색어를 연도로 좁혀봐야 부분집합이라 의미가 없다. */
    const seenFully = new Set()

    for (const attempt of buildPlan(movie)) {
      if (attempt.yearFrom && seenFully.has(attempt.query)) continue

      let res
      try {
        res = await search(page, attempt, counters)
      } catch (err) {
        // 이 검색어는 서버가 거부한다. 다음 형태로 넘어간다(영화 전체를 실패로 보지 않는다).
        if (err.message === "BLOCKED_QUERY") continue
        // 결과가 수천 건인 검색은 KOBIS 가 가끔 응답을 못 준다. 페이지를 되돌리고 한 번만 더.
        console.error(`         재시도: "${attempt.query}" — ${err.message.split("\n")[0]}`)
        await sleep(DELAY_MS * 2)
        await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
        res = await search(page, attempt, counters)
      }

      pool.push(...res.rows)
      lastTotal = res.total
      if (res.truncated) sawTruncated = true
      else if (!attempt.yearFrom) seenFully.add(attempt.query)

      const next = pickBest(pool, movie)
      if (next) {
        picked = next
        usedQuery = attempt.query + (attempt.yearFrom ? ` [${attempt.yearFrom}]` : "")
      }
      if (isConclusive(picked, movie)) break
    }

    const verdict = classify(picked, movie, sawTruncated)
    const row = verdict.row

    out.byBomId[movie.bomId] = {
      bomTitle: movie.title,
      bomYear: movie.year, // 재개봉 행은 null — 재개봉 연도라 쓰면 안 된다는 표시
      ...(movie.reissue ? { reissue: true, searchTitle: movie.searchTitle } : {}),
      query: usedQuery ?? movie.searchTitle,
      titleKo: row?.titleKo ?? null,
      titleEnKobis: row?.titleEn ?? null,
      movieCd: row?.movieCd ?? null,
      prdtYear: row?.prdtYear || null,
      nation: row?.nation ?? null,
      status: row?.status ?? null,
      directorsKo: row?.directors ?? [],
      result: verdict.result,
      match: { confidence: verdict.confidence ?? "low", reason: verdict.reason },
      // ok 가 아니면 사람이 판단할 수 있도록 후보 행을 남긴다.
      ...(verdict.result === "ok" ? {} : { candidates: verdict.candidates ?? [], totalHits: lastTotal }),
      fetchedAt: new Date().toISOString(),
    }

    stats[verdict.result]++
    consecutiveErrors = 0

    const elapsed = (Date.now() - startedAt) / 1000
    const perItem = elapsed / (done + 1)
    const eta = Math.round((perItem * (todo.length - done - 1)) / 60)
    const mark = { ok: "OK", ambiguous: "AMB", "not-found": "NF", "no-korean": "NOKO" }[verdict.result]
    console.log(
      `  [${String(++done).padStart(4)}/${todo.length}] ${mark.padEnd(4)} ${movie.title} → ` +
        `${row?.titleKo ?? "-"}${row?.movieCd ? ` (${row.movieCd})` : ""}` +
        `  | ok ${stats.ok} amb ${stats.ambiguous} nf ${stats["not-found"]} noko ${stats["no-korean"]}` +
        ` | ${perItem.toFixed(1)}s/편, 남은 ${eta}분`
    )
  } catch (err) {
    // 타임아웃·네트워크 오류는 기록하지 않는다. 다음 실행에서 다시 시도한다.
    done++
    stats.error++
    consecutiveErrors++
    console.error(`  [${String(done).padStart(4)}/${todo.length}] ERR  ${movie.title} — ${err.message.split("\n")[0]}`)

    if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
      aborted = `연속 ${consecutiveErrors}회 실패 — KOBIS 가 차단했거나 네트워크가 끊긴 것으로 봅니다.`
      break
    }
    // 세션이 망가졌을 수 있으니 검색 첫 페이지로 되돌린다.
    try {
      await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
    } catch {}
    await sleep(DELAY_MS * 2)
  }

  if (done % SAVE_EVERY === 0) await save()
}

await save()
await browser.close()

const mins = ((Date.now() - startedAt) / 60000).toFixed(1)
console.log(`\n크롤링 ${aborted ? "중단" : "완료"}`)
if (aborted) console.log(`  사유: ${aborted}`)
console.log(`  처리 ${done}편 / 요청 ${counters.requests}회 / ${mins}분`)
console.log(
  `  ok ${stats.ok} · ambiguous ${stats.ambiguous} · not-found ${stats["not-found"]} · ` +
    `no-korean ${stats["no-korean"]} · error ${stats.error}(미기록, 재시도 대상)`
)
console.log(`  누적 ${out.count}편 저장: ${OUT_PATH}\n`)
if (aborted) process.exit(1)
