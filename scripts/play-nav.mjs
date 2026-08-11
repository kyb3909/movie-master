/**
 * 게임 페이지 공용 메뉴바
 *
 * 세 게임(한국 영화 · 헐리우드 · 로튼 하이로우)이 서로 오갈 수 있어야 한다.
 * 랜딩에서 들어온 뒤에는 뒤로가기 말고는 나갈 길이 없었다.
 *
 * --- 왜 링크를 런타임에 정하나 ---
 * 같은 HTML 파일이 두 곳에서 열린다.
 *   로컬 검수:  data/quiz-play.html        (파일 이름 그대로)
 *   배포:       /quiz                       (build-static-deploy 가 이름을 바꾸고 cleanUrls 로 확장자를 뗀다)
 * 빌드 시점에 한쪽으로 박으면 다른 쪽에서 링크가 죽는다. 그래서 주소로 판별해 붙인다.
 */

/** 메뉴에 걸 게임들. slug 는 배포 경로, local 은 검수용 파일 이름이다. */
export const NAV_ITEMS = [
  { slug: "quiz", local: "quiz-play.html", name: "한국 영화" },
  { slug: "hollywood", local: "hollywood-quiz-play.html", name: "헐리우드" },
  { slug: "highlow", local: "highlow-play.html", name: "로튼 하이로우" },
]

/** 마스트헤드 바로 아래에 들어가는 마크업. active 는 현재 페이지의 slug. */
export const navHTML = (active) =>
  `  <nav class="nav" id="nav">
    <a class="home" data-nav="home">누룽지 극장</a>
${NAV_ITEMS.map(
  (it) =>
    `    <a class="${it.slug === active ? "on" : ""}" data-nav="${it.slug}">${it.name}</a>`
).join("\n")}
  </nav>`

/** 게임 페이지들이 쓰는 shadcn 토큰에 맞춘 스타일. 토큰 이름은 각 페이지의 :root 와 같다. */
export const navCSS = `
  /* ── 메뉴바 ──────────────────────────────────────────────── */
  .nav {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    margin: 0 0 4px; padding: 8px 0 0;
  }
  .nav a {
    padding: 5px 10px; border-radius: var(--radius);
    font-size: 12.5px; font-weight: 500; color: var(--muted-foreground);
    text-decoration: none; cursor: pointer; white-space: nowrap;
    transition: color .15s, background .15s;
  }
  .nav a:hover { color: var(--foreground); background: var(--muted); }
  .nav a.on { color: var(--foreground); font-weight: 600; background: var(--muted); }
  .nav .home {
    margin-right: auto; padding-left: 0; font-weight: 700; letter-spacing: -0.01em;
  }
  .nav .home:hover { background: transparent; }`

/**
 * 링크를 실제 주소로 바꾼다.
 * 로컬 검수본은 파일 이름이 '-play.html' 로 끝나므로 그것으로 판별한다.
 * 배포본에서는 랜딩(/)도 존재하지만 로컬에는 없어서 홈 링크를 감춘다.
 */
export const navScript = `
(function () {
  var ITEMS = ${JSON.stringify(Object.fromEntries(NAV_ITEMS.map((i) => [i.slug, i.local])))};
  var local = /-play\\.html$/.test(location.pathname);
  document.querySelectorAll('#nav a').forEach(function (a) {
    var key = a.dataset.nav;
    if (key === 'home') {
      if (local) { a.style.display = 'none'; return; }
      a.href = '/';
      return;
    }
    a.href = local ? ITEMS[key] : '/' + key;
  });
})();`
