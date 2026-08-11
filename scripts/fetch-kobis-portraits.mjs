/**
 * KOBIS 배우 사진 수집
 *
 * data/kobis-cast.json 의 배우 목록을 읽어, peopleCd 로 인물 상세를 조회하고
 * 사진 URL 을 모은다.
 *
 * 실행:
 *   node scripts/fetch-kobis-portraits.mjs --limit=100   # 확보율 측정
 *   node scripts/fetch-kobis-portraits.mjs               # 전체
 *   node scripts/fetch-kobis-portraits.mjs --gb=all      # 단역 포함
 *
 * 중단해도 안전하다. 이미 조회한 배우는 건너뛴다.
 *
 * --- 네이버 방식과의 차이 ---
 * 네이버는 '이름'으로 검색해야 해서 동명이인이 섞였다. 실제로 김상중·조현철·
 * 손선아가 같은 사진을 받고, 강동원에 엄태구 사진이 들어가는 사고가 났다.
 *
 * KOBIS 는 출연진 데이터를 준 그 시스템이고, 우리는 이미 정확한 peopleCd 를
 * 갖고 있다. 검색 단계가 없으므로 다른 사람이 섞일 수 없다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const DTL_URL = "https://www.kobis.or.kr/kobis/business/mast/peop/searchPeopleDtl.do"
const HOST = "https://www.kobis.or.kr"

const IN_PATH = "data/kobis-cast.json"
const OUT_PATH = "data/kobis-portraits.json"

const SAVE_EVERY = 50
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0 Safari/537.36"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/**
 * 요청 간격. 다른 KOBIS 크롤러(제목 수집 등)와 동시에 돌릴 때는
 * --delay=1500 처럼 늘려 같은 서버에 부담이 겹치지 않게 한다.
 */
const DELAY_MS = Number(flags.delay ?? 800)

/**
 * 인물 상세 HTML 에서 사진 경로를 뽑는다.
 *
 * 사진은 /common/mast/people/YYYY/MM/thumb_x192/thn_<hash>.jpg 형태로 들어온다.
 * 같은 해시의 원본이 orgsrc 속성에 함께 오는 경우가 있어 짝지어 둔다.
 * 사진이 없는 인물은 noimage 플레이스홀더만 있고 이 경로가 아예 없다.
 */
function extractPortrait(html) {
  const all = [
    ...html.matchAll(/(?:src|orgsrc)="(\/common\/mast\/people\/[^"]+?\.(?:jpg|jpeg|png))"/gi),
  ].map((m) => m[1])

  if (!all.length) return null

  // 썸네일(thumb_x###)을 우선 쓴다. 크기가 일정하고 5~9KB 로 가볍다.
  const thumb = all.find((u) => /thumb_x\d+/.test(u)) || all[0]
  const hash = thumb.match(/thn_([a-f0-9]{32})\./i)?.[1]
  const original = hash
    ? all.find((u) => !/thumb_x\d+/.test(u) && u.includes(hash))
    : null

  return {
    thumb: HOST + thumb,
    original: original ? HOST + original : null,
    photoCount: new Set(all.map((u) => u.match(/thn_([a-f0-9]{32})\./i)?.[1]).filter(Boolean)).size,
  }
}

async function fetchPortrait(peopleCd) {
  const res = await fetch(DTL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
    },
    body: new URLSearchParams({
      code: peopleCd,
      sType: "",
      titleYN: "Y",
      etcParam: "",
      isOuterReq: "false",
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return extractPortrait(await res.text())
}

// ============================================

const cast = JSON.parse(await readFile(IN_PATH, "utf8"))

/**
 * 배우별로 한 레코드만 남긴다. 이때 배역 구분(actorGb)이 가장 앞선 것을 고른다.
 *
 * 처음에는 먼저 만난 레코드를 그대로 뒀는데, 그러면 한 영화에서 단역이었던 배우가
 * 다른 영화의 주연이어도 아래 gbFilter 에서 잘려 사진을 아예 조회하지 않는다.
 * 천호진(3→2)·김해숙(3→1)·기주봉(3→2) 같은 687명이 이렇게 빠져 있었다.
 * 얼굴은 다 아는 조연들이라 퀴즈에서 가장 아쉬운 손실이었다.
 */
const actors = new Map()
for (const list of Object.values(cast.castByMovie)) {
  for (const p of list) {
    const prev = actors.get(p.peopleCd)
    if (!prev || Number(p.actorGb ?? 9) < Number(prev.actorGb ?? 9)) actors.set(p.peopleCd, p)
  }
}

const gbFilter = flags.gb === "all" ? null : String(flags.gb || "1,2").split(",")
let targets = [...actors.values()]
if (gbFilter) targets = targets.filter((p) => gbFilter.includes(p.actorGb))
if (flags.limit) targets = targets.slice(0, Number(flags.limit))

let out = { fetchedAt: null, byPeopleCd: {} }
if (existsSync(OUT_PATH)) out = JSON.parse(await readFile(OUT_PATH, "utf8"))

const todo = targets.filter((p) => !out.byPeopleCd[p.peopleCd])

console.log(`\nKOBIS 배우 사진 수집`)
console.log(`  대상 ${targets.length}명 중 ${todo.length}명 남음`)
console.log(`  예상 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 조회했습니다.\n")
  process.exit(0)
}

const stat = { found: 0, none: 0, error: 0 }
let done = 0

async function save() {
  out.fetchedAt = new Date().toISOString()
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

for (const person of todo) {
  done++
  try {
    const found = await fetchPortrait(person.peopleCd)

    out.byPeopleCd[person.peopleCd] = {
      name: person.name,
      nameEn: person.nameEn,
      birth: person.birth,
      imageUrl: found?.thumb ?? null,
      imageOriginal: found?.original ?? null,
      photoCount: found?.photoCount ?? 0,
      checkedAt: new Date().toISOString(),
    }

    if (found) stat.found++
    else stat.none++

    if (done % 25 === 0 || done <= 5) {
      console.log(
        `  [${String(done).padStart(4)}/${todo.length}] ${person.name} — ${found ? "사진 있음" : "없음"} (누적 확보 ${stat.found})`
      )
    }
  } catch (err) {
    stat.error++
    console.error(`  [${String(done).padStart(4)}/${todo.length}] ${person.name} — 오류: ${err.message}`)
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const rate = Math.round((stat.found / (stat.found + stat.none || 1)) * 100)
console.log(`\n수집 완료`)
console.log(`  사진 확보 ${stat.found}명 / 없음 ${stat.none}명 / 오류 ${stat.error}명`)
console.log(`  확보율 ${rate}%`)
console.log(`  저장: ${OUT_PATH}\n`)
