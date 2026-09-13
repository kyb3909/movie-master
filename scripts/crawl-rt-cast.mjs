/**
 * 로튼토마토 전체 출연진 수집
 *
 * 실행:
 *   node scripts/crawl-rt-cast.mjs
 *   node scripts/crawl-rt-cast.mjs --limit=20     # 시험용
 *   node scripts/crawl-rt-cast.mjs --delay=2000   # 천천히
 *
 * 중단해도 안전하다. 이미 받은 영화는 건너뛰고 이어서 받는다.
 *
 * --- 왜 따로 받나 ---
 * crawl-rt.mjs 는 영화 페이지(/m/<슬러그>)의 JSON-LD 를 읽는데, 거기에는
 * 배우가 5명까지만 들어 있다. 1,637편을 확인해 보니 한 편도 예외가 없었다.
 *
 * 5명이면 두 배우가 같은 영화에 겹칠 일이 거의 없다. 그래서
 *   · 배우 격자(가로세로 배우로 칸을 채우는 게임)를 만들 수가 없고
 *     (상위 200명을 다 써도 격자가 288개뿐이다. 한국 영화는 74만 개다)
 *   · 사진 있는 배우 5명을 못 채워 엔드게임·아바타 같은 대표작이 퀴즈에서 빠지고
 *   · 헐리우드 퀴즈에 난이도를 만들 수가 없다.
 *
 * 그런데 출연진 페이지(/m/<슬러그>/cast-and-crew)의 JSON-LD 에는 20명이 있다.
 * 모양은 영화 페이지와 같아서 그대로 쓸 수 있다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"

const IN_PATH = "data/rt-crawl.json"
const OUT_PATH = "data/rt-cast.json"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

/** 목록용 100x120 은 카드 크기에서 뭉개진다. 화면에 쓸 큰 판을 함께 만들어 둔다. */
const LARGE_SIZE = "500x600"

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

const DELAY_MS = Number(flags.delay ?? 1200)
const SAVE_EVERY = 25
/** 이만큼 연속으로 실패하면 차단으로 보고 멈춘다. 계속 두드려 봐야 소용없다. */
const MAX_CONSECUTIVE_FAIL = 12

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 리사이즈 주소의 치수만 바꾼다. 원본 주소가 안쪽에 한 번 더 들어 있는 구조다. */
function enlarge(url, size) {
  if (!url) return null
  return url.replace(/\/\d+x\d+\//, `/${size}/`)
}

async function fetchCast(rtUrl) {
  const res = await fetch(rtUrl.replace(/\/+$/, "") + "/cast-and-crew", {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const html = await res.text()
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error("NO_JSONLD")

  const ld = JSON.parse(m[1])
  const list = Array.isArray(ld.actor) ? ld.actor : ld.actor ? [ld.actor] : []

  return list
    .filter((a) => a?.name)
    .map((a, i) => ({
      name: a.name,
      // 로튼 출연진 순서가 곧 비중 순위다 (0번이 주연).
      billing: i + 1,
      url: a.sameAs || null,
      imageUrl: a.image || null,
      imageUrlLarge: enlarge(a.image, LARGE_SIZE),
    }))
}

// ============================================

const rt = JSON.parse(await readFile(IN_PATH, "utf8"))

const targets = Object.entries(rt.byBomId)
  .filter(([, v]) => v?.rtUrl)
  .map(([bomId, v]) => ({ bomId, rtUrl: v.rtUrl, title: v.rtTitle || bomId }))

let out = { fetchedAt: null, count: 0, byBomId: {}, failures: [] }
if (existsSync(OUT_PATH)) {
  out = JSON.parse(await readFile(OUT_PATH, "utf8"))
  out.failures = [] // 실패 목록은 이번 실행 기준으로 다시 쌓는다
}

let todo = targets.filter((t) => !out.byBomId[t.bomId])
if (flags.limit) todo = todo.slice(0, Number(flags.limit))

console.log(`\n로튼 전체 출연진 수집`)
console.log(`  대상 ${targets.length}편 중 ${todo.length}편 남음 (완료 ${targets.length - todo.length}편)`)
console.log(`  예상 소요 약 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분\n`)

if (todo.length === 0) {
  console.log("이미 모두 수집되었습니다.\n")
  process.exit(0)
}

async function save() {
  out.fetchedAt = new Date().toISOString()
  out.count = Object.keys(out.byBomId).length
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8")
}

let done = 0
let consecutiveFail = 0
let actorTotal = 0

for (const t of todo) {
  try {
    const actors = await fetchCast(t.rtUrl)
    out.byBomId[t.bomId] = { title: t.title, actors }
    actorTotal += actors.length
    consecutiveFail = 0

    if (++done % 50 === 0 || done <= 3) {
      console.log(`  [${String(done).padStart(4)}/${todo.length}] ${t.title} — ${actors.length}명`)
    }
  } catch (err) {
    out.failures.push({ bomId: t.bomId, title: t.title, reason: err.message })
    console.error(`  [${String(++done).padStart(4)}/${todo.length}] ${t.title} — 실패: ${err.message}`)

    if (++consecutiveFail > MAX_CONSECUTIVE_FAIL) {
      console.error(`\n연속 ${consecutiveFail}회 실패. 차단으로 보고 멈춥니다.`)
      console.error(`받아 둔 것은 저장했습니다. 잠시 뒤 같은 명령으로 이어받으세요.\n`)
      break
    }
  }

  if (done % SAVE_EVERY === 0) await save()
  await sleep(DELAY_MS)
}

await save()

const counts = Object.values(out.byBomId).map((v) => v.actors.length)
const avg = counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1) : 0

console.log(`\n수집 완료`)
console.log(`  영화 ${out.count}편 · 출연 기록 ${counts.reduce((a, b) => a + b, 0).toLocaleString()}건 · 편당 평균 ${avg}명`)
console.log(`  배우 10명 이상인 영화 ${counts.filter((n) => n >= 10).length}편`)
if (out.failures.length) console.log(`  실패 ${out.failures.length}편`)
console.log(`  저장: ${OUT_PATH}\n`)
