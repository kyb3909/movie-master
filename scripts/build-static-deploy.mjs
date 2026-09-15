/**
 * 정적 배포용 폴더 생성
 *
 * 실행:
 *   node scripts/build-static-deploy.mjs
 *   cd deploy/noorung-quiz && npx vercel deploy --prod
 *
 * 게임 페이지들을 모아 단독 배포 가능한 폴더를 만들고, 진입점이 될 랜딩을 생성한다.
 * DB·인증 없이 동작하므로 반응을 먼저 보는 용도로 쓴다.
 *
 * 주의: 기존 Next.js 앱(.vercel/project.json → movie-master)과 별개 프로젝트로
 * 올려야 한다. 프로젝트 루트에서 vercel 을 실행하면 기존 사이트를 덮어쓴다.
 *
 * 아직 만들어지지 않은 게임은 건너뛴다. 크롤링·생성이 끝난 것부터 배포할 수 있어야 한다.
 */

import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises"

import { buildLanding } from "./build-landing.mjs"

const OUT = "deploy/noorung-quiz"

const exists = async (p) => {
  try { await access(p); return true } catch { return false }
}

/**
 * 배포에 실을 게임들.
 * count 는 랜딩에 "N편 수록" 으로 찍는다. 데이터가 얼마나 찼는지 한눈에 보려는 것이다.
 */
const GAMES = [
  {
    slug: "quiz",
    src: "data/quiz-play.html",
    name: "영화 제목 맞추기",
    desc: "배우 얼굴만 보고 한국 영화를 맞힙니다. 비중이 낮은 배우부터 공개됩니다.",
    tag: "한국 영화",
    countFrom: async () => (JSON.parse(await readFile("data/quizzes.json", "utf8"))).count,
    // 기본 난이도에도 ?mode= 를 붙인다. 비워 두면 게임 쪽이 '고른 게 없다'고 보고
    // 지난번에 저장된 난이도를 그대로 쓴다. 한 번 어려움을 해본 사람은 '쉬움' 을
    // 눌러도 계속 어려움으로 들어갔다.
    entries: [
      { label: "쉬움", query: "?mode=" },
      { label: "어려움", query: "?mode=hard" },
    ],
  },
  {
    slug: "grid",
    src: "data/grid-play.html",
    name: "배우 격자",
    desc: "가로·세로의 두 배우가 함께 나온 영화로 아홉 칸을 채웁니다. 같은 영화는 한 번만 쓸 수 있습니다.",
    tag: "한국 영화",
    // 이쪽은 영화가 아니라 격자 문제의 수다. "편" 으로 찍으면 말이 어긋난다.
    unit: "문제",
    countFrom: async () => (JSON.parse(await readFile("data/grid-puzzles.json", "utf8"))).count,
    entries: [
      { label: "쉬움 · 12번", query: "?mode=easy" },
      { label: "어려움 · 9번", query: "?mode=hard" },
    ],
  },
  {
    slug: "highlow",
    src: "data/highlow-play.html",
    name: "로튼 하이로우",
    desc: "두 영화의 로튼토마토 지수를 비교합니다. 몇 번 연속으로 맞힐 수 있는지 겨룹니다.",
    tag: "헐리우드",
    // 기본 범위(한국 개봉작)의 편수를 적는다. 카탈로그 전체를 적으면 들어가서 보는
    // 숫자와 어긋난다.
    // 게임 안에 찍히는 숫자와 같아야 한다. build-highlow-play.mjs 가 같은 영화를
    // rtUrl/bomId 로 한 번 걸러내므로 여기서도 같게 센다. 안 그러면 랜딩과 게임의
    // 편수가 몇 편씩 어긋난다.
    countFrom: async () => {
      const c = JSON.parse(await readFile("data/hollywood-catalog.json", "utf8"))
      const seen = new Set()
      return c.movies.filter((m) => {
        if (m.tomatometer == null || !m.posterUrl) return false
        if ((m.krAudi ?? 0) < 300_000) return false
        const key = m.rtUrl || m.bomId || m.titleEn
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).length
    },
    // 범위는 들어가기 전에 고른다. 게임 안에도 같은 버튼이 있어 도중에 바꿀 수 있다.
    entries: [
      { label: "한국 개봉작", query: "?mode=" },
      { label: "전체", query: "?mode=all" },
    ],
  },
  {
    slug: "hollywood",
    src: "data/hollywood-quiz-play.html",
    name: "헐리우드 영화 맞추기",
    desc: "같은 규칙, 무대만 헐리우드입니다. 원제로 답해도 정답으로 인정합니다.",
    tag: "헐리우드",
    countFrom: async () => (JSON.parse(await readFile("data/hollywood-quizzes.json", "utf8"))).count,
    // 출연진 페이지를 따로 받기 전에는 배우가 편당 5명뿐이라 난이도를 만들 수 없었다.
    // 이제 평균 9.8명이라 한국 퀴즈와 같은 구간 나누기가 된다.
    entries: [
      { label: "쉬움", query: "?mode=" },
      { label: "어려움", query: "?mode=hard" },
    ],
  },
]

await mkdir(OUT, { recursive: true })

const shipped = []
for (const g of GAMES) {
  if (!(await exists(g.src))) continue
  await copyFile(g.src, `${OUT}/${g.slug}.html`)
  let count = null
  try { count = await g.countFrom() } catch { /* 데이터 파일이 없으면 편수만 생략한다 */ }
  shipped.push({ ...g, count })
}

if (await exists("data/quiz-preview.html")) {
  await copyFile("data/quiz-preview.html", `${OUT}/preview.html`)
}

// ============================================
// 랭킹 API
// ============================================

/**
 * 게임 페이지들이 부르는 /api/rank 를 함께 싣는다.
 * Vercel 은 api/ 아래 파일을 서버리스 함수로 잡으므로 별도 설정이 필요 없다.
 *
 * 저장소는 Vercel Blob 이고, 토큰(BLOB_READ_WRITE_TOKEN)은 프로젝트 환경 변수로 들어온다.
 * 토큰이 없으면 함수가 500 을 내고, 페이지는 '랭킹을 불러오지 못했습니다' 로 남는다.
 * 게임 자체는 그대로 돌아간다.
 */
await mkdir(`${OUT}/api`, { recursive: true })
await copyFile("scripts/deploy-api/rank.js", `${OUT}/api/rank.js`)

// 함수가 @vercel/blob 을 쓰므로 의존성을 선언한다. Vercel 이 빌드 때 설치한다.
await writeFile(
  `${OUT}/package.json`,
  JSON.stringify(
    {
      name: "noorung-quiz",
      private: true,
      type: "module",
      dependencies: { "@vercel/blob": "^2.0.0" },
    },
    null,
    2
  ),
  "utf8"
)

// ============================================
// 랜딩
// ============================================

const index = await buildLanding(shipped)

await writeFile(`${OUT}/index.html`, index, "utf8")

// 정적 사이트임을 명시. 빌드 단계 없이 그대로 서빙한다.
await writeFile(
  `${OUT}/vercel.json`,
  JSON.stringify(
    {
      $schema: "https://openapi.vercel.sh/vercel.json",
      cleanUrls: true,
      headers: [
        {
          // 퀴즈를 재생성해 다시 올리면 바로 반영되도록 캐시를 짧게 둔다.
          source: "/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
        },
      ],
    },
    null,
    2
  ),
  "utf8"
)

// ============================================

console.log(`\n정적 배포 폴더 생성`)
console.log(`  ${OUT}/index.html      랜딩`)
for (const g of shipped) {
  console.log(`  ${OUT}/${g.slug}.html`.padEnd(38) + `${g.name}${g.count != null ? ` (${g.count.toLocaleString()}편)` : ""}`)
}
for (const g of GAMES) {
  if (!shipped.some((s) => s.slug === g.slug)) console.log(`  (건너뜀) ${g.src} 없음 — ${g.name}`)
}
console.log(`\n배포:  cd ${OUT} && npx vercel deploy --prod\n`)
