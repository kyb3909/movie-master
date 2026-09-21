/** Shared puzzle generation and browser selection, without I/O. */
export function seededRandom(seed = 20260921) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(items, random = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** Each cell must have its own movie, even when answers overlap. */
export function solveGrid(cells) {
  const owner = new Map()
  function assign(cell, seen) {
    for (const film of cells[cell]) {
      if (seen.has(film)) continue
      seen.add(film)
      if (!owner.has(film) || assign(owner.get(film), seen)) {
        owner.set(film, cell)
        return true
      }
    }
    return false
  }
  for (let i = 0; i < cells.length; i++) if (!assign(i, new Set())) return null
  const solution = []
  for (const [film, cell] of owner) solution[cell] = film
  return solution
}

export function selectDiversePuzzles(candidates, count, { maxMovieShare = 1 } = {}) {
  const usage = new Map(), movieUsage = new Map(), selected = [], remaining = new Set(candidates)
  const movieLimit = Math.max(1, Math.floor(count * maxMovieShare))
  const films = new Map(candidates.map((p) => [p, [...new Set(p.cells.flat())]]))
  // Extra answers must not overpower actor variety.
  const quality = (p) => Math.min(p.cells.flat().length, 18) / 18 - p.rankSum / 1200
  const qualities = new Map(candidates.map((p) => [p, quality(p)]))
  while (selected.length < count && remaining.size) {
    let best, bestScore = Infinity
    for (const p of remaining) {
      if (maxMovieShare < 1 && films.get(p).some((f) => (movieUsage.get(f) ?? 0) >= movieLimit)) continue
      const filmPenalty = maxMovieShare < 1
        ? films.get(p).reduce((sum, film) => sum + (movieUsage.get(film) ?? 0) ** 2, 0) / films.get(p).length
        : 0
      const score = p.actors.reduce((sum, id) => sum + (usage.get(id) ?? 0) ** 2, 0) + filmPenalty - qualities.get(p)
      if (score < bestScore) { best = p; bestScore = score }
    }
    if (!best) break
    selected.push(best)
    remaining.delete(best)
    for (const id of best.actors) usage.set(id, (usage.get(id) ?? 0) + 1)
    for (const film of films.get(best)) movieUsage.set(film, (movieUsage.get(film) ?? 0) + 1)
  }
  return selected
}

/** Actors: {id, name, img, films: Set<movieId>, fame}. */
export function generateGridPuzzles(actors, { count = 600, stars = 200, scan = 60000, minAnswers = 12, seed = 20260921, independentAxes = true, acceptPuzzle = () => true, maxMovieShare = 1, variantsPerRows = 4 } = {}) {
  const random = seededRandom(seed)
  const people = actors.filter((a) => a.img && a.films.size >= 3)
    .sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id)).slice(0, stars)
  const n = people.length
  const co = Array(n).fill(0n), pair = Array.from({ length: n }, () => Array(n))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const shared = [...people[i].films].filter((f) => people[j].films.has(f))
    pair[i][j] = pair[j][i] = shared
    if (shared.length) { co[i] |= 1n << BigInt(j); co[j] |= 1n << BigInt(i) }
  }
  const bits = (mask) => {
    const ids = []
    for (let i = 0; mask; i++, mask >>= 1n) if (mask & 1n) ids.push(i)
    return ids
  }
  const triples = []
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (independentAxes && pair[a][b].length) continue
    for (let c = b + 1; c < n; c++) {
      if (independentAxes && (pair[a][c].length || pair[b][c].length)) continue
      const mask = co[a] & co[b] & co[c]
      let rest = mask
      for (let i = 0; i < 2 && rest; i++) rest &= rest - 1n
      if (rest) triples.push([[a, b, c], mask])
    }
  }
  shuffle(triples, random)
  const candidates = [], seen = new Set()
  let checked = 0
  for (const [rows, mask] of triples.slice(0, scan)) {
    const pool = shuffle(bits(mask), random)
    let accepted = 0
    for (let i = 0; i < pool.length && accepted < variantsPerRows; i++) for (let j = i + 1; j < pool.length && accepted < variantsPerRows; j++) {
      if (independentAxes && pair[pool[i]][pool[j]].length) continue
      for (let k = j + 1; k < pool.length && accepted < variantsPerRows; k++) {
        const cols = [pool[i], pool[j], pool[k]]
        if (independentAxes && (pair[cols[0]][cols[2]].length || pair[cols[1]][cols[2]].length)) continue
        const key = [rows.slice().sort((a, b) => a - b).join(','), cols.slice().sort((a, b) => a - b).join(',')].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        checked++
        const cells = rows.flatMap((r) => cols.map((c) => pair[r][c]))
        if (cells.flat().length < minAnswers || !solveGrid(cells) || !acceptPuzzle(cells)) continue
        accepted++
        candidates.push({ rows, cols, cells, actors: [...rows, ...cols], rankSum: [...rows, ...cols].reduce((s, x) => s + x, 0) })
      }
    }
  }
  const selected = selectDiversePuzzles(candidates, count, { maxMovieShare })
  const person = (i) => ({ id: people[i].id, name: people[i].name, img: people[i].img })
  const puzzles = selected.map((p) => ({
    id: [p.rows, p.cols].map((axis) => axis.map((i) => people[i].id).sort().join(',')).sort().join('|'),
    rows: p.rows.map(person), cols: p.cols.map(person), cells: p.cells,
  }))
  return { puzzles, starPool: n, candidates: candidates.length, checked }
}

/** Browser history is bounded, region-specific, and independent of difficulty. */
export function pickNextGrid(puzzles, history = [], random = Math.random) {
  if (!puzzles.length) throw new Error('격자 문제가 없습니다.')
  const seen = new Set(history.map((h) => h.id))
  let pool = puzzles.filter((p) => !seen.has(p.id))
  if (!pool.length) pool = puzzles.filter((p) => p.id !== history[history.length - 1]?.id)
  if (!pool.length) pool = puzzles
  const recent = history.slice(-5), last = new Set(recent[recent.length - 1]?.actors ?? [])
  const exposure = new Map()
  recent.forEach((h, i) => h.actors.forEach((id) => exposure.set(id, (exposure.get(id) ?? 0) + i + 1)))
  const lastFilms = new Set(recent[recent.length - 1]?.movies ?? [])
  const filmExposure = new Map()
  recent.forEach((h, i) => (h.movies ?? []).forEach((film) => filmExposure.set(film, (filmExposure.get(film) ?? 0) + i + 1)))
  let best = [], bestScore = Infinity
  for (const p of pool) {
    const score = [...p.r, ...p.c].reduce((s, id) => s + (last.has(id) ? 100 : 0) + (exposure.get(id) ?? 0), 0)
      + (p.f ?? []).reduce((s, film) => s + (lastFilms.has(film) ? 20 : 0) + (filmExposure.get(film) ?? 0), 0)
    if (score < bestScore) { best = [p]; bestScore = score }
    else if (score === bestScore) best.push(p)
  }
  return best[Math.floor(random() * best.length)]
}
