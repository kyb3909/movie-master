/**
 * KOBIS 수집 결과를 Supabase 에 적재
 *
 * 입력: data/kobis-boxoffice.json, data/kobis-cast.json
 * 대상: movie / actor / movie_credit  (마이그레이션 004, 005 적용 필요)
 *
 * 실행:
 *   node --env-file=.env scripts/load-kobis-to-db.mjs
 *   node --env-file=.env scripts/load-kobis-to-db.mjs --dry   # 적재 없이 통계만
 *
 * 외부 ID(kobis_movie_cd, kobis_people_cd) 기준 upsert 라 재실행해도 안전하다.
 *
 * 사진은 이 단계에서 채우지 않는다. KOBIS 가 인물 이미지를 제공하지 않으므로
 * actor.image_url 은 NULL 로 남고, 이후 별도 매칭 단계에서 채운다.
 */

import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"

const CHUNK = 500

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}
const dry = Boolean(flags.dry)

// 적재할 배역 구분. 단역(5)은 "대구분점조직원1" 같은 배역이라
// 퀴즈·캐스팅 어디에도 쓰이지 않으므로 기본으로 제외한다.
// 원본 JSON 에는 그대로 남아 있어 필요하면 --gb=all 로 다시 넣을 수 있다.
const gbFilter = flags.gb === "all" ? null : String(flags.gb || "1,2").split(",")

// ============================================

function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`환경변수 ${name} 가 없습니다.`)
    process.exit(1)
  }
  return v
}

const db = dry
  ? null
  : createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    )

/** "19701129" → "1970-11-29", 형식이 어긋나면 null */
function toDate(s) {
  if (!s || !/^\d{8}$/.test(s)) return null
  const y = +s.slice(0, 4)
  const m = +s.slice(4, 6)
  const d = +s.slice(6, 8)
  if (y < 1850 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

async function upsertChunks(table, rows, onConflict, label) {
  let n = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await db.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${label} 적재 실패: ${error.message}`)
    n += chunk.length
    process.stdout.write(`\r  ${label}: ${n}/${rows.length}`)
  }
  process.stdout.write(`\r  ${label}: ${n}/${rows.length}  완료\n`)
}

// ============================================

const boxoffice = JSON.parse(await readFile("data/kobis-boxoffice.json", "utf8"))
const castData = JSON.parse(await readFile("data/kobis-cast.json", "utf8"))

// --- 영화 정리 ---
// 같은 영화가 두 해에 순위에 오를 수 있다. 관객수가 큰 쪽(=대표 성적)을 남긴다.
const movieByCd = new Map()
for (const m of boxoffice.movies) {
  const prev = movieByCd.get(m.movieCd)
  if (!prev || (m.audiAcc ?? 0) > (prev.audiAcc ?? 0)) movieByCd.set(m.movieCd, m)
}

const movieRows = [...movieByCd.values()].map((m) => ({
  kobis_movie_cd: m.movieCd,
  title: m.title,
  release_date: m.openDt || null,
  audi_acc: m.audiAcc,
  sales_acc: m.salesAcc,
  box_year: m.year,
  box_rank: m.rank,
}))

/** 적재 대상 배역인지 */
const keep = (p) => !gbFilter || gbFilter.includes(p.actorGb)

// --- 배우 정리 ---
// 한 배우가 여러 영화에 나오므로 peopleCd 로 중복을 제거한다.
// (같은 upsert 문에 같은 키가 두 번 들어가면 Postgres 가 실패한다.)
const actorByCd = new Map()
for (const cast of Object.values(castData.castByMovie)) {
  for (const p of cast) {
    if (!keep(p)) continue
    if (!actorByCd.has(p.peopleCd)) {
      actorByCd.set(p.peopleCd, {
        kobis_people_cd: p.peopleCd,
        name: p.name,
        name_en: p.nameEn,
        birthday: toDate(p.birth),
      })
    }
  }
}
const actorRows = [...actorByCd.values()]

// --- 통계 ---
const gbCount = {}
let creditTotal = 0
for (const cast of Object.values(castData.castByMovie)) {
  creditTotal += cast.length
  for (const p of cast) gbCount[p.actorGb] = (gbCount[p.actorGb] || 0) + 1
}

console.log(`\nKOBIS → Supabase 적재${dry ? " (건너뛰기 모드)" : ""}\n`)
console.log(`  영화        ${movieRows.length}편`)
console.log(`  고유 배우    ${actorRows.length}명`)
console.log(`  출연 기록    ${creditTotal}건`)
console.log(`  배역 구분    주연 ${gbCount["1"] || 0} / 조연 ${gbCount["2"] || 0} / 기타 ${gbCount["3"] || 0} / 단역 ${gbCount["5"] || 0}`)
console.log(`  생년월일 확보 ${actorRows.filter((a) => a.birthday).length}명`)
console.log(`  영문명 확보   ${actorRows.filter((a) => a.name_en).length}명\n`)

if (dry) {
  console.log("적재하지 않고 종료합니다.\n")
  process.exit(0)
}

// --- 적재 ---
await upsertChunks("movie", movieRows, "kobis_movie_cd", "영화")
await upsertChunks("actor", actorRows, "kobis_people_cd", "배우")

// 크레딧을 만들려면 외부 ID → UUID 매핑이 필요하다.
console.log("  ID 매핑 조회 중...")

async function fetchIdMap(table, idCol, keyCol) {
  const map = new Map()
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select(`${idCol}, ${keyCol}`)
      .not(keyCol, "is", null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} 매핑 조회 실패: ${error.message}`)
    for (const r of data) map.set(r[keyCol], r[idCol])
    if (data.length < PAGE) break
    from += PAGE
  }
  return map
}

const movieIdByCd = await fetchIdMap("movie", "id", "kobis_movie_cd")
const actorIdByCd = await fetchIdMap("actor", "actor_id", "kobis_people_cd")

// --- 크레딧 ---
const creditRows = []
const seen = new Set()
let skipped = 0

for (const [movieCd, cast] of Object.entries(castData.castByMovie)) {
  const movieId = movieIdByCd.get(movieCd)
  if (!movieId) { skipped += cast.length; continue }

  // 단역을 걸러내면 sortSeq 에 구멍이 생길 수 있다. 퀴즈 힌트는 1~7 이
  // 연속이어야 하므로, 필터링한 목록을 다시 정렬해 0부터 번호를 매긴다.
  const filtered = cast
    .filter(keep)
    .sort((a, b) => (a.sortSeq ?? 999) - (b.sortSeq ?? 999))

  let order = 0
  for (const p of filtered) {
    const actorId = actorIdByCd.get(p.peopleCd)
    if (!actorId) { skipped++; continue }

    // (movie_id, actor_id) 가 기본키다. 한 영화에 같은 배우가 여러 배역으로
    // 올라오는 경우가 있어(1인 다역) 첫 번째만 남긴다.
    const key = `${movieId}|${actorId}`
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)

    creditRows.push({
      movie_id: movieId,
      actor_id: actorId,
      cast_order: order++,
      character_name: p.cast,
      actor_gb: p.actorGb,
    })
  }
}

await upsertChunks("movie_credit", creditRows, "movie_id,actor_id", "크레딧")

console.log(`\n적재 완료`)
console.log(`  영화 ${movieRows.length} / 배우 ${actorRows.length} / 크레딧 ${creditRows.length}`)
if (skipped) console.log(`  건너뜀 ${skipped}건 (중복 배역 또는 매핑 실패)`)
console.log(`\n사진은 아직 비어 있습니다. actor.image_url 을 채우는 단계가 별도로 필요합니다.\n`)
