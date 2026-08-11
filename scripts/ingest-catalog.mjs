/**
 * 영화/배우 카탈로그 수집 스크립트
 *
 * 실행:
 *   node --env-file=.env.local scripts/ingest-catalog.mjs movies --lang=ko --pages=5
 *   node --env-file=.env.local scripts/ingest-catalog.mjs movies --lang=en --pages=5
 *   node --env-file=.env.local scripts/ingest-catalog.mjs actors
 *   node --env-file=.env.local scripts/ingest-catalog.mjs rt --limit=900
 *
 * 세 단계를 분리한 이유:
 *   movies - TMDB 에서 영화 + 출연진을 받아 movie / actor / movie_credit 을 채운다.
 *   actors - 배우 상세를 받아 한글 이름과 프로필 정보를 보강한다. (배우 1명당 1콜)
 *   rt     - OMDb 에서 로튼토마토 지수를 받아온다. 무료 티어가 하루 1,000 요청이라
 *            별도 단계로 두고 --limit 으로 예산을 통제한다.
 *
 * 모든 단계는 외부 ID(tmdb_id) 기준 upsert 라서 몇 번을 다시 돌려도 안전하다.
 */

import { createClient } from "@supabase/supabase-js"

// ============================================
// 설정
// ============================================

const TMDB_KEY = process.env.TMDB_API_KEY
const OMDB_KEY = process.env.OMDB_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TMDB_BASE = "https://api.themoviedb.org/3"
const IMAGE_BASE = "https://image.tmdb.org/t/p/w185"

/** 영화 1편당 저장할 최대 출연진 수. 퀴즈가 7명을 쓰므로 여유를 둔다. */
const MAX_CAST_PER_MOVIE = 10

/** TMDB 는 초당 약 50 요청까지 허용한다. 넉넉하게 간격을 둔다. */
const TMDB_DELAY_MS = 60

// ============================================
// 유틸
// ============================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 한글 음절이 포함되어 있는지 */
const hasHangul = (s) => typeof s === "string" && /[가-힣]/.test(s)

function parseArgs(argv) {
  const cmd = argv[2]
  const flags = {}
  for (const arg of argv.slice(3)) {
    const m = arg.match(/^--([^=]+)=?(.*)$/)
    if (m) flags[m[1]] = m[2] === "" ? true : m[2]
  }
  return { cmd, flags }
}

function requireEnv(name, value) {
  if (!value) {
    console.error(`환경변수 ${name} 가 없습니다. .env.local 을 확인하세요.`)
    process.exit(1)
  }
  return value
}

/**
 * TMDB 는 v3 api_key 와 v4 Bearer 토큰을 모두 지원한다.
 * v4 토큰은 JWT 라서 'eyJ' 로 시작한다.
 */
async function tmdb(path, params = {}) {
  const url = new URL(TMDB_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
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

/** TMDB gender 코드를 actor 테이블의 CHECK 제약에 맞춘다. */
function mapGender(code) {
  if (code === 1) return "female"
  if (code === 2) return "male"
  return "other"
}

const supabase = () =>
  createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
    { auth: { persistSession: false } }
  )

// ============================================
// 1단계: 영화 + 출연진
// ============================================

async function ingestMovies(flags) {
  requireEnv("TMDB_API_KEY", TMDB_KEY)
  const db = supabase()

  const lang = flags.lang || "ko"
  const pages = Number(flags.pages || 5)
  const minVotes = Number(flags.minVotes || 50)
  const maxCast = Number(flags.cast || MAX_CAST_PER_MOVIE)

  console.log(
    `\n영화 수집: 원어=${lang}, ${pages}페이지, 최소 투표수=${minVotes}, 영화당 배우 최대 ${maxCast}명\n`
  )

  let totalMovies = 0
  let totalCredits = 0

  for (let page = 1; page <= pages; page++) {
    const list = await tmdb("/discover/movie", {
      with_original_language: lang,
      sort_by: "popularity.desc",
      "vote_count.gte": minVotes,
      include_adult: false,
      language: "ko-KR",
      page,
    })

    if (!list?.results?.length) {
      console.log(`${page}페이지에 결과가 없습니다. 중단합니다.`)
      break
    }

    console.log(`[${page}/${pages}페이지] ${list.results.length}편`)

    for (const stub of list.results) {
      await sleep(TMDB_DELAY_MS)

      // 상세와 크레딧을 한 번의 요청으로 받는다.
      const detail = await tmdb(`/movie/${stub.id}`, {
        language: "ko-KR",
        append_to_response: "credits",
      })
      if (!detail) continue

      // TMDB 는 1인 2역인 배우를 캐스트에 여러 번 올린다. 같은 tmdb_id 가 한 번의
      // upsert 에 두 번 들어가면 Postgres 가 "cannot affect row a second time" 로
      // 실패하므로 person id 기준으로 먼저 중복을 제거한다.
      const seen = new Set()
      const cast = (detail.credits?.cast || [])
        .filter((c) => c.profile_path) // 사진 없는 배우는 퀴즈 힌트로 못 쓴다
        .filter((c) => {
          if (seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
        .sort((a, b) => a.order - b.order)
        .slice(0, maxCast)

      // 출연진이 적은 영화도 버리지 않는다. 배우 확보가 목적이고,
      // 퀴즈 출제 가능 여부(7명 이상)는 quiz_ready_movies 뷰가 걸러준다.
      if (cast.length === 0) continue

      // --- 영화 upsert ---
      const { data: movieRow, error: movieErr } = await db
        .from("movie")
        .upsert(
          {
            tmdb_id: detail.id,
            imdb_id: detail.imdb_id || null,
            title: detail.title,
            original_title: detail.original_title,
            original_language: detail.original_language,
            release_date: detail.release_date || null,
            poster_path: detail.poster_path,
            overview: detail.overview || null,
            runtime: detail.runtime || null,
            popularity: detail.popularity,
            tmdb_vote_average: detail.vote_average,
            tmdb_vote_count: detail.vote_count,
          },
          { onConflict: "tmdb_id" }
        )
        .select("id")
        .single()

      if (movieErr) {
        console.error(`  ! 영화 저장 실패 ${detail.title}: ${movieErr.message}`)
        continue
      }

      // --- 배우 upsert ---
      // 이 단계에서는 TMDB 기본 표기(주로 로마자)를 name 에 넣는다.
      // 한글 이름은 actors 단계에서 보강한다.
      const { data: actorRows, error: actorErr } = await db
        .from("actor")
        .upsert(
          cast.map((c) => ({
            tmdb_id: c.id,
            name: c.name,
            name_en: c.original_name || c.name,
            profile_path: c.profile_path,
            image_url: IMAGE_BASE + c.profile_path,
            gender: mapGender(c.gender),
            popularity: c.popularity ?? null,
          })),
          { onConflict: "tmdb_id" }
        )
        .select("actor_id, tmdb_id")

      if (actorErr) {
        console.error(`  ! 배우 저장 실패 ${detail.title}: ${actorErr.message}`)
        continue
      }

      const idByTmdb = new Map(actorRows.map((a) => [a.tmdb_id, a.actor_id]))

      // --- 크레딧 upsert ---
      // cast_order 를 0부터 다시 매긴다. TMDB 의 order 는 사진 없는 배우를
      // 걸러내면 중간에 구멍이 생기는데, 퀴즈 힌트는 연속된 순번이어야 한다.
      const credits = cast
        .map((c, i) => ({
          movie_id: movieRow.id,
          actor_id: idByTmdb.get(c.id),
          cast_order: i,
          character_name: c.character || null,
        }))
        .filter((c) => c.actor_id)

      const { error: creditErr } = await db
        .from("movie_credit")
        .upsert(credits, { onConflict: "movie_id,actor_id" })

      if (creditErr) {
        console.error(`  ! 크레딧 저장 실패 ${detail.title}: ${creditErr.message}`)
        continue
      }

      totalMovies++
      totalCredits += credits.length
      console.log(`  ✓ ${detail.title} (배우 ${credits.length}명)`)
    }
  }

  console.log(`\n완료: 영화 ${totalMovies}편, 크레딧 ${totalCredits}건\n`)
}

// ============================================
// 1-b단계: 배우 직접 대량 수집
//
// 영화를 거치지 않고 TMDB 인기 인물 목록에서 배우만 바로 긁는다.
// 가상 캐스팅 게임처럼 "영화와 무관하게 배우 풀이 크면 좋은" 경우에 쓴다.
//
// 주의: /person/popular 은 전 세계 인기순이라 헐리우드 비중이 높다.
//       한국 배우를 두껍게 쌓으려면 movies --lang=ko 로 한국영화 출연진을
//       훑는 쪽이 훨씬 효율적이다.
// ============================================

async function ingestPeople(flags) {
  requireEnv("TMDB_API_KEY", TMDB_KEY)
  const db = supabase()

  const pages = Number(flags.pages || 25)
  const startPage = Number(flags.startPage || 1)

  console.log(`\n배우 직접 수집: ${startPage}~${startPage + pages - 1}페이지 (페이지당 20명)\n`)

  let saved = 0
  let skipped = 0

  for (let page = startPage; page < startPage + pages; page++) {
    await sleep(TMDB_DELAY_MS)

    // TMDB 페이지네이션 상한은 500페이지다.
    if (page > 500) {
      console.log("TMDB 페이지 상한(500)에 도달했습니다.")
      break
    }

    const list = await tmdb("/person/popular", { language: "ko-KR", page })
    if (!list?.results?.length) {
      console.log(`${page}페이지에 결과가 없습니다. 중단합니다.`)
      break
    }

    // 사진 없는 인물은 캐스팅/퀴즈 어디에도 못 쓴다.
    // 감독·제작진이 섞여 오므로 배우만 남긴다.
    const people = list.results.filter(
      (p) => p.profile_path && p.known_for_department === "Acting"
    )

    skipped += list.results.length - people.length
    if (people.length === 0) continue

    // 같은 페이지 안의 중복 방지 (upsert 는 한 문장에 같은 키가 두 번 오면 실패한다)
    const seen = new Set()
    const rows = []
    for (const p of people) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      rows.push({
        tmdb_id: p.id,
        name: p.name,
        name_en: p.original_name || p.name,
        profile_path: p.profile_path,
        image_url: IMAGE_BASE + p.profile_path,
        gender: mapGender(p.gender),
        popularity: p.popularity ?? null,
        known_for_department: p.known_for_department || null,
      })
    }

    const { error } = await db.from("actor").upsert(rows, { onConflict: "tmdb_id" })

    if (error) {
      console.error(`  ! ${page}페이지 저장 실패: ${error.message}`)
      continue
    }

    saved += rows.length
    console.log(`  ✓ ${page}페이지 — ${rows.length}명 (누적 ${saved}명)`)
  }

  console.log(`\n완료: ${saved}명 저장, ${skipped}명 제외(사진 없음 또는 비배우)\n`)
  console.log(`한글 이름을 채우려면 이어서 실행하세요:  pnpm ingest actors\n`)
}

// ============================================
// 2단계: 배우 정보 보강 (한글 이름)
// ============================================

/**
 * TMDB 의 person.name 은 로컬라이즈되지 않는다. 한국 배우도 보통 로마자
 * 표기("Song Kang-ho")로 들어온다. 한글 표기는 also_known_as 배열 안에
 * 섞여 있어서, 거기서 한글이 포함된 항목을 골라내야 한다.
 *
 * 배우 1명당 1요청이 필요하므로 영화 수집과 분리했다.
 */
async function enrichActors(flags) {
  requireEnv("TMDB_API_KEY", TMDB_KEY)
  const db = supabase()

  const limit = Number(flags.limit || 2000)

  const { data: targets, error } = await db
    .from("actor")
    .select("actor_id, tmdb_id, name")
    .not("tmdb_id", "is", null)
    .is("enriched_at", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) throw new Error(`대상 조회 실패: ${error.message}`)

  console.log(`\n배우 보강: ${targets.length}명\n`)

  let renamed = 0
  let updated = 0

  for (const target of targets) {
    await sleep(TMDB_DELAY_MS)

    const person = await tmdb(`/person/${target.tmdb_id}`, { language: "ko-KR" })
    if (!person) continue

    // also_known_as 에서 한글 표기를 찾는다. 없으면 기존 이름을 유지한다.
    const hangulName = (person.also_known_as || []).find(hasHangul)
    const displayName = hangulName || (hasHangul(person.name) ? person.name : target.name)

    const patch = {
      name: displayName,
      name_en: person.name,
      birthday: person.birthday || null,
      place_of_birth: person.place_of_birth || null,
      known_for_department: person.known_for_department || null,
      popularity: person.popularity ?? null,
      enriched_at: new Date().toISOString(),
    }
    if (person.profile_path) {
      patch.profile_path = person.profile_path
      patch.image_url = IMAGE_BASE + person.profile_path
    }

    const { error: upErr } = await db
      .from("actor")
      .update(patch)
      .eq("actor_id", target.actor_id)

    if (upErr) {
      console.error(`  ! ${target.name}: ${upErr.message}`)
      continue
    }

    updated++
    if (hangulName && hangulName !== target.name) {
      renamed++
      console.log(`  ✓ ${target.name} → ${hangulName}`)
    }
  }

  console.log(`\n완료: ${updated}명 갱신, 그중 ${renamed}명 한글 이름 적용\n`)
}

// ============================================
// 3단계: 로튼토마토 지수
// ============================================

/**
 * TMDB 에는 로튼토마토 지수가 없다. TMDB 가 주는 imdb_id 를 키로
 * OMDb 에 물어봐야 한다.
 *
 * OMDb 무료 티어는 하루 1,000 요청이므로 --limit 으로 예산을 통제하고,
 * 이미 조회한 영화는 rt_checked_at 으로 걸러 재조회하지 않는다.
 */
async function ingestRottenScores(flags) {
  requireEnv("OMDB_API_KEY", OMDB_KEY)
  const db = supabase()

  const limit = Number(flags.limit || 900)

  const { data: targets, error } = await db
    .from("movie")
    .select("id, title, imdb_id")
    .not("imdb_id", "is", null)
    .is("rt_checked_at", null)
    .order("popularity", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`대상 조회 실패: ${error.message}`)

  console.log(`\n로튼토마토 지수 수집: ${targets.length}편 (일일 한도 내)\n`)

  let found = 0
  let missing = 0

  for (const movie of targets) {
    const url = new URL("https://www.omdbapi.com/")
    url.searchParams.set("apikey", OMDB_KEY)
    url.searchParams.set("i", movie.imdb_id)

    const res = await fetch(url)
    if (!res.ok) {
      console.error(`  ! OMDb ${res.status} — ${movie.title}. 중단합니다.`)
      break
    }

    const json = await res.json()

    // 한도 초과 시 OMDb 는 200 과 함께 Error 필드를 준다.
    if (json.Response === "False") {
      const msg = json.Error || "알 수 없는 오류"
      if (/limit/i.test(msg)) {
        console.error(`\n일일 요청 한도에 도달했습니다. 내일 이어서 실행하세요.`)
        break
      }
      // 해당 영화만의 문제라면 조회했음으로 표시하고 넘어간다.
      await db
        .from("movie")
        .update({ rt_checked_at: new Date().toISOString() })
        .eq("id", movie.id)
      missing++
      continue
    }

    const rt = (json.Ratings || []).find((r) => r.Source === "Rotten Tomatoes")
    const score = rt ? Number.parseInt(rt.Value, 10) : null
    const valid = Number.isInteger(score) && score >= 0 && score <= 100

    const { error: upErr } = await db
      .from("movie")
      .update({
        rt_score: valid ? score : null,
        rt_checked_at: new Date().toISOString(),
      })
      .eq("id", movie.id)

    if (upErr) {
      console.error(`  ! ${movie.title}: ${upErr.message}`)
      continue
    }

    if (valid) {
      found++
      console.log(`  ✓ ${movie.title} — ${score}%`)
    } else {
      missing++
    }
  }

  console.log(`\n완료: 지수 확보 ${found}편, 지수 없음 ${missing}편\n`)
}

// ============================================
// 진입점
// ============================================

const { cmd, flags } = parseArgs(process.argv)

const commands = {
  movies: ingestMovies,
  people: ingestPeople,
  actors: enrichActors,
  rt: ingestRottenScores,
}

if (!commands[cmd]) {
  console.log(`
사용법: pnpm ingest <명령> [옵션]

명령:
  movies   TMDB 에서 영화 + 출연진 수집 (배우도 함께 쌓임)
           --lang=ko|en   원어 (기본 ko)
           --pages=5      수집할 페이지 수, 페이지당 20편 (기본 5)
           --minVotes=50  최소 투표수 (기본 50)
           --cast=10      영화당 저장할 배우 수 (기본 10)

  people   배우만 직접 대량 수집 (영화 무관)
           --pages=25     페이지 수, 페이지당 20명 (기본 25 = 500명)
           --startPage=1  시작 페이지. 이어받기용 (기본 1)

  actors   배우 상세 보강 — 한글 이름, 출생 정보 (배우 1명당 1요청)
           --limit=2000   처리할 배우 수 (기본 2000)

  rt       OMDb 에서 로튼토마토 지수 수집
           --limit=900    요청 수. 무료 티어 일일 한도 1,000 (기본 900)

예시 — 배우 수천 명 쌓기:
  pnpm ingest movies --lang=ko --pages=50 --cast=15
  pnpm ingest movies --lang=en --pages=30 --cast=15
  pnpm ingest people --pages=50
  pnpm ingest actors --limit=5000
`)
  process.exit(1)
}

commands[cmd](flags).catch((err) => {
  console.error(`\n실패: ${err.message}`)
  process.exit(1)
})
