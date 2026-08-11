/**
 * 로튼토마토 지수 하이/로우 게임 페이지 생성
 *
 * data/hollywood-catalog.json + data/rt-scores.json 을 병합해
 * 실제로 플레이할 수 있는 단일 HTML 을 만든다.
 *
 * 실행:
 *   node scripts/build-highlow-play.mjs
 *   node scripts/build-highlow-play.mjs --fixture   # 입력 JSON 없이 샘플 12편으로
 *   → data/highlow-play.html
 *
 * --- 게임 규칙 ---
 * 왼쪽 영화의 로튼 지수는 공개, 오른쪽은 가려져 있다.
 * 오른쪽이 왼쪽보다 HIGHER 인지 LOWER 인지 고른다.
 * 맞히면 오른쪽이 왼쪽 자리로 밀려오고 새 영화가 오른쪽에 선다. 연속 기록 +1.
 * 틀리면 종료. 최고 기록은 localStorage 에 남는다.
 *
 * 동점은 정답으로 친다. 로튼 지수는 정수라 동점이 흔한데,
 * 찍어서 맞힐 방법이 없는 자리에서 죽으면 플레이어가 억울하다.
 *
 * --- 스타일 ---
 * scripts/build-quiz-play.mjs 와 같은 shadcn 토큰·마스트헤드·버튼을 쓴다.
 * 두 게임이 한 서비스로 보여야 하므로 색이나 폰트를 새로 만들지 않는다.
 * 토큰 값을 고칠 일이 생기면 app/globals.css, build-quiz-play.mjs 와 함께 고쳐야 한다.
 */

import { readFile, writeFile } from "node:fs/promises"
import { homeHTML, navCSS, navHTML, navScript } from "./play-nav.mjs"
import { rankCSS, rankHTML, rankScript } from "./play-rank.mjs"

/**
 * 입력은 scripts/build-hollywood-catalog.mjs 가 만든 한 파일뿐이다.
 * 지수·포스터·한국어 제목·감독이 이미 병합돼 있고 걸러낼 것도 그쪽에서 다 걸러진다.
 * (예전에는 카탈로그와 지수를 따로 읽었는데, 수집을 크롤링으로 바꾸면서 한 파일로 합쳤다.)
 */
const CATALOG_PATH = "data/hollywood-catalog.json"
const OUT_PATH = "data/highlow-play.html"

const useFixture = process.argv.includes("--fixture")

/**
 * 픽스처 — 수집 스크립트가 아직 없어도 게임 로직과 레이아웃을 확인하려고 둔다.
 * 실제 존재하는 헐리우드 영화 12편, 로튼 지수는 실제값 근사치,
 * posterPath 는 TMDB 에서 확인한 실제 경로다.
 *
 * 의도적으로 섞어둔 것들:
 *   - 91 점이 세 편(쥬라기 공원 / 어벤져스 / 라스트 제다이) → 동점 처리 확인용
 *   - 라스트 제다이는 titleKo 를 비워 원제 표시 경로를 태운다
 *   - 마지막 두 편은 tomatometer null / posterPath 없음 → 제외 로직 확인용
 */
function fixtureInput() {
  const POSTER = "https://image.tmdb.org/t/p/w342"
  const m = (titleEn, titleKo, year, director, imdbId, posterPath) => ({
    titleEn,
    titleKo,
    year,
    directorsKo: [director],
    imdbId,
    // 실데이터의 posterUrl 은 로튼의 전체 URL 이다. 픽스처도 같은 모양으로 맞춘다.
    posterUrl: posterPath ? POSTER + posterPath : null,
  })
  const catalog = {
    movies: [
      m("The Dark Knight", "다크 나이트", 2008, "크리스토퍼 놀란", "tt0468569", "/qJ2tW6WMUDux911r6m7haRef0WH.jpg"),
      m("Inception", "인셉션", 2010, "크리스토퍼 놀란", "tt1375666", "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg"),
      m("The Matrix", "매트릭스", 1999, "워쇼스키 자매", "tt0133093", "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"),
      m("Titanic", "타이타닉", 1997, "제임스 카메론", "tt0120338", "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg"),
      m("Avatar", "아바타", 2009, "제임스 카메론", "tt0499549", "/kyeqWdyUXW608qlYkRqosgbbJyK.jpg"),
      m("Jurassic Park", "쥬라기 공원", 1993, "스티븐 스필버그", "tt0107290", "/oU7Oq2kFAAlGqbU4VoAE36g4hoI.jpg"),
      m("Forrest Gump", "포레스트 검프", 1994, "로버트 저메키스", "tt0109830", "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg"),
      m("The Avengers", "어벤져스", 2012, "조스 웨던", "tt0848228", "/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg"),
      m("Toy Story 3", "토이 스토리 3", 2010, "리 언크리치", "tt0435761", "/AbbXspMOwdvwWZgVN0nabZq03Ec.jpg"),
      m("Batman v Superman: Dawn of Justice", "배트맨 대 슈퍼맨: 저스티스의 시작", 2016, "잭 스나이더", "tt2975590", "/5UsK3grJvtQrtzEgqNlDljJW96w.jpg"),
      m("Suicide Squad", "수어사이드 스쿼드", 2016, "데이비드 에이어", "tt1386697", "/xFw9RXKZDvevAGocgBK0zteto4U.jpg"),
      m("Star Wars: The Last Jedi", null, 2017, "라이언 존슨", "tt2527336", "/kOVEVeg59E0wsnXmF9nrh6OmWII.jpg"),
      // 아래 두 편은 화면에 나오면 안 된다 (제외 카운터 확인용)
      m("Untitled Unrated", "지수 없는 영화", 2020, "감독 미상", "tt9999991", "/zzzNoScore.jpg"),
      m("Untitled Posterless", "포스터 없는 영화", 2021, "감독 미상", "tt9999992", null),
    ],
  }
  const t = {
    tt0468569: 94, tt1375666: 87, tt0133093: 83, tt0120338: 88,
    tt0499549: 81, tt0107290: 91, tt0109830: 74, tt0848228: 91,
    tt0435761: 98, tt2975590: 29, tt1386697: 26, tt2527336: 91,
    tt9999991: null, tt9999992: 70,
  }
  const byImdbId = {}
  for (const [id, tomatometer] of Object.entries(t)) byImdbId[id] = { tomatometer }
  return { catalog, scores: { byImdbId } }
}

async function readInput() {
  if (useFixture) return { ...fixtureInput(), source: "fixture" }
  try {
    const catalog = await readFile(CATALOG_PATH, "utf8").then(JSON.parse)
    return { catalog, scores: null, source: "data" }
  } catch (e) {
    if (e.code !== "ENOENT") throw e
    // 카탈로그가 아직 없다. 멈추지 말고 픽스처로 페이지를 만든다.
    console.log(`\n입력 JSON 이 없어 픽스처로 생성한다 (${CATALOG_PATH})`)
    return { ...fixtureInput(), source: "fixture" }
  }
}

const { catalog, scores, source } = await readInput()

const rows = catalog?.movies ?? []

/**
 * 로튼 포스터를 화면 크기에 맞춰 줄인다.
 *
 * resizing.flixster.com 은 서명 뒤에 크기를 끼워 넣으면 그 크기로 내려준다.
 * 서명이 크기를 검증하지 않아서 가능하다(배우 사진의 /100x120/ 과 같은 원리).
 * 원본은 2160x2880 · 694KB 짜리도 있어 그대로 쓰면 카드 한 장에 메가바이트가 나간다.
 * 실제로 줄여보니 694KB → 49KB 였다. 화면에서 포스터는 212px 폭이라 300x450 이면 넉넉하다.
 *
 * 단 URL 형태가 두 가지고 한쪽만 먹는다.
 *   <서명>=/v3/t/assets/xxx.jpg   크기 삽입이 먹는다        (122편)
 *   <서명>=/ems.<base64>          삽입하면 빈 응답이 온다     (21편)
 * ems 형은 원본이 이미 60~90KB 라 굳이 손대지 않는다.
 */
const shrinkPoster = (url) => (url.includes("=/v3/") ? url.replace("=/v3/", "=/300x450/v3/") : url)

/**
 * 제외 사유별 편수.
 * 카탈로그 단계에서 이미 걸러지므로 여기서 잡히는 건 거의 없어야 한다.
 * 그래도 세는 이유는, 숫자가 0 이 아니면 병합 쪽이 샜다는 신호이기 때문이다.
 */
const dropped = { tomatometer: 0, poster: 0, duplicate: 0 }
let englishTitles = 0

const seen = new Set()
const movies = []

for (const row of rows) {
  // 같은 영화가 좌우에 동시에 서면 게임이 성립하지 않는다.
  const key = row.rtUrl || row.bomId || row.titleEn
  if (seen.has(key)) { dropped.duplicate++; continue }

  // 가릴 숫자가 없으면 문제가 성립하지 않는다.
  const score = row.tomatometer
  if (typeof score !== "number" || !Number.isFinite(score)) { dropped.tomatometer++; continue }

  // 볼 것이 없으면 카드가 텅 빈다. 하이로우는 포스터가 화면의 전부다.
  if (!row.posterUrl) { dropped.poster++; continue }

  seen.add(key)

  // 한국어 제목이 있으면 그쪽을 쓴다. 커버리지가 곧 이 게임의 품질이다.
  const title = row.titleKo || row.titleEn || ""
  if (!row.titleKo) englishTitles++

  const year = row.year ?? row.bomYear ?? Number(String(row.releaseDate ?? "").slice(0, 4)) ?? null

  // 감독은 한글 표기를 우선한다. 한국어 제목 옆에 영문 이름이 오면 어색하다.
  const directors = (row.directorsKo?.length ? row.directorsKo : row.directors) ?? []

  // 페이지에 실을 것은 제목·연도·감독·포스터·지수뿐이다.
  movies.push({
    t: title,
    y: Number.isFinite(year) ? year : "",
    d: directors.slice(0, 2).join(", "),
    p: shrinkPoster(row.posterUrl),
    s: Math.round(score),
  })
}

if (movies.length < 4) {
  throw new Error(`플레이 가능한 영화가 ${movies.length}편뿐이라 게임을 만들 수 없다`)
}

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>로튼 하이로우</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://image.tmdb.org">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  /* ── shadcn 토큰 (app/globals.css · quiz-play 와 동일한 값) ────── */
  :root {
    --background: oklch(0.98 0.002 240);
    --foreground: oklch(0.15 0.01 240);
    --card: oklch(1 0 0);
    --muted: oklch(0.95 0.003 240);
    --muted-foreground: oklch(0.4 0.01 240);
    --primary: oklch(0.45 0.06 230);
    --primary-foreground: oklch(0.99 0 0);
    --border: oklch(0.88 0.005 240);
    --ring: oklch(0.45 0.06 230);
    --destructive: oklch(0.55 0.2 25);
    --success: oklch(0.52 0.13 155);
    --radius: 0.5rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.13 0.015 240);
      --foreground: oklch(0.96 0.005 240);
      --card: oklch(0.16 0.015 240);
      --muted: oklch(0.2 0.015 240);
      --muted-foreground: oklch(0.62 0.01 240);
      --primary: oklch(0.6 0.08 240);
      --primary-foreground: oklch(0.13 0.015 240);
      --border: oklch(0.24 0.015 240);
      --ring: oklch(0.6 0.08 240);
      --destructive: oklch(0.62 0.18 25);
      --success: oklch(0.7 0.14 155);
    }
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--background);
    color: var(--foreground);
    font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
      "Segoe UI", "Malgun Gothic", sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 20px 20px 64px; }

  /* ── 마스트헤드 ───────────────────────────────────────────── */
  .masthead {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 14px; border-bottom: 1px solid var(--foreground);
  }
  .brand { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { color: var(--muted-foreground); font-weight: 500; margin-left: 7px; }
  .score {
    font-size: 12px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; letter-spacing: 0.01em;
  }
  .score b { color: var(--foreground); font-weight: 700; }

  .kicker {
    display: block; font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.16em; color: var(--muted-foreground);
    text-transform: uppercase;
  }

  /* ── 문제/결과 패널 ──────────────────────────────────────── */
  /* 결과를 카드 아래가 아니라 위에 둔다. 모바일에서 카드 두 장 밑으로 내려가면
     게임이 끝난 줄도 모르고 스크롤을 찾아야 한다. */
  .prompt { padding: 26px 0 18px; }
  .prompt h2 {
    margin: 6px 0 0; font-size: 24px; font-weight: 700;
    letter-spacing: -0.03em; line-height: 1.25;
  }
  .prompt .big {
    margin: 4px 0 0; font-size: 52px; font-weight: 300; line-height: 1.05;
    letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
  }
  .prompt .big em { font-style: normal; font-size: 18px; font-weight: 500;
    letter-spacing: -0.01em; color: var(--muted-foreground); margin-left: 8px; }
  .rmeta { margin: 8px 0 0; font-size: 13px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; }
  .kicker.win { color: var(--success); }
  .kicker.bad { color: var(--destructive); }
  .prompt .btn { margin-top: 18px; }

  /* ── 대결판 ──────────────────────────────────────────────── */
  /* 모바일은 위아래, 720px 이상에서 좌우. 가로 스크롤이 생기면 안 되므로
     칸 너비는 1fr 로 두고 포스터에만 max-width 를 건다. */
  .board { display: grid; gap: 14px; }
  @media (min-width: 720px) {
    .board { grid-template-columns: 1fr 40px 1fr; gap: 20px; align-items: start; }
  }

  /* figure 의 기본 여백(margin: 1em 40px)을 지우지 않으면 칸 밖으로 넘친다.
     min-width:0 이 없으면 grid 항목이 내용 너비 아래로 줄지 않아 가로 스크롤이 난다. */
  .pane { margin: 0; min-width: 0; }
  .side { min-width: 0; }

  /* 모바일은 카드 안을 가로로 눕힌다(포스터 | 정보).
     세로로 쌓으면 한 판이 1200px 가까이 되어 HIGHER/LOWER 버튼이 접히는 곳
     아래로 내려간다. 스크롤해서 답하고 다시 올라와 판정을 보는 게임은 못 쓴다. */
  .pane { display: grid; grid-template-columns: 118px 1fr; gap: 14px; align-items: center; }
  /* width:100% 를 반드시 준다. 플레이스홀더는 absolute 라 상자 크기에 기여하지 않아서,
     이미지가 깨져 img 가 사라지면 내용 너비가 0 이 되고 aspect-ratio 가 그 0 을 물려받아
     포스터가 2x3px 로 찌그러진다(데스크톱의 margin:0 auto 와 겹치면 확실히 재현된다). */
  .poster {
    position: relative; width: 100%; aspect-ratio: 2/3; overflow: hidden;
    border-radius: calc(var(--radius) - 2px);
    border: 1px solid var(--border); background: var(--muted);
  }
  @media (min-width: 720px) {
    .pane { grid-template-columns: 1fr; gap: 0; }
    .poster { max-width: 212px; margin: 0 auto; }
    .side { text-align: center; }
    /* 좌우로 놓이면 제목이 한 줄이든 두 줄이든 지수 높이는 맞아야 한다.
       min-height 를 .title 이 아니라 .info 에 걸어야 남는 높이가 제목과 연도 사이가
       아니라 아래로 간다. */
    .info { min-height: 60px; }
  }
  /* 플레이스홀더를 항상 깔아두고 그 위에 이미지를 얹는다.
     이미지가 깨지면 onerror 로 img 만 숨기면 되고 레이아웃은 그대로다. */
  .poster .ph {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 10px; font-weight: 600; letter-spacing: 0.16em;
    color: var(--muted-foreground); opacity: 0.45;
  }
  .poster img {
    position: relative; width: 100%; height: 100%;
    object-fit: cover; display: block;
  }

  .info { margin: 0; }
  @media (min-width: 720px) { .info { padding-top: 12px; } }
  .title {
    font-size: 15px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted-foreground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .pct {
    margin: 6px 0 0;
    font-size: 40px; font-weight: 300; line-height: 1;
    letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
  }
  @media (min-width: 720px) { .pct { margin-top: 12px; font-size: 46px; } }
  .pct em { font-style: normal; font-size: 16px; font-weight: 500;
    color: var(--muted-foreground); margin-left: 3px; }
  .pct.mask { color: var(--muted-foreground); opacity: .5; }

  /* ── VS 구분선 ───────────────────────────────────────────── */
  .vs {
    display: flex; align-items: center; gap: 10px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.16em;
    color: var(--muted-foreground);
  }
  .vs::before, .vs::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  @media (min-width: 720px) {
    .vs { flex-direction: column; align-self: stretch; padding: 40px 0; }
    .vs::before, .vs::after { width: 1px; height: auto; }
  }

  /* ── 버튼 (shadcn Button) ────────────────────────────────── */
  .choice { display: grid; gap: 8px; margin-top: 10px; }
  @media (min-width: 720px) { .choice { margin-top: 14px; } }
  .btn {
    height: 44px; padding: 0 18px; width: 100%; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 600; letter-spacing: 0.02em;
    color: var(--primary-foreground); background: var(--primary);
    border: 1px solid transparent; border-radius: var(--radius);
    transition: opacity .15s, background .15s;
  }
  .btn:hover { opacity: .88; }
  .btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .btn:disabled { cursor: default; opacity: .4; }
  .btn-ghost { color: var(--muted-foreground); background: transparent; border-color: var(--border); }
  .btn-ghost:hover { background: var(--muted); opacity: 1; }
  .btn-ghost:disabled:hover { background: transparent; }
  .prompt .btn { width: auto; }

  /* ── 애니메이션 ──────────────────────────────────────────── */
  /* 오른쪽 카드가 왼쪽 자리로 '밀려온다'는 느낌을 주려고
     새 왼쪽 카드는 오른쪽에서, 새 오른쪽 카드는 아래에서 들어온다. */
  @keyframes fromRight { from { opacity: 0; transform: translateX(22px); } }
  @keyframes fromBelow { from { opacity: 0; transform: translateY(12px); } }
  .pane.came { animation: fromRight .32s cubic-bezier(.2,.7,.3,1); }
  .pane.fresh { animation: fromBelow .32s cubic-bezier(.2,.7,.3,1); }
  .pane.leaving { opacity: 0; transform: translateX(-14px);
    transition: opacity .22s ease, transform .22s ease; }

  .foot { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border);
    font-size: 11.5px; color: var(--muted-foreground); }
  .hidden { display: none; }
${navCSS}
${rankCSS}

  /* ── 난이도 ──────────────────────────────────────────────── */
  .modes { display: flex; align-items: center; gap: 6px; margin: 14px 0 0; flex-wrap: wrap; }
  .modes .lab {
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.16em;
    color: var(--muted-foreground); text-transform: uppercase; margin-right: 4px;
  }
  .modes button {
    padding: 5px 11px; border: 1px solid var(--border); border-radius: 999px;
    background: transparent; color: var(--muted-foreground);
    font-family: inherit; font-size: 12.5px; cursor: pointer;
    transition: color .15s, border-color .15s, background .15s;
  }
  .modes button:hover { color: var(--foreground); }
  .modes button.on {
    color: var(--primary-foreground); background: var(--primary); border-color: var(--primary);
    font-weight: 600;
  }
  .modes .cnt { font-size: 11.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <h1 class="brand">로튼 하이로우<span>${homeHTML}</span></h1>
    <span class="score" id="score">연속 <b>0</b> · 최고 0</span>
  </header>
${navHTML("highlow")}

  <div class="modes" id="modes">
    <span class="lab">난이도</span>
    <button data-mode="" class="on">전체</button>
    <button data-mode="fresh50">신선한 영화만</button>
    <span class="cnt" id="modeCnt"></span>
  </div>

  <section class="prompt">
    <span class="kicker" id="pLabel">Round 1</span>
    <h2 id="pText">오른쪽 영화의 로튼 지수는?</h2>
    <p class="big hidden" id="pBig"></p>
    <p class="rmeta hidden" id="pMeta"></p>
    <button class="btn hidden" id="again">다시 하기</button>
  </section>

  <div class="board">
    <figure class="pane" id="paneL"></figure>
    <div class="vs">VS</div>
    <figure class="pane" id="paneR"></figure>
  </div>

${rankHTML("랭킹")}

  <footer class="foot">로튼토마토 신선도(Tomatometer) 기준입니다. 동점은 정답으로 처리됩니다.
    '신선한 영화만' 은 지수 50 이상인 작품끼리 겨룹니다.</footer>
</div>

<script>
const ALL_MOVIES = ${JSON.stringify(movies)};
const BEST_KEY = 'noorung.highlow.best';
const MODE_KEY = 'noorung.highlow.mode';

/**
 * 난이도 = 출제 대상 좁히기.
 *
 * 하한 없이 내면 지수 한 자리대의 졸작이 절반씩 섞여 나온다. 아무도 모르는 영화라
 * 찍는 것 말고 할 수 있는 게 없다. 'fresh50' 은 지수 50 이상만 남긴다.
 * (로튼이 Fresh 로 치는 공식 경계는 60 이다. 더 좁히려면 이 값을 60 으로 올린다)
 *
 * 다만 쉬워지지는 않는다. 50~100 안에서 겨루면 두 지수가 붙어 오히려 가르기 어렵다.
 * 아는 영화로 고민하게 만드는 것이 목적이지, 정답률을 올리는 것이 목적이 아니다.
 */
const FRESH_MIN = 50;
const POOLS = {
  '': ALL_MOVIES,
  fresh50: ALL_MOVIES.filter(function (m) { return m.s >= FRESH_MIN; }),
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
${navScript}
${rankScript({ game: "highlow", unit: "연속", localKey: "" })}

/**
 * 방금 나온 영화가 곧바로 다시 나오지 않도록 최근 등장분을 제외한다.
 * 목록이 짧으면 제외 폭도 줄여야 뽑을 후보가 남는다.
 * (제외 목록에는 화면의 두 편도 들어가므로 최소 2편은 남겨둔다)
 */
let MOVIES = POOLS[''];
let RECENT_MAX = 8;
let recent = [];

/** 난이도를 바꾸면 출제 목록이 통째로 갈린다. 최근 등장분도 함께 버린다. */
function usePool(mode) {
  MOVIES = POOLS[mode] && POOLS[mode].length >= 4 ? POOLS[mode] : POOLS[''];
  RECENT_MAX = Math.min(8, Math.max(2, Math.floor(MOVIES.length / 3)));
  recent = [];
}

function draw() {
  const banned = new Set(recent);
  let cand = [];
  for (let i = 0; i < MOVIES.length; i++) if (!banned.has(i)) cand.push(i);
  if (!cand.length) {           // 이론상 안 나오지만, 나오면 게임이 멈춘다
    cand = MOVIES.map((_, i) => i).filter(i => i !== recent[0]);
  }
  const idx = cand[Math.floor(Math.random() * cand.length)];
  recent.unshift(idx);
  if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
  return MOVIES[idx];
}

/**
 * 지수를 감춘 쪽과 공개한 쪽을 같은 마크업으로 그린다. 자리가 바뀌어도 흔들리지 않는다.
 * extra 는 .side 안쪽 끝에 붙는다(오른쪽 카드의 HIGHER/LOWER).
 * 모바일에서 포스터 옆 칸에 같이 들어가야 해서 .side 밖으로 뺄 수 없다.
 */
function paneHTML(m, revealed, extra) {
  const meta = [m.y || '', m.d || ''].filter(Boolean).join(' · ');
  // 포스터 URL 이 없거나 로드에 실패하면 img 만 숨긴다. 회색 자리는 그대로 남는다.
  const img = m.p
    ? '<img src="' + esc(m.p) + '" alt="" loading="lazy" ' +
      'onerror="this.style.display=\\'none\\'">'
    : '';
  const pct = revealed
    ? '<p class="pct"><b>' + m.s + '</b><em>%</em></p>'
    : '<p class="pct mask"><b>?</b></p>';
  return '<div class="poster"><span class="ph">POSTER</span>' + img + '</div>' +
    '<div class="side">' +
      '<figcaption class="info">' +
        '<b class="title">' + esc(m.t) + '</b>' +
        '<span class="meta">' + esc(meta) + '</span>' +
      '</figcaption>' + pct + (extra || '') +
    '</div>';
}

const CHOICE =
  '<div class="choice" id="choice">' +
    '<button class="btn" data-v="hi">HIGHER ↑</button>' +
    '<button class="btn btn-ghost" data-v="lo">LOWER ↓</button>' +
  '</div>';

let left, right, streak = 0, best = 0, round = 1, locked = false;

/** 난이도마다 출제 목록이 다르니 최고 기록도 따로 센다. 섞으면 어느 쪽 기록인지 알 수 없다. */
let mode = '';
try { mode = localStorage.getItem(MODE_KEY) || ''; } catch (e) {}

// 랜딩에서 난이도를 골라 들어온 경우(/highlow?mode=fresh50)가 지난 선택보다 우선한다.
var qMode = new URLSearchParams(location.search).get('mode');
if (qMode !== null) mode = qMode;

if (!POOLS[mode]) mode = '';

const bestKey = () => BEST_KEY + (mode ? '.' + mode : '');

function loadBest() {
  try { best = Number(localStorage.getItem(bestKey())) || 0; } catch (e) { best = 0; }
}

function saveBest() {
  try { localStorage.setItem(bestKey(), String(best)); } catch (e) {}
}

function paintScore() {
  $('score').innerHTML = '연속 <b>' + streak + '</b> · 최고 ' + best;
}

/** 0에서 목표값까지 올라가는 카운트업. ease-out 으로 끝을 부드럽게 눌러준다. */
function countUp(el, to, ms) {
  const t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  }
  el.textContent = '0';
  requestAnimationFrame(step);
}

function renderBoard(animL, animR) {
  $('paneL').className = 'pane' + (animL ? ' ' + animL : '');
  $('paneL').innerHTML = paneHTML(left, true);
  $('paneR').className = 'pane' + (animR ? ' ' + animR : '');
  $('paneR').innerHTML = paneHTML(right, false, CHOICE);
  bindChoice();
}

function bindChoice() {
  const box = $('choice');
  if (!box) return;
  box.querySelectorAll('button').forEach(b => {
    b.onclick = () => answer(b.dataset.v);
  });
}

function setPrompt(label, labelClass, text) {
  $('pLabel').textContent = label;
  $('pLabel').className = 'kicker' + (labelClass ? ' ' + labelClass : '');
  $('pText').textContent = text;
  $('pText').classList.remove('hidden');
  $('pBig').classList.add('hidden');
  $('pMeta').classList.add('hidden');
  $('again').classList.add('hidden');
}

function askPrompt() {
  setPrompt('Round ' + round, '', '오른쪽 영화의 로튼 지수는?');
}

function answer(v) {
  if (locked) return;
  locked = true;
  // 판정이 끝난 뒤에도 버튼이 남아 있으면 연타로 상태가 꼬인다.
  $('choice').querySelectorAll('button').forEach(b => { b.disabled = true; });

  // 동점은 정답. 로튼 지수는 정수라 동점이 흔한데, 여기서 죽으면 억울하다.
  const ok = right.s === left.s || (v === 'hi' ? right.s > left.s : right.s < left.s);

  // 가려둔 '?' 를 숫자로 바꾸고 0부터 올린다.
  const pct = $('paneR').querySelector('.pct');
  pct.className = 'pct';
  pct.innerHTML = '<b>0</b><em>%</em>';
  countUp(pct.querySelector('b'), right.s, 320);

  if (ok) {
    streak++;
    if (streak > best) { best = streak; saveBest(); }
    paintScore();
    setPrompt(
      right.s === left.s ? '동점 · 정답' : '정답',
      'win',
      right.s + '% · ' + (right.s === left.s ? '같습니다' : right.s > left.s ? '더 높습니다' : '더 낮습니다')
    );
    setTimeout(advance, 820);
  } else {
    gameOver();
  }
}

/** 오른쪽이 왼쪽 자리로 밀려오고 새 영화가 오른쪽에 선다. */
function advance() {
  $('paneL').classList.add('leaving');
  setTimeout(() => {
    left = right;
    right = draw();
    round++;
    renderBoard('came', 'fresh');
    askPrompt();
    locked = false;
  }, 220);
}

function gameOver() {
  const result = round - 1;   // 이번 판에 몇 번 연속으로 맞혔나
  streak = 0;
  paintScore();
  // 못 누르는 버튼을 남겨두면 '다시 하기' 를 못 찾고 저기를 누른다.
  const c = $('choice');
  if (c) c.remove();
  $('pLabel').textContent = 'Game Over';
  $('pLabel').className = 'kicker bad';
  $('pText').classList.add('hidden');
  $('pBig').classList.remove('hidden');
  $('pBig').innerHTML = result + '<em>연속</em>';
  $('pMeta').classList.remove('hidden');
  $('pMeta').textContent =
    left.t + ' ' + left.s + '%  ·  ' + right.t + ' ' + right.s + '%  ·  최고 기록 ' + best;
  $('again').classList.remove('hidden');

  // 이번 판 기록을 랭킹에 올릴 수 있게 연다. 0연속이면 입력칸은 열리지 않는다.
  RANK.offer(result, mode);
}

function start() {
  recent = [];
  streak = 0;
  round = 1;
  locked = false;
  left = draw();
  right = draw();
  paintScore();
  renderBoard('fresh', 'fresh');
  askPrompt();
}

/** 난이도 버튼. 바꾸면 진행 중인 판은 버리고 새로 시작한다. */
function paintModes() {
  document.querySelectorAll('#modes button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === mode);
  });
  $('modeCnt').textContent = MOVIES.length.toLocaleString() + '편';
}

document.querySelectorAll('#modes button').forEach(b => {
  b.onclick = () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    usePool(mode);
    loadBest();
    paintModes();
    // 못 누르는 선택지가 남아 있으면 새 판에서 두 번 그려진다.
    const c = $('choice');
    if (c) c.remove();
    $('again').classList.add('hidden');
    $('pBig').classList.add('hidden');
    $('pMeta').classList.add('hidden');
    $('pText').classList.remove('hidden');
    RANK.setMode(mode);
    start();
  };
});

$('again').onclick = start;

usePool(mode);
loadBest();
paintModes();
start();
RANK.setMode(mode);
</script>
</body>
</html>`

await writeFile(OUT_PATH, html, "utf8")

const dropTotal = Object.values(dropped).reduce((a, b) => a + b, 0)

console.log(`\n하이로우 플레이 페이지 생성 (${source === "fixture" ? "픽스처" : "실데이터"})`)
console.log(`  입력 ${rows.length}편 → 플레이 가능 ${movies.length}편`)
// 카탈로그에서 이미 걸러지므로 여기가 0 이 아니면 병합 쪽을 봐야 한다.
if (dropTotal) {
  console.log(`\n  제외 ${dropTotal}편 (병합 단계에서 샌 것)`)
  console.log(`    지수 없음   ${dropped.tomatometer}`)
  console.log(`    포스터 없음  ${dropped.poster}`)
  console.log(`    중복       ${dropped.duplicate}`)
}
console.log(`\n  제목 표기`)
console.log(`    한국어 제목  ${movies.length - englishTitles}편`)
console.log(
  `    원제 그대로  ${englishTitles}편` +
    (movies.length ? ` (${Math.round((englishTitles / movies.length) * 100)}%)` : "")
)
console.log(`\n  저장: ${OUT_PATH}\n`)
