import { readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { themeCSS, siteHeaderHTML } from "./play-theme.mjs"
import { navCSS, navHTML, navScript } from "./play-nav.mjs"
import { CASTING, cleanCasting, encodeCasting, decodeCasting } from "./casting-data.mjs"
import { castingApp } from "./casting-app.mjs"

export async function buildCastingPage() {
  const { quizzes } = JSON.parse(await readFile("data/quizzes.json", "utf8"))
  const { movies } = JSON.parse(await readFile("data/hollywood-catalog.json", "utf8"))
  const catalog = new Map()
  for (const quiz of quizzes) {
    for (const actor of quiz.candidates ?? quiz.hints ?? []) {
      if (!actor.peopleCd || !actor.name) continue
      const id = String(actor.peopleCd)
      if (!catalog.has(id)) catalog.set(id, { id, name: actor.name, nameEn: actor.nameEn || "", image: actor.imageUrl || "", works: [] })
      const entry = catalog.get(id)
      if (!entry.image && actor.imageUrl) entry.image = actor.imageUrl
      if (!entry.works.some((work) => work.title === quiz.title)) entry.works.push({ title: quiz.title, billing: actor.billing || 20, audience: quiz.audiAcc || 0 })
    }
  }
  const actors = [...catalog.values()].sort((a, b) => b.works.filter((w) => w.billing <= 5).length - a.works.filter((w) => w.billing <= 5).length || b.works.length - a.works.length || a.name.localeCompare(b.name, "ko"))
    .map(({ works, ...actor }) => ({ ...actor, credits: works.sort((a, b) => a.billing - b.billing || b.audience - a.audience).slice(0, 2).map((work) => work.title) }))
  const originals = movies.flatMap((movie) => movie.actors ?? [])
  const project = {
    ...CASTING,
    roles: CASTING.roles.map((role) => {
      const original = originals.find((actor) => actor.name === role.original && actor.imageUrl)
      return { ...role, image: original?.imageUrlLarge || original?.imageUrl || "", picks: role.picks.filter((id) => catalog.has(id)) }
    }),
  }
  for (const role of project.roles) {
    if (role.picks.length < 4) throw new Error(`Not enough casting candidates for ${role.name}`)
  }
  const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c")
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>한국판 어벤져스 가상 캐스팅 · 누룽지 극장</title>
<meta name="description" content="아이언맨이 한국 배우라면? 8개 배역의 배우를 직접 고르고 나만의 한국판 어벤져스 캐스팅을 친구에게 공유하세요.">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${themeCSS}
${navCSS}
  [hidden] { display: none !important; }
  button { cursor: pointer; color: inherit; }
  button:disabled { cursor: default; }
  .casting-main { max-width: 1240px; padding: 36px 32px 64px; margin: auto; }
  .casting-intro { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 28px; }
  .eyebrow { font-size: 12px; letter-spacing: .12em; font-weight: 750; margin: 0 0 10px; }
  h1 { font-size: clamp(30px, 4vw, 44px); line-height: 1.2; letter-spacing: -.05em; margin: 0 0 12px; }
  .intro-copy { margin: 0; color: #626262; font-size: 15px; }
  .edition { flex-shrink: 0; border: 1px solid #ccc; padding: 9px 14px; font-size: 12px; font-weight: 650; }
  .board-label { border-top: 2px solid #171717; padding: 15px 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .board-label h2 { margin: 0; font-size: 16px; }
  .board-progress { display: flex; gap: 10px; align-items: center; font-size: 12px; font-weight: 700; }
  progress { width: 80px; height: 4px; border: 0; background: #e8e8e8; }
  progress::-webkit-progress-bar { background: #e8e8e8; }
  progress::-webkit-progress-value { background: #171717; }
  progress::-moz-progress-bar { background: #171717; }
  .role-board { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 10px; }
  .role-slot { min-width: 0; text-align: left; padding: 0 0 10px; background: #fff; border: 1px solid #ddd; transition: border-color .15s; }
  .role-slot.active { border: 2px solid #171717; }
  .role-slot:hover { border-color: #171717; }
  .portrait { display: block; position: relative; overflow: hidden; background: #ededeb; }
  .portrait img { position: absolute; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; top: 0; left: 0; }
  .photo-fallback { display: grid; place-items: center; position: absolute; inset: 0; color: #888; font-size: 32px; font-weight: 700; }
  .role-slot .portrait, .empty-slot { aspect-ratio: 1.2; margin: 0 0 9px; }
  .empty-slot { background: #f5f5f3; padding: 9px; display: flex; justify-content: space-between; align-items: start; font-size: 11px; font-weight: 700; color: #888; }
  .empty-slot > span { align-self: center; margin: auto; font-size: 32px; font-weight: 300; color: #b7b7b7; padding-right: 12px; }
  .role-slot .slot-role { display: block; padding: 0 8px; font-size: 11px; color: #626262; }
  .role-slot strong { display: block; padding: 1px 8px 0; font-size: 13px; line-height: 1.5; }
  .role-slot:not(.filled) strong { color: #888; font-size: 11px; font-weight: 500; }
  .casting-editor { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 36px; margin-top: 34px; align-items: start; scroll-margin-top: 20px; }
  .role-detail { border-top: 2px solid #171717; background: #f5f5f3; padding: 22px; }
  .role-detail h2 { margin: 10px 0 0; font-size: 30px; line-height: 1.2; letter-spacing: -.05em; }
  .role-person { margin: 7px 0 0; color: #626262; font-size: 13px; }
  .role-cue { margin: 18px 0 22px; line-height: 1.7; font-size: 14px; }
  .original-actor, .chosen-actor { display: flex; gap: 12px; align-items: center; }
  .original-photo, .chosen-photo { width: 64px; height: 82px; flex-shrink: 0; }
  .original-actor small, .chosen-actor small { display: block; font-size: 11px; color: #626262; }
  .original-actor strong, .chosen-actor strong { display: block; font-size: 14px; line-height: 1.5; }
  .chosen-actor { padding-top: 18px; margin-top: 18px; border-top: 1px solid #d6d6d6; }
  .selection-empty { font-size: 13px; color: #626262; }
  .text-button { border: 0; border-bottom: 1px solid #a6a6a6; background: none; padding: 3px 0; font-size: 12px; }
  #clear-role { margin-top: 10px; }
  .role-controls { display: flex; margin-top: 22px; gap: 8px; }
  .role-controls button { min-height: 44px; border: 1px solid #bcbcbc; background: #fff; padding: 7px 12px; font-size: 13px; }
  .role-controls button:last-child { flex: 1; background: #171717; color: #fff; border-color: #171717; }
  .role-controls button:disabled { opacity: .4; }
  .candidates h3 { margin: 0; font-size: 23px; letter-spacing: -.035em; line-height: 1.4; }
  .search-field { margin: 16px 0 9px; }
  .search-field label { display: block; font-size: 12px; font-weight: 650; margin-bottom: 6px; }
  .search-field input { width: 100%; min-height: 48px; border: 1px solid #aaa; padding: 10px 14px; border-radius: 0; font-size: 16px; color: #171717; background: #fff; }
  .candidate-count { min-height: 21px; font-size: 12px; color: #626262; margin: 0 0 14px; }
  .candidate-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .actor-card { min-width: 0; position: relative; border: 1px solid #ddd; padding: 0; background: #fff; text-align: left; }
  .actor-card:hover { border-color: #171717; }
  .actor-card.selected { border-color: #171717; box-shadow: 0 0 0 1px #171717; }
  .actor-card > .portrait { height: 178px; }
  .actor-card > .portrait img { object-fit: contain; object-position: center; }
  .actor-info { padding: 11px 12px; display: block; }
  .actor-info strong { font-size: 17px; line-height: 1.4; display: block; }
  .actor-credit { font-size: 11px; color: #626262; display: block; line-height: 1.5; margin-top: 4px; min-height: 33px; }
  .pick-label { display: block; border-top: 1px solid #e8e8e8; padding-top: 8px; margin-top: 8px; font-size: 12px; font-weight: 700; }
  .selected .pick-label { background: #171717; color: #fff; margin: 8px -12px -11px; padding: 8px 12px; }
  .actor-card:disabled { opacity: .5; }
  .actor-card:disabled .portrait img { filter: grayscale(1); }
  .no-results { padding: 28px 18px; background: #f5f5f3; font-size: 14px; line-height: 1.8; }
  .browse-actions { display: flex; gap: 12px; justify-content: center; margin-top: 20px; }
  .btn { display: inline-flex; justify-content: center; align-items: center; min-height: 48px; background: #171717; color: #fff; border: 1px solid #171717; padding: 10px 20px; font-size: 14px; font-weight: 700; text-decoration: none; }
  .btn:hover { background: #333; }
  .btn.secondary { background: #fff; color: #171717; border-color: #bbb; }
  .btn.secondary:hover { background: #f5f5f3; }
  .btn:disabled { opacity: .4; }
  .editor-actions { margin-top: 32px; display: flex; justify-content: flex-end; }
  .result-header { margin: 30px 0 24px; }
  .result-header h2 { margin: 0; font-size: 32px; letter-spacing: -.04em; }
  .result-header p { color: #626262; font-size: 14px; margin: 8px 0 0; }
  .result-board { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
  .result-board .role-slot { padding-bottom: 15px; }
  .result-board .portrait, .result-board .empty-slot { aspect-ratio: 1; }
  .result-board .slot-role { font-size: 13px; padding: 0 14px; }
  .result-board strong { font-size: 22px; padding: 1px 14px; }
  .result-actions { display: flex; gap: 10px; justify-content: center; margin: 28px 0 0; }
  .share-panel { border: 1px solid #ccc; padding: 18px; margin: 22px 0 0; background: #f5f5f3; }
  .share-panel p, .share-panel label { font-size: 13px; }
  .share-panel input { width: 100%; min-height: 44px; font-size: 14px; padding: 8px 10px; border: 1px solid #aaa; background: #fff; }
  .announcement { margin: 18px 0 0; font-size: 14px; font-weight: 650; }
  .save-note { font-size: 12px; color: #626262; margin: 12px 0 0; }
  .casting-foot { border-top: 1px solid #ddd; margin-top: 30px; padding-top: 20px; color: #626262; font-size: 12px; line-height: 1.8; }
  .casting-foot p { margin: 3px 0; }
  @media (max-width: 900px) {
    .casting-editor { grid-template-columns: 220px minmax(0, 1fr); gap: 22px; }
    .candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .role-board:not(.result-board) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .role-board:not(.result-board) .portrait, .role-board:not(.result-board) .empty-slot { aspect-ratio: 2; }
    .role-detail { padding: 18px; }
  }
  @media (max-width: 600px) {
    .casting-main { padding: 26px 20px 100px; }
    .casting-intro { flex-direction: column; align-items: start; gap: 14px; margin-bottom: 24px; }
    .intro-copy { font-size: 14px; }
    .edition { font-size: 11px; padding: 5px 9px; }
    .role-board { gap: 6px; }
    .role-slot .slot-role { padding: 0 5px; font-size: 10px; }
    .role-slot strong { padding: 2px 5px 0; font-size: 12px; }
    .role-slot:not(.filled) strong { font-size: 10px; }
    .role-board:not(.result-board) .portrait, .role-board:not(.result-board) .empty-slot { aspect-ratio: 1.25; }
    .empty-slot { padding: 6px; }
    .board-progress { font-size: 11px; }
    progress { width: 40px; }
    .casting-editor { grid-template-columns: 1fr; gap: 24px; margin-top: 24px; }
    .role-detail { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; padding: 18px; }
    .role-summary, .role-controls { grid-column: 1 / -1; }
    .role-detail h2 { font-size: 28px; }
    .role-cue { margin: 12px 0 18px; }
    .original-photo, .chosen-photo { width: 42px; height: 58px; }
    .original-actor, .chosen-actor { gap: 8px; }
    .original-actor strong, .chosen-actor strong { font-size: 12px; }
    .chosen-actor { border: 0; padding: 0; margin: 0; }
    .selection-empty { font-size: 12px; }
    #clear-role { grid-column: 2; justify-self: start; }
    .role-controls { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; z-index: 10; padding: 12px 20px max(12px, env(safe-area-inset-bottom)); background: #fff; border-top: 1px solid #ddd; }
    .candidates h3 { font-size: 22px; }
    .actor-card > .portrait { height: 170px; }
    .actor-info { padding: 10px; }
    .actor-info strong { font-size: 16px; }
    .selected .pick-label { margin-inline: -10px; margin-bottom: -10px; padding-inline: 10px; }
    .result-board { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .result-board strong { font-size: 20px; }
    .result-board .slot-role { font-size: 12px; }
    .editor-actions .btn { width: 100%; }
    .result-actions .btn { flex: 1; padding: 10px; }
    .browse-actions .btn { width: 100%; }
  }
</style>
</head>
<body>
${siteHeaderHTML}
<div class="game-navigation">${navHTML("casting")}</div>
<main class="casting-main" id="main" tabindex="-1">
  <header class="casting-intro">
    <div><p class="eyebrow">THE CASTING ROOM</p><h1>어벤져스, 한국에서 만든다면?</h1><p class="intro-copy">아이언맨부터 로키까지. 8개의 배역, 캐스팅은 당신의 취향대로.</p></div>
    <span class="edition">01 · THE AVENGERS (2012)</span>
  </header>
  <div class="board-label"><h2>나의 캐스팅 보드</h2><div class="board-progress"><span id="progress-label">0 / 8 캐스팅</span><progress id="casting-progress" value="0" max="8" aria-label="캐스팅 진행률"></progress></div></div>
  <div class="result-header" id="result-header" hidden><p class="eyebrow">MY DREAM CAST</p><h2 id="result-title" tabindex="-1">나의 한국판 어벤져스</h2><p id="result-note"></p></div>
  <div class="role-board" id="role-board" role="group" aria-label="배역 선택"></div>
  <section class="casting-editor" id="casting-editor" aria-label="배우 캐스팅">
    <aside class="role-detail" aria-labelledby="role-name">
      <div class="role-summary"><p class="eyebrow" id="role-number"></p><h2 id="role-name" tabindex="-1"></h2><p class="role-person" id="role-person"></p><p class="role-cue" id="role-cue"></p></div>
      <div class="original-actor" id="original-actor"></div>
      <div class="chosen-actor" id="chosen-actor"></div>
      <button class="text-button" id="clear-role" type="button" hidden>선택 취소</button>
      <div class="role-controls"><button type="button" id="previous">← 이전</button><button type="button" id="next">다음 배역 →</button></div>
    </aside>
    <div class="candidates">
      <h3 id="candidate-title"></h3>
      <div class="search-field"><label for="actor-search">배우 이름으로 찾기</label><input type="search" id="actor-search" placeholder="예: 이병헌, 김혜수" autocomplete="off" aria-controls="candidate-grid" aria-describedby="candidate-count"></div>
      <p class="candidate-count" id="candidate-count" role="status"></p>
      <div class="candidate-grid" id="candidate-grid" role="group" aria-label="배우 후보"></div>
      <div class="no-results" id="no-results" hidden>찾는 배우가 아직 없어요.<br>이름을 확인하거나 다른 배우를 검색해 주세요.</div>
      <div class="browse-actions"><button class="btn secondary" type="button" id="browse-all">전체 배우 둘러보기</button><button class="btn secondary" type="button" id="show-more" hidden>배우 더 보기</button></div>
    </div>
  </section>
  <p class="announcement" id="announcement" role="status" aria-live="polite"></p>
  <div class="editor-actions" id="editor-actions"><button class="btn" id="finish" type="button">내 캐스팅 보기</button></div>
  <div class="result-actions" id="result-actions" hidden><button class="btn secondary" id="edit" type="button">캐스팅 편집</button><button class="btn" id="share" type="button" disabled>공유 링크 복사</button></div>
  <div class="share-panel" id="share-panel" hidden><p id="share-status" role="status"></p><label for="share-url">내 캐스팅 공유 링크</label><input id="share-url" type="url" readonly></div>
  <p class="save-note" id="save-note">선택 내용은 이 브라우저에 자동 저장됩니다.</p>
  <footer class="casting-foot"><p>영화 팬이 상상하는 가상 캐스팅입니다. 실제 제작·출연 소식과 관계없습니다.</p><p>배우 사진·출연작: 영화진흥위원회(KOBIS), Rotten Tomatoes · <a href="${CASTING.source}" target="_blank" rel="noopener noreferrer">원작 배역 정보</a></p></footer>
  <noscript><p>가상 캐스팅을 플레이하려면 브라우저에서 자바스크립트를 켜 주세요.</p></noscript>
</main>
<script>
${navScript}
${cleanCasting.toString()}
${encodeCasting.toString()}
${decodeCasting.toString()}
(${castingApp.toString()})(${json(project)}, ${json(actors)});
</script>
</body>
</html>`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile("data/casting-play.html", await buildCastingPage(), "utf8")
  console.log("Built data/casting-play.html")
}
