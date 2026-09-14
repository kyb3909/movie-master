/**
 * 배우 격자 문제 생성
 *
 * 실행:
 *   node scripts/build-grid-puzzles.mjs
 *   node scripts/build-grid-puzzles.mjs --count=500 --stars=150
 *
 * 가로 3명·세로 3명의 배우를 놓고, 두 배우가 함께 나온 영화로 아홉 칸을 채우는
 * 게임의 문제를 미리 만들어 둔다. 정적 페이지라 서버가 없으므로 플레이할 때
 * 만들 수 없다.
 *
 * --- 문제가 되려면 ---
 * 1. 아홉 칸 모두 정답이 하나 이상 있어야 한다.
 * 2. 아홉 칸을 '서로 다른 영화' 로 채울 수 있어야 한다.
 *    한 영화가 여러 칸의 유일한 답이면 그 칸들을 동시에 채울 수 없다.
 *    실제로 무작위 격자의 4분의 3이 여기서 걸린다.
 * 3. 축에 선 여섯 명이 알 만한 배우여야 한다.
 *    모르는 얼굴이 축에 있으면 풀 수가 없다.
 *
 * --- 인지도를 어떻게 재나 ---
 * 직접 잴 방법이 없어 '주연으로 나온 영화의 관객 수 합' 으로 대신 잰다.
 * 조연은 0.3 을 곱한다. TV·예능으로 유명한 사람은 실제보다 낮게 잡히는데,
 * 축에 세울 배우는 어차피 상위권만 쓰므로 큰 문제가 되지 않는다.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const OUT_PATH = "data/grid-puzzles.json"

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=?(.*)$/)
  if (m) flags[m[1]] = m[2] === "" ? true : m[2]
}

/** 만들 문제 수. */
const COUNT = Number(flags.count ?? 300)

/**
 * 축에 세울 배우를 상위 몇 명까지 쓸 것인가.
 *
 * 60명이면 74만 개, 120명이면 465만 개의 격자가 나온다. 어차피 다 쓰지 못하므로
 * 개수가 아니라 '아는 얼굴인가' 로 정해야 한다. 120명이면 조연 전문 배우까지
 * 들어오지만 얼굴은 아는 선이다.
 */
const STARS = Number(flags.stars ?? 120)

/**
 * 아홉 칸의 정답을 다 합쳐 이보다 적으면 버린다.
 *
 * 칸마다 답이 딱 하나뿐이면 그 영화를 떠올리지 못하는 순간 끝이라, 실력이 아니라
 * 운에 가까워진다.
 *
 * 처음에는 18(칸당 평균 두 개)로 뒀는데, 같은 축에 함께 나온 배우를 두지 않기로
 * 하면서 12로 낮췄다. 가로 셋이 서로 겹치지 않는 배우들이라 칸마다 걸리는 작품도
 * 적어지기 때문이다. 18을 고집하면 쓸 수 있는 격자가 36개로 줄어든다.
 *
 * 답이 하나뿐인 칸이 있어도 풀 수는 있다. 반면 함께 나온 배우가 같은 축에 서서
 * 만날 칸이 아예 없는 것은 고장으로 보인다. 정확함을 택했다.
 */
const MIN_TOTAL_ANSWERS = Number(flags["min-answers"] ?? 12)

/**
 * 몇 개의 가로 조합을 훑어볼 것인가.
 *
 * 쓸 수 있는 조합이 13만 가지라 다 볼 필요가 없다. 넉넉히 훑어 모은 뒤
 * 그중 답이 풍부한 것만 골라 쓴다. 앞에서 찾는 대로 채우면 질이 들쭉날쭉해진다.
 */
const SCAN = Number(flags.scan ?? 25000)

const read = async (p) => JSON.parse(await readFile(p, "utf8"))

// ============================================

const cast = await read("data/kobis-cast.json")
const kq = await read("data/quizzes.json")

/** 정답으로 인정할 영화 = 퀴즈에 쓰는 영화와 같은 기준(관객 100만 이상 한국영화). */
const title = new Map(kq.quizzes.map((q) => [q.movieCd, q.title]))
const audi = new Map(kq.quizzes.map((q) => [q.movieCd, q.audiAcc ?? 0]))

// 사진은 퀴즈와 같은 것을 쓴다. peopleCd 로 직접 조회한 것이라 동명이인이 섞이지 않는다.
const photo = new Map()
for (const [cd, v] of Object.entries((await read("data/kobis-portraits.json")).byPeopleCd)) {
  if (v.imageUrl) photo.set(cd, v.imageUrl)
}
try {
  for (const [cd, v] of Object.entries((await read("data/naver-fill.json")).byPeopleCd)) {
    if (v.status === "verified" && v.imageUrl && !photo.has(cd)) photo.set(cd, v.imageUrl)
  }
} catch { /* 보충 파일이 없으면 KOBIS 것만 쓴다 */ }

/**
 * 배우별 출연작과 인지도. 주연·조연만 센다(단역까지 넣으면 아무나 연결된다).
 *
 * --- 이름으로 합친다 ---
 * KOBIS 에는 같은 이름의 인물 코드가 둘씩 있는 배우가 79명이다.
 * 황정민이 8편짜리와 24편짜리로 쪼개져 있는 식이다.
 *
 * 코드별로 따로 두면 화면에는 '황정민' 한 사람으로 보이는데 출연작은 절반만
 * 잡힌다. 실제로 황정민과 진선규가 같은 축에 나란히 섰는데 둘이 함께 나온
 * 사바하가 안 보여, 만날 칸이 없는 채로 문제가 만들어졌다.
 *
 * 합치면 동명이인(정경호·주진모는 실제로 두 사람이다)의 작품이 섞일 수 있지만,
 * 그건 정답 후보가 하나 늘어날 뿐이라 해가 없다. 반대로 안 합치면 맞는 답이
 * 틀렸다고 나온다. 덜 나쁜 쪽을 택한다.
 */
const A = new Map()
for (const [movieCd, list] of Object.entries(cast.castByMovie)) {
  if (!title.has(movieCd)) continue
  for (const p of list) {
    if (!["1", "2"].includes(p.actorGb) || !p.peopleCd || !p.name) continue
    if (!A.has(p.name)) A.set(p.name, { name: p.name, films: new Set(), fame: 0, codes: new Set() })
    const a = A.get(p.name)
    a.films.add(movieCd)
    a.codes.add(p.peopleCd)
    a.fame += (audi.get(movieCd) ?? 0) * (p.actorGb === "1" ? 1 : 0.3)
  }
}

/** 사진은 인물 코드마다 따로다. 합친 코드 중 사진이 있는 것을 쓴다. */
const photoOf = (a) => [...a.codes].map((cd) => photo.get(cd)).find(Boolean) ?? null

// 사진이 없으면 축에 세울 수 없다. 이름만 덩그러니 있으면 누군지 모른다.
const stars = [...A.entries()]
  .filter(([, a]) => photoOf(a))
  .sort((a, b) => b[1].fame - a[1].fame)
  .slice(0, STARS)

const N = stars.length
const shared = (i, j) => [...stars[i][1].films].filter((f) => stars[j][1].films.has(f))

/** co[i] = i번 배우와 함께 나온 배우들의 비트마스크. 격자 탐색을 빠르게 하려고 만든다. */
const co = Array.from({ length: N }, () => 0n)
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    if (shared(i, j).length) {
      co[i] |= 1n << BigInt(j)
      co[j] |= 1n << BigInt(i)
    }
  }
}

const bits = (mask) => {
  const out = []
  let m = mask, i = 0
  while (m) {
    if (m & 1n) out.push(i)
    m >>= 1n
    i++
  }
  return out
}

/**
 * 아홉 칸을 서로 다른 영화로 채울 수 있는가 (이분 매칭).
 * 칸마다 쓸 수 있는 영화 목록이 있고, 영화는 한 번씩만 쓸 수 있다.
 */
function solvable(cells) {
  const matchOf = new Map() // 영화 → 그 영화를 차지한 칸
  const tryAssign = (cell, seen) => {
    for (const f of cells[cell]) {
      if (seen.has(f)) continue
      seen.add(f)
      if (!matchOf.has(f) || tryAssign(matchOf.get(f), seen)) {
        matchOf.set(f, cell)
        return true
      }
    }
    return false
  }
  for (let c = 0; c < cells.length; c++) if (!tryAssign(c, new Set())) return false
  return true
}

// ============================================

/** 세로 3명도 서로 함께 나온 적이 없어야 한다. 가로와 같은 이유다. */
function pickCols(pool) {
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      if (sharesWith(pool[i], pool[j])) continue
      for (let k = j + 1; k < pool.length; k++) {
        if (sharesWith(pool[i], pool[k]) || sharesWith(pool[j], pool[k])) continue
        return [pool[i], pool[j], pool[k]]
      }
    }
  return null
}

const shuffle = (a) => {
  // Fisher-Yates. sort(() => Math.random() - 0.5) 는 고르게 섞이지 않는다.
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const sharesWith = (i, j) => ((co[i] >> BigInt(j)) & 1n) === 1n

/**
 * 가로 3명 후보를 모은다. 세로를 3명 이상 채울 수 있는 조합만 남긴다.
 *
 * --- 같은 축에는 함께 나온 배우를 두지 않는다 ---
 * 가로에 조우진과 유해진이 나란히 서면, 둘이 만나는 칸이 격자에 아예 없다.
 * 그런데 플레이어는 두 이름을 보고 '봉오동 전투' 를 떠올린다. 어느 칸에 넣어도
 * 틀렸다고 나오니 게임이 고장난 것처럼 보인다. 실제로 이 신고를 받았다.
 *
 * 이 조건을 넣으면 만들 수 있는 격자가 465만 개에서 1만 8천 개로 줄지만,
 * 우리가 쓰는 것은 300개뿐이라 넉넉하다.
 */
const triples = []
for (let a = 0; a < N; a++)
  for (let b = a + 1; b < N; b++) {
    if (sharesWith(a, b)) continue
    for (let c = b + 1; c < N; c++) {
      if (sharesWith(a, c) || sharesWith(b, c)) continue
      const m = co[a] & co[b] & co[c]
      if (bits(m).length >= 3) triples.push([[a, b, c], m])
    }
  }

shuffle(triples)

const found = []
const seenKey = new Set()
let checked = 0, rejected = 0

for (const [rows, mask] of triples.slice(0, SCAN)) {
  const colPool = shuffle(bits(mask).filter((i) => !rows.includes(i)))
  if (colPool.length < 3) continue

  // 같은 가로 조합에서 세로만 바꾼 문제가 연달아 나오지 않게 몇 번만 시도한다
  for (let attempt = 0; attempt < 4; attempt++) {
    const cols = pickCols(shuffle(colPool.slice()))
    if (!cols) break
    const key = [...rows].sort().join(",") + "|" + [...cols].sort().join(",")
    if (seenKey.has(key)) continue

    const cells = []
    for (const r of rows) for (const c of cols) cells.push(shared(r, c))
    checked++

    const total = cells.reduce((s, x) => s + x.length, 0)
    if (total < MIN_TOTAL_ANSWERS) { rejected++; continue }
    if (!solvable(cells)) { rejected++; continue }

    seenKey.add(key)
    const person = (i) => ({ name: stars[i][1].name, img: photoOf(stars[i][1]) })

    found.push({
      // stars 는 인지도 순이므로 번호가 작을수록 유명하다. 여섯 명의 번호 합으로
      // 이 격자가 얼마나 아는 얼굴들로 이뤄졌는지를 잰다.
      rankSum: [...rows, ...cols].reduce((s, i) => s + i, 0),
      rows: rows.map(person),
      cols: cols.map(person),
      // 칸마다 정답 영화 제목들. 흥행 순으로 둬서 대표 답이 앞에 오게 한다.
      cells: cells.map((s) =>
        s.slice().sort((x, y) => (audi.get(y) ?? 0) - (audi.get(x) ?? 0)).map((f) => title.get(f))
      ),
    })
    break
  }
}

/**
 * 좋은 문제 = 답이 넉넉하면서 + 축이 아는 얼굴인 것.
 *
 * 답 개수만으로 줄을 세우면 다작 조연들로만 이뤄진 격자가 위로 온다. 같은 영화에
 * 자주 겹치는 건 주연급이 아니라 조연이기 때문이다. 얼굴은 알아도 "이 배우가 나온
 * 영화" 를 떠올리기는 훨씬 어렵다.
 *
 * 반대로 인지도만 보면 답이 칸마다 하나뿐인 빠듯한 격자만 남는다.
 * 둘을 같이 본다. 답 하나가 순위 30계단 정도의 값어치를 갖도록 맞췄다.
 */
found.sort((a, b) => {
  const score = (p) => p.cells.flat().length * 30 - p.rankSum
  return score(b) - score(a)
})
const puzzles = found.slice(0, COUNT).map(({ rankSum, ...rest }) => rest)

const out = {
  generatedAt: new Date().toISOString(),
  count: puzzles.length,
  starPool: N,
  note: "가로·세로 배우가 함께 나온 영화로 아홉 칸을 채운다. 아홉 칸을 서로 다른 영화로 채울 수 있는 격자만 담았다.",
  puzzles,
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, JSON.stringify(out), "utf8")

const per = puzzles.map((p) => p.cells.flat().length / 9)
const avg = (per.reduce((a, b) => a + b, 0) / (per.length || 1)).toFixed(1)

console.log(`\n배우 격자 문제 생성`)
console.log(`  축에 쓸 수 있는 배우 ${N}명 (사진 있는 상위 ${STARS}명 기준)`)
console.log(`  가로 3명 조합 ${triples.length.toLocaleString()}가지 중 ${checked.toLocaleString()}개를 검사`)
console.log(`  탈락 ${rejected.toLocaleString()}개 (답이 모자라거나, 아홉 칸을 서로 다른 영화로 못 채움)`)
console.log(`  쓸 만한 것 ${found.length.toLocaleString()}개 중 답이 넉넉한 ${puzzles.length}개를 골랐다`)
console.log(`  칸당 정답 평균 ${avg}개 · 가장 빠듯한 칸의 답이 2개 이상인 문제 ${puzzles.filter((p) => Math.min(...p.cells.map((c) => c.length)) >= 2).length}개`)

if (puzzles[0]) {
  const p = puzzles[0]
  console.log(`\n  예시 (가장 답이 넉넉한 문제)`)
  console.log(`  ${"".padEnd(9)}${p.cols.map((c) => c.name.padEnd(13)).join("")}`)
  p.rows.forEach((r, i) => {
    const line = p.cells
      .slice(i * 3, i * 3 + 3)
      .map((s) => (s[0] + (s.length > 1 ? ` 외${s.length - 1}` : "")).padEnd(13))
      .join("")
    console.log(`  ${r.name.padEnd(8)} ${line}`)
  })
}
console.log(`\n  저장: ${OUT_PATH}\n`)
