/**
 * 로튼토마토 크롤링 (Playwright)
 *
 * data/bom-yearly.json 의 영화들을 로튼토마토에서 찾아
 * 토마토미터·팝콘미터·감독·출연진(사진 포함)·포스터·장르를 모은다.
 *
 * 실행:
 *   node scripts/crawl-rt.mjs --limit=30     # 시험용
 *   node scripts/crawl-rt.mjs                # 전체 (약 2~3시간)
 *   node scripts/crawl-rt.mjs --force        # 이미 받은 것도 다시
 *   node scripts/crawl-rt.mjs --headed       # 브라우저 띄워서 디버깅
 *
 * 중단해도 안전하다. 25편마다 저장하고, 이미 확정된 영화는 건너뛴다.
 *
 * --- 왜 API 가 아니라 크롤링인가 ---
 * 로튼토마토는 공개 API 가 없다. OMDb 경유(scripts/fetch-rt-scores.mjs)는
 * 배우 사진이 없고 키 한도에 걸린다. 이 프로젝트의 외부 수집은 전부 크롤링이다.
 *
 * --- 데이터가 어디에 있나 ---
 * 상세 페이지의 script[type="application/ld+json"] 한 덩어리에
 * 점수·감독·개봉일·배우5명·포스터·장르가 전부 들어 있다. HTML 을 긁을 필요가 없다.
 * 예외는 팝콘미터(관객 점수) 하나뿐이라, 그건 media-scorecard 의
 * rt-text[slot="audience-score"] 에서 따로 뽑는다.
 *
 * --- 검색 1등을 믿으면 안 되는 이유 ---
 * 동명이작이 흔하다(오리지널 vs 리메이크). 그래서 상세 페이지의 dateCreated 연도가
 * BOM 의 year 와 ±1 안에 드는지, 제목이 정규화 후 맞는지 교차검증하고
 * 어긋나면 다음 후보로 넘어간다. 세 후보가 모두 어긋나면 confidence:"low" 로
 * 기록하되 버리지는 않는다 (사람이 나중에 볼 수 있게 reason 을 남긴다).
 *
 * --- 실패의 두 종류를 반드시 구분한다 ---
 * "정말 로튼토마토에 없다"(not-found)는 기록해서 다음 실행에 다시 부르지 않는다.
 * "타임아웃·네트워크 오류·차단 의심"은 기록하지 않는다. 다음 실행에 재시도해야 한다.
 * 이 구분이 없으면 일시적 장애 한 번에 수백 편이 영구 not-found 로 굳어버린다.
 */

import { chromium } from "playwright"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const IN_PATH = "data/bom-yearly.json"
const OUT_PATH = "data/rt-crawl.json"

const SEARCH_URL = "https://www.rottentomatoes.com/search?search="

const DELAY_MS = 1600 // 페이지 이동 사이 최소 대기
const SAVE_EVERY = 25 // 중간 저장 주기(편)
const CONTEXT_EVERY = 100 // 컨텍스트 재생성 주기(편). 메모리 누수 방지
const MAX_CANDIDATES = 4 // 교차검증에 쓸 검색 후보 수(재정렬 후 상위 N개)
const MAX_CONSECUTIVE_FAIL = 10 // 이만큼 연속 실패하면 차단으로 보고 중단
const NAV_TIMEOUT = 30000

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/** 배우 사진 확대 크기. 원본이 대개 1080x1440 이라 이 정도는 실제 화질이 나온다. */
const LARGE_SIZE = "500x600"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

// ============================================
// 제목 정규화 / 비교
// ============================================

/**
 * 제목을 비교 가능한 형태로 만든다.
 * 소문자 → 발음부호 제거(Amélie→amelie) → &를 and 로 → 문장부호 제거 →
 * 후치 관사 복원("Lord of the Rings, The" → "the lord of the rings") →
 * 선행 관사 제거.
 */
function normTitle(s) {
  if (!s) return ""
  let t = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 발음부호(NFD 로 분리된 결합문자)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bpart\b/g, " ") // "Part II" vs "II" 같은 흔들림 흡수

  // RT 는 동명이작을 "Robin Hood (2010)" 처럼 연도로 구분해 붙이기도 한다.
  t = t.replace(/\s*\(\d{4}\)\s*$/, "")

  // "Lord of the Rings, The" 처럼 관사가 뒤로 간 표기를 되돌린다.
  t = t.replace(/^(.*),\s*(the|a|an)$/, "$2 $1")

  t = t
    .replace(/[^a-z0-9]+/g, " ") // 문장부호·중점(WALL·E)·하이픈 전부 공백으로
    .trim()
    .replace(/^(the|a|an)\s+/, "") // 선행 관사 무시
    .replace(/\s+/g, " ")

  return t
}

/** 0~1 유사도. 오탈자·부제 표기 차이를 흡수하려고 편집거리를 쓴다. */
function similarity(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const [s, t] = a.length >= b.length ? [a, b] : [b, a]
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i)
  for (let i = 1; i <= s.length; i++) {
    const cur = [i]
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return 1 - prev[t.length] / s.length
}

/** 부제(콜론 뒤)를 떼어낸 앞부분. "Star Wars: Episode III" → "star wars" */
const mainPart = (s) => s.split(":")[0].trim()

/**
 * BOM 제목에 붙은 재개봉 꼬리표를 떼어낸다.
 *
 * BOM 표에서는 제목 칸에 주석이 위첨자로 붙는데, 긁어올 때 공백 없이 들러붙었다.
 *   "Titanic2012 3D Release", "Avatar2022 Re-release", "Coraline15th Anniversary"
 * 이대로 검색하면 결과가 아예 안 나온다. 20편이 여기 해당한다.
 *
 * 재개봉작은 BOM 의 year 가 재개봉 연도라서 원작 개봉연도와 다르다.
 * 그래서 떼어냈다는 사실(isReissue)을 같이 돌려주고, 연도 검증을 느슨하게 한다.
 */
function cleanTitle(raw) {
  const t = raw.replace(
    /(\d{4}\s*(?:Re-?release|3D Release)|\d+(?:st|nd|rd|th)?\s*(?:Year\s*)?Anniversary)\s*$/i,
    ""
  ).trim()
  return { title: t || raw, isReissue: t !== raw && t.length > 0 }
}

/**
 * BOM 제목 + BOM 연도 vs RT 제목 + RT 개봉연도.
 *
 * opts.searchYear — 검색 결과 행의 release-year.
 *   RT 상세의 dateCreated 는 그 페이지 기준 개봉일이라 재개봉이 있으면
 *   원작 연도가 아니다. 실측: /m/titanic 의 dateCreated 는 2012-04-04(3D 재개봉)인데
 *   검색 행의 release-year 는 1997 이다. 둘 중 하나라도 맞으면 통과시킨다.
 * opts.isReissue — BOM 쪽이 재개봉 등재라면 RT 연도가 BOM 연도보다 앞서는 게 정상이다.
 *
 * 반환: { titleOk, yearOk, score, reason }
 */
function verify(bomTitle, bomYear, rtTitle, rtYear, opts = {}) {
  const a = normTitle(bomTitle)
  const b = normTitle(rtTitle)

  let titleOk = false
  let titleNote = ""

  if (a === b) {
    titleOk = true
  } else if (similarity(a, b) >= 0.88) {
    titleOk = true
    titleNote = "제목이 완전히 같지는 않지만 매우 비슷함"
  } else if (a && b && normTitle(mainPart(bomTitle)) === normTitle(mainPart(rtTitle))) {
    titleOk = true
    titleNote = "부제 표기가 다르지만 본제목이 같음"
  } else if (a && b) {
    // RT 는 앞에 소유격을 붙여 두기도 한다.
    //   BOM "The Nightmare Before Christmas" ↔ RT "Tim Burton's The Nightmare Before Christmas"
    // 뒤쪽이 완전히 일치할 때만 인정한다. 뒤가 아니라 앞이 겹치는 경우
    // ("Halloween" ⊂ "Halloween Kills", "Dune" ⊂ "Dune: Part Two")는 속편이므로 걸러야 한다.
    const [long, short] = a.length >= b.length ? [a, b] : [b, a]
    if (long.endsWith(short) && short.length / long.length >= 0.55) {
      titleOk = true
      titleNote = "RT 제목 앞에 소유격 등이 덧붙음"
    }
  }

  const { searchYear = null, isReissue = false } = opts
  const near = (y) => y != null && bomYear != null && Math.abs(y - bomYear) <= 1

  let yearOk = near(rtYear)
  let yearNote = ""
  if (!yearOk && near(searchYear)) {
    yearOk = true
    yearNote = `RT 상세의 dateCreated(${rtYear})는 재개봉일로 보이나 검색 결과 연도(${searchYear})가 일치`
  }
  if (!yearOk && isReissue && titleOk) {
    // 재개봉 행은 양쪽 연도가 다 못 믿을 값이다.
    // BOM 의 year 는 재개봉 연도이고, RT 의 dateCreated 도 또 다른 재개봉일 수 있다.
    // 실측: "The Phantom Menace2012 3D Release"(BOM 2012) ↔ RT dateCreated 2024(2024 재개봉).
    // 제목이 맞으면 연도로 떨어뜨리지 않는다.
    yearOk = true
    yearNote = `BOM ${bomYear}년 재개봉 등재 / RT ${rtYear} — 재개봉이라 연도 검증은 생략, 제목으로 확정`
  }

  const reasons = []
  if (!titleOk) reasons.push(`제목 불일치: BOM "${bomTitle}" vs RT "${rtTitle}"`)
  if (rtYear == null && searchYear == null) reasons.push("RT 개봉연도를 알 수 없음")
  else if (!yearOk) reasons.push(`개봉연도 차이: BOM ${bomYear} vs RT ${rtYear}`)
  if (titleOk && titleNote) reasons.push(titleNote)
  if (yearOk && yearNote) reasons.push(yearNote)

  return {
    titleOk,
    yearOk,
    score: (titleOk ? 2 : 0) + (yearOk ? 1 : 0) + similarity(a, b),
    reason: reasons.join(" / "),
  }
}

/**
 * 상세 페이지를 열기 전에 후보의 순위를 다시 매긴다.
 *
 * 이게 이 스크립트에서 가장 값싸고 효과가 큰 부분이다.
 * RT 검색은 관련도 순이라 원하는 영화가 6번째, 8번째에 있는 일이 흔하다.
 *   "Halloween"     → 1978 판이 2번째, 우리가 찾는 2007 판은 8번째
 *   "It"            → 2017 판이 6번째 ("It Ends", "It Follows" 가 앞에)
 *   "The Lion King" → 2019 판이 3번째 (Mufasa, 1994 판이 앞에)
 * 그런데 검색 행에 release-year 속성이 이미 붙어 있다. 페이지를 더 열지 않고도
 * 제목 유사도와 연도 근접도로 줄을 다시 세울 수 있다. 그러면 대개 1번째가 정답이라
 * 상세 페이지를 한 번만 열면 된다.
 *
 * 주의: 속성 이름은 releaseyear 가 아니라 release-year 다.
 * 커스텀 엘리먼트 속성이라 하이픈이 들어간다. 이름을 틀리면 조용히 빈 값이 와서
 * "연도 정보가 없다"고 착각하게 된다.
 */
function rankCandidates(candidates, bomTitle, bomYear) {
  const a = normTitle(bomTitle)
  return candidates
    .map((c, i) => {
      const sim = similarity(a, normTitle(c.title))
      // 연도가 맞으면 크게 가산, 확실히 다른 판이면 감점, 모르면 중립.
      // bomYear 가 null 이면(재개봉 등재라 연도를 믿을 수 없는 경우) 제목만 본다.
      const yearScore =
        bomYear == null || c.year == null ? 0 : Math.abs(c.year - bomYear) <= 1 ? 1.5 : -0.3
      return { c, rank: sim * 2 + yearScore, i }
    })
    .sort((x, y) => y.rank - x.rank || x.i - y.i) // 동점이면 원래 검색 순서 유지
    .map((x) => x.c)
}

// ============================================
// 사진 URL 확대
// ============================================

/**
 * flixster 리사이저 URL 의 크기 부분만 바꾼다.
 *   .../<서명>/100x120/v2/<원본URL>
 * 서명은 크기를 포함하지 않아서 숫자만 키워도 200 이 온다(실측 확인).
 * 원본이 1080x1440 이라 500x600 까지는 진짜 해상도가 나온다.
 */
function enlarge(url, size) {
  if (!url) return null
  const out = url.replace(/\/\d+x\d+\//, `/${size}/`)
  return out === url ? null : out
}

/** v2 뒤에 붙어 있는 내부 URL 이 리사이즈 안 된 원본이다. */
function sourceImage(url) {
  if (!url) return null
  const i = url.indexOf("/v2/http")
  return i < 0 ? null : url.slice(i + 4)
}

// ============================================
// 페이지 조작
// ============================================

async function newContext(browser) {
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  })
  // JSON-LD 만 필요하다. 이미지·폰트·미디어는 받지 않는다.
  await ctx.route("**/*", (route) => {
    const t = route.request().resourceType()
    if (t === "image" || t === "font" || t === "media") return route.abort()
    return route.continue()
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(NAV_TIMEOUT)
  return { ctx, page }
}

/** 네트워크·타임아웃 오류는 위로 던진다(재시도 대상이므로 기록하면 안 된다). */
async function goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
}

/**
 * 검색 결과에서 영화 후보를 뽑는다.
 * search-page-media-row 커스텀 엘리먼트가 서버에서 렌더돼 나온다.
 * release-year / tomatometer-score 속성이 있지만 참고용으로만 쓴다.
 * 진실은 상세 페이지 JSON-LD 다.
 */
async function searchCandidates(page, title) {
  await goto(page, SEARCH_URL + encodeURIComponent(title))

  return await page.evaluate(() => {
    const seen = new Set()
    const out = []
    for (const row of document.querySelectorAll("search-page-media-row")) {
      const a = row.querySelector('a[href*="/m/"]')
      if (!a) continue
      const href = a.href.split("?")[0]
      if (!href.includes("/m/") || seen.has(href)) continue
      seen.add(href)
      out.push({
        url: href,
        title: (row.querySelector('a[slot="title"]')?.textContent || "").trim(),
        year: Number(row.getAttribute("release-year")) || null,
      })
    }
    return out
  })
}

/**
 * 상세 페이지에서 JSON-LD + 팝콘미터를 뽑는다.
 * JSON-LD 가 아예 없으면 null 을 돌려준다 → 호출부에서 차단 의심으로 처리한다.
 */
async function scrapeDetail(page, url) {
  await goto(page, url)

  return await page.evaluate(() => {
    let ld = null
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent)
        const type = Array.isArray(j["@type"]) ? j["@type"] : [j["@type"]]
        if (type.includes("Movie")) {
          ld = j
          break
        }
        if (!ld && j.aggregateRating) ld = j
      } catch {
        /* 깨진 덩어리는 무시하고 다음 것을 본다 */
      }
    }

    // 팝콘미터는 JSON-LD 에 없다. 스코어카드에서 따로 읽는다.
    const pct = (sel) => {
      const t = document.querySelector(sel)?.textContent?.trim() || ""
      const m = t.match(/(\d+)\s*%/)
      return m ? Number(m[1]) : null
    }
    const count = (sel) => {
      const t = document.querySelector(sel)?.textContent?.trim() || ""
      const m = t.replace(/,/g, "").match(/(\d+)/)
      return m ? Number(m[1]) : null
    }

    return {
      ld,
      audienceScore: pct('rt-text[slot="audience-score"]'),
      audienceCount: count('rt-link[slot="audience-reviews"]'),
      pageTitle: document.title,
    }
  })
}

/** JSON-LD 덩어리를 우리가 쓸 모양으로 정리한다. */
function shape(ld, detail, url) {
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : [])

  const tomatometer = ld?.aggregateRating?.ratingValue
  const actors = asArray(ld?.actor).map((a) => ({
    name: a.name || null,
    url: a.sameAs || null,
    imageUrl: a.image || null,
    imageUrlLarge: enlarge(a.image, LARGE_SIZE),
    imageUrlSource: sourceImage(a.image), // 리사이즈 전 원본(대개 1080x1440)
  }))

  return {
    rtUrl: url,
    rtTitle: ld?.name || null,
    tomatometer: tomatometer != null ? Number(tomatometer) : null,
    ratingCount: ld?.aggregateRating?.ratingCount ?? null,
    audienceScore: detail.audienceScore,
    audienceCount: detail.audienceCount,
    directors: asArray(ld?.director).map((d) => d.name).filter(Boolean),
    releaseDate: ld?.dateCreated || null,
    posterUrl: ld?.image || null,
    actors,
    genres: asArray(ld?.genre),
    contentRating: ld?.contentRating || null,
    description: ld?.description || null,
  }
}

// ============================================
// 입력 준비
// ============================================

const bom = JSON.parse(await readFile(IN_PATH, "utf8"))

/**
 * bomId 로 중복 제거.
 * 연말 개봉작은 두 해에 걸쳐 등재돼서 2000행 중 고유 bomId 는 1864개다.
 * 대표는 rank 가 작은(성적이 좋은) 행으로 삼고,
 * 사라지는 행은 bomAppearances 에 보존해 정보를 잃지 않는다.
 */
const byId = new Map()
for (const m of bom.movies) {
  const prev = byId.get(m.bomId)
  const appearance = { year: m.year, rank: m.rank, gross: m.gross }
  if (!prev) {
    byId.set(m.bomId, { ...m, bomAppearances: [appearance] })
  } else {
    prev.bomAppearances.push(appearance)
    if (m.rank < prev.rank) {
      Object.assign(prev, m, { bomAppearances: prev.bomAppearances })
    }
  }
}

let movies = [...byId.values()]
if (flags.limit) movies = movies.slice(0, Number(flags.limit))

let out = { generatedAt: null, count: 0, byBomId: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))

const todo = flags.force ? movies : movies.filter((m) => !out.byBomId[m.bomId])

console.log(`\n로튼토마토 크롤링`)
console.log(`  BOM ${bom.movies.length}행 → 고유 ${byId.size}편`)
console.log(`  이번 대상 ${movies.length}편 중 ${todo.length}편 남음`)
console.log(`  예상 약 ${Math.ceil((todo.length * DELAY_MS * 2) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 수집되었습니다.\n")
  process.exit(0)
}

// ============================================
// 크롤링
// ============================================

const stat = { ok: 0, noScore: 0, notFound: 0, error: 0, high: 0, low: 0 }
let done = 0
let consecutiveFail = 0
const startedAt = Date.now()

async function save() {
  out.generatedAt = new Date().toISOString()
  out.count = Object.keys(out.byBomId).length
  await mkdir(dirname(OUT_PATH), { recursive: true })
  // 저장소의 다른 data/*.json 과 마찬가지로 압축해서 쓴다(전체 1864편이면 약 4MB).
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

function progress() {
  const elapsed = (Date.now() - startedAt) / 1000
  const per = elapsed / done
  const left = Math.round((per * (todo.length - done)) / 60)
  console.log(
    `  ── ${done}/${todo.length} · 경과 ${Math.round(elapsed / 60)}분 · 남은 예상 ${left}분 · ` +
      `편당 ${per.toFixed(1)}초 · ok ${stat.ok} / no-score ${stat.noScore} / not-found ${stat.notFound} / 오류 ${stat.error}`
  )
}

const browser = await chromium.launch({ headless: !flags.headed })
let { ctx, page } = await newContext(browser)

let aborted = null

for (const movie of todo) {
  // 컨텍스트를 주기적으로 갈아엎어 메모리 누수를 막는다.
  if (done > 0 && done % CONTEXT_EVERY === 0) {
    await ctx.close()
    ;({ ctx, page } = await newContext(browser))
  }

  done++

  try {
    // BOM 제목에 재개봉 꼬리표가 붙어 있으면 떼고 검색한다("Titanic2012 3D Release").
    const { title: searchTitle, isReissue } = cleanTitle(movie.title)

    const found = await searchCandidates(page, searchTitle)
    await sleep(DELAY_MS)
    // 재개봉 등재는 BOM year 가 재개봉 연도라 순위 근거로 쓰면 속편이 앞으로 온다
    // ("Avatar2022 Re-release" 의 2022 는 Avatar 가 아니라 물의 길에 맞는다).
    const candidates = rankCandidates(
      found,
      searchTitle,
      isReissue ? null : movie.year
    ).slice(0, MAX_CANDIDATES)

    if (candidates.length === 0) {
      // 검색이 정상 응답했는데 영화 결과가 하나도 없다 → 진짜 없는 것으로 본다.
      out.byBomId[movie.bomId] = {
        rtUrl: null,
        rtTitle: null,
        status: "not-found",
        match: { confidence: "low", reason: "검색 결과에 영화 항목이 없음" },
        bomTitle: movie.title,
        bomYear: movie.year,
        fetchedAt: new Date().toISOString(),
      }
      stat.notFound++
      consecutiveFail++
      console.log(`  [${done}/${todo.length}] ${movie.title} (${movie.year}) — not-found`)
    } else {
      // 후보를 차례로 보며 교차검증. 통과하면 즉시 채택, 아니면 가장 나은 것을 남긴다.
      let best = null
      for (const cand of candidates) {
        const detail = await scrapeDetail(page, cand.url)
        await sleep(DELAY_MS)

        if (!detail.ld) {
          // 페이지는 열렸는데 JSON-LD 가 없다 → 차단 페이지일 수 있다.
          // 기록하지 않고 오류로 던져서 다음 실행에 재시도하게 한다.
          throw new Error(`JSON-LD 없음 (${cand.url})`)
        }

        const rtYear = Number(String(detail.ld.dateCreated || "").slice(0, 4)) || null
        const v = verify(searchTitle, movie.year, detail.ld.name, rtYear, {
          searchYear: cand.year,
          isReissue,
        })
        const shaped = shape(detail.ld, detail, cand.url)

        if (!best || v.score > best.v.score) best = { shaped, v }
        if (v.titleOk && v.yearOk) break // 확실하다. 더 볼 필요 없다.
      }

      const confident = best.v.titleOk && best.v.yearOk
      const status = best.shaped.tomatometer == null ? "no-score" : "ok"

      out.byBomId[movie.bomId] = {
        ...best.shaped,
        status,
        match: {
          confidence: confident ? "high" : "low",
          reason: best.v.reason || "제목과 개봉연도가 모두 일치",
        },
        bomTitle: movie.title,
        bomYear: movie.year,
        fetchedAt: new Date().toISOString(),
      }

      if (status === "ok") stat.ok++
      else stat.noScore++
      if (confident) stat.high++
      else stat.low++
      consecutiveFail = 0

      console.log(
        `  [${done}/${todo.length}] ${movie.title} (${movie.year}) — ` +
          `${best.shaped.tomatometer ?? "?"}% / 관객 ${best.shaped.audienceScore ?? "?"}% · ` +
          `배우 ${best.shaped.actors.length}명 · ${confident ? "high" : "LOW: " + best.v.reason}`
      )
    }
  } catch (err) {
    // 타임아웃·네트워크·차단 의심은 기록하지 않는다. 다음 실행에 다시 시도한다.
    stat.error++
    consecutiveFail++
    console.error(`  [${done}/${todo.length}] ${movie.title} — 오류(미기록, 재시도 대상): ${err.message}`)
    await sleep(DELAY_MS)
  }

  if (consecutiveFail > MAX_CONSECUTIVE_FAIL) {
    aborted =
      `연속 ${consecutiveFail}편 실패. 차단되었거나 페이지 구조가 바뀐 것으로 보입니다.\n` +
      `  전부 not-found 로 굳어버리는 사고를 막으려고 중단합니다.\n` +
      `  --headed 로 한 편만 열어 실제 화면을 확인하세요.`
    break
  }

  if (done % SAVE_EVERY === 0) {
    await save()
    progress()
  }
}

await save()
await ctx.close()
await browser.close()

const elapsed = (Date.now() - startedAt) / 1000
console.log(`\n크롤링 ${aborted ? "중단" : "완료"}`)
console.log(`  처리 ${done}편 · ${Math.round(elapsed / 60)}분 · 편당 ${(elapsed / done).toFixed(1)}초`)
console.log(`  ok ${stat.ok} / no-score ${stat.noScore} / not-found ${stat.notFound} / 오류 ${stat.error}`)
console.log(`  신뢰도 high ${stat.high} / low ${stat.low}`)
console.log(`  저장: ${OUT_PATH} (누적 ${out.count}편)`)
if (aborted) {
  console.error(`\n${aborted}\n`)
  process.exit(1)
}
console.log("")
