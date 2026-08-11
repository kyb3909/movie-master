/**
 * Box Office Mojo 목록 → TMDB 매칭 → 한국 개봉 제목 / 감독 / imdbId 확보
 *
 * data/bom-yearly.json 의 헐리우드 영화 목록을 TMDB 와 대조해
 * 한국 개봉 제목, 감독, imdbId, 주연 배우를 붙인다.
 *   - 로튼토마토 하이/로우 게임 → imdbId 가 RT 지수를 붙이는 키가 된다
 *   - 헐리우드 배우 사진 퀴즈    → cast[].profilePath 가 사진 소스가 된다
 *
 * 실행:
 *   node --env-file=.env scripts/fetch-tmdb-match.mjs
 *   node --env-file=.env scripts/fetch-tmdb-match.mjs --limit=20   # 시험용
 *   node --env-file=.env scripts/fetch-tmdb-match.mjs --force      # 전체 재수집
 *   node scripts/fetch-tmdb-match.mjs --self-test                  # 네트워크 없이 로직만 검증
 *
 * 중단해도 안전하다. 이미 처리한 bomId 는 건너뛰고 이어서 받는다.
 *
 * --- 이 저장소의 뼈아픈 교훈 ---
 * 예전에 "이름으로 검색"한 결과를 그대로 믿고 배우 사진을 붙였다가
 * 서로 다른 배우 80명에게 같은 사진이 들어갔다. 그래서 여기서는
 *   1) 검색 최상위 결과를 무조건 믿지 않는다 (제목·연도로 후보를 재정렬한다)
 *   2) 연도 / 제목 / 감독이라는 독립된 축으로 교차검증한다
 *   3) 하나라도 어긋나면 confidence="low" 로 떨어뜨려 검수 큐로 뺀다
 *   4) 한국 제목이 없으면 원제로 때우지 않고 null 로 두고 검수 큐로 뺀다
 * 추측으로 채운 데이터가 비어 있는 데이터보다 훨씬 위험하다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

// ============================================
// 설정
// ============================================

const TMDB_KEY = process.env.TMDB_API_KEY
const TMDB_BASE = "https://api.themoviedb.org/3"

const IN_PATH = "data/bom-yearly.json"
const OUT_PATH = "data/hollywood-catalog.json"
const QUEUE_PATH = "data/hollywood-review-queue.json"

/** TMDB 는 초당 약 50 요청까지 허용한다. 넉넉하게 간격을 둔다. */
const TMDB_DELAY_MS = 60

/** 영화 1편당 저장할 최대 출연진 수 */
const MAX_CAST = 10

/** 검수 큐에 남길 TMDB 후보 수 (사람이 눈으로 고를 수 있을 만큼만) */
const MAX_CANDIDATES = 5

/** 중간에 끊겨도 손실을 줄이기 위해 주기적으로 저장한다. */
const SAVE_EVERY = 25

/**
 * 제목 교차검증에 쓸 "영문권" 대체제목의 국가 코드.
 * 전체 대체제목을 다 비교하면 검증이 헐거워지므로 영문권으로 제한한다.
 */
const EN_REGIONS = new Set(["US", "GB", "CA", "AU", "NZ", "IE", ""])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 한글 음절이 한 글자라도 있는지. 로마자로 등록된 "KR 제목"을 걸러내는 데 쓴다. */
const hasHangul = (s) => typeof s === "string" && /[가-힣]/.test(s)

// ============================================
// 제목 정규화
//
// BOM 과 TMDB 는 같은 영화를 다르게 적는다.
//   "Spider-Man: No Way Home" vs "Spider Man No Way Home"
//   "The Lord of the Rings"   vs "Lord of the Rings, The"
//   "WALL·E"                  vs "WALL-E"
// 대소문자 / 문장부호 / 관사 / 발음기호를 지운 뒤 비교한다.
// ============================================

const LEADING_ARTICLE = /^(?:the|a|an)\s+/
/** "Lord of the Rings, The" 처럼 관사가 뒤로 간 표기 */
const TRAILING_ARTICLE = /^(.*),\s*(the|a|an)$/i

function normalizeTitle(s) {
  if (typeof s !== "string") return ""

  let t = s.trim()
  const moved = t.match(TRAILING_ARTICLE)
  if (moved) t = `${moved[2]} ${moved[1]}`

  return t
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // 발음기호 제거: é → e
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ") // 문장부호·특수문자 → 공백
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_ARTICLE, "")
}

/** "2010-07-16" → 2010, 값이 없으면 null */
function yearOf(releaseDate) {
  const y = Number(String(releaseDate || "").slice(0, 4))
  return Number.isFinite(y) && y > 1800 ? y : null
}

// ============================================
// TMDB 호출
//
// TMDB 는 v3 api_key 와 v4 Bearer 토큰을 모두 지원한다.
// v4 토큰은 JWT 라서 'eyJ' 로 시작한다. (ingest-catalog.mjs 와 동일한 규칙)
// ============================================

async function tmdb(path, params = {}) {
  const url = new URL(TMDB_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v))
  }

  const headers = { accept: "application/json" }
  if (TMDB_KEY.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${TMDB_KEY}`
  } else {
    url.searchParams.set("api_key", TMDB_KEY)
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers })

    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") || 2) * 1000
      console.warn(`  · 요청 제한. ${wait}ms 대기 후 재시도`)
      await sleep(wait)
      continue
    }
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`TMDB ${res.status} ${path}: ${await res.text()}`)

    return res.json()
  }
  throw new Error(`TMDB 재시도 초과: ${path}`)
}

/**
 * 검색 후보를 찾는다.
 * 연도를 박아 검색 → 못 찾으면 ±1 → 그래도 없으면 연도 없이.
 * language 를 지정하지 않는다. BOM 제목이 영어라 기본(en-US)이 맞다.
 */
async function searchCandidates(bom) {
  const attempts = [bom.year, bom.year - 1, bom.year + 1, null]

  for (const year of attempts) {
    const data = await tmdb("/search/movie", {
      query: bom.title,
      include_adult: false,
      primary_release_year: year ?? undefined,
    })
    await sleep(TMDB_DELAY_MS)

    const results = data?.results || []
    if (results.length) return { results, searchedYear: year }
  }

  return { results: [], searchedYear: null }
}

/**
 * 검색 결과를 재정렬한다.
 *
 * TMDB 의 검색 순위는 인기도 기반이라 동명이작에서 엉뚱한 편을 1위로 올린다.
 * (예: "The Mummy" 검색 시 2017년판이 1999년판보다 위로 올 수 있다)
 * 제목 완전일치 > 연도 근접 > 인기도 순으로 다시 세운다.
 */
function rankCandidates(bom, results) {
  const wanted = normalizeTitle(bom.title)

  return [...results].sort((a, b) => {
    const titleScore = (m) =>
      normalizeTitle(m.title) === wanted || normalizeTitle(m.original_title) === wanted ? 0 : 1
    const yearScore = (m) => {
      const y = yearOf(m.release_date)
      return y === null ? 99 : Math.abs(y - bom.year)
    }

    return (
      titleScore(a) - titleScore(b) ||
      yearScore(a) - yearScore(b) ||
      (b.popularity || 0) - (a.popularity || 0)
    )
  })
}

// ============================================
// 파싱 / 교차검증  (self-test 가 검증하는 순수 함수들)
// ============================================

/**
 * 한국 개봉 제목을 뽑는다.
 *   1순위: alternative_titles 의 iso_3166_1 === "KR"
 *   2순위: translations 의 iso_639_1 === "ko" 의 data.title
 * 둘 다 없거나 한글이 한 글자도 없으면 null 을 돌려준다.
 *
 * KR 대체제목이 로마자로 등록된 경우가 흔하다("Inception" 이 KR 로 등록됨).
 * 그건 한국 개봉 제목이 아니므로 hasHangul 로 걸러내고 다음 순위로 넘어간다.
 */
function pickKoreanTitle(detail) {
  const alts = detail?.alternative_titles?.titles || []
  const krAlt = alts.find((t) => t.iso_3166_1 === "KR" && hasHangul(t.title))
  if (krAlt) return { titleKo: krAlt.title.trim(), titleKoSource: "tmdb-alt-kr" }

  const trs = detail?.translations?.translations || []
  const koTr = trs.find((t) => t.iso_639_1 === "ko" && hasHangul(t.data?.title))
  if (koTr) return { titleKo: koTr.data.title.trim(), titleKoSource: "tmdb-ko-translation" }

  // 원제로 때우지 않는다. 없으면 없는 것이다.
  return { titleKo: null, titleKoSource: null }
}

/** credits.crew 에서 감독을 모두 뽑는다 (공동연출이면 여러 명). */
function pickDirectors(detail) {
  const crew = detail?.credits?.crew || []
  const names = crew.filter((c) => c.job === "Director" && c.name).map((c) => c.name.trim())
  return [...new Set(names)]
}

/** credits.cast 를 order 오름차순으로 최대 MAX_CAST 명. 사진 없는 배우도 그대로 담는다. */
function pickCast(detail) {
  const cast = detail?.credits?.cast || []
  return [...cast]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST)
    .map((c) => ({
      tmdbId: c.id,
      name: c.name || null,
      character: c.character || null,
      order: c.order ?? null,
      profilePath: c.profile_path || null,
    }))
}

/** 교차검증에 쓸 영문 제목 후보들 (원제 + 영문권 대체제목) */
function englishTitlesOf(detail) {
  const alts = (detail?.alternative_titles?.titles || [])
    .filter((t) => EN_REGIONS.has(t.iso_3166_1 ?? ""))
    .map((t) => t.title)

  return [detail?.title, detail?.original_title, ...alts].filter(Boolean)
}

/**
 * 교차검증: 연도 / 제목 / 감독이라는 독립된 축으로 확인한다.
 * 하나라도 어긋나면 low. 감독이 비면 동명이작을 구분할 근거 자체가 없으므로 역시 low.
 */
function evaluateMatch(bom, detail, directors) {
  const problems = []
  const notes = []

  const tmdbYear = yearOf(detail?.release_date)
  if (tmdbYear === null) {
    problems.push("TMDB 개봉일 없음")
  } else if (Math.abs(tmdbYear - bom.year) > 1) {
    problems.push(`연도 불일치 (BOM ${bom.year} vs TMDB ${tmdbYear})`)
  } else {
    notes.push(`연도 ${tmdbYear}`)
  }

  const wanted = normalizeTitle(bom.title)
  const titleMatched = englishTitlesOf(detail).some((t) => normalizeTitle(t) === wanted)
  if (!titleMatched) {
    problems.push(`제목 불일치 (BOM "${bom.title}" vs TMDB "${detail?.title ?? "?"}")`)
  } else {
    notes.push("제목 일치")
  }

  if (directors.length === 0) {
    problems.push("감독 정보 없음")
  } else {
    notes.push(`감독 ${directors.join(", ")}`)
  }

  return {
    confidence: problems.length ? "low" : "high",
    reason: problems.length ? problems.join(" / ") : notes.join(" / "),
  }
}

/** BOM 항목 + TMDB 상세 → 카탈로그 레코드 */
function buildRecord(bom, detail) {
  const directors = pickDirectors(detail)
  const { titleKo, titleKoSource } = pickKoreanTitle(detail)

  return {
    bomId: bom.bomId,
    bomRank: bom.rank ?? null,
    bomYear: bom.year,
    // BOM 의 gross 는 "해당 연도 내 매출"이라 작품 총매출이 아니다.
    // 두 해에 걸친 작품의 총매출은 bomAppearances 를 합산해야 한다.
    gross: bom.gross ?? null,
    bomAppearances: bom.bomAppearances ?? [
      { year: bom.year, rank: bom.rank ?? null, gross: bom.gross ?? null },
    ],

    titleEn: detail.title || detail.original_title || bom.title,
    titleKo,
    titleKoSource,

    year: yearOf(detail.release_date),
    releaseDate: detail.release_date || null,
    directors,

    tmdbId: detail.id,
    imdbId: detail.imdb_id || null,
    posterPath: detail.poster_path || null,

    cast: pickCast(detail),
    match: evaluateMatch(bom, detail, directors),
  }
}

/**
 * bomId 중복 제거.
 *
 * BOM 은 "해당 연도 내 매출" 기준이라 연말 개봉작이 두 해 목록에 모두 오른다.
 * (예: 나니아 연대기 → 2005년 4위 / 2006년 24위. 2000행 중 136행이 이 경우다)
 * 그대로 두면 카탈로그에 같은 영화가 두 번 들어가 하이/로우 게임 좌우에
 * 같은 영화가 뜨는 사고가 나고, TMDB 요청도 그만큼 낭비된다.
 *
 * 대표 행은 rank 가 더 높은(숫자가 작은) 쪽을 고른다. 그 해가 그 영화의 주
 * 흥행 연도라 TMDB 개봉연도와의 대조가 정확해진다. 사라지는 행은 버리지 않고
 * bomAppearances 로 남겨 나중에 총 흥행 규모를 계산할 수 있게 한다.
 */
function dedupeByBomId(rows) {
  const rankOf = (m) => (Number.isFinite(Number(m.rank)) ? Number(m.rank) : Infinity)
  const byId = new Map()
  let inputRows = 0

  for (const raw of rows) {
    if (!raw?.bomId || !raw.title || !Number.isFinite(Number(raw.year))) continue
    inputRows++

    const row = { ...raw, year: Number(raw.year) }
    const appearance = {
      year: row.year,
      rank: rankOf(row) === Infinity ? null : rankOf(row),
      gross: row.gross ?? null,
    }
    const prev = byId.get(row.bomId)

    if (!prev) {
      byId.set(row.bomId, { ...row, bomAppearances: [appearance] })
    } else if (rankOf(row) < rankOf(prev)) {
      // 더 높은 순위 행이 대표가 된다. 기존 등재 기록은 그대로 이어받는다.
      byId.set(row.bomId, { ...row, bomAppearances: [...prev.bomAppearances, appearance] })
    } else {
      prev.bomAppearances.push(appearance)
    }
  }

  for (const m of byId.values()) m.bomAppearances.sort((a, b) => a.year - b.year)

  return { movies: [...byId.values()], inputRows }
}

/** 검수 큐 항목. 사람이 원제·연도·후보를 한눈에 보고 고칠 수 있게 담는다. */
function toReviewEntry(bom, record, candidates) {
  const issues = []
  if (!record) issues.push("no-match")
  if (record?.match.confidence === "low") issues.push("low-confidence")
  if (record && !record.titleKo) issues.push("missing-korean-title")
  if (issues.length === 0) return null

  return {
    issues,
    bomId: bom.bomId,
    bomTitle: bom.title,
    bomYear: bom.year,
    bomRank: bom.rank ?? null,
    bomReleaseDate: bom.releaseDate ?? null, // BOM 표기는 "May 19" 처럼 연도가 없다
    bomAppearances: bom.bomAppearances ?? null,
    gross: bom.gross ?? null,
    reason: record?.match.reason ?? "TMDB 검색 결과 없음",
    matched: record
      ? {
          tmdbId: record.tmdbId,
          imdbId: record.imdbId,
          titleEn: record.titleEn,
          titleKo: record.titleKo,
          year: record.year,
          directors: record.directors,
        }
      : null,
    candidates: (candidates || []).slice(0, MAX_CANDIDATES).map((c) => ({
      tmdbId: c.id,
      title: c.title,
      originalTitle: c.original_title,
      releaseDate: c.release_date || null,
      popularity: c.popularity ?? null,
    })),
  }
}

// ============================================
// self-test — 네트워크 없이 파싱·교차검증·한국어 제목 추출만 검증한다
//
// TMDB 키가 아직 없어 실제 실행 검증이 불가능하므로, 손으로 만든 응답 샘플로
// 로직만 돌려본다. 픽스처는 실제 TMDB 응답에서 필요한 필드만 남긴 모양이다.
// ============================================

const FIXTURES = [
  {
    label: "KR 대체제목이 있는 경우",
    bom: { bomId: "tt1375666", rank: 4, year: 2010, title: "Inception", gross: 292587330 },
    detail: {
      id: 27205,
      imdb_id: "tt1375666",
      title: "Inception",
      original_title: "Inception",
      release_date: "2010-07-15",
      poster_path: "/inception.jpg",
      alternative_titles: {
        titles: [
          { iso_3166_1: "KR", title: "인셉션", type: "" },
          { iso_3166_1: "JP", title: "インセプション", type: "" },
        ],
      },
      translations: { translations: [{ iso_639_1: "ko", data: { title: "인셉션(번역)" } }] },
      credits: {
        crew: [
          { job: "Director", name: "Christopher Nolan" },
          { job: "Editor", name: "Lee Smith" },
        ],
        cast: [
          { id: 6193, name: "Leonardo DiCaprio", character: "Cobb", order: 0, profile_path: "/ldc.jpg" },
          { id: 24045, name: "Joseph Gordon-Levitt", character: "Arthur", order: 1, profile_path: null },
        ],
      },
    },
    expect: { confidence: "high", titleKo: "인셉션", titleKoSource: "tmdb-alt-kr", inQueue: false },
  },
  {
    label: "ko 번역만 있는 경우 (KR 대체제목이 로마자라 무시됨) + 관사 후치 표기",
    bom: { bomId: "tt0468569", rank: 1, year: 2008, title: "Dark Knight, The", gross: 534858444 },
    detail: {
      id: 155,
      imdb_id: "tt0468569",
      title: "The Dark Knight",
      original_title: "The Dark Knight",
      release_date: "2008-07-16",
      poster_path: "/tdk.jpg",
      // KR 로 등록됐지만 로마자다 → 한국 개봉 제목이 아니므로 건너뛰어야 한다
      alternative_titles: { titles: [{ iso_3166_1: "KR", title: "The Dark Knight", type: "" }] },
      translations: { translations: [{ iso_639_1: "ko", data: { title: "다크 나이트" } }] },
      credits: {
        crew: [{ job: "Director", name: "Christopher Nolan" }],
        cast: [{ id: 3894, name: "Christian Bale", character: "Bruce Wayne", order: 0, profile_path: "/cb.jpg" }],
      },
    },
    expect: { confidence: "high", titleKo: "다크 나이트", titleKoSource: "tmdb-ko-translation", inQueue: false },
  },
  {
    label: "한국어 제목이 아예 없는 경우 → null + 검수 큐",
    bom: { bomId: "tt0499549", rank: 1, year: 2009, title: "Avatar", gross: 760507625 },
    detail: {
      id: 19995,
      imdb_id: "tt0499549",
      title: "Avatar",
      original_title: "Avatar",
      release_date: "2009-12-18",
      poster_path: "/avatar.jpg",
      alternative_titles: { titles: [{ iso_3166_1: "FR", title: "Avatar" }] },
      translations: { translations: [{ iso_639_1: "fr", data: { title: "Avatar" } }] },
      credits: {
        crew: [{ job: "Director", name: "James Cameron" }],
        cast: [{ id: 65731, name: "Sam Worthington", character: "Jake Sully", order: 0, profile_path: null }],
      },
    },
    expect: { confidence: "high", titleKo: null, titleKoSource: null, inQueue: true },
  },
  {
    label: "동명이작을 잘못 잡은 경우 (연도 어긋남 + 감독 없음) → low",
    bom: { bomId: "tt5581788", rank: 22, year: 2017, title: "The Mummy", gross: 80101125 },
    detail: {
      id: 564,
      imdb_id: "tt0120616",
      title: "The Mummy",
      original_title: "The Mummy",
      release_date: "1999-05-07", // BOM 2017 과 18년 차이
      poster_path: "/mummy99.jpg",
      alternative_titles: { titles: [{ iso_3166_1: "KR", title: "미이라" }] },
      translations: { translations: [] },
      credits: {
        crew: [{ job: "Screenplay", name: "Stephen Sommers" }], // Director 가 없다
        cast: [{ id: 111, name: "Brendan Fraser", character: "Rick", order: 0, profile_path: "/bf.jpg" }],
      },
    },
    expect: { confidence: "low", titleKo: "미이라", titleKoSource: "tmdb-alt-kr", inQueue: true },
  },
  {
    label: "TMDB 표기가 다르지만 영문권 대체제목으로 일치하는 경우 → high",
    bom: { bomId: "tt1596343", rank: 6, year: 2011, title: "Fast Five", gross: 209837675 },
    detail: {
      id: 51497,
      imdb_id: "tt1596343",
      title: "Fast & Furious 5",
      original_title: "Fast Five",
      release_date: "2011-04-20",
      poster_path: "/ff5.jpg",
      alternative_titles: {
        titles: [
          { iso_3166_1: "US", title: "Fast Five" },
          { iso_3166_1: "KR", title: "분노의 질주: 언리미티드" },
        ],
      },
      translations: { translations: [] },
      credits: {
        crew: [{ job: "Director", name: "Justin Lin" }],
        cast: [{ id: 12835, name: "Vin Diesel", character: "Dom", order: 0, profile_path: "/vd.jpg" }],
      },
    },
    expect: {
      confidence: "high",
      titleKo: "분노의 질주: 언리미티드",
      titleKoSource: "tmdb-alt-kr",
      inQueue: false,
    },
  },
]

function runSelfTest() {
  console.log("\nself-test — 네트워크 없이 픽스처로 로직만 검증합니다.\n")

  let failed = 0

  for (const fx of FIXTURES) {
    const record = buildRecord(fx.bom, fx.detail)
    const queued = toReviewEntry(fx.bom, record, [])

    const actual = {
      confidence: record.match.confidence,
      titleKo: record.titleKo,
      titleKoSource: record.titleKoSource,
      inQueue: queued !== null,
    }

    const diffs = Object.entries(fx.expect)
      .filter(([k, v]) => actual[k] !== v)
      .map(([k, v]) => `${k}: 기대 ${JSON.stringify(v)} ≠ 실제 ${JSON.stringify(actual[k])}`)

    if (diffs.length) failed++

    console.log(`  ${diffs.length ? "실패" : "통과"}  ${fx.label}`)
    console.log(`         제목: ${record.titleEn} → ${record.titleKo ?? "(없음)"} [${record.titleKoSource ?? "-"}]`)
    console.log(`         감독: ${record.directors.join(", ") || "(없음)"} / 연도: ${record.year} / imdb: ${record.imdbId}`)
    console.log(`         판정: ${record.match.confidence} — ${record.match.reason}`)
    console.log(`         배우: ${record.cast.map((c) => `${c.name}(${c.profilePath ? "사진O" : "사진X"})`).join(", ")}`)
    if (queued) console.log(`         검수 큐: ${queued.issues.join(", ")}`)
    for (const d of diffs) console.log(`         >> ${d}`)
    console.log()
  }

  // 제목 정규화 단위 검증
  const NORM_CASES = [
    ["Spider-Man: No Way Home", "spider man no way home"],
    ["Lord of the Rings, The", "lord of the rings"],
    ["The Lord of the Rings", "lord of the rings"],
    ["WALL·E", "wall e"],
    ["Amélie", "amelie"],
    ["Fast & Furious", "fast and furious"],
  ]
  console.log("  제목 정규화")
  for (const [input, expected] of NORM_CASES) {
    const got = normalizeTitle(input)
    const ok = got === expected
    if (!ok) failed++
    console.log(`    ${ok ? "통과" : "실패"}  "${input}" → "${got}"${ok ? "" : ` (기대 "${expected}")`}`)
  }

  // bomId 중복 제거: 두 해에 걸친 영화는 rank 가 높은 해를 대표로 삼고,
  // 나머지 해의 등재 기록은 bomAppearances 에 남아야 한다.
  console.log("\n  bomId 중복 제거")
  const { movies: deduped, inputRows } = dedupeByBomId([
    { bomId: "rlNarnia", year: 2005, rank: 4, title: "The Chronicles of Narnia", gross: 291710957 },
    { bomId: "rlNarnia", year: 2006, rank: 24, title: "The Chronicles of Narnia", gross: 3268759 },
    { bomId: "rlAvatar", year: 2009, rank: 1, title: "Avatar", gross: 491757064 },
    { bomId: "", year: 2009, rank: 2, title: "쓰레기 행" }, // bomId 없는 행은 버려야 한다
  ])
  const narnia = deduped.find((m) => m.bomId === "rlNarnia")
  const dedupChecks = [
    ["입력 행 수 3 (bomId 없는 행 제외)", inputRows === 3],
    ["고유 2편", deduped.length === 2],
    ["대표는 rank 가 높은 2005년", narnia?.year === 2005 && narnia?.rank === 4],
    ["등재 기록 2건 보존", narnia?.bomAppearances?.length === 2],
    [
      "등재 기록 연도순 정렬",
      narnia?.bomAppearances?.[0]?.year === 2005 && narnia?.bomAppearances?.[1]?.year === 2006,
    ],
    [
      "총 매출 합산 가능",
      narnia?.bomAppearances?.reduce((s, a) => s + a.gross, 0) === 291710957 + 3268759,
    ],
  ]
  for (const [label, ok] of dedupChecks) {
    if (!ok) failed++
    console.log(`    ${ok ? "통과" : "실패"}  ${label}`)
  }

  console.log(`\nself-test ${failed ? `실패 ${failed}건` : "전부 통과"}\n`)
  process.exit(failed ? 1 : 0)
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
사용법: node --env-file=.env scripts/fetch-tmdb-match.mjs [옵션]

  --limit=N      처리할 편수 제한 (시험용)
  --force        이어받기를 무시하고 전체 재수집
  --self-test    네트워크 없이 고정 픽스처로 로직만 검증
  --help         이 도움말

  입력: ${IN_PATH}
  출력: ${OUT_PATH}, ${QUEUE_PATH}
`)
  process.exit(0)
}

if (flags["self-test"]) runSelfTest()

if (!TMDB_KEY) {
  console.error(`
환경변수 TMDB_API_KEY 가 없습니다.

  1) https://www.themoviedb.org/settings/api 에서 키를 발급받으세요.
     (v3 API Key 와 v4 Read Access Token 둘 다 사용할 수 있습니다)
  2) 프로젝트 루트의 .env 에 아래 줄을 추가하세요.
       TMDB_API_KEY=발급받은_키
  3) 다음처럼 실행하세요.
       node --env-file=.env scripts/fetch-tmdb-match.mjs

키 없이 파싱 로직만 확인하려면:
       node scripts/fetch-tmdb-match.mjs --self-test
`)
  process.exit(1)
}

if (!existsSync(IN_PATH)) {
  console.error(`
입력 파일이 없습니다: ${IN_PATH}

Box Office Mojo 수집 스크립트가 먼저 이 파일을 만들어야 합니다.
기대하는 형식:
  { movies: [ { year, rank, title, bomId, gross, releaseDate, distributor } ] }
`)
  process.exit(1)
}

const bomData = JSON.parse(await readFile(IN_PATH, "utf8"))
if (!Array.isArray(bomData?.movies)) {
  console.error(`${IN_PATH} 에 movies 배열이 없습니다. 형식을 확인하세요.`)
  process.exit(1)
}

const { movies, inputRows } = dedupeByBomId(bomData.movies)

// 이어받기: 카탈로그 또는 검수 큐에 이미 있는 bomId 는 처리된 것으로 본다.
// (매칭 실패한 영화는 검수 큐에만 남으므로 큐도 함께 봐야 무한 재시도를 막는다)
let catalog = new Map()
let queue = new Map()

if (!flags.force) {
  if (existsSync(OUT_PATH)) {
    const prev = JSON.parse(await readFile(OUT_PATH, "utf8"))
    for (const r of prev.movies || []) catalog.set(r.bomId, r)
  }
  if (existsSync(QUEUE_PATH)) {
    const prev = JSON.parse(await readFile(QUEUE_PATH, "utf8"))
    for (const r of prev.items || []) queue.set(r.bomId, r)
  }
}

const done = new Set([...catalog.keys(), ...queue.keys()])
const alreadyDone = movies.filter((m) => done.has(m.bomId)).length
let todo = movies.filter((m) => !done.has(m.bomId))
if (flags.limit) todo = todo.slice(0, Number(flags.limit))

const dupRows = inputRows - movies.length

console.log(`\nTMDB 매칭`)
console.log(
  `  입력 ${inputRows}행 → 고유 ${movies.length}편` +
    (dupRows > 0 ? ` (두 해에 걸쳐 중복 등재된 ${dupRows}행은 rank 가 높은 쪽으로 합쳤습니다)` : "")
)
console.log(`  이번 실행 ${todo.length}편 처리 (이미 완료 ${alreadyDone}편)`)
console.log(`  요청 간격 ${TMDB_DELAY_MS}ms, 영화당 2회 이상 요청\n`)

if (todo.length === 0) {
  console.log("처리할 영화가 없습니다. 전체를 다시 받으려면 --force 를 쓰세요.\n")
  process.exit(0)
}

async function save() {
  const sortKey = (r) => `${String(r.bomYear).padStart(4, "0")}-${String(r.bomRank ?? 999).padStart(4, "0")}`
  const records = [...catalog.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const items = [...queue.values()].sort(
    (a, b) => a.bomYear - b.bomYear || (a.bomRank ?? 999) - (b.bomRank ?? 999)
  )

  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(
    OUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: records.length, movies: records }, null, 2),
    "utf8"
  )
  await writeFile(
    QUEUE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: items.length,
        note: "매칭 실패 / confidence low / 한국 개봉 제목 없음 인 항목. 사람이 확인해 고쳐야 한다.",
        items,
      },
      null,
      2
    ),
    "utf8"
  )
}

let processed = 0
let high = 0
let low = 0
let unmatched = 0
let noKo = 0

for (const bom of todo) {
  const label = `[${String(++processed).padStart(4)}/${todo.length}] ${bom.year} ${bom.title}`

  try {
    const { results } = await searchCandidates(bom)

    if (results.length === 0) {
      queue.set(bom.bomId, toReviewEntry(bom, null, []))
      unmatched++
      console.log(`  ${label} — 검색 결과 없음 (검수 큐)`)
    } else {
      const ranked = rankCandidates(bom, results)
      const detail = await tmdb(`/movie/${ranked[0].id}`, {
        append_to_response: "credits,alternative_titles,translations",
      })
      await sleep(TMDB_DELAY_MS)

      if (!detail) throw new Error(`상세 조회 실패 (tmdbId=${ranked[0].id})`)

      const record = buildRecord(bom, detail)
      catalog.set(bom.bomId, record)

      const entry = toReviewEntry(bom, record, ranked)
      if (entry) queue.set(bom.bomId, entry)
      else queue.delete(bom.bomId)

      if (record.match.confidence === "high") high++
      else low++
      if (!record.titleKo) noKo++

      console.log(
        `  ${label} → ${record.titleKo ?? "(한국 제목 없음)"} / ${record.directors[0] ?? "감독?"}` +
          ` / ${record.imdbId ?? "imdb?"} [${record.match.confidence}]`
      )
    }
  } catch (err) {
    queue.set(bom.bomId, {
      ...toReviewEntry(bom, null, []),
      reason: `수집 오류: ${err.message}`,
    })
    unmatched++
    console.error(`  ${label} — 실패: ${err.message}`)
  }

  if (processed % SAVE_EVERY === 0) await save()
}

await save()

console.log(`\n수집 완료`)
console.log(`  카탈로그 ${catalog.size}편 (이번 실행: high ${high}, low ${low}, 매칭실패 ${unmatched})`)
console.log(`  한국 개봉 제목 없음 ${noKo}편`)
console.log(`  검수 큐 ${queue.size}건`)
console.log(`  저장: ${OUT_PATH}, ${QUEUE_PATH}\n`)
