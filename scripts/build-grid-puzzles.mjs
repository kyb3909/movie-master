/** Build both grids: node scripts/build-grid-puzzles.mjs [--region=hollywood] */
import { writeFile, mkdir } from 'node:fs/promises'
import { generateGridPuzzles } from './grid-engine.mjs'
import { loadGridCatalog } from './grid-catalog.mjs'
import { solveGridWithLimit } from './grid-variety.mjs'

const flags = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')))
const regions = flags.region && flags.region !== 'all' ? [flags.region] : ['korea', 'hollywood']
const options = { count: 600, stars: 200, scan: 60000, minAnswers: 12, seed: 20260921 }
for (const [flag, key] of Object.entries({ count: 'count', stars: 'stars', scan: 'scan', 'min-answers': 'minAnswers', seed: 'seed' })) {
  if (flags[flag] !== undefined) options[key] = Number(flags[flag])
  if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error('Invalid --' + flag)
}
for (const region of regions) {
  const { actors, movies } = await loadGridCatalog(region)
  const heroes = new Set([...movies].filter(([, movie]) => movie.franchise).map(([id]) => id))
  const pool = region === 'hollywood'
    ? actors.filter((a) => [...a.films].filter((film) => !heroes.has(film)).length >= 3)
    : actors
  // Hollywood ensembles often share credits on the same axis. Only intersections
  // are questions; distinct-movie matching still guarantees nine usable answers.
  const variety = region === 'hollywood' ? {
    stars: flags.stars === undefined ? 300 : options.stars,
    minAnswers: flags['min-answers'] === undefined ? 9 : options.minAnswers,
    maxMovieShare: 0.15, variantsPerRows: 12,
    acceptPuzzle: (cells) => !!solveGridWithLimit(cells, heroes, 2),
  } : {}
  const result = generateGridPuzzles(pool, { ...options, ...variety, independentAxes: region === 'korea' })
  if (result.puzzles.length < options.count) throw new Error(`${region}: ${options.count} requested, only ${result.puzzles.length} valid puzzles. Check catalog and generation constraints.`)
  const puzzles = result.puzzles.map((p) => ({ ...p, cells: p.cells.map((cell) => cell.slice()
    .sort((a, b) => Number(!!movies.get(a).franchise) - Number(!!movies.get(b).franchise) || movies.get(b).popularity - movies.get(a).popularity).map((id) => movies.get(id).title)) }))
  const frequency = new Map()
  for (const p of puzzles) for (const a of [...p.rows, ...p.cols]) frequency.set(a.name, (frequency.get(a.name) ?? 0) + 1)
  const out = {
    generatedAt: new Date().toISOString(), region, count: puzzles.length, starPool: result.starPool,
    actorCount: frequency.size, maxActorAppearances: Math.max(...frequency.values()),
    ...(region === 'hollywood' ? { variety: { maxSuperheroAnswersNeeded: 2, maxMovieShare: 0.15 } } : {}),
    aliases: Object.fromEntries([...movies.values()].filter((m) => m.aliases.length).map((m) => [m.title, m.aliases])),
    puzzles,
  }
  const path = region === 'korea' ? 'data/grid-puzzles.json' : 'data/hollywood-grid-puzzles.json'
  await mkdir('data', { recursive: true })
  await writeFile(path, JSON.stringify(out), 'utf8')
  console.log(`${region}: ${puzzles.length} puzzles, ${frequency.size}/${result.starPool} actors, max exposure ${out.maxActorAppearances} (${(out.maxActorAppearances / puzzles.length * 100).toFixed(1)}%), ${result.candidates} candidates`)
  console.log('Saved: ' + path)
}
