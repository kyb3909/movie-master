/**
 * 퀴즈 검수용 미리보기 페이지 생성
 *
 * data/quizzes.json 을 읽어 단일 HTML 파일을 만든다.
 * 브라우저로 열어 힌트 사진이 실제로 그 배우가 맞는지 눈으로 확인하는 용도다.
 *
 * 실행:
 *   node scripts/build-quiz-preview.mjs
 *   → data/quiz-preview.html 을 브라우저에서 열기
 *
 * 사진은 KOBIS 서버에서 직접 불러온다.
 *
 * 사진 출처는 KOBIS 인물 상세다. peopleCd 로 직접 조회하므로 동명이인이
 * 섞이지 않는다. 이 페이지는 사진 자체가 제대로 붙었는지 확인하는 용도다.
 */

import { readFile, writeFile } from "node:fs/promises"

const data = JSON.parse(await readFile("data/quizzes.json", "utf8"))
const quizzes = data.quizzes

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const stats = {
  quizzes: quizzes.length,
  hints: quizzes.reduce((n, q) => n + q.hints.length, 0),
}

const cards = quizzes
  .map((q, qi) => {
    const hints = q.hints
      .map(
        (h) => `
        <figure class="hint">
          <span class="ord">${h.hintOrder}</span>
          <img src="${esc(h.imageUrl)}" alt="${esc(h.name)}" loading="lazy"
               onerror="this.closest('.hint').classList.add('broken')">
          <figcaption>
            <b>${esc(h.name)}</b>
            <span class="ch">${esc(h.character || "—")}</span>
            <span class="meta">비중 ${h.billing}위</span>
          </figcaption>
        </figure>`
      )
      .join("")

    return `
    <section class="quiz" data-i="${qi}">
      <header>
        <h2>${esc(q.title)}</h2>
        <span class="sub">${esc(q.releaseDate || "")} · ${(q.audiAcc ?? 0).toLocaleString()}명 · ${q.boxYear}년 ${q.boxRank}위</span>
      </header>
      <div class="hints">${hints}</div>
    </section>`
  })
  .join("")

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>영화 퀴즈 검수 — ${stats.quizzes}편</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --line: #262b36;
    --fg: #e6e8ee; --dim: #8b93a7; --ok: #3ddc97; --warn: #ffb454; --bad: #ff6b6b;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --panel:#fff; --line:#e2e5ea; --fg:#171a21; --dim:#6b7280; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font: 15px/1.5 -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .lede { color: var(--dim); font-size: 13px; margin: 0 0 16px; }
  .bar { position: sticky; top: 0; z-index: 5; background: var(--bg);
    padding: 12px 0; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
  .bar label { font-size: 13px; color: var(--dim); margin-right: 14px; cursor: pointer; }
  .quiz { background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  .quiz header { display: flex; align-items: baseline; gap: 10px;
    flex-wrap: wrap; margin-bottom: 12px; }
  .quiz h2 { font-size: 17px; margin: 0; }
  .sub { color: var(--dim); font-size: 12px; }
  .hints { display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); }
  .hint { margin: 0; position: relative; background: var(--bg);
    border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .hint img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; background: var(--line); }
  .hint figcaption { padding: 6px 8px 8px; font-size: 12px; }
  .hint b { display: block; }
  .ch { display: block; color: var(--dim); font-size: 11px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: block; color: var(--dim); font-size: 10px; margin-top: 2px; }
  .ord { position: absolute; top: 6px; left: 6px; z-index: 1;
    background: rgba(0,0,0,.7); color: #fff; font-size: 11px;
    width: 20px; height: 20px; border-radius: 50%;
    display: grid; place-items: center; }
  .hint.broken { outline: 2px solid var(--bad); }
  .hint.broken img { min-height: 100px; }
  body.hide-answer .quiz h2 { filter: blur(6px); }
  body.hide-answer .quiz h2:hover { filter: none; }
</style>
</head>
<body>
<div class="wrap">
  <h1>영화 퀴즈 검수</h1>
  <p class="lede">
    힌트 1 = 비중 낮은 조연 → 힌트 7 = 주연.
    퀴즈 ${stats.quizzes}편 · 힌트 ${stats.hints}개.
    사진은 KOBIS 인물 상세를 <b>peopleCd 로 직접 조회</b>한 것이라
    동명이인이 섞일 수 없습니다.
  </p>
  <div class="bar">
    <label><input type="checkbox" id="f2"> 정답 가리기</label>
  </div>
  ${cards}
</div>
<script>
  f2.onchange = e => document.body.classList.toggle('hide-answer', e.target.checked);
</script>
</body>
</html>`

await writeFile("data/quiz-preview.html", html, "utf8")

console.log(`\n검수 페이지 생성`)
console.log(`  퀴즈 ${stats.quizzes}편 · 힌트 ${stats.hints}개`)
console.log(`  저장: data/quiz-preview.html\n`)
