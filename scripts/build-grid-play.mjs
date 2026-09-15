/**
 * 배우 격자 플레이 페이지
 *
 * 실행:
 *   node scripts/build-grid-puzzles.mjs   # 문제 먼저
 *   node scripts/build-grid-play.mjs      # → data/grid-play.html
 *
 * 가로 3명·세로 3명의 배우가 만나는 아홉 칸에, 두 배우가 함께 나온 영화를 적어
 * 채우는 게임이다.
 *
 * --- 규칙을 이렇게 정한 이유 ---
 * 시도 횟수를 제한한다. 무제한이면 생각나는 영화를 전부 넣어 보는 게 최적이 되어
 * 게임이 아니라 노동이 된다. 아홉 칸에 아홉 번(어려움) 또는 열두 번(쉬움)이다.
 *
 * 같은 영화를 두 번 쓸 수 없다. 안 그러면 여러 배우가 함께 나온 영화 한 편으로
 * 여러 칸을 채워 버린다. 실제로 '군도' 나 '베테랑' 하나면 네 칸이 채워진다.
 *
 * --- 앞선 점검에서 지적된 것들을 여기서는 처음부터 지킨다 ---
 *   · 입력칸 글자 16px  (그 아래면 아이폰에서 누를 때마다 화면이 확대된다)
 *   · 누르는 것은 최소 44px
 *   · 정답/오답을 aria-live 로 알린다 (화면을 못 보는 사람도 결과를 안다)
 *   · 규칙을 화면 맨 위에 한 줄로 둔다 (각주는 아무도 읽지 못한다)
 *   · 제목 자동완성 (모바일에서 제목을 다 쳐야 하는 문제)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { navCSS, navHTML, navScript } from "./play-nav.mjs"
import { rankCSS, rankHTML, rankScript } from "./play-rank.mjs"
import { themeCSS, gameThemeCSS, siteHeaderHTML } from "./play-theme.mjs"
import { loadMovieTitles, titleSuggestionsCSS, titleSuggestionsScript } from "./movie-titles.mjs"

const IN_PATH = "data/grid-puzzles.json"
const TITLES_PATH = "data/quizzes.json"
const OUT_PATH = "data/grid-play.html"

const data = JSON.parse(await readFile(IN_PATH, "utf8"))

/**
 * 배우 사진 주소는 100자가 넘는데 같은 배우가 여러 문제에 거듭 나온다.
 * 그대로 실으면 같은 주소를 수백 번 적게 된다. 배우 목록을 따로 두고 번호로 가리킨다.
 */
const people = []
const idxOf = new Map()
const ref = (p) => {
  const key = p.name + "|" + p.img
  if (!idxOf.has(key)) {
    idxOf.set(key, people.length)
    people.push([p.name, p.img])
  }
  return idxOf.get(key)
}

const puzzles = data.puzzles.map((z) => ({
  r: z.rows.map(ref),
  c: z.cols.map(ref),
  a: z.cells,
}))

/** 자동완성은 출제 조건과 별개인 전체 영화 목록을 사용한다. */
const quizTitles = JSON.parse(await readFile(TITLES_PATH, "utf8")).quizzes.map((q) => q.title)
const titles = await loadMovieTitles([...quizTitles, ...data.puzzles.flatMap((p) => p.cells.flat())])

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>배우 격자</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://www.kobis.or.kr">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${themeCSS}
  .wrap { max-width: 820px; margin: 0 auto; padding: 20px 20px 64px; }

  .masthead {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding-bottom: 14px; border-bottom: 1px solid var(--foreground);
  }
  .brand { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { color: var(--muted-foreground); font-weight: 500; margin-left: 7px; }
  .score { font-size: 13px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .score b { color: var(--foreground); font-weight: 700; font-size: 15px; }

${navCSS}

  /* ── 규칙 한 줄. 각주로 내리면 아무도 읽지 못한다 ─────────────── */
  .rule {
    margin: 16px 0 0; padding: 11px 14px;
    background: var(--muted); border-radius: var(--radius);
    font-size: 13.5px; color: var(--muted-foreground);
  }
  .rule b { color: var(--foreground); font-weight: 600; }

  /* ── 격자 ─────────────────────────────────────────────────── */
  .board { margin-top: 18px; }
  table.grid { border-collapse: separate; border-spacing: 6px; width: 100%; table-layout: fixed; }
  table.grid td, table.grid th { padding: 0; }
  .corner { width: 21%; }

  .who { text-align: center; }
  .who img {
    width: 100%; max-width: 62px; aspect-ratio: 3/4; object-fit: cover;
    border-radius: 6px; background: var(--muted); display: block; margin: 0 auto 4px;
  }
  .who b { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.3; word-break: keep-all; }

  .cell {
    width: 100%; min-height: 74px; padding: 8px 6px;
    background: var(--card); color: var(--foreground);
    border: 1px dashed var(--border); border-radius: var(--radius);
    font: inherit; font-size: 13px; line-height: 1.35; text-align: center;
    cursor: pointer; transition: border-color .12s, background .12s;
    display: flex; align-items: center; justify-content: center;
  }
  .cell:hover:not(:disabled) { border-color: var(--muted-foreground); }
  .cell:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .cell.done {
    border-style: solid; border-color: var(--success);
    background: color-mix(in oklab, var(--success) 12%, var(--card));
    font-weight: 600; cursor: default;
  }
  .cell.active { border-style: solid; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 20%, transparent); }
  .cell .ph { color: var(--muted-foreground); font-size: 20px; font-weight: 300; }

  /* ── 답 입력 ──────────────────────────────────────────────── */
  .answer { margin-top: 16px; }
  .answer.hidden { display: none; }
  .askedFor { font-size: 13.5px; color: var(--muted-foreground); margin: 0 0 8px; }
  .askedFor b { color: var(--foreground); font-weight: 700; }
  .form { display: flex; gap: 8px; }
  .form input {
    flex: 1; min-width: 0; height: 46px; padding: 0 15px;
    /* 16px 미만이면 아이폰이 포커스마다 화면을 확대한다 */
    font: inherit; font-size: 16px;
    color: var(--foreground); background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius);
  }
  .form input:focus { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 22%, transparent); }
  .btn {
    height: 46px; min-width: 64px; padding: 0 18px;
    font: inherit; font-size: 14.5px; font-weight: 600;
    background: var(--primary); color: var(--primary-foreground);
    border: 1px solid var(--primary); border-radius: var(--radius); cursor: pointer;
  }
  .btn.ghost { background: transparent; color: var(--muted-foreground); border-color: var(--border); font-weight: 500; }
  .btn:disabled { opacity: .5; cursor: default; }

  /* 자동완성. 모바일에서 제목을 끝까지 치는 건 고역이다. */
  .sugg { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .sugg li button {
    font: inherit; font-size: 13.5px; min-height: 40px; padding: 0 13px;
    background: var(--muted); color: var(--foreground);
    border: 1px solid var(--border); border-radius: 999px; cursor: pointer;
  }
  .sugg li button:hover { border-color: var(--muted-foreground); }

  .msg { margin: 10px 0 0; font-size: 14px; min-height: 22px; }
  .msg.ok { color: var(--success); font-weight: 600; }
  .msg.no { color: var(--destructive); font-weight: 600; }

  /* ── 결과 ─────────────────────────────────────────────────── */
  .result { margin-top: 22px; padding: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  .result.hidden { display: none; }
  .result h2 { margin: 0 0 4px; font-size: 21px; letter-spacing: -0.02em; }
  .result p { margin: 0 0 14px; font-size: 14px; color: var(--muted-foreground); }
  .missed { margin: 0 0 16px; padding: 0; list-style: none; font-size: 13.5px; }
  .missed li { padding: 5px 0; border-top: 1px solid var(--border); color: var(--muted-foreground); }
  .missed b { color: var(--foreground); font-weight: 600; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }

  /* ── 난이도 ───────────────────────────────────────────────── */
  .modes { display: flex; align-items: center; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  .modes span { font-size: 12.5px; color: var(--muted-foreground); }
  .modes button {
    font: inherit; font-size: 13px; min-height: 44px; padding: 0 14px;
    background: var(--card); color: var(--muted-foreground);
    border: 1px solid var(--border); border-radius: 999px; cursor: pointer;
  }
  .modes button.on { background: var(--foreground); color: var(--background); border-color: var(--foreground); font-weight: 600; }

${rankCSS}

  .foot { margin-top: 30px; font-size: 12.5px; color: var(--muted-foreground); }

  @media (max-width: 560px) {
    .wrap { padding: 16px 16px 64px; }
    .who b { font-size: 11.5px; }
    .cell { min-height: 64px; font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
${gameThemeCSS}
${titleSuggestionsCSS}
</style>
</head>
<body class="game-grid">
${siteHeaderHTML}
<div class="game-navigation">${navHTML("grid")}</div>
<main class="wrap" id="main" tabindex="-1">

  <div class="masthead">
    <h1 class="brand">배우 격자</h1>
    <span class="score" id="score"></span>
  </div>



  <p class="rule">가로와 세로의 <b>두 배우가 함께 나온 영화</b>를 칸마다 적어 아홉 칸을 채웁니다.
  같은 영화는 한 번만 쓸 수 있고, <b id="ruleTries">시도는 아홉 번</b>입니다.</p>

  <div class="modes">
    <span>난이도</span>
    <button type="button" data-mode="easy">쉬움 · 12번</button>
    <button type="button" data-mode="hard">어려움 · 9번</button>
  </div>

  <div class="board">
    <table class="grid">
      <tr>
        <th class="corner"></th>
        <th class="who" id="c0"></th><th class="who" id="c1"></th><th class="who" id="c2"></th>
      </tr>
      <tr><th class="who" id="r0"></th><td id="t0"></td><td id="t1"></td><td id="t2"></td></tr>
      <tr><th class="who" id="r1"></th><td id="t3"></td><td id="t4"></td><td id="t5"></td></tr>
      <tr><th class="who" id="r2"></th><td id="t6"></td><td id="t7"></td><td id="t8"></td></tr>
    </table>
  </div>

  <div class="answer hidden" id="answer">
    <p class="askedFor" id="askedFor"></p>
    <form class="form" id="f" autocomplete="off">
      <label for="guess" class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">영화 제목</label>
      <input id="guess" type="text" placeholder="영화 제목" enterkeyhint="done"
             autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn" type="submit">확인</button>
      <button class="btn ghost" type="button" id="cancel">취소</button>
    </form>
    <ul class="title-suggestions" id="sugg" hidden></ul>
  </div>

  <p class="msg" id="msg" role="status" aria-live="polite"></p>

  <section class="result hidden" id="result">
    <h2 id="rTitle"></h2>
    <p id="rSub"></p>
    <ul class="missed" id="missed"></ul>
    <div class="acts">
      <button class="btn" type="button" id="again">새 문제</button>
      <button class="btn ghost" type="button" id="share">결과 복사</button>
    </div>
  </section>

${rankHTML("랭킹")}

  <p class="foot">문제는 관객 100만 명 이상인 한국 영화 중에서 냅니다. 배우가 함께 나온 작품이 여럿이면 어느 것을 적어도 정답입니다.</p>
</main>

<script>
${titleSuggestionsScript(titles)}
const PEOPLE = ${JSON.stringify(people)};
const PUZZLES = ${JSON.stringify(puzzles)};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/**
 * 정답 비교용 정규화.
 * 공백·문장부호에 더해 한자도 지운다. 그대로 두면 '해무(海霧)' 를 '해무' 라고
 * 적은 사람이 틀린 것이 된다.
 */
const norm = (s) => String(s).toLowerCase()
  .replace(/[\\s:;·,.\\-–—!?'"()\\/#+\\u3400-\\u9FFF]/g, '');

/** 난이도 = 시도 횟수. */
const TRIES = { easy: 12, hard: 9 };
const MODE_KEY = 'noorung.grid.mode';
const REC_KEY = 'noorung-quiz-record:grid';

let mode = 'easy';
try { mode = localStorage.getItem(MODE_KEY) || 'easy'; } catch (e) {}
const qMode = new URLSearchParams(location.search).get('mode');
if (qMode !== null) mode = qMode;
if (mode !== 'hard') mode = 'easy';

let cur = null, filled = [], used = new Set(), left = 0, active = -1, over = false;

function pickPuzzle() {
  titleSuggestions.clear();
  RANK.setMode(mode);
  cur = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
  filled = new Array(9).fill(null);
  used = new Set();
  left = TRIES[mode];
  active = -1;
  over = false;

  cur.c.forEach((p, i) => { $('c' + i).innerHTML = who(p); });
  cur.r.forEach((p, i) => { $('r' + i).innerHTML = who(p); });
  for (let i = 0; i < 9; i++) paintCell(i);

  $('result').classList.add('hidden');
  $('answer').classList.add('hidden');
  $('msg').textContent = '';
  $('msg').className = 'msg';
  paintScore();
}

function who(i) {
  const p = PEOPLE[i];
  return '<img src="' + esc(p[1]) + '" alt="" loading="lazy" onerror="this.style.visibility=\\'hidden\\'">' +
         '<b>' + esc(p[0]) + '</b>';
}

function paintCell(i) {
  const td = $('t' + i);
  const v = filled[i];
  td.innerHTML = '<button class="cell' + (v ? ' done' : '') + '" type="button" data-i="' + i + '"' +
    (v || over ? ' disabled' : '') + '>' +
    (v ? esc(v) : '<span class="ph">+</span>') + '</button>';
}

function paintScore() {
  const n = filled.filter(Boolean).length;
  $('score').innerHTML = '<b>' + n + '</b> / 9칸 · 남은 시도 ' + left + '번';
  $('ruleTries').textContent = '시도는 ' + (mode === 'hard' ? '아홉' : '열두') + ' 번';
}

/** 칸을 고르면 그 칸의 두 배우를 묻는 화면이 열린다. */
function openCell(i) {
  if (over || filled[i]) return;
  active = i;
  document.querySelectorAll('.cell').forEach((b) => b.classList.remove('active'));
  $('t' + i).querySelector('.cell').classList.add('active');

  const r = PEOPLE[cur.r[Math.floor(i / 3)]][0];
  const c = PEOPLE[cur.c[i % 3]][0];
  $('askedFor').innerHTML = '<b>' + esc(r) + '</b> 와 <b>' + esc(c) + '</b> 가 함께 나온 영화는?';
  $('answer').classList.remove('hidden');
  titleSuggestions.clear();
  $('guess').value = '';
  $('guess').focus();
}

function submit(text) {
  if (over || active < 0) return;
  const g = norm(text);
  if (!g) return;

  const answers = cur.a[active];
  const hit = answers.find((t) => norm(t) === g);

  if (hit && used.has(norm(hit))) {
    say('이미 쓴 영화입니다. 다른 작품을 적어 주세요.', 'no');
    return;   // 시도를 깎지 않는다. 규칙을 몰라서 생긴 일이지 오답이 아니다.
  }

  left--;
  if (hit) {
    filled[active] = hit;
    used.add(norm(hit));
    paintCell(active);
    say('정답입니다 · ' + hit, 'ok');
    active = -1;
    $('answer').classList.add('hidden');
  } else {
    say('아닙니다. 남은 시도 ' + left + '번', 'no');
    $('guess').value = '';
    titleSuggestions.clear();
    $('guess').focus();   // 오답마다 키보드가 닫히면 매번 다시 눌러야 한다
  }

  paintScore();
  if (filled.every(Boolean) || left <= 0) finish();
}

function say(t, cls) {
  $('msg').textContent = t;
  $('msg').className = 'msg' + (cls ? ' ' + cls : '');
}

function finish() {
  titleSuggestions.clear();
  over = true;
  active = -1;
  $('answer').classList.add('hidden');
  for (let i = 0; i < 9; i++) paintCell(i);

  const n = filled.filter(Boolean).length;
  $('rTitle').textContent = n === 9 ? '아홉 칸 완성' : n + '칸 채웠습니다';
  $('rSub').textContent = n === 9
    ? '남은 시도 ' + left + '번을 남기고 끝냈습니다.'
    : '못 채운 칸의 답을 알려 드립니다.';

  const rows = [];
  for (let i = 0; i < 9; i++) {
    if (filled[i]) continue;
    const r = PEOPLE[cur.r[Math.floor(i / 3)]][0];
    const c = PEOPLE[cur.c[i % 3]][0];
    rows.push('<li>' + esc(r) + ' × ' + esc(c) + ' → <b>' + cur.a[i].map(esc).join('</b>, <b>') + '</b></li>');
  }
  $('missed').innerHTML = rows.join('');
  $('result').classList.remove('hidden');
  say('');

  try {
    const all = JSON.parse(localStorage.getItem(REC_KEY + ':' + mode) || '[]');
    all.unshift({ s: n, d: Date.now() });
    localStorage.setItem(REC_KEY + ':' + mode, JSON.stringify(all.slice(0, 20)));
  } catch (e) {}

  RANK.offer(n, mode);
}

// ── 이벤트 ────────────────────────────────────────────────
document.querySelector('.board').addEventListener('click', (e) => {
  const b = e.target.closest('.cell');
  if (b && !b.disabled) openCell(Number(b.dataset.i));
});
$('f').addEventListener('submit', (e) => { e.preventDefault(); submit($('guess').value); });
$('cancel').onclick = () => {
  titleSuggestions.clear();
  active = -1;
  $('answer').classList.add('hidden');
  document.querySelectorAll('.cell').forEach((b) => b.classList.remove('active'));
};
$('again').onclick = pickPuzzle;
$('share').onclick = () => {
  const marks = filled.map((v) => v ? '🟩' : '⬜');
  const txt = '누룽지 극장 · 배우 격자 ' + filled.filter(Boolean).length + '/9\\n' +
    marks.slice(0, 3).join('') + '\\n' + marks.slice(3, 6).join('') + '\\n' + marks.slice(6).join('');
  navigator.clipboard.writeText(txt).then(
    () => say('결과를 복사했습니다.', 'ok'),
    () => say('복사하지 못했습니다.', 'no')
  );
};

document.querySelectorAll('.modes button').forEach((b) => {
  b.classList.toggle('on', b.dataset.mode === mode);
  b.onclick = () => {
    if (b.dataset.mode === mode) return;
    // 진행 중이면 지금 판이 사라진다. 말없이 날리지 않는다.
    const started = !over && (filled.some(Boolean) || left < TRIES[mode]);
    if (started && !confirm('난이도를 바꾸면 지금 판이 사라집니다. 계속할까요?')) return;
    mode = b.dataset.mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('on', x.dataset.mode === mode));
    pickPuzzle();
  };
});

${navScript}
${rankScript({ game: "grid", unit: "칸", localKey: "noorung-quiz-record:grid" })}

pickPuzzle();
</script>
</body>
</html>
`

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, html, "utf8")

console.log(`\n배우 격자 플레이 페이지`)
console.log(`  문제 ${puzzles.length}개 · 축에 쓰인 배우 ${people.length}명 · 자동완성 제목 ${new Set(titles).size}개`)
console.log(`  크기 ${(html.length / 1024).toFixed(0)}KB`)
console.log(`  저장: ${OUT_PATH}\n`)
