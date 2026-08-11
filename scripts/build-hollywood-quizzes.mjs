/**
 * 헐리우드 배우 퀴즈 생성
 *
 * data/hollywood-catalog.json 의 배우 사진으로 '영화 제목 맞추기' 퀴즈를 만든다.
 * 출력 형식은 data/quizzes.json(한국 영화 퀴즈) 과 똑같이 맞춘다.
 * 같은 플레이 엔진(scripts/build-quiz-play.mjs)이 두 파일을 그대로 읽어야 하기 때문이다.
 *
 * 실행:
 *   node scripts/build-hollywood-quizzes.mjs
 *   node scripts/build-hollywood-quizzes.mjs --min-gross=50000000
 *
 * --- 힌트 순서 ---
 * 로튼 출연진은 비중 순으로 최대 5명이다(0번이 주연).
 * 한국 퀴즈처럼 후보가 20명씩 있지 않으므로 매 판 무작위 조합을 만들 수 없다.
 * 5명을 그대로 쓰되 순서만 뒤집어 '비중 낮은 배우 → 주연' 으로 공개한다.
 *
 * --- 사진 ---
 * imageUrlLarge(500x600) 만 쓴다. 목록용 100x120 은 카드 크기에서 뭉개진다.
 * 큰 사진이 없는 배우는 후보에서 빼고, 그 탓에 5명을 못 채우면 출제하지 않는다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const IN_PATH = "data/hollywood-catalog.json"
const OUT_PATH = "data/hollywood-quizzes.json"

/** 한 판에 쓰는 힌트 수. 로튼이 주는 배우가 최대 5명이라 5로 고정된다. */
const HINT_COUNT = 5

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/**
 * 최소 북미 흥행. 기본값 0 = 카탈로그에 있으면 다 낸다.
 * 카탈로그 자체가 연도별 흥행 상위 100편에서 왔고 최저가 2,551만 달러라
 * 한국 퀴즈의 관객수 하한 같은 별도 방어선이 필요하지 않다.
 */
const minGross = Number(flags["min-gross"] ?? 0)

// ============================================

const catalog = JSON.parse(await readFile(IN_PATH, "utf8"))

const quizzes = []
const skipped = { notEligible: 0, notEnoughPhoto: 0, noTitle: 0, lowGross: 0 }

for (const m of catalog.movies) {
  // 카탈로그가 이미 판정해 둔 것을 따른다 (사진 있는 배우 5명 이상 · 애니메이션 아님).
  if (!m.quizEligible) { skipped.notEligible++; continue }
  if (!m.titleKo || !m.titleEn) { skipped.noTitle++; continue }
  if ((m.gross ?? 0) < minGross) { skipped.lowGross++; continue }

  // quizEligible 은 100x120 기준이라 큰 사진이 없는 배우가 섞여 있을 수 있다.
  const usable = (m.actors ?? []).filter((a) => a.name && a.imageUrlLarge)
  if (usable.length < HINT_COUNT) { skipped.notEnoughPhoto++; continue }

  // 로튼 출연진 순서가 곧 비중 순위다 (0번이 주연).
  const candidates = usable.slice(0, HINT_COUNT).map((a, i) => ({
    name: a.name,
    // 로튼 출연진 목록에는 배역명이 없다. 엔진은 빈 값이면 '—' 로 표시한다.
    character: "",
    billing: i + 1,
    imageUrl: a.imageUrlLarge,
    rtUrl: a.url ?? null,
  }))

  // 기본 힌트 세트 = 후보를 뒤집은 것. '비중 낮은 배우 → 주연' 순.
  const hints = candidates
    .slice()
    .reverse()
    .map((a, i) => ({ hintOrder: i + 1, ...a }))

  quizzes.push({
    bomId: m.bomId,
    movieCd: m.movieCd ?? null,
    title: m.titleKo,
    titleEn: m.titleEn,
    releaseDate: m.releaseDate,
    gross: m.gross ?? 0,
    tomatometer: m.tomatometer ?? null,
    audienceScore: m.audienceScore ?? null,
    boxYear: m.bomYear,
    boxRank: m.bomRank,
    hints,
    candidates,
  })
}

// 흥행 내림차순 = 대중 인지도 순. 유명한 영화가 앞에 오게 한다.
quizzes.sort((a, b) => (b.gross ?? 0) - (a.gross ?? 0))

// ============================================

console.log(`\n헐리우드 배우 퀴즈 생성`)
console.log(`  카탈로그 ${catalog.movies.length}편 (그중 quizEligible ${catalog.quizCount ?? "?"}편)`)
console.log(`  생성된 퀴즈 ${quizzes.length}편 · 힌트 ${quizzes.length * HINT_COUNT}개`)
console.log(`  제외: quizEligible 아님 ${skipped.notEligible} / 큰 사진 부족 ${skipped.notEnoughPhoto} / 제목 없음 ${skipped.noTitle} / 흥행 미달 ${skipped.lowGross}`)

if (quizzes.length) {
  const q = quizzes[0]
  console.log(`\n  예시 — ${q.title} (${q.titleEn} · $${q.gross.toLocaleString()})`)
  for (const h of q.hints) {
    console.log(`    힌트${h.hintOrder}  ${h.name.padEnd(22)} (비중 ${h.billing}위)`)
  }
  console.log()
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(
  OUT_PATH,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), hintOrder: "비중 낮은 순 → 주연", count: quizzes.length, quizzes },
    null,
    2
  ),
  "utf8"
)
console.log(`  저장: ${OUT_PATH}\n`)
