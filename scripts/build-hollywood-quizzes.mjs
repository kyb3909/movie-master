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

/** 한 판에 쓰는 힌트 수. 출제하려면 최소 이만큼의 배우가 있어야 한다. */
const HINT_COUNT = 5

/**
 * 후보 목록에 담을 배우 수.
 *
 * 예전에는 로튼이 배우를 5명까지만 줘서 5로 고정이었다. 그래서 헐리우드에는
 * 난이도를 만들 수가 없었다 — 어려움은 비중 3~7위를 쓰는데 7위가 아예 없었다.
 * 출연진 페이지를 따로 받아 평균 12.8명이 되었으니 10명까지 담는다.
 * 한국 퀴즈와 같은 엔진이 이 목록에서 난이도별로 구간을 잘라 쓴다.
 */
const WIDE = 10

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/**
 * 최소 북미 흥행. 기본 5,000만 달러.
 *
 * 하한 없이 내보니(1,268편) 국내에 개봉조차 안 한 작품이 절반 넘게 섞여
 * 배우 얼굴을 다 봐도 못 맞히는 판이 이어졌다. Bonhoeffer·Homestead·The Shift 같은 것들이다.
 * 5,000만 달러로 끊으면 707편이 남는다. 무명작을 걷어내면서도 풀이 넉넉해
 * 5판씩 여러 번 해도 같은 영화가 금방 되돌아오지 않는다.
 * (1억 달러면 313편까지 줄어 반복이 눈에 띄고, 밀리언 달러 베이비·크리드가 잘린다)
 */
const minGross = Number(flags["min-gross"] ?? 50_000_000)

/**
 * 한국에서 흥행한 영화만 낼 것인가. 기본으로 켠다.
 *
 * 북미 흥행 하한만으로는 한국 사람이 아는 영화인지 가릴 수 없다. 행오버·레고 무비는
 * 북미에서 2억 달러 넘게 벌었지만 한국에서는 조용히 지나갔다. 반대로 한국에서만
 * 크게 터진 영화도 있다. 얼굴 다섯 장을 다 봐도 제목을 떠올릴 수 없으면 게임이 아니다.
 *
 * KOBIS 외국영화 연간 50위에 든 적이 있으면 '한국에서 봤다' 로 본다.
 * 그 해 한국에 걸린 외화 중 50위 안이면 극장에서 실제로 돌아간 작품이다.
 *
 * --all 로 끄면 예전처럼 북미 흥행만 본다.
 */
const krOnly = !flags.all

/**
 * 한국 관객 수 하한. 기본 30만 명.
 *
 * 연간 50위 안에 들었어도 꼬리 쪽은 10만 명대다. 엘비스(10만)·스마일(11만) 정도인데,
 * 제목은 들어봤을지 몰라도 배우 얼굴로 떠올리기는 어렵다.
 * 30만으로 끊으면 402편에서 382편으로 20편만 줄면서 그 꼬리가 정리된다.
 */
const minKrAudi = Number(flags["min-kr"] ?? 300_000)

// ============================================

const catalog = JSON.parse(await readFile(IN_PATH, "utf8"))

/**
 * 사람이 검수한 결과. 검수 페이지에서 내려받아 덮어쓰는 파일이다.
 * 자동 수집만으로는 못 거르는 것들이 있다 — 동명의 다른 작품이 붙은 한국어 제목,
 * 얼굴만으로는 도저히 못 맞히는 영화 같은 것들.
 */
let overrides = { excluded: {}, titles: {} }
try {
  overrides = JSON.parse(await readFile("data/quiz-overrides.json", "utf8"))
} catch {
  // 검수 전이면 파일이 없다. 그대로 진행한다.
}
const excluded = new Set(overrides.excluded?.hollywood ?? [])
const titleFix = overrides.titles?.hollywood ?? {}

const quizzes = []
const skipped = { notEligible: 0, notEnoughPhoto: 0, noTitle: 0, lowGross: 0, excluded: 0, notInKorea: 0 }

for (const m of catalog.movies) {
  if (excluded.has(m.bomId)) { skipped.excluded++; continue }
  // 카탈로그가 이미 판정해 둔 것을 따른다 (사진 있는 배우 5명 이상 · 애니메이션 아님).
  if (!m.quizEligible) { skipped.notEligible++; continue }
  if (!m.titleKo || !m.titleEn) { skipped.noTitle++; continue }
  if (krOnly && (m.krAudi ?? 0) < minKrAudi) { skipped.notInKorea++; continue }
  if ((m.gross ?? 0) < minGross) { skipped.lowGross++; continue }

  // quizEligible 은 100x120 기준이라 큰 사진이 없는 배우가 섞여 있을 수 있다.
  const usable = (m.actors ?? []).filter((a) => a.name && a.imageUrlLarge)
  if (usable.length < HINT_COUNT) { skipped.notEnoughPhoto++; continue }

  // 로튼 출연진 순서가 곧 비중 순위다 (0번이 주연).
  const candidates = usable.slice(0, WIDE).map((a, i) => ({
    name: a.name,
    // 로튼 출연진 목록에는 배역명이 없다. 엔진은 빈 값이면 '—' 로 표시한다.
    character: "",
    billing: i + 1,
    imageUrl: a.imageUrlLarge,
    rtUrl: a.url ?? null,
  }))

  // 기본 힌트 세트 = 앞 5명을 뒤집은 것. '비중 낮은 배우 → 주연' 순.
  // 실제 플레이는 candidates 에서 난이도별로 다시 뽑으므로 이건 대비용이다.
  const hints = candidates
    .slice(0, HINT_COUNT)
    .reverse()
    .map((a, i) => ({ hintOrder: i + 1, ...a }))

  quizzes.push({
    bomId: m.bomId,
    movieCd: m.movieCd ?? null,
    title: titleFix[m.bomId] ?? m.titleKo,
    titleEn: m.titleEn,
    releaseDate: m.releaseDate,
    gross: m.gross ?? 0,
    krAudi: m.krAudi ?? null,
    tomatometer: m.tomatometer ?? null,
    audienceScore: m.audienceScore ?? null,
    boxYear: m.bomYear,
    boxRank: m.bomRank,
    hints,
    candidates,
  })
}

// 한국 관객 수 내림차순. 우리 사용자에게 인지도는 북미 흥행이 아니라 이쪽이다.
// 한국 기록이 없으면(--all 로 켰을 때) 북미 흥행으로 줄을 세운다.
quizzes.sort((a, b) => (b.krAudi ?? 0) - (a.krAudi ?? 0) || (b.gross ?? 0) - (a.gross ?? 0))

// ============================================

console.log(`\n헐리우드 배우 퀴즈 생성`)
console.log(`  카탈로그 ${catalog.movies.length}편 (그중 quizEligible ${catalog.quizCount ?? "?"}편)`)
console.log(`  생성된 퀴즈 ${quizzes.length}편 · 힌트 ${quizzes.length * HINT_COUNT}개`)
console.log(`  제외: quizEligible 아님 ${skipped.notEligible} / 큰 사진 부족 ${skipped.notEnoughPhoto} / 제목 없음 ${skipped.noTitle} / 흥행 미달 ${skipped.lowGross} / 검수 제외 ${skipped.excluded} / 한국 흥행 없음 ${skipped.notInKorea}`)

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
