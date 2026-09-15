/** Shared visual tokens for the standalone theatre and its four games. */
export const themeCSS = `
  :root {
    color-scheme: light;
    --background: #fff;
    --foreground: #171717;
    --card: #fff;
    --muted: #f4f4f4;
    --muted-foreground: #626262;
    --primary: #171717;
    --primary-foreground: #fff;
    --border: #dedede;
    --ring: #2456d6;
    --destructive: #bd2929;
    --success: #187044;
    --radius: 0px;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-padding-top: 20px; }
  body {
    margin: 0; background: var(--background); color: var(--foreground);
    font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
      "Segoe UI", "Malgun Gothic", sans-serif;
    font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased;
    word-break: keep-all; overflow-wrap: anywhere;
  }
  button, input { font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  a { color: inherit; }
  a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible {
    outline: 3px solid var(--ring); outline-offset: 4px;
  }
  ::selection { background: #171717; color: #fff; }
  .site-header { background: #111; color: #fff; }
  .header-inner { max-width: 1328px; min-height: 86px; margin: auto; padding: 16px 32px;
    display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  .site-logo { font-size: 30px; font-weight: 900; letter-spacing: -.065em;
    line-height: 1.2; text-decoration: none; white-space: nowrap; }
  .site-tagline { color: #c4c4c4; font-size: 12px; font-weight: 600; letter-spacing: .12em; }
  .skip-link { position: fixed; left: 16px; top: -100px; padding: 12px 18px;
    z-index: 100; background: #fff; color: #111; }
  .skip-link:focus { top: 16px; }
  .hidden { display: none; }
  @media (max-width: 600px) {
    .header-inner { min-height: 72px; padding: 16px 20px; }
    .site-logo { font-size: 26px; }
    .site-tagline { max-width: 95px; text-align: right; font-size: 10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
`

export const siteHeaderHTML = `
  <a class="skip-link" href="#main">본문으로 건너뛰기</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="site-logo" href="/" data-nav="home" aria-label="누룽지 극장 홈">누룽지 극장</a>
      <span class="site-tagline">CINEMA PLAY CLUB</span>
    </div>
  </header>`

/** Loaded last so game-specific layout remains intact while controls share a scale. */
export const gameThemeCSS = `
  .wrap { max-width: 1040px; margin: 0 auto; padding: 32px 32px 64px; }
  .masthead { display: flex; align-items: center; justify-content: space-between; gap: 20px;
    padding: 0 0 22px; border-bottom: 2px solid var(--foreground); }
  .brand { margin: 0; font-size: 30px; font-weight: 850; letter-spacing: -.045em; line-height: 1.3; }
  .score { flex-shrink: 0; background: var(--muted); padding: 10px 14px;
    color: var(--foreground); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .score b { font-size: 18px; font-weight: 800; }
  .kicker { font-size: 12px; font-weight: 700; letter-spacing: .08em; }
  .modes { gap: 8px; margin: 20px 0 0; }
  .modes .lab, .modes > span { font-size: 13px; letter-spacing: 0; }
  .modes .cnt { margin-left: auto; font-size: 13px; }
  .modes button { min-height: 44px; padding: 9px 18px; border-radius: 0; font-size: 14px; font-weight: 600; }
  .modes button:hover { border-color: var(--foreground); }
  .modes button.on { color: #fff; background: #171717; border-color: #171717; }
  .prompt { padding: 26px 0 24px; }
  .year, .prompt .big { font-weight: 800; letter-spacing: -.055em; }
  .year { font-size: 62px; }
  .ask { font-size: 25px; line-height: 1.4; }
  .game-quiz .prompt { display: grid; grid-template-columns: auto 1fr; column-gap: 30px; align-items: end; }
  .game-quiz .prompt .kicker { grid-column: 1; }
  .game-quiz .year { grid-column: 1; }
  .game-quiz .ask { grid-column: 2; grid-row: 2; margin: 0 0 5px; }
  .progress { gap: 20px; margin-bottom: 20px; }
  .track { height: 3px; }
  .steps { font-size: 13px; font-weight: 600; }
  .hints { gap: 16px; }
  .thumb { border-radius: 0; }
  .card.locked .thumb { background: #f4f4f4; border: 1px solid #e3e3e3; }
  .card.locked .slot { color: #707070; opacity: 1; font-size: 24px; font-weight: 400; }
  .cap { padding-top: 12px; }
  .idx { font-size: 11px; letter-spacing: .06em; }
  .nm { font-size: 17px; font-weight: 750; margin-top: 3px; }
  .card.locked .nm { color: #767676; }
  .ch { font-size: 13px; min-height: 21px; }
  .form { gap: 8px; }
  .form input, .rank .entry input { height: 50px; font-size: 16px; border-radius: 0; border-color: #bcbcbc; }
  .form input::placeholder { color: #6d6d6d; opacity: 1; }
  .btn, .rank .entry .btn { min-height: 48px; height: 50px; border-radius: 0;
    font-size: 15px; font-weight: 700; }
  .btn-ghost, .btn.ghost { color: var(--foreground); border-color: #c4c4c4; background: #fff; }
  .btn:not(:disabled):hover { background: #343434; color: #fff; opacity: 1; }
  .btn-ghost:not(:disabled):hover, .btn.ghost:not(:disabled):hover { background: var(--muted); color: var(--foreground); }
  .msg, .rmeta, .askedFor { font-size: 15px; line-height: 1.7; }
  .result, .summary { border-top: 2px solid #171717; padding-top: 24px; }
  .result h2 { font-size: 34px; font-weight: 800; }
  .slog li { padding: 13px 0; font-size: 15px; }
  .slog .n, .slog .p, .hist li { font-size: 13px; }
  .rank { padding-top: 22px; margin-top: 36px; }
  .rank .head > .kicker { font-size: 19px; letter-spacing: -.03em; font-weight: 800; }
  .rank .note, .rank .empty { font-size: 13px; }
  .rank li { padding: 13px 0; font-size: 15px; }
  .rank li .r { font-size: 14px; font-weight: 700; }
  .rank li .who { text-align: left; }
  .foot { margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--border);
    font-size: 13px; line-height: 1.8; }
  .game-grid .rule { padding: 16px 18px; border-left: 3px solid #171717;
    border-radius: 0; font-size: 15px; line-height: 1.8; }
  .game-grid .board { max-width: 760px; margin: 24px auto 0; }
  .game-grid .grid { border-spacing: 8px; }
  .game-grid .who img { max-width: 70px; border-radius: 0; margin-bottom: 8px; }
  .game-grid .who b { font-size: 14px; }
  .game-grid .cell { min-height: 104px; border-style: solid; border-color: #cecece;
    border-radius: 0; background: #f7f7f7; font-size: 15px; }
  .game-grid .cell:hover:not(:disabled) { border-color: #171717; background: #eee; }
  .game-grid .cell.done { border-color: var(--success); background: #eaf5ee; }
  .game-grid .cell.active { border-color: var(--ring); background: #f0f4ff; }
  .game-grid .answer { padding: 20px; border: 1px solid var(--border); background: #f7f7f7; }
  .game-grid .sugg li button { min-height: 44px; border-radius: 0; background: #fff; font-size: 14px; }
  .game-highlow .prompt h2 { font-size: 28px; line-height: 1.4; }
  .game-highlow .board { gap: 20px; }
  .game-highlow .pane { padding: 22px; background: #f5f5f5; }
  .game-highlow .poster { border-radius: 0; max-width: 180px; }
  .game-highlow .title { font-size: 20px; line-height: 1.4; font-weight: 800; }
  .game-highlow .meta { margin-top: 5px; font-size: 13px; white-space: normal; }
  .game-highlow .pct { font-size: 48px; font-weight: 800; }
  .game-highlow .pct.mask { color: #626262; opacity: 1; }
  .game-highlow .choice { grid-template-columns: 1fr 1fr; }
  .game-highlow .choice .btn { padding-inline: 10px; font-size: 14px; }
  .game-highlow .vs { font-size: 12px; font-weight: 800; }
  @media (min-width: 720px) {
    .game-highlow .board { grid-template-columns: 1fr 36px 1fr; }
    .game-highlow .info { min-height: 80px; }
  }
  @media (max-width: 719px) {
    .game-highlow .pane { grid-template-columns: 112px minmax(0, 1fr); padding: 16px; gap: 18px; }
    .game-highlow .choice { grid-template-columns: 1fr; }
    .game-highlow .pct { font-size: 36px; }
    .game-highlow .title { font-size: 18px; }
    .game-highlow .board { gap: 12px; }
    .game-highlow .prompt h2 { font-size: 24px; }
  }
  @media (max-width: 600px) {
    .wrap { padding: 24px 20px 48px; }
    .masthead { flex-wrap: wrap; gap: 12px; padding-bottom: 18px; }
    .brand { font-size: 26px; }
    .score { font-size: 13px; padding: 7px 10px; }
    .modes { margin-top: 16px; }
    .modes .cnt { flex-basis: 100%; margin-left: 0; }
    .modes button { padding-inline: 14px; }
    .game-quiz .prompt { column-gap: 20px; }
    .year { font-size: 46px; }
    .year em { font-size: 15px; margin-left: 4px; }
    .ask { font-size: 20px; }
    .hints { gap: 12px; }
    .nm { font-size: 15px; }
    .ch { font-size: 12px; }
    .form { flex-wrap: wrap; }
    .game-quiz .form input { flex-basis: 100%; }
    .game-quiz .form .btn { flex: 1; }
    .game-grid .rule { font-size: 14px; padding: 12px 14px; }
    .game-grid .grid { border-spacing: 4px; }
    .game-grid .who img { max-width: 50px; }
    .game-grid .who b { font-size: 12px; }
    .game-grid .cell { min-height: 78px; padding: 7px 4px; font-size: 12px; }
    .game-grid .answer { padding: 14px; }
    .game-grid .form input { flex-basis: 100%; }
    .game-grid .form .btn { flex: 1; }
    .rank .head { flex-wrap: wrap; }
    .rank .entry { flex-wrap: wrap; }
    .rank .entry input { width: 0; }
  }
  @media (max-width: 380px) {
    .game-highlow .pane { grid-template-columns: 90px minmax(0, 1fr); padding: 12px; gap: 12px; }
    .game-highlow .choice .btn { padding-inline: 6px; font-size: 13px; }
  }
`
