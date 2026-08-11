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
  },
  {
    slug: "highlow",
    src: "data/highlow-play.html",
    name: "로튼 하이로우",
    desc: "두 영화의 로튼토마토 지수를 비교합니다. 몇 번 연속으로 맞힐 수 있는지 겨룹니다.",
    tag: "헐리우드",
    countFrom: async () => (JSON.parse(await readFile("data/hollywood-catalog.json", "utf8"))).count,
  },
  {
    slug: "hollywood",
    src: "data/hollywood-quiz-play.html",
    name: "헐리우드 영화 맞추기",
    desc: "같은 규칙, 무대만 헐리우드입니다. 원제로 답해도 정답으로 인정합니다.",
    tag: "헐리우드",
    countFrom: async () => (JSON.parse(await readFile("data/hollywood-quizzes.json", "utf8"))).count,
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
// 랜딩
// ============================================

/**
 * 게임 페이지들과 같은 shadcn 토큰·Pretendard·에디토리얼 문법을 쓴다.
 * 여기만 다른 색을 쓰면 들어가는 순간 다른 서비스처럼 보인다.
 * 토큰을 고칠 일이 생기면 build-quiz-play.mjs, build-highlow-play.mjs 와 함께 고쳐야 한다.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

const cards = shipped
  .map(
    (g) => `      <a class="card" href="/${g.slug}">
        <span class="tag">${esc(g.tag)}</span>
        <h2>${esc(g.name)}</h2>
        <p>${esc(g.desc)}</p>
        <span class="count">${g.count != null ? `${g.count.toLocaleString()}편 수록` : "&nbsp;"}</span>
      </a>`
  )
  .join("\n")

const index = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>누룽지 극장</title>
<meta name="description" content="영화 퀴즈 세 가지. 배우 얼굴로 제목 맞히기, 로튼토마토 지수 하이로우.">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  :root {
    --background: oklch(0.98 0.002 240);
    --foreground: oklch(0.15 0.01 240);
    --card: oklch(1 0 0);
    --muted: oklch(0.95 0.003 240);
    --muted-foreground: oklch(0.4 0.01 240);
    --border: oklch(0.88 0.005 240);
    --radius: 0.5rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.13 0.015 240);
      --foreground: oklch(0.96 0.005 240);
      --card: oklch(0.16 0.015 240);
      --muted: oklch(0.2 0.015 240);
      --muted-foreground: oklch(0.62 0.01 240);
      --border: oklch(0.24 0.015 240);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--background); color: var(--foreground);
    font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
      "Segoe UI", "Malgun Gothic", sans-serif;
    font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 20px 20px 64px; }
  .masthead {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 14px; border-bottom: 1px solid var(--foreground);
  }
  .brand { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .brand span { color: var(--muted-foreground); font-weight: 500; margin-left: 7px; }
  .kicker {
    display: block; font-size: 10.5px; font-weight: 600; letter-spacing: 0.16em;
    color: var(--muted-foreground); text-transform: uppercase;
  }
  .lede { padding: 40px 0 30px; }
  .lede h1 { margin: 8px 0 0; font-size: 30px; font-weight: 700; letter-spacing: -0.035em; line-height: 1.25; }
  .lede p { margin: 10px 0 0; color: var(--muted-foreground); font-size: 14px; }

  .games { display: grid; gap: 12px; grid-template-columns: 1fr; }
  @media (min-width: 700px) { .games { grid-template-columns: repeat(3, 1fr); } }

  .card {
    display: flex; flex-direction: column; min-width: 0;
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 18px 18px 16px; text-decoration: none; color: inherit;
    transition: border-color .15s, transform .15s;
  }
  .card:hover { border-color: var(--foreground); transform: translateY(-2px); }
  .card .tag {
    font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
    color: var(--muted-foreground); text-transform: uppercase;
  }
  .card h2 { margin: 8px 0 0; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
  .card p { margin: 8px 0 16px; font-size: 13px; color: var(--muted-foreground); flex: 1; }
  .card .count {
    font-size: 11.5px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; border-top: 1px solid var(--border); padding-top: 10px;
  }

  .foot {
    margin-top: 44px; padding-top: 16px; border-top: 1px solid var(--border);
    font-size: 11.5px; color: var(--muted-foreground);
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <h1 class="brand">누룽지 극장<span>영화 퀴즈</span></h1>
  </header>

  <section class="lede">
    <span class="kicker">Play</span>
    <h1>얼굴로, 숫자로<br>영화를 맞혀 보세요</h1>
    <p>로그인 없이 바로 시작합니다.</p>
  </section>

  <nav class="games">
${cards}
  </nav>

  <footer class="foot">
    한국 영화 정보는 영화진흥위원회(KOBIS), 헐리우드 영화 정보는 로튼토마토와 Box Office Mojo 를 참고했습니다.
  </footer>
</div>
</body>
</html>`

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
