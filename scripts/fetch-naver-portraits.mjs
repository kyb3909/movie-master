/**
 * 네이버 인물 프로필 사진 수집
 *
 * data/kobis-cast.json 의 배우 명단을 읽어, 네이버 통합검색의 인물정보 카드에서
 * 프로필 사진 URL 을 찾는다.
 *
 * 실행:
 *   node scripts/fetch-naver-portraits.mjs --limit=50
 *   node scripts/fetch-naver-portraits.mjs --gb=1,2      # 주연·조연만 (기본)
 *   node scripts/fetch-naver-portraits.mjs --gb=all      # 단역 포함
 *
 * 중단해도 안전하다. 이미 조회한 배우는 건너뛴다.
 *
 * --- 매칭 신뢰도 ---
 * 이름만으로 검색하면 동명이인이 섞인다. KOBIS 가 준 생년월일과
 * 네이버 인물정보의 '출생'을 대조해 검증 등급을 매긴다.
 *
 *   verified : 생년월일이 일치 — 신뢰 가능
 *   unverified: KOBIS 에 생년월일이 없어 대조 불가 — 사람이 확인 필요
 *   mismatch : 생년월일이 다름 — 다른 사람일 가능성이 높아 URL 을 버린다
 *
 * 배우가 아닌 동명의 인물(운동선수 등)이 잡히는 것을 줄이기 위해
 * 검색어에 '배우'를 붙인다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const IN_PATH = "data/kobis-cast.json"
const OUT_PATH = "data/naver-portraits.json"

/** 검색 요청 간격. 짧게 두면 차단될 수 있다. */
const DELAY_MS = 1500

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

const SAVE_EVERY = 25

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ============================================

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/** KOBIS birYrMmdd("19701129") → "1970.11.29" (네이버 표기 형식) */
function toNaverDate(s) {
  if (!s || !/^\d{8}$/.test(s)) return null
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
}

/**
 * "1970.11.20" 두 개의 날짜 차이(일).
 * KOBIS 와 네이버가 하루씩 어긋나는 경우가 있어(예: 정재영 11.20 vs 11.21)
 * 그 정도는 같은 사람으로 본다.
 */
function daysApart(a, b) {
  const p = (s) => {
    const [y, m, d] = s.split(".").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.abs(p(a) - p(b)) / 86400000
}

/**
 * 검색 결과 HTML 에서 인물 프로필 사진과 출생일을 뽑는다.
 *
 * 네이버는 인물 사진을 두 경로로 서빙한다.
 *   sstatic.naver.net/people/portrait/YYYYMM/...   (구형)
 *   sstatic.naver.net/people/profileImg/<uuid>...  (신형)
 * 둘 다 인물정보 전용 경로라 뉴스 썸네일과 섞이지 않는다.
 *
 * 이미지는 search.pstatic.net 프록시의 src= 파라미터에 퍼센트 인코딩되어
 * 들어가는 경우가 있어, 디코딩한 뒤 경로를 판별해야 한다.
 * (인코딩된 형태만 보고 판단하면 현빈 같은 사례를 놓친다.)
 */
function extractProfile(html) {
  let imageUrl = null

  for (const m of html.matchAll(/[?&]src=([^"'&\s]+)/g)) {
    let decoded
    try {
      decoded = decodeURIComponent(m[1])
    } catch {
      continue
    }
    if (/people\/(?:profileImg|portrait)\//i.test(decoded)) {
      imageUrl = decoded.replace(/^http:/, "https:")
      break
    }
  }

  if (!imageUrl) {
    const raw = html.match(
      /https?:\/\/[^"'\s]*people\/(?:profileImg|portrait)\/[^"'\s]+?\.(?:jpg|jpeg|png)/i
    )
    if (raw) imageUrl = raw[0].replace(/^http:/, "https:")
  }

  // '출생' 라벨 뒤의 날짜. 인물정보 카드가 펼쳐진 경우에만 나온다.
  const b = html.match(/출생[\s\S]{0,200}?(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})/)
  const birth = b
    ? `${b[1]}.${b[2].padStart(2, "0")}.${b[3].padStart(2, "0")}`
    : null

  return { imageUrl, birth }
}

async function searchPerson(name) {
  // where=people 은 인물검색 전용 탭이라 통합검색보다 마크업이 일정하다.
  // (통합검색은 인물마다 영상·뉴스가 먼저 오는 등 레이아웃이 달라진다.)
  const url =
    "https://search.naver.com/search.naver?where=people&query=" +
    encodeURIComponent(name)

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return extractProfile(await res.text())
}

// ============================================

const castData = JSON.parse(await readFile(IN_PATH, "utf8"))

// 배우 목록을 peopleCd 로 중복 제거
const actors = new Map()
for (const cast of Object.values(castData.castByMovie)) {
  for (const p of cast) {
    if (!actors.has(p.peopleCd)) actors.set(p.peopleCd, p)
  }
}

// 배역 구분 필터. 기본은 주연·조연만 — 단역은 사진이 있을 확률도 낮고
// 퀴즈·캐스팅 어디에도 쓰이지 않는다.
const gbFilter =
  flags.gb === "all" ? null : String(flags.gb || "1,2").split(",")

let targets = [...actors.values()]
if (gbFilter) targets = targets.filter((p) => gbFilter.includes(p.actorGb))
if (flags.limit) targets = targets.slice(0, Number(flags.limit))

// 이어받기
let out = { fetchedAt: null, byPeopleCd: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))

const todo = targets.filter((p) => !out.byPeopleCd[p.peopleCd])

console.log(`\n네이버 프로필 사진 수집`)
console.log(`  전체 배우 ${actors.size}명 중 대상 ${targets.length}명 (배역구분: ${gbFilter ? gbFilter.join(",") : "전체"})`)
console.log(`  남은 ${todo.length}명, 예상 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 조회했습니다.\n")
  process.exit(0)
}

const stat = { verified: 0, unverified: 0, mismatch: 0, notfound: 0, error: 0 }
let done = 0

async function save() {
  out.fetchedAt = new Date().toISOString()
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const person of todo) {
  done++
  try {
    const found = await searchPerson(person.name)
    const expected = toNaverDate(person.birth)

    // 판정 규칙
    //   양쪽 생년월일이 다 있고 일치        → verified
    //   양쪽 다 있고 하루 이내 차이         → verified (자료원 간 표기 오차로 본다)
    //   양쪽 다 있고 명확히 다름            → mismatch (다른 사람이므로 URL 폐기)
    //   어느 한쪽이라도 없어 대조 불가      → unverified (URL 은 남기되 사람이 확인 필요)
    //
    // 네이버 인물카드의 '출생'은 항상 노출되지는 않는다. 추출 실패를 불일치로
    // 취급하면 멀쩡한 사진을 대량으로 버리게 되므로 반드시 구분해야 한다.
    let status
    if (!found.imageUrl) {
      status = "notfound"
    } else if (!expected || !found.birth) {
      status = "unverified"
    } else if (found.birth === expected || daysApart(found.birth, expected) <= 1) {
      status = "verified"
    } else {
      status = "mismatch"
    }

    out.byPeopleCd[person.peopleCd] = {
      name: person.name,
      // 생년월일이 어긋나면 다른 사람일 가능성이 높으므로 URL 을 남기지 않는다.
      imageUrl: status === "mismatch" ? null : found.imageUrl,
      status,
      kobisBirth: expected,
      naverBirth: found.birth,
      checkedAt: new Date().toISOString(),
    }

    stat[status]++

    const mark =
      { verified: "✓", unverified: "?", mismatch: "✗", notfound: "-" }[status]
    console.log(
      `  [${String(done).padStart(4)}/${todo.length}] ${mark} ${person.name}` +
        (status === "mismatch" ? `  (KOBIS ${expected} ≠ 네이버 ${found.birth})` : "")
    )
  } catch (err) {
    stat.error++
    out.byPeopleCd[person.peopleCd] = {
      name: person.name,
      imageUrl: null,
      status: "error",
      reason: err.message,
      checkedAt: new Date().toISOString(),
    }
    console.error(`  [${String(done).padStart(4)}/${todo.length}] ! ${person.name} — ${err.message}`)
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

console.log(`\n수집 완료`)
console.log(`  검증됨(생년일치) ${stat.verified}`)
console.log(`  미검증(생년없음) ${stat.unverified}`)
console.log(`  불일치(폐기)     ${stat.mismatch}`)
console.log(`  사진 없음        ${stat.notfound}`)
console.log(`  오류             ${stat.error}`)
console.log(`  저장: ${OUT_PATH}\n`)
