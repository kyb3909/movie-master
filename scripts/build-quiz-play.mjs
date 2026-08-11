/**
 * 플레이 가능한 퀴즈 페이지 생성
 *
 * 퀴즈 JSON 을 읽어 실제로 풀어볼 수 있는 단일 HTML 을 만든다.
 * 한국 영화 퀴즈와 헐리우드 배우 퀴즈가 같은 화면을 쓰므로,
 * 게임 로직·CSS·마크업은 하나로 두고 입출력과 문구만 플래그로 바꾼다.
 *
 * 실행:
 *   node scripts/build-quiz-play.mjs
 *   → data/quiz-play.html 을 브라우저에서 열기
 *
 *   node scripts/build-quiz-play.mjs \
 *     --in=data/hollywood-quizzes.json --out=data/hollywood-quiz-play.html \
 *     --title="헐리우드 영화 맞추기" --stat=gross
 *
 * --- 플래그 ---
 *   --in     입력 퀴즈 JSON            (기본 data/quizzes.json)
 *   --out    출력 HTML                 (기본 data/quiz-play.html)
 *   --title  마스트헤드·탭 제목        (기본 "영화 제목 맞추기")
 *   --stat   결과 화면에 붙는 흥행 지표 (audi = 누적 관객 · gross = 북미 흥행)
 *   --rounds 한 세션에 푸는 판 수       (기본 5)
 *
 * --- 게임 규칙 ---
 * 힌트 1(비중 낮은 조연)부터 하나씩 공개하고, 틀리면 다음 힌트를 연다.
 * 적게 열수록 점수가 높다. 힌트 개수는 quizzes.json 이 정한다.
 *
 * 5판을 한 세션으로 묶어 정산한다. 끝없이 이어지면 '오늘 몇 점이었나' 를 말할 수 없고,
 * 그만둘 지점도 각자 달라 기록끼리 견줄 수 없기 때문이다.
 * 세션 점수는 localStorage 에 최근 20판까지 남는다(브라우저 한정 · 서버 없음).
 * 개봉 연도는 처음부터 공개한다. 배우만으로는 너무 어렵다는 반응이 많았다.
 *
 * 배역명은 정답을 열기 전까지 숨긴다. '이순신' 같은 배역명이 뜨면
 * 배우를 볼 필요도 없이 영화가 특정되기 때문이다.
 *
 * --- 스타일 ---
 * 앱(app/globals.css)의 shadcn 토큰을 그대로 옮겨 색·라운드를 맞춘다.
 * React 없이 도는 단일 파일이라 컴포넌트 대신 CSS 로 Card/Button/Input 을 복제했다.
 * 토큰 값을 고칠 일이 생기면 globals.css 와 함께 고쳐야 한다.
 */

import { readFile, writeFile } from "node:fs/promises"
import { homeHTML, navCSS, navHTML, navScript } from "./play-nav.mjs"
import { rankCSS, rankHTML, rankScript } from "./play-rank.mjs"

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

const IN_PATH = String(flags.in || "data/quizzes.json")
const OUT_PATH = String(flags.out || "data/quiz-play.html")
const TITLE = String(flags.title || "영화 제목 맞추기")

/**
 * 결과 화면에 붙는 흥행 지표.
 * field = 퀴즈 JSON 에서 읽을 값 · expr = 그 값(cur.a)을 문장으로 만드는 식.
 *
 * 헐리우드에는 '관객수' 에 해당하는 값이 없어 북미 흥행(달러)을 쓴다.
 * 로튼 지수는 흥행 규모가 아니라 평가라서 '이 영화는 이만큼 흥행했다' 를 대신하지 못한다.
 */
const STATS = {
  audi: {
    field: "audiAcc",
    expr: `'누적 관객 ' + Math.round(cur.a / 10000).toLocaleString() + '만 명'`,
  },
  gross: {
    field: "gross",
    expr: `'북미 흥행 ' + (cur.a >= 1e8
      ? (cur.a / 1e8).toFixed(1) + '억 달러'
      : Math.round(cur.a / 1e4).toLocaleString() + '만 달러')`,
  },
}
const STAT = STATS[String(flags.stat || "audi")]
if (!STAT) {
  console.error(`알 수 없는 --stat 값입니다: ${flags.stat} (audi | gross)`)
  process.exit(1)
}

const data = JSON.parse(await readFile(IN_PATH, "utf8"))

/** 한 판에 보여줄 힌트 수. 생성된 기본 세트의 길이를 따른다. */
const HINT_COUNT = data.quizzes[0]?.hints.length ?? 5

/** 한 세션에 푸는 판 수. 이만큼 풀면 점수를 정산해 기록에 남긴다. */
const ROUNDS = Number(flags.rounds || 5)

/**
 * 기록 저장 키에 붙일 이름. 출력 파일 이름에서 딴다.
 * 한국 영화 퀴즈와 헐리우드 퀴즈가 같은 브라우저에서 서로의 기록을 덮어쓰면 안 된다.
 */
const SLUG = OUT_PATH.split(/[\\/]/).pop().replace(/\.html?$/i, "")

/** 랭킹·메뉴에서 이 페이지를 가리키는 이름. 배포 경로(/quiz · /hollywood)와 같다. */
const GAME = String(flags.game || (SLUG.startsWith("hollywood") ? "hollywood" : "quiz"))

// 페이지에 담을 최소 정보만 추린다.
// c = 후보 배우 전체(비중 오름차순, 0번이 주연). 5명 선택은 플레이할 때 한다.
const quizzes = data.quizzes.map((q) => ({
  t: q.title,
  // e = 원제. 헐리우드 영화는 원제로 입력하는 사람이 많아 이것도 정답으로 인정한다.
  // 한국 영화 퀴즈에는 없는 값이라 키 자체가 빠진다.
  e: q.titleEn,
  y: q.releaseDate?.slice(0, 4) ?? "",
  a: q[STAT.field] ?? 0,
  c: (q.candidates ?? q.hints).map((x) => ({
    n: x.name,
    ch: x.character ?? "",
    i: x.imageUrl,
    b: x.billing,
  })),
}))

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- KOBIS 이미지가 리퍼러를 보고 막는 경우가 있어 전역으로 끈다. -->
<meta name="referrer" content="no-referrer">
<title>${TITLE}</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  /* ── shadcn 토큰 (app/globals.css 와 동일한 값) ───────────────── */
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
  .brand { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { color: var(--muted-foreground); font-weight: 500; margin-left: 7px; }
  .score {
    font-size: 12px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; letter-spacing: 0.01em;
  }

  /* ── 문제 ────────────────────────────────────────────────── */
  .kicker {
    display: block; font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.16em; color: var(--muted-foreground);
    text-transform: uppercase;
  }
  .prompt { padding: 34px 0 26px; }
  .year {
    margin: 6px 0 0; font-size: 56px; font-weight: 300; line-height: 1;
    letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
  }
  .year em { font-style: normal; font-size: 18px; font-weight: 500; letter-spacing: -0.01em;
    color: var(--muted-foreground); margin-left: 8px; }
  .ask { margin: 14px 0 0; font-size: 21px; font-weight: 700; letter-spacing: -0.025em; }

  /* ── 진행 표시 ───────────────────────────────────────────── */
  .progress { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .track { flex: 1; height: 2px; background: var(--border); overflow: hidden; }
  .bar { height: 100%; width: 0; background: var(--foreground); transition: width .35s cubic-bezier(.4,0,.2,1); }
  .steps { font-size: 11.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums;
    white-space: nowrap; }

  /* ── 힌트 카드 ───────────────────────────────────────────── */
  /* 공개 전 자리도 미리 깔아둔다. 몇 장이 남았는지 눈에 보여야 판단이 선다. */
  .hints { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
  @media (min-width: 620px) { .hints { grid-template-columns: repeat(${HINT_COUNT}, 1fr); gap: 14px; } }

  /* figure 의 기본 여백(margin: 1em 40px)을 반드시 지운다.
     안 지우면 카드가 칸 밖으로 넘쳐 모바일에서 가로 스크롤이 생긴다. */
  .card { margin: 0; min-width: 0; }
  .thumb {
    position: relative; aspect-ratio: 3/4; overflow: hidden;
    border-radius: calc(var(--radius) - 2px);
    border: 1px solid var(--border); background: var(--muted);
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card.locked .thumb { background: transparent; border-style: dashed; }
  .card.locked .slot {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 12px; color: var(--muted-foreground); opacity: .45;
    font-variant-numeric: tabular-nums;
  }
  .card.fresh { animation: rise .3s cubic-bezier(.2,.7,.3,1); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }

  .cap { padding-top: 9px; }
  .idx { display: block; font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em;
    color: var(--muted-foreground); }
  .nm { display: block; margin-top: 1px; font-size: 13.5px; font-weight: 600;
    letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card.locked .nm { color: var(--border); }
  .ch { display: block; min-height: 17px; font-size: 11.5px; color: var(--muted-foreground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── 입력 (shadcn Input / Button) ────────────────────────── */
  .form { display: flex; gap: 8px; margin-top: 26px; }
  /* min-width:0 이 없으면 flex 항목이 내용 너비 아래로 줄지 않아 버튼을 밀어낸다. */
  .form input {
    flex: 1; min-width: 0; height: 46px; padding: 0 15px;
    font: inherit; font-size: 15px;
    color: var(--foreground); background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius);
    transition: border-color .15s, box-shadow .15s;
  }
  .form input::placeholder { color: var(--muted-foreground); opacity: .7; }
  .form input:focus {
    outline: none; border-color: var(--ring);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 22%, transparent);
  }
  .btn {
    height: 46px; padding: 0 20px; flex: 0 0 auto; white-space: nowrap; cursor: pointer;
    font: inherit; font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em;
    color: var(--primary-foreground); background: var(--primary);
    border: 1px solid transparent; border-radius: var(--radius);
    transition: opacity .15s, background .15s;
  }
  .btn:hover { opacity: .88; }
  .btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .btn-ghost { color: var(--muted-foreground); background: transparent; border-color: var(--border); }
  .btn-ghost:hover { background: var(--muted); opacity: 1; }

  .msg { min-height: 22px; margin: 12px 0 0; font-size: 13px; color: var(--muted-foreground); }
  .msg.bad { color: var(--destructive); }

  /* ── 결과 ────────────────────────────────────────────────── */
  .result { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--foreground); }
  .result .kicker.win { color: var(--success); }
  .result h2 { margin: 8px 0 0; font-size: 32px; font-weight: 700; letter-spacing: -0.035em;
    line-height: 1.2; }
  .rmeta { margin: 8px 0 20px; font-size: 13px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; }
  /* ── 세션 결과(5판 정산) ─────────────────────────────────── */
  .summary { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--foreground); }
  .summary .total { margin: 10px 0 0; letter-spacing: -0.04em; line-height: 1; }
  .summary .total b { font-size: 52px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .summary .total span { margin-left: 8px; font-size: 15px; font-weight: 500;
    color: var(--muted-foreground); }
  .summary .best { margin: 0 0 18px; font-size: 13px; font-weight: 600; color: var(--success); }

  /* 판별 요약. 어디서 점수를 흘렸는지 한눈에 보이게 한 줄씩 세운다. */
  .slog { list-style: none; margin: 0 0 24px; padding: 0; border-top: 1px solid var(--border); }
  .slog li { display: flex; align-items: center; gap: 10px; padding: 9px 0;
    border-bottom: 1px solid var(--border); font-size: 13px; }
  .slog .n { width: 18px; font-size: 11px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; }
  .slog .t { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; }
  .slog .p { font-size: 11.5px; color: var(--muted-foreground);
    font-variant-numeric: tabular-nums; }
  .slog li.lose .t { color: var(--muted-foreground); }
  .slog li.win .p { color: var(--success); }

  .hist { margin: 0 0 24px; }
  .hist ol { list-style: none; margin: 10px 0 0; padding: 0; }
  .hist li { display: flex; align-items: center; gap: 12px; padding: 6px 0;
    font-size: 12.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .hist li.now { color: var(--foreground); font-weight: 600; }
  .hist .d { width: 74px; }
  .hist .v { width: 54px; }

  .foot { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border);
    font-size: 11.5px; color: var(--muted-foreground); }
  .hidden { display: none; }
${navCSS}
${rankCSS}
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <h1 class="brand">${TITLE}<span>${homeHTML}</span></h1>
    <span class="score" id="score">1 / ${ROUNDS}판 · 0점</span>
  </header>
${navHTML(GAME)}

  <section class="prompt">
    <span class="kicker">개봉 연도</span>
    <p class="year" id="year">—</p>
    <p class="ask">이 배우들이 나온 영화는?</p>
  </section>

  <section class="progress">
    <div class="track"><div class="bar" id="bar"></div></div>
    <span class="steps" id="steps"></span>
  </section>

  <div class="hints" id="hints"></div>

  <form class="form" id="f">
    <input type="text" id="guess" placeholder="영화 제목을 입력하세요"
           autocomplete="off" autocapitalize="off" spellcheck="false">
    <button type="submit" class="btn">확인</button>
    <button type="button" class="btn btn-ghost" id="skip">포기</button>
  </form>
  <p class="msg" id="msg"></p>

  <section class="result hidden" id="result">
    <span class="kicker" id="rLabel">정답</span>
    <h2 id="rTitle"></h2>
    <p class="rmeta" id="rMeta"></p>
    <button class="btn" id="next">다음 문제</button>
  </section>

  <section class="summary hidden" id="summary">
    <span class="kicker">${ROUNDS}판 완료</span>
    <p class="total"><b id="sScore">0</b><span id="sMax"></span></p>
    <p class="rmeta" id="sLine"></p>
    <p class="best hidden" id="sBest">자기 최고 기록을 세웠습니다</p>

    <ol class="slog" id="sLog"></ol>

    <div class="hist hidden" id="sHist">
      <span class="kicker">지난 기록</span>
      <ol id="sHistList"></ol>
    </div>

    <button class="btn" id="again">다시 하기</button>
  </section>

${rankHTML("랭킹")}

  <footer class="foot">비중이 낮은 배우부터 공개됩니다. 힌트를 적게 볼수록 점수가 높습니다.
    ${ROUNDS}판을 풀면 점수가 이 브라우저에 기록됩니다.</footer>
</div>

<script>
const QUIZZES = ${JSON.stringify(quizzes)};
const HINT_COUNT = ${HINT_COUNT};
${navScript}
${rankScript({ game: GAME, unit: "점", localKey: `noorung-quiz-record:${SLUG}` })}

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');

/**
 * 정답 비교용 정규화.
 * 공백·문장부호를 없애 "겨울왕국 2" 와 "겨울왕국2" 를 같게 본다.
 * 숫자 앞의 '제' 도 뗀다. "제7광구" 를 틀렸다고 하면 억울하다.
 */
const norm = s => s.toLowerCase()
  .replace(/[\\s:·,.\\-–—!?'"()]/g, '')
  .replace(/^제(?=\\d)/, '');

/**
 * 한글 음절을 자모로 편다. '괴물' → 'ㄱㅚㅁㅜㄹ'
 * 이렇게 두면 한 글자 오타가 자모 1개 차이로 줄어 오타 허용 폭을 재기 쉬워진다.
 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function jamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) {
      out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)];
      const t = c % 28;
      if (t) out += JONG[t];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 편집거리(레벤슈타인). 제목은 길어야 수십 자라 비용은 신경 쓸 필요 없다. */
function dist(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 정답 길이에 비례해 오타를 봐준다. 짧은 제목까지 후하게 보면 아무거나 정답이 된다. */
const tolerance = len => (len <= 6 ? 1 : len <= 12 ? 2 : 3);

/**
 * 출제 목록에 있는 모든 제목.
 * 오타 허용을 켜면 '아저씨' 를 정답으로 두고 '아가씨' 라고 써도 통과해 버린다.
 * 다른 영화의 제목을 정확히 적었다면 오타가 아니라 다른 답을 낸 것이므로 오답 처리한다.
 */
const TITLES = new Set(QUIZZES.flatMap(q => [q.t, q.e]).filter(Boolean).map(norm));

/**
 * 정답 판정. 받아쓰기 시험이 아니므로 오타와 띄어쓰기는 눈감아 준다.
 *   "겨울왕국 2"      = "겨울왕국2"      (공백·문장부호 무시)
 *   "신과함께-인과 연" = "신과함께"        (부제 제거)
 *   "7광구"          = "제7광구"        (숫자 앞 '제' 제거)
 *   "괴물"           = "괴믈"           (자모 1개 차이)
 *
 * answers 는 정답으로 인정할 제목들이다. 한국 영화는 제목 하나,
 * 헐리우드 영화는 한국 개봉 제목과 원제 둘을 넘긴다. 원제도 같은 규칙을 타므로
 * "Pirates of the Caribbean: Dead Man's Chest" 는 앞부분만 적어도 통과한다.
 *
 * 비교 상대는 이번 판의 정답뿐이라 후하게 잡아도 다른 영화가 정답이 되진 않는다.
 */
function accepts(answers, guess) {
  const g = norm(guess);
  if (!g) return false;

  const targets = [];
  for (const a of answers) {
    if (!a) continue;
    targets.push(a);
    const base = a.split(/[:\\-–—,]/)[0];
    if (base.length >= 2) targets.push(base);
  }

  for (const t of targets) {
    if (norm(t) === g) return true;
  }
  if (TITLES.has(g)) return false; // 다른 영화를 정확히 적었다 → 오타가 아니다

  const gj = jamo(g);
  for (const t of targets) {
    const tj = jamo(norm(t));
    if (dist(tj, gj) <= tolerance(tj.length)) return true;
  }
  return false;
}

let pool = [], cur = null, hints = [], shown = 0;

/** 이번 판의 정산이 끝났는지. finish() 를 두 번 돌지 않게 막는다. */
let over = false;

/** 한 세션 = ROUNDS 판. 다 풀면 결과를 정산하고 기록에 남긴다. */
const ROUNDS = ${ROUNDS};
const MAX_SCORE = ROUNDS * (HINT_COUNT * 10);

/** 이번 세션 상태. round 는 지금 푸는 판 번호(1부터). */
let round = 1, score = 0, solved = 0, log = [];

/**
 * 기록은 이 브라우저에만 남는다.
 * 정적 페이지라 서버가 없다. 순위표를 만들려면 백엔드가 따로 있어야 한다.
 * 키에 페이지 이름을 붙여 한국 영화 퀴즈와 헐리우드 퀴즈의 기록이 섞이지 않게 한다.
 */
const KEY = 'noorung-quiz-record:${SLUG}';

/** 사생활 보호 모드에서는 localStorage 접근 자체가 예외를 던진다. 기록이 없다고 게임이 멈추면 안 된다. */
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
function saveRecord(rec) {
  try {
    const all = loadRecords();
    all.unshift(rec);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 20)));  // 최근 20판만 남긴다
    return all;
  } catch (e) { return [rec]; }
}

/**
 * 후보 배우 중에서 이번 판에 쓸 힌트를 뽑는다.
 * 같은 영화가 다시 나와도 매번 다른 조합이 되도록 무작위로 고른다.
 *
 * 다만 완전 무작위로 두면 난이도 흐름이 깨진다. 그래서
 *   - 마지막 힌트는 항상 비중이 가장 높은 배우(주연) 로 고정하고
 *   - 나머지는 무작위로 뽑아 비중이 낮은 순으로 늘어놓는다.
 * 결과적으로 '조연 → 주연' 흐름은 유지되면서 조합만 바뀐다.
 */
function drawHints(cand) {
  if (cand.length <= HINT_COUNT) return cand.slice().reverse();

  const lead = cand[0];                       // 비중 1위
  const rest = cand.slice(1);
  for (let i = rest.length - 1; i > 0; i--) { // 부분 셔플
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const chosen = rest.slice(0, HINT_COUNT - 1);
  chosen.sort((a, b) => b.b - a.b);           // 비중 낮은 순(숫자 큰 순)
  return [...chosen, lead];
}

function pick() {
  if (!pool.length) pool = QUIZZES.map((_, i) => i).sort(() => Math.random() - 0.5);
  cur = QUIZZES[pool.pop()];
  hints = drawHints(cur.c);
  shown = 0;
  over = false;

  $('year').innerHTML = cur.y
    ? esc(cur.y) + '<em>년 개봉</em>'
    : '연도 미상';

  // 공개 전 자리를 먼저 깔아둔다. 남은 힌트 수가 보여야 언제 답할지 정할 수 있다.
  $('hints').innerHTML = hints.map((_, i) =>
    '<figure class="card locked">' +
      '<div class="thumb"><span class="slot">' + pad(i + 1) + '</span></div>' +
      '<figcaption class="cap"><span class="idx">HINT ' + pad(i + 1) + '</span>' +
      '<b class="nm">—</b><span class="ch"></span></figcaption>' +
    '</figure>'
  ).join('');

  $('msg').textContent = '';
  $('msg').className = 'msg';
  $('guess').value = '';
  $('result').classList.add('hidden');
  $('f').classList.remove('hidden');
  $('msg').classList.remove('hidden');
  paintScore();
  reveal();
  $('guess').focus();
}

function reveal() {
  if (shown >= hints.length) return;
  const h = hints[shown];
  const el = $('hints').children[shown];
  el.className = 'card fresh';
  el.innerHTML =
    '<div class="thumb"><img src="' + esc(h.i) + '" alt="" loading="lazy"></div>' +
    '<figcaption class="cap"><span class="idx">HINT ' + pad(shown + 1) + '</span>' +
    '<b class="nm">' + esc(h.n) + '</b>' +
    '<span class="ch" data-ch="' + esc(h.ch) + '"></span></figcaption>';
  shown++;
  $('bar').style.width = (shown / hints.length * 100) + '%';
  $('steps').textContent = '힌트 ' + shown + ' / ' + hints.length;
}

/** 힌트를 적게 쓸수록 높은 점수. 1개면 만점, 다 쓰면 10점. */
const points = used => (hints.length + 1 - used) * 10;

function finish(win) {
  // 한 판은 한 번만 정산한다. 힌트를 다 쓴 뒤 답이 한 번 더 들어오면
  // (폼을 숨기기 전에 엔터가 겹치는 등) 같은 판이 두 번 기록되고 점수도 두 번 들어간다.
  if (over) return;
  over = true;

  const used = shown;                 // 공개를 마저 하기 전에 세어둔다
  const got = win ? points(used) : 0;
  if (win) { solved++; score += got; }
  log.push({ t: cur.t, win: win, used: used, p: got });

  while (shown < hints.length) reveal();
  // 배역명은 이제 공개해도 된다.
  document.querySelectorAll('.ch').forEach(e => { e.textContent = e.dataset.ch || '—'; });

  paintScore();
  // 마지막 판이면 '다음 문제' 대신 세션 결과로 넘긴다.
  $('next').textContent = round >= ROUNDS ? '결과 보기' : '다음 문제';
  $('rLabel').textContent = win ? '정답입니다' : '정답';
  $('rLabel').className = win ? 'kicker win' : 'kicker';
  $('rTitle').textContent = cur.t;

  const parts = [];
  if (cur.y) parts.push(cur.y + '년 개봉');
  if (cur.a) parts.push(${STAT.expr});
  parts.push(win ? '힌트 ' + used + '개 사용 · +' + points(used) + '점' : '획득 점수 없음');
  $('rMeta').textContent = parts.join('  ·  ');

  $('f').classList.add('hidden');
  $('msg').classList.add('hidden');
  $('result').classList.remove('hidden');
  $('next').focus();
}

$('f').onsubmit = e => {
  e.preventDefault();
  const v = $('guess').value.trim();
  if (!v) return;
  if (accepts([cur.t, cur.e], v)) { finish(true); return; }

  $('guess').value = '';
  if (shown >= hints.length) {
    finish(false);
  } else {
    reveal();
    $('msg').textContent = '아쉽네요. 힌트를 하나 더 공개합니다.';
    $('msg').className = 'msg bad';
  }
};

$('skip').onclick = () => finish(false);

$('next').onclick = () => {
  if (round >= ROUNDS) { showSummary(); return; }
  round++;
  pick();
};

$('again').onclick = () => {
  round = 1; score = 0; solved = 0; log = [];
  $('summary').classList.add('hidden');
  pick();
};

function paintScore() {
  $('score').textContent = round + ' / ' + ROUNDS + '판 · ' + score + '점';
}

/** 날짜는 '8월 12일' 정도면 충분하다. 기록을 되짚을 때 필요한 건 순서와 대략의 시점뿐이다. */
const fmtDate = iso => {
  const d = new Date(iso);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
};

function showSummary() {
  // 정산은 여기서 딱 한 번 한다. 결과 화면을 다시 열어도 기록이 두 번 쌓이면 안 된다.
  const rec = { at: new Date().toISOString(), s: score, w: solved, r: ROUNDS };
  const all = saveRecord(rec);

  // 방금 판을 뺀 지난 기록과 견준다. '자기 최고' 는 갱신했을 때 알려줘야 의미가 있다.
  const past = all.slice(1);
  const best = past.reduce((m, x) => Math.max(m, x.s), 0);
  const isBest = past.length > 0 && score > best;

  $('sScore').textContent = score;
  $('sMax').textContent = '/ ' + MAX_SCORE + '점';
  $('sLine').textContent = ROUNDS + '판 중 ' + solved + '판 정답'
    + (past.length ? '  ·  지난 최고 ' + best + '점' : '');
  $('sBest').classList.toggle('hidden', !isBest);

  $('sLog').innerHTML = log.map((x, i) =>
    '<li class="' + (x.win ? 'win' : 'lose') + '">' +
      '<span class="n">' + (i + 1) + '</span>' +
      '<span class="t">' + esc(x.t) + '</span>' +
      '<span class="p">' + (x.win ? '힌트 ' + x.used + '개 · +' + x.p : '실패') + '</span>' +
    '</li>'
  ).join('');

  // 기록이 이번 판 하나뿐이면 목록을 보여줄 이유가 없다.
  $('sHist').classList.toggle('hidden', all.length < 2);
  $('sHistList').innerHTML = all.slice(0, 10).map((x, i) =>
    '<li' + (i === 0 ? ' class="now"' : '') + '>' +
      '<span class="d">' + fmtDate(x.at) + '</span>' +
      '<span class="v">' + x.s + '점</span>' +
      '<span class="w">' + x.w + '/' + (x.r || ROUNDS) + '</span>' +
    '</li>'
  ).join('');

  $('result').classList.add('hidden');
  $('summary').classList.remove('hidden');
  $('again').focus();

  // 점수를 올릴 수 있게 랭킹판을 연다. 0점이면 입력칸은 열리지 않는다.
  RANK.offer(score);
}

paintScore();
pick();
RANK.refresh();
</script>
</body>
</html>`

await writeFile(OUT_PATH, html, "utf8")

console.log(`\n플레이 페이지 생성`)
console.log(`  입력: ${IN_PATH}`)
console.log(`  퀴즈 ${quizzes.length}편 · 힌트 ${HINT_COUNT}개`)
console.log(`  저장: ${OUT_PATH}\n`)
