/**
 * KOBIS 에 사진이 없는 배우를 네이버에서 보충
 *
 * 실행:
 *   node scripts/fetch-naver-fill.mjs --limit=30   # 표본 측정
 *   node scripts/fetch-naver-fill.mjs             # 전체
 *
 * --- 지난 실패와 무엇이 다른가 ---
 * 처음 시도에서는 검색 결과 페이지 전체에서 인물 이미지처럼 보이는 첫 URL 을
 * 집었다. 그 결과 김상중에 이하늬 사진이, 강동원에 엄태구 사진이 들어갔고
 * 같은 사진이 서로 다른 배우 80명에게 배정됐다.
 *
 * 이번에는 세 가지를 모두 통과한 것만 받는다.
 *   1) data-id="main_profile" 인 대표 이미지에서만 URL 을 뽑는다
 *      (연관 인물·뉴스 썸네일이 섞이지 않는다)
 *   2) 그 img 의 alt 가 검색한 이름과 정확히 일치해야 한다
 *      — alt 에는 사진 주인의 이름이 들어 있다
 *   3) KOBIS 생년월일과 네이버 '출생' 이 일치해야 한다
 *
 * 생년월일이 없어 3번을 못 하는 배우는 기본적으로 건너뛴다.
 * --allow-unverified 를 주면 1·2번만 통과해도 받되 따로 표시한다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const IN_CAST = "data/kobis-cast.json"
const IN_PORTRAITS = "data/kobis-portraits.json"
const OUT_PATH = "data/naver-fill.json"

/**
 * 요청 간격. 1.5초로 900건, 2.5초로 800건에서 403 이 났다.
 * 간격만으로는 못 피하는 누적 한도로 보여, 차단당하면 쉬었다가 이어간다.
 */
const DELAY_MS = 3500

/** 403 을 만났을 때 대기 시간(분). 순서대로 늘려가며 재시도한다. */
const BACKOFF_MIN = [10, 20, 30]
const SAVE_EVERY = 20
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}
const allowUnverified = Boolean(flags["allow-unverified"])

/** KOBIS "19710518" → "1971.05.18" */
const toDot = (s) =>
  s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : null

/** 두 날짜의 일 수 차이. 자료원 간 하루 오차는 같은 사람으로 본다. */
function daysApart(a, b) {
  const p = (s) => {
    const [y, m, d] = s.split(".").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.abs(p(a) - p(b)) / 86400000
}

/**
 * 대표 프로필 이미지와 출생일을 뽑는다.
 * alt 가 검색어와 다르면 다른 사람의 사진이므로 null 을 돌려준다.
 */
function extractProfile(html, expectName) {
  const idx = html.indexOf('data-id="main_profile"')
  if (idx < 0) return { reason: "no_profile_card" }

  // 대표 이미지 태그는 앵커 바로 뒤에 온다.
  const seg = html.slice(idx, idx + 1500)

  const alt = seg.match(/alt="([^"]*)"/)?.[1]?.trim()
  if (!alt) return { reason: "no_alt" }
  if (alt !== expectName) return { reason: "name_mismatch", alt }

  const srcEnc = seg.match(/[?&]src=([^"'&\s]+)/)?.[1]
  let imageUrl = null
  if (srcEnc) {
    try {
      imageUrl = decodeURIComponent(srcEnc).replace(/^http:/, "https:")
    } catch {}
  }
  if (!imageUrl) {
    const raw = seg.match(/src="(https?:\/\/[^"]*people[^"]*)"/)?.[1]
    imageUrl = raw ? raw.replace(/^http:/, "https:") : null
  }
  if (!imageUrl) return { reason: "no_image" }

  // 출생: <dt>...출생</dt><dd>1971.05.18.
  const b = html.match(/출생<\/dt>\s*<dd>\s*(\d{4})\.(\d{2})\.(\d{2})/)
  const birth = b ? `${b[1]}.${b[2]}.${b[3]}` : null

  return { imageUrl, birth, alt }
}

async function search(name) {
  const url =
    "https://search.naver.com/search.naver?where=people&query=" + encodeURIComponent(name)
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ko-KR,ko;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  })
  if (res.status === 403) throw new Error("BLOCKED")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ============================================

const cast = JSON.parse(await readFile(IN_CAST, "utf8"))
const portraits = JSON.parse(await readFile(IN_PORTRAITS, "utf8"))

const hasPhoto = new Set(
  Object.entries(portraits.byPeopleCd).filter(([, v]) => v.imageUrl).map(([k]) => k)
)

// 대상: 주연·조연이면서 KOBIS 사진이 없는 배우
const actors = new Map()
for (const list of Object.values(cast.castByMovie)) {
  for (const p of list) {
    if (!["1", "2"].includes(p.actorGb)) continue
    if (hasPhoto.has(p.peopleCd)) continue
    if (!actors.has(p.peopleCd)) actors.set(p.peopleCd, p)
  }
}

// 생년월일이 있어야 검증이 가능하다. 인기 배우가 먼저 오도록 정렬 기준은 없으니
// 생년 보유자를 앞에 둔다.
let targets = [...actors.values()].sort((a, b) => (b.birth ? 1 : 0) - (a.birth ? 1 : 0))
if (!allowUnverified) targets = targets.filter((p) => p.birth)
if (flags.limit) targets = targets.slice(0, Number(flags.limit))

let out = { fetchedAt: null, byPeopleCd: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))

const todo = targets.filter((p) => !out.byPeopleCd[p.peopleCd])

console.log(`\n네이버 사진 보충 (KOBIS 미보유분)`)
console.log(`  사진 없는 주연·조연 ${actors.size}명`)
console.log(`  이번 대상 ${targets.length}명 (남은 ${todo.length}명)`)
console.log(`  검증: 이름 일치 + 생년 일치${allowUnverified ? " (미검증도 허용)" : " (필수)"}`)
console.log(`  간격 ${DELAY_MS}ms → 예상 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (!todo.length) {
  console.log("이미 모두 조회했습니다.\n")
  process.exit(0)
}

let blockCount = 0
const stat = { accepted: 0, nameMismatch: 0, birthMismatch: 0, noCard: 0, noBirth: 0, error: 0 }
let done = 0

async function save() {
  out.fetchedAt = new Date().toISOString()
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const person of todo) {
  done++
  try {
    const html = await search(person.name)
    const found = extractProfile(html, person.name)
    const expected = toDot(person.birth)

    let status, imageUrl = null

    if (found.reason === "name_mismatch") {
      status = "name_mismatch"
      stat.nameMismatch++
    } else if (found.reason) {
      status = "no_photo"
      stat.noCard++
    } else if (expected && found.birth) {
      const same = found.birth === expected || daysApart(found.birth, expected) <= 1
      if (same) { status = "verified"; imageUrl = found.imageUrl; stat.accepted++ }
      else { status = "birth_mismatch"; stat.birthMismatch++ }
    } else if (allowUnverified) {
      status = "unverified"; imageUrl = found.imageUrl; stat.accepted++
    } else {
      status = "no_birth"
      stat.noBirth++
    }

    out.byPeopleCd[person.peopleCd] = {
      name: person.name,
      imageUrl,
      status,
      kobisBirth: expected,
      naverBirth: found.birth ?? null,
      naverAlt: found.alt ?? null,
      checkedAt: new Date().toISOString(),
    }

    const mark = { verified: "✓", unverified: "~", name_mismatch: "✗", birth_mismatch: "✗", no_photo: "-", no_birth: "?" }[status]
    if (done <= 30 || done % 25 === 0) {
      console.log(
        `  [${String(done).padStart(4)}/${todo.length}] ${mark} ${person.name}` +
          (status === "birth_mismatch" ? `  (KOBIS ${expected} ≠ 네이버 ${found.birth})` : "") +
          (status === "name_mismatch" ? `  (사진 주인: ${found.alt})` : "")
      )
    }
  } catch (err) {
    if (err.message === "BLOCKED") {
      // 차단당하면 이번 배우는 기록하지 않는다. 기록하면 이어받기가 건너뛴다.
      const wait = BACKOFF_MIN[blockCount] ?? BACKOFF_MIN[BACKOFF_MIN.length - 1]
      blockCount++
      await save()

      if (blockCount > BACKOFF_MIN.length) {
        console.error(`\n차단이 반복됩니다(${blockCount}회). ${stat.accepted}명 저장하고 종료합니다.`)
        console.error(`나중에 다시 실행하면 이어받습니다.\n`)
        break
      }

      // 이 배우는 결과를 기록하지 않았으므로 다음 실행에서 다시 대상이 된다.
      // 순회 중인 배열을 건드리지 않기 위해 이번 판에서는 그냥 넘어간다.
      console.error(`\n차단(403) — ${wait}분 대기 후 재개합니다. (지금까지 채택 ${stat.accepted}명)\n`)
      await sleep(wait * 60_000)
      continue
    }
    stat.error++
    console.error(`  [${done}] ${person.name} — ${err.message}`)
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const tried = stat.accepted + stat.nameMismatch + stat.birthMismatch + stat.noCard + stat.noBirth
console.log(`\n결과 (조회 ${tried}명)`)
console.log(`  ✓ 채택          ${stat.accepted}명`)
console.log(`  ✗ 이름 불일치    ${stat.nameMismatch}명  (다른 사람 사진 — 폐기)`)
console.log(`  ✗ 생년 불일치    ${stat.birthMismatch}명  (동명이인 — 폐기)`)
console.log(`  - 프로필 없음    ${stat.noCard}명`)
console.log(`  ? 생년 없어 검증불가 ${stat.noBirth}명`)
console.log(`  오류            ${stat.error}명`)
console.log(`  저장: ${OUT_PATH}\n`)
