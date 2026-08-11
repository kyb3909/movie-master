/**
 * 게임 페이지 공용 랭킹판
 *
 * 세션이 끝나면 닉네임을 받아 점수를 올리고, 상위 10명을 보여준다.
 * 서버는 같은 배포 안의 /api/rank (scripts/deploy-api/rank.js · Vercel Blob).
 *
 * --- 로컬 검수본에서는 ---
 * data/*-play.html 을 그냥 열면 /api/rank 가 없다. 없는 서버를 부르면 에러만 쌓이므로,
 * 파일 이름으로 판별해 이 브라우저의 지난 점수를 같은 모양으로 보여준다.
 * 랭킹 자리를 통째로 지우지 않는 이유는, 그러면 검수할 때 배치가 달라져 무엇이
 * 실제 화면인지 알 수 없기 때문이다.
 */

/** 닉네임 길이 상한. API(scripts/deploy-api/rank.js)의 NICK_MAX 와 같아야 한다. */
export const NICK_MAX = 12

export const rankCSS = `
  /* ── 랭킹 ────────────────────────────────────────────────── */
  .rank { margin-top: 34px; padding-top: 20px; border-top: 1px solid var(--border); }
  .rank .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .rank .note { font-size: 11.5px; color: var(--muted-foreground); }

  /* .hidden 은 클래스 하나라 아래의 두 겹 선택자에 진다. 숨김 규칙을 같은 무게로 다시 쓴다.
     (이걸 빼면 세션이 끝나기 전에도 닉네임 입력칸이 계속 떠 있다) */
  .rank .entry.hidden, .rank .empty.hidden { display: none; }

  .rank .entry { display: flex; gap: 8px; margin: 14px 0 0; }
  .rank .entry input {
    flex: 1; min-width: 0; padding: 9px 12px;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); color: var(--foreground);
    font-family: inherit; font-size: 14px;
  }
  .rank .entry input:focus { outline: none; border-color: var(--foreground); }
  /* 하이로우의 .btn 은 width:100% 라(선택지 버튼용) 그대로 두면 입력칸을 밀어낸다. */
  .rank .entry .btn { flex: 0 0 auto; width: auto; height: auto; padding: 9px 18px; font-size: 13px; }

  .rank ol { list-style: none; margin: 14px 0 0; padding: 0; }
  .rank li {
    display: flex; align-items: center; gap: 12px; padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px; font-variant-numeric: tabular-nums;
  }
  .rank li:last-child { border-bottom: 0; }
  .rank li .r { width: 22px; font-size: 11.5px; color: var(--muted-foreground); }
  .rank li .who { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank li .v { font-weight: 600; }
  .rank li.me { color: var(--success); }
  .rank li.me .r { color: inherit; }
  .rank .empty { margin: 14px 0 0; font-size: 12.5px; color: var(--muted-foreground); }`

/** 랭킹판 마크업. */
export const rankHTML = (title) => `  <section class="rank" id="rank">
    <div class="head">
      <span class="kicker">${title}</span>
      <span class="note" id="rankNote"></span>
    </div>
    <div class="entry hidden" id="rankEntry">
      <input type="text" id="nick" maxlength="${NICK_MAX}" placeholder="닉네임"
             autocomplete="off" spellcheck="false">
      <button class="btn" id="rankSend">등록</button>
    </div>
    <ol id="rankList"></ol>
    <p class="empty hidden" id="rankEmpty">아직 기록이 없습니다.</p>
  </section>`

/**
 * 랭킹 클라이언트.
 *   game     랭킹을 나누는 키('quiz' · 'hollywood' · 'highlow')
 *   unit     점수 뒤에 붙는 말('점' · '연속')
 *   localKey 로컬 폴백에서 읽을 localStorage 키. 없으면 폴백 목록은 비운다.
 */
export const rankScript = ({ game, unit, localKey }) => `
var RANK = (function () {
  var GAME = ${JSON.stringify(game)};
  var UNIT = ${JSON.stringify(unit)};
  var LOCAL_KEY = ${JSON.stringify(localKey ?? "")};
  var NICK_KEY = 'noorung.nick';

  // 로컬 검수본(data/*-play.html)에는 API 가 없다.
  var online = !/-play\\.html$/.test(location.pathname) && location.protocol !== 'file:';

  var mode = '';     // 난이도로 순위표를 더 나눌 때 쓴다
  var mine = null;   // 방금 올린 기록. 목록에서 표시해 준다.

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function qs() { return '?game=' + encodeURIComponent(GAME) + '&mode=' + encodeURIComponent(mode); }

  /** 폴백: 이 브라우저의 지난 점수를 순위 모양으로 만든다. */
  function localRows() {
    if (!LOCAL_KEY) return [];
    try {
      var raw = JSON.parse(localStorage.getItem(LOCAL_KEY + (mode ? ':' + mode : '')) || '[]');
      return raw.slice().sort(function (a, b) { return b.s - a.s; }).slice(0, 10)
        .map(function (x) { return { nickname: '나', score: x.s }; });
    } catch (e) { return []; }
  }

  function paint(rows) {
    el('rankList').innerHTML = rows.map(function (x, i) {
      return '<li' + (mine && x.id === mine ? ' class="me"' : '') + '>'
        + '<span class="r">' + (i + 1) + '</span>'
        + '<span class="who">' + esc(x.nickname) + '</span>'
        + '<span class="v">' + x.score + UNIT + '</span>'
        + '</li>';
    }).join('');
    el('rankEmpty').classList.toggle('hidden', rows.length > 0);
  }

  function refresh() {
    if (!online) { paint(localRows()); return Promise.resolve(); }
    return fetch('/api/rank' + qs(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { paint(d.rows || []); })
      .catch(function () {
        el('rankNote').textContent = '랭킹을 불러오지 못했습니다';
        paint([]);
      });
  }

  /** 세션이 끝났을 때 부른다. 0점이면 올릴 것이 없으니 입력칸을 열지 않는다. */
  function offer(score, curMode) {
    mode = curMode || '';
    mine = null;
    el('rankNote').textContent = online ? '' : '이 브라우저 기록입니다';
    el('rankEntry').classList.toggle('hidden', !online || !(score > 0));
    if (online && score > 0) {
      try { el('nick').value = localStorage.getItem(NICK_KEY) || ''; } catch (e) {}
      var btn = el('rankSend');
      btn.disabled = false;
      btn.textContent = '등록';
      btn.onclick = function () { send(score); };
    }
    return refresh();
  }

  function send(score) {
    var nick = (el('nick').value || '').trim().slice(0, ${NICK_MAX});
    if (!nick) { el('nick').focus(); return; }
    var btn = el('rankSend');
    btn.disabled = true;
    btn.textContent = '등록 중';
    try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}

    fetch('/api/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: GAME, mode: mode, nickname: nick, score: score }),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      mine = d.id;
      el('rankEntry').classList.add('hidden');
      el('rankNote').textContent = '등록했습니다';
      paint(d.rows || []);
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = '등록';
      el('rankNote').textContent = '등록에 실패했습니다';
    });
  }

  /** 난이도를 바꿨을 때처럼, 점수 제출 없이 순위표만 갈아끼울 때 쓴다. */
  function setMode(m) {
    mode = m || '';
    el('rankEntry').classList.add('hidden');
    el('rankNote').textContent = online ? '' : '이 브라우저 기록입니다';
    return refresh();
  }

  return { offer: offer, refresh: refresh, setMode: setMode, online: online };
})();`
