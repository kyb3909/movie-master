/**
 * 영화 퀴즈 생성
 *
 * 수집한 KOBIS 출연진 + KOBIS 인물 사진으로 '영화 제목 맞추기' 퀴즈를 만든다.
 *
 * 실행:
 *   node scripts/build-quizzes.mjs
 *   node scripts/build-quizzes.mjs --min-audi=1000000   # 관객 100만 이상만
 *   node scripts/build-quizzes.mjs --sql                # SQL 시드도 함께 출력
 *
 * --- 힌트 순서 ---
 * 힌트 1 = 비중이 가장 낮은 조연  (어렵다)
 * 힌트 5 = 주연                   (쉽다)
 *
 * KOBIS sortSeq 는 1=주연 순이므로, 구간을 나눠 뽑은 뒤 뒤집어서 사용한다.
 * 즉 무명 조연부터 공개해 점점 쉬워지고, 빨리 맞힐수록 좋은 점수가 된다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * 힌트 개수. 7개는 너무 길어 5개로 둔다.
 * --hints=7 로 바꿀 수 있다.
 */
let HINT_COUNT = 5
const OUT_PATH = "data/quizzes.json"
const SQL_PATH = "data/quizzes.sql"

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/**
 * 최소 관객수. 이 아래는 퀴즈로 내지 않는다.
 *
 * 연도별 50위권에는 새해전야(17만), 특송(44만) 같은 저조한 흥행작도 들어온다.
 * 아무도 모르는 영화는 힌트를 7개 다 봐도 못 맞히므로 게임이 성립하지 않는다.
 * 200만이면 경계가 하녀·7광구·강남 1970 수준이라 인지도가 확보된다.
 *
 * 주의: 2004년은 KOBIS 통합전산망 집계가 불완전해 관객수가 실제보다 낮다.
 * 그 해 영화는 이 기준에서 불리하게 잘릴 수 있다.
 */
const minAudi = Number(flags["min-audi"] ?? 1_000_000)
if (flags.hints) HINT_COUNT = Number(flags.hints)

/**
 * 힌트로 쓸 수 있는 최대 비중 순위. 이보다 뒤쪽 배우는 후보에서 뺀다.
 *
 * 20위까지 열어두니 첫 힌트가 이름도 얼굴도 모르는 배우라 너무 어렵다는 반응이 많았다.
 * 8위 안쪽이면 이름은 몰라도 얼굴은 아는 조연 선이라 단서로 기능한다.
 *
 * 8위 안에서 힌트 수를 못 채우는 영화는 12 → 20 순으로만 넓힌다.
 * 예전처럼 곧바로 전체를 풀면 비중 47위(명량의 '조선수군/왜군') 같은 배우가 다시 들어온다.
 */
const billingSteps = flags["max-billing"] ? [Number(flags["max-billing"])] : [8, 12, 20]

// ============================================

const cast = JSON.parse(await readFile("data/kobis-cast.json", "utf8"))
const box = JSON.parse(await readFile("data/kobis-boxoffice.json", "utf8"))

// 사진은 KOBIS 인물 상세에서 받은 것을 쓴다.
// peopleCd 로 직접 조회하므로 동명이인이 섞일 수 없다.
//
// 네이버 검색 방식(naver-portraits.json)은 이름으로만 조회해야 해서
// 김상중에 이하늬 사진이, 강동원에 엄태구 사진이 들어가는 사고가 났다.
// 같은 사진이 서로 다른 배우 80명에게 배정된 것이 확인되어 사용하지 않는다.
let portraits = { byPeopleCd: {} }
try {
  portraits = JSON.parse(await readFile("data/kobis-portraits.json", "utf8"))
} catch {
  console.warn("경고: KOBIS 사진 파일이 없습니다. 사진 없이 진행합니다.\n")
}

const photoByCd = new Map()
for (const [cd, v] of Object.entries(portraits.byPeopleCd)) {
  if (v.imageUrl) photoByCd.set(cd, { ...v, source: "kobis" })
}

// KOBIS 에 사진이 없는 배우는 네이버에서 보충한 것을 쓴다.
// 단 이름(alt)과 생년월일이 모두 일치해 'verified' 로 판정된 것만 받는다.
// 검증을 통과하지 못한 건 imageUrl 자체가 비어 있다.
try {
  const fill = JSON.parse(await readFile("data/naver-fill.json", "utf8"))
  let added = 0
  for (const [cd, v] of Object.entries(fill.byPeopleCd)) {
    if (v.status !== "verified" || !v.imageUrl) continue
    if (photoByCd.has(cd)) continue // KOBIS 사진이 우선
    photoByCd.set(cd, { ...v, source: "naver" })
    added++
  }
  if (added) console.log(`  네이버 보충 사진 ${added}명 병합`)
} catch {
  // 보충 파일이 없으면 KOBIS 만 사용한다.
}

// 영화 메타 (같은 영화가 두 해에 오르면 관객수가 큰 쪽)
const movieMeta = new Map()
for (const m of box.movies) {
  const prev = movieMeta.get(m.movieCd)
  if (!prev || (m.audiAcc ?? 0) > (prev.audiAcc ?? 0)) movieMeta.set(m.movieCd, m)
}

// ============================================

const quizzes = []
const skipped = { noMeta: 0, notEnoughCast: 0, notEnoughPhoto: 0, lowAudi: 0 }

for (const [movieCd, list] of Object.entries(cast.castByMovie)) {
  const meta = movieMeta.get(movieCd)
  if (!meta) { skipped.noMeta++; continue }

  if ((meta.audiAcc ?? 0) < minAudi) { skipped.lowAudi++; continue }

  // 주연·조연만, 비중 순(sortSeq 오름차순 = 주연이 앞)
  const main = list
    .filter((p) => ["1", "2"].includes(p.actorGb))
    .sort((a, b) => (a.sortSeq ?? 999) - (b.sortSeq ?? 999))

  if (main.length < HINT_COUNT) { skipped.notEnoughCast++; continue }

  // 사진이 있는 배우만 남긴다. 사진 없는 배우는 힌트로 쓸 수 없다.
  //
  // 같은 배우가 한 영화에 두 번 올라오는 경우가 있다. 1인 다역도 있지만
  // 대부분은 KOBIS 중복 등록이다(이끼: 유준상 '박민욱 검사' / '박민욱 검사 역').
  // 그대로 두면 한 판에 같은 얼굴이 두 번 나오므로 비중이 높은 쪽만 남긴다.
  const seenCd = new Set()
  const usable = main.filter((p) => {
    if (!photoByCd.has(p.peopleCd)) return false
    if (seenCd.has(p.peopleCd)) return false
    seenCd.add(p.peopleCd)
    return true
  })
  if (usable.length < HINT_COUNT) { skipped.notEnoughPhoto++; continue }

  // 비중 상위권만 후보로 쓴다. 좁은 구간부터 시도하고, 힌트 수를 못 채울 때만 넓힌다.
  let pool = []
  for (const cap of billingSteps) {
    pool = usable.filter((p) => (p.sortSeq ?? 999) <= cap)
    if (pool.length >= HINT_COUNT) break
  }
  // 마지막 구간으로도 모자라면 어쩔 수 없이 범위를 푼다.
  if (pool.length < HINT_COUNT) pool = usable

  const toActor = (p) => {
    const photo = photoByCd.get(p.peopleCd)
    return {
      peopleCd: p.peopleCd,
      name: p.name,
      nameEn: p.nameEn,
      character: p.cast,
      billing: p.sortSeq, // 원래 비중 순위 (1=주연)
      actorGb: p.actorGb,
      // KOBIS 썸네일은 192px, 5~9KB 라 그대로 쓴다. 리사이즈 프록시가 필요 없다.
      imageUrl: photo.imageUrl,
      imageOriginal: photo.imageOriginal ?? null,
      photoSource: photo.source,
    }
  }

  // 후보 전체를 담는다. 같은 영화가 다시 출제될 때 매번 다른 조합이 나오도록
  // 5명을 고르는 일은 플레이 화면에서 한다.
  const candidates = pool.map(toActor) // 비중 오름차순 (0번이 주연)

  // 기본 힌트 세트. 검수 페이지와 SQL 시드는 고정된 조합이 있어야 하므로
  // 주연과 가장 비중 낮은 후보를 양 끝에 두고 사이를 균등 분할해 만든다.
  const last = candidates.length - 1
  const hints = Array.from({ length: HINT_COUNT }, (_, i) =>
    candidates[Math.round((i * last) / (HINT_COUNT - 1))]
  )
    .reverse() // '비중 낮은 조연 → 주연' 순
    .map((a, i) => ({ hintOrder: i + 1, ...a }))

  quizzes.push({
    movieCd,
    title: meta.title,
    releaseDate: meta.openDt,
    audiAcc: meta.audiAcc,
    boxYear: meta.year,
    boxRank: meta.rank,
    hints,
    candidates,
  })
}

// 관객수 내림차순 = 대중 인지도 순. 유명한 영화가 앞에 오게 한다.
quizzes.sort((a, b) => (b.audiAcc ?? 0) - (a.audiAcc ?? 0))

// ============================================

const totalHints = quizzes.length * HINT_COUNT

console.log(`\n영화 퀴즈 생성`)
console.log(`  사진 보유 배우 ${photoByCd.size}명`)
console.log(`  생성된 퀴즈 ${quizzes.length}편`)
console.log(`  힌트 ${totalHints}개 (사진 출처: KOBIS peopleCd 직접 조회)`)
console.log(`  제외: 출연진 부족 ${skipped.notEnoughCast} / 사진 부족 ${skipped.notEnoughPhoto} / 관객수 미달 ${skipped.lowAudi}`)

// 후보에 들어간 가장 낮은 비중이 몇 위인지. 8위 내 비중이 많을수록 쉬운 판이 된다.
const spread = { 8: 0, 12: 0, 20: 0, over: 0 }
for (const q of quizzes) {
  const worst = Math.max(...q.candidates.map((c) => c.billing ?? 999))
  if (worst <= 8) spread[8]++
  else if (worst <= 12) spread[12]++
  else if (worst <= 20) spread[20]++
  else spread.over++
}
console.log(`  비중 범위: 8위 내 ${spread[8]}편 · 12위 내 ${spread[12]}편 · 20위 내 ${spread[20]}편 · 그 밖 ${spread.over}편\n`)

if (quizzes.length) {
  const q = quizzes[0]
  console.log(`  예시 — ${q.title} (${q.audiAcc?.toLocaleString()}명)`)
  for (const h of q.hints) {
    console.log(`    힌트${h.hintOrder}  ${h.name.padEnd(5)} ${(h.character || "").slice(0, 12).padEnd(14)} (비중 ${h.billing}위)`)
  }
  console.log()
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), hintOrder: "비중 낮은 순 → 주연", count: quizzes.length, quizzes }, null, 2),
  "utf8"
)
console.log(`  저장: ${OUT_PATH}`)

// ============================================
// SQL 시드 (기존 quiz / quiz_actor 스키마용)
// ============================================

if (flags.sql) {
  const esc = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`)
  const lines = [
    "-- 자동 생성된 영화 퀴즈 시드",
    `-- 힌트 1 = 비중 낮은 조연, 힌트 ${HINT_COUNT} = 주연`,
    "",
  ]

  for (const q of quizzes) {
    lines.push(`INSERT INTO public.quiz (title, is_active) VALUES (${esc(q.title)}, true)`)
    lines.push(`  ON CONFLICT DO NOTHING;`)
    for (const h of q.hints) {
      lines.push(
        `INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order)`,
        `  SELECT id, ${esc(h.name)}, ${esc(h.imageUrl)}, ${h.hintOrder} FROM public.quiz WHERE title = ${esc(q.title)}`,
        `  ON CONFLICT (quiz_id, hint_order) DO NOTHING;`
      )
    }
    lines.push("")
  }

  await writeFile(SQL_PATH, lines.join("\n"), "utf8")
  console.log(`  저장: ${SQL_PATH}`)
}

console.log()
