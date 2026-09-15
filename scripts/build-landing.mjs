import { readFile } from "node:fs/promises"
import { themeCSS, siteHeaderHTML } from "./play-theme.mjs"

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

/** Reuse real catalog imagery; missing optional catalogs leave a typographic cover. */
async function coverImages() {
  const images = { quiz: [], grid: [], highlow: [], hollywood: [], casting: [] }
  try {
    const { quizzes } = JSON.parse(await readFile("data/quizzes.json", "utf8"))
    const actors = quizzes.flatMap((q) => q.candidates ?? q.hints)
    images.casting = ["이병헌", "전지현", "강동원"].map((name) => actors.find((a) => a.name === name && a.imageUrl))
      .filter(Boolean).map((a) => ({ src: a.imageUrl, alt: a.name }))
    for (const [slug, names] of Object.entries({ quiz: ["송강호", "김혜수", "최민식"], grid: ["황정민", "하정우", "조진웅"] })) {
      images[slug] = names.map((name) => actors.find((a) => a.name === name && a.imageUrl))
        .filter(Boolean).map((a) => ({ src: a.imageUrl, alt: a.name }))
    }
  } catch { /* A partial catalog build still has working game links. */ }
  try {
    const { movies } = JSON.parse(await readFile("data/hollywood-catalog.json", "utf8"))
    images.highlow = ["Inception", "Interstellar"].map((title) => movies.find((m) => m.titleEn === title && m.posterUrl))
      .filter(Boolean).map((m) => ({ src: m.posterUrl.includes("=/v3/") ? m.posterUrl.replace("=/v3/", "=/300x450/v3/") : m.posterUrl, alt: m.titleKo || m.titleEn }))
    const actors = movies.flatMap((m) => m.actors ?? [])
    images.hollywood = ["Leonardo DiCaprio", "Scarlett Johansson", "Brad Pitt"]
      .map((name) => actors.find((a) => a.name === name && a.imageUrl))
      .filter(Boolean).map((a) => ({ src: a.imageUrlLarge || a.imageUrl, alt: a.name }))
  } catch { /* See above. */ }
  return images
}

const labels = { quiz: ["01", "WHO’S IN IT?", "배우로 찾는 한국 영화"], grid: ["02", "CONNECT THE CAST", "두 배우, 하나의 영화"], highlow: ["03", "HIGH OR LOW?", "영화 평점 비교"], hollywood: ["04", "HELLO, HOLLYWOOD", "배우로 찾는 헐리우드 영화"] }

export async function buildLanding(shipped) {
  const images = await coverImages()
  const cards = shipped.map((g) => {
    const [number, title, caption] = labels[g.slug]
    const firstQuery = g.entries?.[0]?.query ?? ""
    return `<article class="game-card">
      <a class="cover cover-${g.slug}" href="/${g.slug}${firstQuery}" aria-label="${esc(g.name)} 시작">
        <div class="cover-heading"><span>${number} / PLAY</span><span>${esc(g.tag)}</span></div>
        <div class="cover-images" style="--image-count:${images[g.slug].length || 1}">
          ${images[g.slug].map((img) => `<img src="${esc(img.src)}" alt="${esc(img.alt)}" width="192" height="256" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`).join("")}
        </div>
        <div class="cover-title">${title}</div>
        <div class="cover-bottom"><span>${caption}</span><span aria-hidden="true">↗</span></div>
      </a>
      <div class="card-meta"><span>${esc(g.tag)}</span>${g.count != null ? `<span>${g.count.toLocaleString("ko-KR")}${g.unit ?? "편"} 수록</span>` : ""}</div>
      <h2><a href="/${g.slug}${firstQuery}">${esc(g.name)}</a></h2>
      <p class="description">${esc(g.desc)}</p>
      <div class="entries" aria-label="${esc(g.name)} 모드 선택">
        ${(g.entries ?? [{ label: "시작하기", query: "" }]).map((e, i) => `<a class="${i === 0 ? "entry-primary" : ""}" href="/${g.slug}${e.query}">${esc(e.label)}<span aria-hidden="true">↗</span></a>`).join("")}
      </div>
    </article>`
  }).join("\n")

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>누룽지 극장 — 영화로 노는 시간</title>
<meta name="description" content="배우 얼굴로 영화 맞히기, 배우 격자, 로튼 하이로우. 로그인 없이 즐기는 네 가지 영화 게임.">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${themeCSS}
  .home-nav { border-bottom: 1px solid var(--border); }
  .home-nav-inner { max-width: 1328px; margin: auto; padding: 0 32px; display: flex; gap: 32px; overflow-x: auto; }
  .home-nav a { display: flex; align-items: center; min-height: 56px; flex-shrink: 0;
    text-decoration: none; font-size: 14px; font-weight: 600; border-bottom: 3px solid transparent; }
  .home-nav a[aria-current] { border-color: #111; font-weight: 800; }
  .home-nav a:hover { border-color: #111; }
  .home-main { max-width: 1328px; margin: auto; padding: 0 32px 72px; }
  .intro { padding: 42px 0 34px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .eyebrow { margin: 0 0 10px; font-size: 12px; letter-spacing: .12em; font-weight: 700; }
  .intro h1 { margin: 0; font-size: clamp(30px, 3.2vw, 46px); letter-spacing: -.055em; line-height: 1.2; font-weight: 850; }
  .intro-note { margin: 0; color: var(--muted-foreground); font-size: 14px; line-height: 1.8; }
  .section-label { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
    padding: 16px 0; border-top: 2px solid #171717; }
  .section-label h2 { margin: 0; font-size: 16px; font-weight: 750; }
  .section-label span { color: var(--muted-foreground); font-size: 12px; letter-spacing: .08em; }
  .casting-feature { display: flex; justify-content: space-between; gap: 28px; align-items: stretch;
    margin-bottom: 36px; color: #fff; background: #242724; text-decoration: none; overflow: hidden; }
  .casting-feature-copy { padding: 26px 30px; display: flex; flex-direction: column; justify-content: center; }
  .casting-feature-copy small { font-size: 11px; letter-spacing: .1em; font-weight: 700; color: #d3d6cf; }
  .casting-feature-copy h2 { font-size: clamp(23px, 2.8vw, 32px); margin: 10px 0 7px; letter-spacing: -.04em; line-height: 1.3; }
  .casting-feature-copy p { font-size: 13px; color: #dededb; margin: 0; }
  .casting-feature-copy strong { font-size: 13px; margin-top: 20px; text-decoration: underline; text-underline-offset: 5px; }
  .casting-feature-images { display: grid; grid-template-columns: repeat(3, 1fr); width: 40%; max-width: 420px; gap: 4px; }
  .casting-feature-images img { width: 100%; height: 100%; min-height: 220px; max-height: 250px; object-fit: cover; object-position: center 20%; filter: grayscale(1); }
  .casting-feature:hover img { filter: none; }
  .games { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
  .game-card { min-width: 0; display: flex; flex-direction: column; }
  .cover { min-width: 0; display: flex; flex-direction: column; aspect-ratio: 4/5;
    background: #202020; color: #fff; text-decoration: none; overflow: hidden; }
  .cover-heading, .cover-bottom { display: flex; justify-content: space-between; align-items: center;
    gap: 8px; padding: 16px; font-size: 10px; font-weight: 650; letter-spacing: .04em; }
  .cover-images { display: grid; grid-template-columns: repeat(var(--image-count), minmax(0, 1fr));
    flex: 1; min-height: 0; margin: 4px 16px 0; overflow: hidden; background: #343434; }
  .cover-images img { width: 100%; height: 100%; object-fit: cover; object-position: center top;
    filter: grayscale(100%); transition: filter .25s; }
  .cover:hover img { filter: grayscale(0); }
  .cover-title { margin: 18px 16px 0; font-size: clamp(22px, 2.4vw, 36px);
    font-weight: 900; letter-spacing: -.055em; line-height: .98; overflow-wrap: normal; }
  .cover-bottom { padding-top: 12px; }
  .cover-bottom > span:last-child { font-size: 23px; line-height: 1; }
  .cover-grid { background: #deded8; color: #151515; }
  .cover-grid .cover-images { background: #c5c5bf; gap: 4px; }
  .cover-highlow { background: #e4e9ee; color: #151515; }
  .cover-highlow .cover-images { background: #c6cdd4; gap: 6px; }
  .cover-highlow img { filter: none; }
  .cover-hollywood { background: #3c4340; }
  .card-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px;
    margin: 18px 0 7px; font-size: 12px; color: var(--muted-foreground); }
  .card-meta > span:first-child { font-weight: 700; color: var(--foreground); }
  .game-card h2 { margin: 0; font-size: 21px; font-weight: 800; letter-spacing: -.04em; line-height: 1.4; }
  .game-card h2 a { text-decoration: none; }
  .game-card h2 a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .description { margin: 9px 0 20px; font-size: 14px; color: var(--muted-foreground); line-height: 1.75; flex: 1; }
  .entries { display: flex; gap: 6px; }
  .entries a { display: flex; flex: 1; min-height: 46px; padding: 10px 12px; align-items: center;
    justify-content: space-between; gap: 4px; border: 1px solid #c9c9c9; text-decoration: none; font-size: 13px; font-weight: 650; }
  .entries .entry-primary { background: #171717; color: #fff; border-color: #171717; }
  .entries a:hover { background: #eeeeec; color: #171717; border-color: #171717; }
  .site-footer { border-top: 1px solid var(--border); background: #f7f7f7; }
  .footer-inner { max-width: 1328px; margin: auto; padding: 30px 32px 38px; display: flex;
    gap: 24px; justify-content: space-between; align-items: baseline; }
  .footer-brand { font-size: 19px; font-weight: 850; letter-spacing: -.05em; white-space: nowrap; }
  .footer-inner p { margin: 0; font-size: 12px; color: var(--muted-foreground); line-height: 1.8; }
  @media (min-width: 1500px) { .cover-title { font-size: 36px; } }
  @media (max-width: 1050px) {
    .games { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px 24px; }
    .cover { aspect-ratio: 6/5; }
    .cover-title { font-size: 34px; }
  }
  @media (max-width: 600px) {
    .home-nav-inner { padding: 0 20px; gap: 24px; }
    .home-nav a { min-height: 50px; font-size: 13px; }
    .home-main { padding: 0 20px 44px; }
    .intro { padding: 30px 0 26px; align-items: flex-start; flex-direction: column; gap: 12px; }
    .intro-note br { display: none; }
    .casting-feature { flex-direction: column; gap: 0; margin-bottom: 28px; }
    .casting-feature-copy { padding: 22px; }
    .casting-feature-images { width: 100%; max-width: none; height: 150px; }
    .casting-feature-images img { min-height: 0; height: 150px; }
    .games { grid-template-columns: minmax(0, 1fr); gap: 32px; }
    .cover { aspect-ratio: 5/4; }
    .cover-title { font-size: 34px; }
    .cover-heading, .cover-bottom { font-size: 11px; }
    .game-card h2 { font-size: 23px; }
    .entries a { font-size: 14px; min-height: 48px; padding-inline: 16px; }
    .description { margin-bottom: 16px; font-size: 15px; }
    .footer-inner { padding: 24px 20px; flex-direction: column; gap: 12px; }
  }
</style>
</head>
<body>
${siteHeaderHTML}
<nav class="home-nav" aria-label="주 메뉴"><div class="home-nav-inner">
  <a href="/" aria-current="page">전체 게임</a>
  ${shipped.map((g) => `<a href="/${g.slug}${g.entries?.[0]?.query ?? ""}">${esc(g.name)}</a>`).join("")}
  <a href="/casting">가상 캐스팅</a>
</div></nav>
<main class="home-main" id="main" tabindex="-1">
  <section class="intro">
    <div><p class="eyebrow">FOR THE LOVE OF CINEMA</p><h1>영화 좀 본 당신에게.</h1></div>
    <p class="intro-note">얼굴을 기억하고, 작품을 연결하고, 평점을 맞히세요.<br>로그인 없이, 지금 바로 한 판.</p>
  </section>
  <a class="casting-feature" href="/casting">
    <div class="casting-feature-copy"><small>NEW · THE CASTING ROOM</small><h2>어벤져스, 한국에서 만든다면?</h2><p>아이언맨부터 로키까지. 한국 배우로 완성하는 나만의 캐스팅.</p><strong>캐스팅 시작하기 →</strong></div>
    <div class="casting-feature-images" aria-hidden="true">${images.casting.map((img) => `<img src="${esc(img.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`).join("")}</div>
  </a>
  <div class="section-label"><h2>플레이할 게임</h2><span>${String(shipped.length).padStart(2, "0")} GAMES</span></div>
  <section class="games" aria-label="게임 선택">
${cards}
  </section>
</main>
<footer class="site-footer"><div class="footer-inner">
  <span class="footer-brand">누룽지 극장</span>
  <p>영화 정보 · 영화진흥위원회(KOBIS), Rotten Tomatoes, Box Office Mojo<br>게임 기록은 이 브라우저에 저장됩니다.</p>
</div></footer>
</body>
</html>`
}
