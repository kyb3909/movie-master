/**
 * 출제 목록 검수 페이지
 *
 * 실행:
 *   node scripts/build-review.mjs        → data/review.html
 *   node scripts/serve.mjs               → http://localhost:8899/review.html
 *
 * 두 퀴즈(한국 영화·헐리우드)에 실제로 나가는 영화를 한 화면에 늘어놓고,
 * 낼 만하지 않은 것을 골라 뺄 수 있게 한다. '빼기' 를 누르고 저장하면
 * data/quiz-overrides.json 이 갱신되고, 다음 빌드부터 그 영화는 출제되지 않는다.
 *
 * --- 왜 이 페이지가 필요한가 ---
 * 자동 규칙으로는 못 거르는 것이 남는다.
 *   · 얼굴 사진이 있는 배우만 골라 쓰다 보니 첫 힌트가 비중 49위인 영화가 생긴다.
 *   · 한국어 제목을 이름으로 맞추다 보면 동명의 다른 작품이 섞인다.
 * 그래서 사람이 얼굴 다섯 장을 실제로 보고 "이걸로 맞힐 수 있나" 를 판단해야 한다.
 *
 * 화면에는 쉬움 난이도에서 실제로 보게 될 순서(첫 힌트 → 마지막 힌트)대로 늘어놓는다.
 * 첫 힌트 배우의 비중이 10위보다 뒤면 '주의' 를 달아 먼저 보게 한다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const OUT_PATH = "data/review.html"

/** 이 번호보다 뒤에서 첫 힌트가 시작하면 주의 표시를 단다. */
const RISK_BILLING = 10

/** 쉬움 난이도가 쓰는 구간. build-quiz-play.mjs 의 SLICE 와 같아야 한다. */
const HINT_COUNT = 5

const read = async (p) => JSON.parse(await readFile(p, "utf8"))

/** 쉬움 난이도에서 실제로 공개되는 순서. 앞에서 5명을 뽑아 뒤집는다. */
function easyHints(candidates) {
  const part = candidates.slice(0, HINT_COUNT)
  const five = part.length >= HINT_COUNT ? part : candidates.slice(-HINT_COUNT)
  return five.slice().reverse()
}

// ============================================

const kq = await read("data/quizzes.json")
const hq = await read("data/hollywood-quizzes.json")

// 포스터는 퀴즈 파일에 없다. 한국은 KOBIS 포스터, 헐리우드는 카탈로그에서 가져온다.
const posters = await read("data/kobis-posters.json")
const catalog = await read("data/hollywood-catalog.json")
const posterByBomId = new Map(catalog.movies.map((m) => [m.bomId, m.posterUrl]))

let overrides = { excluded: { quiz: [], hollywood: [] } }
try { overrides = await read("data/quiz-overrides.json") } catch { /* 검수 전 */ }

const nf = new Intl.NumberFormat("ko-KR")

function row(id, title, sub, stat, posterUrl, candidates) {
  const hints = easyHints(candidates)
  const first = hints[0]
  const risk = (first?.billing ?? 99) > RISK_BILLING

  return {
    id,
    title,
    sub,
    stat,
    poster: posterUrl || "",
    risk,
    firstBilling: first?.billing ?? 99,
    cast: hints.map((h) => ({ n: h.name, i: h.imageUrl, b: h.billing })),
  }
}

const KR = kq.quizzes.map((q) =>
  row(
    q.movieCd,
    q.title,
    q.releaseDate?.slice(0, 4) ?? "",
    `관객 ${nf.format(q.audiAcc ?? 0)}명`,
    posters.byMovieCd?.[q.movieCd]?.posters?.[0]?.thumb ?? "",
    q.candidates
  )
)

const HW = hq.quizzes.map((q) =>
  row(
    q.bomId,
    q.title,
    `${q.titleEn} · ${q.releaseDate?.slice(0, 4) ?? ""}`,
    `북미 $${nf.format(Math.round((q.gross ?? 0) / 1e6))}M · 로튼 ${q.tomatometer ?? "?"}%`,
    posterByBomId.get(q.bomId) ?? "",
    q.candidates
  )
)

// 위험한 것을 위로 올린다. 검수는 시간이 한정되므로 의심스러운 것부터 보게 한다.
const byRisk = (a, b) => b.firstBilling - a.firstBilling
KR.sort(byRisk)
HW.sort(byRisk)

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>출제 목록 검수 · 누룽지 극장</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #fff; --fg: #16181d; --mut: #666e7a;
    --line: #dfe3e8; --risk: #a8261f; --risk-bg: #fbeae8;
    --drop: #b4241c; --drop-bg: #fbe9e7; --ok: #1f6f4a;
    --accent: #2c4a7c;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121418; --card: #1b1e24; --fg: #e9ecf0; --mut: #98a1ad;
      --line: #2e343d; --risk: #f0938b; --risk-bg: #3a1f1d;
      --drop: #f0938b; --drop-bg: #3a1f1d; --ok: #74c69d;
      --accent: #8fb1e0;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.6 "Pretendard", -apple-system, "Malgun Gothic", sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 0 120px; }

  header { padding-block: 28px 16px; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.02em; }
  .lede { margin: 0; color: var(--mut); font-size: 14px; max-width: 62ch; }

  /* 조작줄은 스크롤해도 항상 손에 닿아야 한다. 1,148편을 훑는 동안 계속 쓴다. */
  .bar {
    position: sticky; top: 0; z-index: 5;
    background: var(--bg); border-bottom: 1px solid var(--line);
    padding-block: 12px; margin-bottom: 18px;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  }
  .bar input[type=search] {
    flex: 1 1 200px; min-width: 0; height: 40px; padding: 0 12px; font: inherit; font-size: 15px;
    background: var(--card); color: var(--fg);
    border: 1px solid var(--line); border-radius: 8px;
  }
  button {
    font: inherit; font-size: 14px; min-height: 40px; padding: 0 14px;
    background: var(--card); color: var(--fg);
    border: 1px solid var(--line); border-radius: 8px; cursor: pointer;
  }
  button:hover { border-color: var(--mut); }
  button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .save { margin-left: auto; background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; padding: 0 20px; }
  .save:disabled { opacity: .5; cursor: default; }
  .count { font-size: 13px; color: var(--mut); font-variant-numeric: tabular-nums; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }

  .m {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px; display: grid; grid-template-columns: 62px 1fr; gap: 12px;
  }
  .m.gone { border-color: var(--drop); background: var(--drop-bg); }
  .m.hide { display: none; }
  .m > .pos { width: 62px; aspect-ratio: 27/40; object-fit: cover; border-radius: 5px; background: var(--bg); }
  .m .body { min-width: 0; }
  .m h3 { margin: 0 0 2px; font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; }
  .m .sub { margin: 0; font-size: 12.5px; color: var(--mut); overflow-wrap: anywhere; }
  .m .stat { margin: 0 0 8px; font-size: 12px; color: var(--mut); font-variant-numeric: tabular-nums; }

  .warn {
    display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .02em;
    color: var(--risk); background: var(--risk-bg);
    padding: 2px 7px; border-radius: 4px; margin-bottom: 6px;
  }

  /* 힌트로 나가는 얼굴들. 왼쪽이 첫 힌트다. */
  .cast { display: flex; gap: 6px; margin-bottom: 10px; }
  .cast figure { margin: 0; flex: 1 1 0; min-width: 0; }
  .cast img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 4px; background: var(--bg); display: block; }
  /* 이름과 비중을 한 줄에 두면 좁은 화면에서 '49위' 가 잘린다.
     비중이야말로 이 화면에서 판단의 근거이므로 줄을 나눠 항상 보이게 한다. */
  .cast figcaption { font-size: 10.5px; line-height: 1.35; color: var(--mut); margin-top: 3px; }
  .cast .n { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cast .b { display: block; font-variant-numeric: tabular-nums; }
  .cast figure:first-child .n { color: var(--fg); font-weight: 600; }
  .cast figure:first-child .b { color: var(--risk); font-weight: 600; }

  .m button.t { width: 100%; min-height: 36px; font-size: 13.5px; }
  .m.gone button.t { background: var(--drop); border-color: var(--drop); color: var(--card); font-weight: 600; }

  .tabs { display: flex; gap: 6px; }
  .empty { padding: 40px; text-align: center; color: var(--mut); }

  .toast {
    position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
    background: var(--fg); color: var(--bg); padding: 11px 20px; border-radius: 999px;
    font-size: 14px; font-weight: 500; box-shadow: 0 6px 24px rgba(0,0,0,.25);
  }
  .toast[hidden] { display: none; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>출제 목록 검수</h1>
  <p class="lede">얼굴 다섯 장만 보고 이 영화를 맞힐 수 있을지 판단해 주세요. <b>왼쪽이 첫 힌트</b>이고 오른쪽으로 갈수록 쉬워집니다.
  첫 힌트가 비중 ${RISK_BILLING}위보다 뒤인 영화에는 <span class="warn" style="margin:0">주의</span>를 달아 위로 올려 두었습니다.</p>
</header>

<div class="bar">
  <div class="tabs">
    <button id="tKR" aria-pressed="true">한국 영화 <span class="count" id="cKR"></span></button>
    <button id="tHW" aria-pressed="false">헐리우드 <span class="count" id="cHW"></span></button>
  </div>
  <input type="search" id="q" placeholder="제목이나 배우 이름으로 찾기" autocomplete="off">
  <button id="fRisk" aria-pressed="false">주의만</button>
  <button id="fGone" aria-pressed="false">뺀 것만</button>
  <span class="count" id="status"></span>
  <button class="save" id="save">저장</button>
</div>

<div class="grid" id="grid"></div>
<p class="empty" id="empty" hidden>해당하는 영화가 없습니다.</p>

</div>
<div class="toast" id="toast" hidden></div>

<script>
const DATA = { KR: ${JSON.stringify(KR)}, HW: ${JSON.stringify(HW)} };
const gone = {
  KR: new Set(${JSON.stringify(overrides.excluded?.quiz ?? [])}),
  HW: new Set(${JSON.stringify(overrides.excluded?.hollywood ?? [])}),
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let tab = 'KR', onlyRisk = false, onlyGone = false, dirty = false;

$('cKR').textContent = DATA.KR.length;
$('cHW').textContent = DATA.HW.length;

function card(m) {
  const out = gone[tab].has(m.id);
  return '<article class="m' + (out ? ' gone' : '') + '" data-id="' + esc(m.id) + '">' +
    (m.poster ? '<img class="pos" src="' + esc(m.poster) + '" alt="" loading="lazy" onerror="this.style.visibility=\\'hidden\\'">'
              : '<div class="pos"></div>') +
    '<div class="body">' +
      (m.risk ? '<span class="warn">주의 · 첫 힌트가 비중 ' + m.firstBilling + '위</span>' : '') +
      '<h3>' + esc(m.title) + '</h3>' +
      '<p class="sub">' + esc(m.sub) + '</p>' +
      '<p class="stat">' + esc(m.stat) + '</p>' +
      '<div class="cast">' + m.cast.map((c) =>
        '<figure>' +
          '<img src="' + esc(c.i) + '" alt="" loading="lazy" onerror="this.style.visibility=\\'hidden\\'">' +
          '<figcaption><span class="n">' + esc(c.n) + '</span><span class="b">비중 ' + c.b + '위</span></figcaption>' +
        '</figure>').join('') +
      '</div>' +
      '<button class="t" type="button">' + (out ? '뺐음 · 되돌리기' : '출제에서 빼기') + '</button>' +
    '</div>' +
  '</article>';
}

function render() {
  const q = $('q').value.trim().toLowerCase();
  const rows = DATA[tab].filter((m) => {
    if (onlyRisk && !m.risk) return false;
    if (onlyGone && !gone[tab].has(m.id)) return false;
    if (!q) return true;
    return (m.title + ' ' + m.sub + ' ' + m.cast.map((c) => c.n).join(' ')).toLowerCase().includes(q);
  });
  $('grid').innerHTML = rows.map(card).join('');
  $('empty').hidden = rows.length > 0;
  paintStatus(rows.length);
}

function paintStatus(shown) {
  const n = gone.KR.size + gone.HW.size;
  $('status').textContent = shown + '편 표시 · 뺀 영화 ' + n + '편' + (dirty ? ' (저장 안 됨)' : '');
  $('save').disabled = !dirty;
}

$('grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button.t');
  if (!btn) return;
  const el = btn.closest('.m');
  const id = el.dataset.id;
  const set = gone[tab];
  if (set.has(id)) set.delete(id); else set.add(id);
  const out = set.has(id);
  el.classList.toggle('gone', out);
  btn.textContent = out ? '뺐음 · 되돌리기' : '출제에서 빼기';
  dirty = true;
  paintStatus(document.querySelectorAll('.m:not(.hide)').length);
});

function tabTo(next) {
  tab = next;
  $('tKR').setAttribute('aria-pressed', String(next === 'KR'));
  $('tHW').setAttribute('aria-pressed', String(next === 'HW'));
  render();
}
$('tKR').onclick = () => tabTo('KR');
$('tHW').onclick = () => tabTo('HW');

$('q').addEventListener('input', render);
$('fRisk').onclick = function () { onlyRisk = !onlyRisk; this.setAttribute('aria-pressed', String(onlyRisk)); render(); };
$('fGone').onclick = function () { onlyGone = !onlyGone; this.setAttribute('aria-pressed', String(onlyGone)); render(); };

let toastT;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { $('toast').hidden = true; }, 2600);
}

$('save').onclick = async () => {
  $('save').disabled = true;
  $('save').textContent = '저장 중…';
  try {
    const res = await fetch('/api/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz: [...gone.KR], hollywood: [...gone.HW] }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || ('HTTP ' + res.status));
    dirty = false;
    toast('저장했습니다 · 뺀 영화 ' + j.count + '편');
  } catch (err) {
    // 파일로 열었거나(file://) 서버가 안 떠 있으면 저장할 곳이 없다.
    toast('저장 실패 — scripts/serve.mjs 로 연 페이지인지 확인해 주세요');
  }
  $('save').textContent = '저장';
  paintStatus(document.querySelectorAll('.m').length);
};

// 저장 안 한 채로 닫으면 고른 것이 사라진다.
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

render();
</script>
</body>
</html>
`

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, html, "utf8")

const risky = (a) => a.filter((m) => m.risk).length

console.log(`\n검수 페이지 생성`)
console.log(`  한국 영화  ${KR.length}편 (첫 힌트가 비중 ${RISK_BILLING}위보다 뒤: ${risky(KR)}편)`)
console.log(`  헐리우드   ${HW.length}편 (첫 힌트가 비중 ${RISK_BILLING}위보다 뒤: ${risky(HW)}편)`)
console.log(`  이미 뺀 영화 ${(overrides.excluded?.quiz ?? []).length + (overrides.excluded?.hollywood ?? []).length}편`)
console.log(`  저장: ${OUT_PATH}`)
console.log(`\n  열기:  node scripts/serve.mjs  →  http://localhost:8899/review.html\n`)
