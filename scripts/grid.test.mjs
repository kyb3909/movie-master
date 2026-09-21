import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateGridPuzzles, pickNextGrid, seededRandom, selectDiversePuzzles, solveGrid } from './grid-engine.mjs'
import { loadGridCatalog } from './grid-catalog.mjs'
import { normalizeMovieTitle } from './movie-titles.mjs'
import { solveGridWithLimit, superheroFranchise } from './grid-variety.mjs'

test('matching handles overlapping answers and rejects grids with no distinct solution', () => {
  const cells = [['a', 'b'], ['a'], ...'cdefghi'.split('').map((f) => [f])]
  const result = solveGrid(cells)
  assert.equal(new Set(result).size, 9)
  result.forEach((f, i) => assert.ok(cells[i].includes(f)))
  // Nine movies in total is insufficient: the first three cells only have two choices.
  assert.equal(solveGrid([['a', 'b'], ['a', 'b'], ['a', 'b'], ['c', 'd', 'e', 'f'], ['g'], ['h'], ['i'], ['c'], ['d']]), null)
})

test('generation preserves cast intersections and deduplicates transposed grids', () => {
  const actors = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: String(i), img: 'photo', films: new Set(), fame: 10 }))
  for (let r = 0; r < 3; r++) for (let c = 3; c < 6; c++) {
    actors[r].films.add(r + '-' + c); actors[c].films.add(r + '-' + c)
  }
  const options = { count: 20, stars: 6, minAnswers: 9, seed: 1 }
  const result = generateGridPuzzles(actors, options)
  assert.equal(result.puzzles.length, 1)
  assert.deepEqual(result, generateGridPuzzles(actors, options))
  const p = result.puzzles[0]
  assert.equal(new Set([...p.rows, ...p.cols].map((a) => a.id)).size, 6)
  for (let i = 0; i < 9; i++) for (const film of p.cells[i]) {
    assert.ok(actors[Number(p.rows[Math.floor(i / 3)].id)].films.has(film))
    assert.ok(actors[Number(p.cols[i % 3].id)].films.has(film))
  }
})

test('selection balances actors even when one group has many more answers', () => {
  const candidates = Array.from({ length: 30 }, (_, i) => ({
    actors: i < 20 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11],
    cells: Array.from({ length: 9 }, () => i < 20 ? ['a', 'b', 'c', 'd'] : ['x']), rankSum: i < 20 ? 15 : 51,
  }))
  const selected = selectDiversePuzzles(candidates, 10)
  assert.equal(selected.filter((p) => p.actors[0] === 0).length, 5)
})

test('browser selection avoids seen puzzles and recent actors, with safe exhaustion', () => {
  const puzzles = [
    { id: 'a', r: [0, 1, 2], c: [3, 4, 5] },
    { id: 'b', r: [0, 1, 2], c: [6, 7, 8] },
    { id: 'c', r: [9, 10, 11], c: [12, 13, 14] },
  ]
  const history = [{ id: 'a', actors: [0, 1, 2, 3, 4, 5] }]
  assert.equal(pickNextGrid(puzzles, history).id, 'c')
  history.push({ id: 'c', actors: [9, 10, 11, 12, 13, 14] })
  assert.equal(pickNextGrid(puzzles, history).id, 'b')
  history.push({ id: 'b', actors: [0, 1, 2, 6, 7, 8] })
  assert.notEqual(pickNextGrid(puzzles, history).id, 'b')
  assert.equal(pickNextGrid([puzzles[0]], history).id, 'a')
})

test('franchise limits count distinct assigned movies, not just cells with alternative answers', () => {
  const heroes = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'])
  assert.equal(solveGridWithLimit(Array.from(heroes, (f) => [f]), heroes, 2), null)
  const ordinary = Array.from('abcdefg', (f) => [f])
  const solution = solveGridWithLimit([...ordinary, ['h1', 'h2'], ['h1']], heroes, 2)
  assert.equal(new Set(solution).size, 9)
  assert.equal(solution.filter((f) => heroes.has(f)).length, 2)
  // Each cell has a non-hero option, but three cells compete for the same movie.
  assert.equal(solveGridWithLimit([['a', 'h1'], ['a', 'h2'], ['a', 'h3'], ...Array.from('bcdefg', (f) => [f])], heroes, 1), null)
  assert.equal(superheroFranchise('Avengers: Endgame'), 'marvel')
  assert.equal(superheroFranchise('The Dark Knight'), 'dc')
  assert.equal(superheroFranchise('The Devil Wears Prada'), null)
})

test('popular movie alternatives cannot saturate the selected set', () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    actors: [i * 6, i * 6 + 1, i * 6 + 2, i * 6 + 3, i * 6 + 4, i * 6 + 5],
    cells: [[i < 4 ? 'same blockbuster' : 'film-' + i]], rankSum: i,
  }))
  const selected = selectDiversePuzzles(candidates, 4, { maxMovieShare: 0.25 })
  assert.equal(selected.length, 4)
  assert.equal(selected.filter((p) => p.cells.flat().includes('same blockbuster')).length, 1)
})

test('recent movies break ties between fresh casts', () => {
  const history = [{ id: 'old', actors: [0, 1, 2, 3, 4, 5], movies: ['avengers'] }]
  const repeatedFilm = { id: 'a', r: [6, 7, 8], c: [9, 10, 11], f: ['avengers'] }
  const freshFilm = { id: 'b', r: [12, 13, 14], c: [15, 16, 17], f: ['drama'] }
  assert.equal(pickNextGrid([repeatedFilm, freshFilm], history, () => 0).id, 'b')
})

// The crawled catalogs are intentionally gitignored. Validate every generated cell
// when they are available; synthetic tests above also run on a fresh checkout.
for (const region of ['korea', 'hollywood']) {
  test(`${region}: generated questions match the catalog, solve with nine titles, and vary across 100 games`, async (t) => {
    const path = region === 'korea' ? 'data/grid-puzzles.json' : 'data/hollywood-grid-puzzles.json'
    let data
    try { data = JSON.parse(await readFile(path, 'utf8')) }
    catch (e) { if (e.code === 'ENOENT') { t.skip('Build crawled grid catalogs first'); return } throw e }
    const { actors, movies } = await loadGridCatalog(region)
    const byActor = new Map(actors.map((a) => [a.id, a]))
    const byTitle = new Map([...movies].map(([id, m]) => [m.title, id]))
    const ids = new Set(), frequency = new Map(), movieFrequency = new Map()
    const heroes = new Set([...movies.values()].filter((m) => m.franchise).map((m) => m.title))
    for (const p of data.puzzles) {
      assert.ok(!ids.has(p.id), 'duplicate puzzle'); ids.add(p.id)
      assert.equal(p.rows.length, 3); assert.equal(p.cols.length, 3); assert.equal(p.cells.length, 9)
      assert.equal(new Set([...p.rows, ...p.cols].map((a) => a.name)).size, 6)
      for (const a of [...p.rows, ...p.cols]) {
        assert.ok(a.img); frequency.set(a.name, (frequency.get(a.name) ?? 0) + 1)
      }
      assert.ok(solveGrid(p.cells.map((cell) => cell.map(normalizeMovieTitle))), 'no distinct title solution')
      if (region === 'hollywood') {
        assert.ok(solveGridWithLimit(p.cells, heroes, 2), 'grid depends on too many Marvel/DC answers')
        for (const movie of new Set(p.cells.flat())) movieFrequency.set(movie, (movieFrequency.get(movie) ?? 0) + 1)
      }
      for (let i = 0; i < 9; i++) for (const title of p.cells[i]) {
        const film = byTitle.get(title)
        assert.ok(film, title)
        assert.ok(byActor.get(p.rows[Math.floor(i / 3)].id).films.has(film), title)
        assert.ok(byActor.get(p.cols[i % 3].id).films.has(film), title)
        if (region === 'hollywood') assert.ok(data.aliases[title]?.length, title + ' needs English alias')
      }
    }
    assert.equal(data.count, data.puzzles.length)
    assert.equal(frequency.size, data.actorCount)
    assert.ok(data.actorCount >= (region === 'korea' ? 180 : 200))
    if (region === 'hollywood') {
      assert.ok(Math.max(...movieFrequency.values()) <= Math.floor(data.count * 0.15), 'a movie saturates the catalog')
      assert.ok(byTitle.has('프로포즈'), 'international drama/romance missing')
      assert.ok(!byTitle.has('우리 이웃 이야기'), 'unreliable foreign title match admitted')
    }
    assert.ok(Math.max(...frequency.values()) / data.count < (region === 'korea' ? 0.1 : 0.2))
    const compact = data.puzzles.map((p) => ({ id: p.id, r: p.rows.map((a) => a.id), c: p.cols.map((a) => a.id), ...(region === 'hollywood' ? { f: [...new Set(p.cells.flat().map(normalizeMovieTitle))] } : {}) }))
    const history = [], random = seededRandom(42), unique = new Set()
    let overlap = 0
    for (let i = 0; i < 100; i++) {
      const p = pickNextGrid(compact, history, random)
      assert.ok(!unique.has(p.id)); unique.add(p.id)
      const previous = new Set(history.at(-1)?.actors ?? [])
      overlap += [...p.r, ...p.c].filter((a) => previous.has(a)).length
      history.push({ id: p.id, actors: [...p.r, ...p.c], movies: p.f ?? [] })
    }
    assert.ok(overlap / 99 < 1, 'too many actors repeated between consecutive games')
    t.diagnostic(`${data.count} puzzles / ${frequency.size} actors / average consecutive overlap ${(overlap / 99).toFixed(2)}`)
  })
}
