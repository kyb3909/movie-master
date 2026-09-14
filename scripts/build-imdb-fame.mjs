/**
 * IMDb 공개 데이터로 배우 인지도 표 만들기
 *
 * 준비 (한 번만):
 *   mkdir -p data/imdb
 *   curl -o data/imdb/name.basics.tsv.gz     https://datasets.imdbws.com/name.basics.tsv.gz
 *   curl -o data/imdb/title.ratings.tsv.gz   https://datasets.imdbws.com/title.ratings.tsv.gz
 *   curl -o data/imdb/title.principals.tsv.gz https://datasets.imdbws.com/title.principals.tsv.gz
 *
 * 실행:
 *   node scripts/build-imdb-fame.mjs      → data/imdb-fame.json
 *
 * --- 무엇을 재나 ---
 * "주연급으로 이름을 올린 작품을 몇 명이나 봤나" 를 잰다.
 * 배역 순서 3위 안에 든 작품들의 IMDb 평점 투표 수를 더한 값이다.
 *
 * --- 두 번 틀린 끝에 정한 방식이다 ---
 *
 * 1차: 우리 출제 목록 384편 중 몇 편에 나오는가
 *   → 유명한 정도가 아니라 '최근 20년 흥행작에 얼마나 자주 나왔나' 였다.
 *     히스 레저는 다크 나이트 한 편뿐이라 무명으로 잡혀 조커가 힌트에서 빠졌다.
 *
 * 2차: 대표작(knownForTitles)이 받은 투표 수 합
 *   → 그 사람이 스쳐간 영화가 유명한지를 잴 뿐이었다. 단역도 블록버스터에 나오면
 *     높게 나온다. 다렐 포스터(단역) 168만이 마이클 케인 28만보다 높았다.
 *
 * 3차(지금): 배역 순서 3위 안에 든 작품들의 투표 수 합
 *   → 주연을 맡은 적이 있어야 점수가 생긴다. 단역은 아무리 큰 영화에 나와도 0 이다.
 *     한 편만 찍고 은퇴했어도 그 한 편이 유명하면 높게 나온다.
 *
 * --- 동명이인 ---
 * 이름으로만 맞추므로 같은 이름이 여럿이면 점수가 높은 쪽을 쓴다.
 * 크리스 에반스(마블)와 동명의 영국 방송인 중 마블 쪽이 잡힌다.
 * 우리는 흥행작 출연진만 조회하므로 이 선택이 거의 언제나 맞다.
 */

import { createReadStream } from "node:fs"
import { createGunzip } from "node:zlib"
import { createInterface } from "node:readline"
import { writeFile, readFile } from "node:fs/promises"

const NAMES = "data/imdb/name.basics.tsv.gz"
const RATINGS = "data/imdb/title.ratings.tsv.gz"
const PRINCIPALS = "data/imdb/title.principals.tsv.gz"
const OUT_PATH = "data/imdb-fame.json"

/** 주연으로 칠 배역 순서. 3위까지면 포스터에 이름이 오르는 선이다. */
const LEAD_ORDER = 3

/** tsv.gz 를 한 줄씩 흘려 읽는다. 파일이 783MB 라 통째로 올리면 안 된다. */
async function* rows(path) {
  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue } // 헤더
    yield line.split("\t")
  }
}

// ============================================

/** 우리가 쓰는 배우 이름만 추린다. IMDb 전체 1,500만 명을 담을 이유가 없다. */
const wanted = new Set()
try {
  const cat = JSON.parse(await readFile("data/hollywood-catalog.json", "utf8"))
  for (const m of cat.movies) for (const a of m.actors ?? []) if (a.name) wanted.add(a.name)
} catch {
  console.error("data/hollywood-catalog.json 이 필요합니다.")
  process.exit(1)
}

console.log(`\nIMDb 인지도 표 생성`)
console.log(`  대상 배우 이름 ${wanted.size.toLocaleString()}개`)

// 1) 우리가 찾는 이름의 IMDb 번호(nconst) 를 모은다
const nconstOf = new Map() // nconst → 이름
let scanned = 0
for await (const [nconst, primaryName, , , primaryProfession] of rows(NAMES)) {
  scanned++
  if (!wanted.has(primaryName)) continue
  // 배우로 등록된 사람만. 같은 이름의 감독·제작자가 잡히면 점수가 엉킨다.
  if (!/act(or|ress)/.test(primaryProfession || "")) continue
  nconstOf.set(nconst, primaryName)
}
console.log(`  인물 자료 ${scanned.toLocaleString()}명 훑어 후보 ${nconstOf.size.toLocaleString()}명 확보 (동명이인 포함)`)

// 2) 작품별 투표 수
const votes = new Map()
for await (const [tconst, , numVotes]of rows(RATINGS)) {
  const n = Number(numVotes) || 0
  // 1만 표 미만은 대중이 본 작품으로 보기 어렵다. 담아 둬도 메모리만 먹는다.
  if (n >= 10000) votes.set(tconst, n)
}
console.log(`  평점 자료에서 1만 표 이상 ${votes.size.toLocaleString()}편 확보`)

// 3) 배역 순서 3위 안에 든 작품의 투표 수를 더한다
const score = new Map() // nconst → 점수
const leadCount = new Map()
let rowsSeen = 0
for await (const [tconst, ordering, nconst, category] of rows(PRINCIPALS)) {
  rowsSeen++
  if (Number(ordering) > LEAD_ORDER) continue
  if (!/act(or|ress)/.test(category || "")) continue
  if (!nconstOf.has(nconst)) continue
  const v = votes.get(tconst)
  if (!v) continue
  score.set(nconst, (score.get(nconst) ?? 0) + v)
  leadCount.set(nconst, (leadCount.get(nconst) ?? 0) + 1)
}
console.log(`  출연 기록 ${rowsSeen.toLocaleString()}건 훑음`)

// 4) 이름별로 가장 높은 점수를 남긴다 (동명이인 처리)
const byName = {}
const leadsByName = {}
for (const [nconst, name] of nconstOf) {
  const s = score.get(nconst) ?? 0
  if (s > (byName[name] ?? -1)) {
    byName[name] = s
    leadsByName[name] = leadCount.get(nconst) ?? 0
  }
}

const found = Object.values(byName).filter((v) => v > 0).length
console.log(`  주연 기록이 있는 배우 ${found.toLocaleString()}명 / 이름 ${Object.keys(byName).length.toLocaleString()}개`)

await writeFile(
  OUT_PATH,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "datasets.imdbws.com",
    method: `배역 순서 ${LEAD_ORDER}위 안에 든 작품의 IMDb 투표 수 합`,
    count: found,
    byName,
    leads: leadsByName,
  }),
  "utf8"
)

// 기준값을 정하려면 분포를 봐야 한다.
const vals = Object.values(byName).sort((a, b) => a - b)
const at = (p) => vals[Math.floor(vals.length * p)].toLocaleString()
console.log(`\n  점수 분포`)
console.log(`    0점(주연 경험 없음) ${vals.filter((v) => v === 0).length.toLocaleString()}명`)
console.log(`    하위 25% ${at(0.25)} · 중앙값 ${at(0.5)} · 75% ${at(0.75)} · 90% ${at(0.9)}`)

const show = (n) => `${n.padEnd(20)} ${(byName[n] ?? 0).toLocaleString().padStart(12)}  (주연 ${leadsByName[n] ?? 0}편)`
console.log(`\n  확인용 — 위 셋은 높고 아래 셋은 낮아야 한다`)
for (const n of ["Heath Ledger", "Michael Caine", "Rami Malek", "Lucy Boynton"]) console.log(`    ${show(n)}`)
console.log()
for (const n of ["Dileep Rao", "Darrell Foster", "Monique Curnen"]) console.log(`    ${show(n)}`)
console.log(`\n  저장: ${OUT_PATH}\n`)
