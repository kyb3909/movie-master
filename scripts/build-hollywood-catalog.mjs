/**
 * 헐리우드 영화 카탈로그 병합
 *
 * 크롤링한 세 조각을 합쳐 게임이 바로 쓸 수 있는 한 파일로 만든다.
 *   data/bom-yearly.json    흥행 순위 (Box Office Mojo)
 *   data/rt-crawl.json      로튼 지수·감독·개봉일·출연진·포스터 (Rotten Tomatoes)
 *   data/kobis-titles.json  한국 개봉 제목·한글 감독명 (KOBIS)
 *
 * 실행:
 *   node scripts/build-hollywood-catalog.mjs
 *   node scripts/build-hollywood-catalog.mjs --keep-doc   # 다큐도 남긴다
 *
 * --- 애매한 건 버린다 ---
 * 한국어 제목이 없거나, 지수가 없거나, 매칭 신뢰도가 낮은 영화는 카탈로그에 넣지 않는다.
 * 원본이 1,800편이 넘으므로 의심스러운 걸 억지로 살려 게임 품질을 떨어뜨릴 이유가 없다.
 * 버린 것은 사유별로 세어 콘솔에 찍고, 검수용으로 따로 저장한다.
 */

import { readFile, writeFile } from "node:fs/promises"

const BOM_PATH = "data/bom-yearly.json"
const RT_PATH = "data/rt-crawl.json"
const KOBIS_PATH = "data/kobis-titles.json"
const OUT_PATH = "data/hollywood-catalog.json"
const DROP_PATH = "data/hollywood-dropped.json"

/** 배우 퀴즈가 한 판에 쓰는 힌트 수. 사진 있는 배우가 이만큼은 있어야 출제할 수 있다. */
const MIN_ACTORS = 5

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

// ============================================

const [bom, rt, kobis] = await Promise.all([
  readFile(BOM_PATH, "utf8").then(JSON.parse),
  readFile(RT_PATH, "utf8").then(JSON.parse),
  readFile(KOBIS_PATH, "utf8").then(JSON.parse),
])

/**
 * BOM 은 2,000행이지만 고유 작품은 1,864편이다.
 * 연말 개봉작이 이듬해 목록에도 올라 136편이 두 번 등재된다.
 * 대표는 순위가 높은(숫자가 작은) 해로 잡고, 나머지 등재 이력은 보존한다.
 * 그대로 두면 하이로우 화면 좌우에 같은 영화가 뜬다.
 */
const byBomId = new Map()
for (const m of bom.movies) {
  if (!m.bomId) continue
  const prev = byBomId.get(m.bomId)
  if (!prev) {
    byBomId.set(m.bomId, { ...m, bomAppearances: [{ year: m.year, rank: m.rank, gross: m.gross }] })
    continue
  }
  prev.bomAppearances.push({ year: m.year, rank: m.rank, gross: m.gross })
  if (m.rank < prev.rank) Object.assign(prev, m, { bomAppearances: prev.bomAppearances })
}
for (const v of byBomId.values()) v.bomAppearances.sort((a, b) => a.year - b.year)

/**
 * KOBIS 한국어 제목에는 동명이작 구분용 괄호가 붙는다.
 *   "퍼펙트 웨딩(몬스터 인 로)" · "링2(2005)" · "로봇(애니)"
 * 화면에는 거슬리므로 떼고, 원본은 titleKoRaw 로 남겨 검수 때 대조할 수 있게 한다.
 */
function cleanKoTitle(s) {
  return String(s || "").replace(/\s*\([^()]*\)\s*$/, "").trim()
}

const isDocumentary = (genres) => (genres || []).some((g) => /document/i.test(g))
const isAnimation = (genres) => (genres || []).some((g) => /anim/i.test(g))

// ============================================

const movies = []
const dropped = []
const reasons = {
  "로튼 미수집": 0,
  "로튼 매칭 실패": 0,
  "지수 없음": 0,
  "포스터 없음": 0,
  "KOBIS 미수집": 0,
  "한국어 제목 없음": 0,
  "KOBIS 느슨한 매칭": 0,
  다큐멘터리: 0,
}

function drop(row, reason) {
  reasons[reason]++
  dropped.push({ bomId: row.bomId, title: row.title, year: row.year, reason })
}

for (const row of byBomId.values()) {
  const r = rt.byBomId?.[row.bomId]
  const k = kobis.byBomId?.[row.bomId]

  // 아직 크롤링이 안 닿은 편은 '버린 것'이 아니라 '아직 없는 것'이다. 사유를 나눠 센다.
  if (!r) { drop(row, "로튼 미수집"); continue }
  if (r.status !== "ok" || r.match?.confidence !== "high") { drop(row, "로튼 매칭 실패"); continue }
  if (typeof r.tomatometer !== "number") { drop(row, "지수 없음"); continue }
  if (!r.posterUrl) { drop(row, "포스터 없음"); continue }

  if (!k) { drop(row, "KOBIS 미수집"); continue }
  if (k.result !== "ok" || !k.titleKo) { drop(row, "한국어 제목 없음"); continue }

  // 영문 제목이 완전 일치했으면 신뢰한다.
  //
  // KOBIS 는 제작상태가 "개봉" 이 아니면(비디오 출시 등 "기타") 신뢰도를 낮춰 표시하는데,
  // 실제로 확인해보니 그런 22편의 한국어 제목이 전부 정확했다.
  //   The Longest Yard → 롱기스트 야드 · Jarhead → 자헤드 - 그들만의 전쟁
  //   Must Love Dogs → 비밀과 거짓말의 차이 · The Sisterhood... → 청바지 돌려입기
  // 제작상태는 개봉 형태를 말할 뿐 제목의 정확도와 무관하다. 이것까지 버리면 17% 를 헛되이 잃는다.
  //
  // 반대로 부제 일치·접두/접미 일치 같은 느슨한 매칭은 버린다. 지금 표본에서는 맞았지만
  // 1,800편 규모에서 속편이 새어 들어올 통로가 바로 여기다. 원본이 넉넉하니 의심스러우면 버린다.
  const exactTitleMatch = /완전 일치/.test(k.match?.reason ?? "")
  if (k.match?.confidence !== "high" && !exactTitleMatch) { drop(row, "KOBIS 느슨한 매칭"); continue }

  // 다큐는 하이로우에 나와도 아무도 모른다. (--keep-doc 으로 남길 수 있다)
  if (!flags["keep-doc"] && isDocumentary(r.genres)) { drop(row, "다큐멘터리"); continue }

  // 사진 있는 배우만 배우 퀴즈에 쓸 수 있다.
  // 애니메이션은 장르로 걸러도 새는 게 있어(앨빈과 슈퍼밴드, 호튼) 배우 수로 한 번 더 막는다.
  const actors = (r.actors || []).filter((a) => a.name && a.imageUrl)
  const quizEligible = !isAnimation(r.genres) && actors.length >= MIN_ACTORS

  movies.push({
    bomId: row.bomId,
    bomRank: row.rank,
    bomYear: row.year,
    gross: row.gross,
    bomAppearances: row.bomAppearances,

    titleEn: r.rtTitle || row.title,
    titleKo: cleanKoTitle(k.titleKo),
    titleKoRaw: k.titleKo,
    year: Number(String(r.releaseDate || "").slice(0, 4)) || row.year,
    releaseDate: r.releaseDate ?? null,

    directors: r.directors ?? [],
    directorsKo: k.directorsKo ?? [],

    tomatometer: r.tomatometer,
    ratingCount: r.ratingCount ?? null,
    audienceScore: r.audienceScore ?? null,

    posterUrl: r.posterUrl,
    rtUrl: r.rtUrl,
    movieCd: k.movieCd ?? null,
    genres: r.genres ?? [],

    actors,
    quizEligible,
  })
}

// 흥행 순으로. 유명한 영화가 앞에 오면 검수할 때 눈에 먼저 걸린다.
movies.sort((a, b) => (b.gross ?? 0) - (a.gross ?? 0))

// ============================================

const quizCount = movies.filter((m) => m.quizEligible).length
const total = byBomId.size
const dropTotal = dropped.length

console.log(`\n헐리우드 카탈로그 병합`)
console.log(`  BOM 고유 작품 ${total}편`)
console.log(`  카탈로그 ${movies.length}편  (하이로우 출제 가능)`)
console.log(`  그중 배우 퀴즈 가능 ${quizCount}편 (사진 있는 배우 ${MIN_ACTORS}명 이상 · 애니 제외)`)
console.log(`\n  제외 ${dropTotal}편`)
for (const [k, v] of Object.entries(reasons)) {
  if (v) console.log(`    ${k.padEnd(22)} ${v}`)
}

const crawledRt = Object.keys(rt.byBomId ?? {}).length
const crawledKo = Object.keys(kobis.byBomId ?? {}).length
if (crawledRt < total || crawledKo < total) {
  console.log(`\n  ※ 크롤링이 아직 진행 중입니다 (로튼 ${crawledRt}/${total} · KOBIS ${crawledKo}/${total})`)
  console.log(`     '미수집' 은 실패가 아니라 아직 안 받은 것입니다.`)
}

await writeFile(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: movies.length, quizCount, movies }, null, 2),
  "utf8"
)
await writeFile(
  DROP_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: dropTotal, reasons, dropped }, null, 2),
  "utf8"
)

console.log(`\n  저장: ${OUT_PATH}`)
console.log(`  저장: ${DROP_PATH}  (검수용)\n`)
