import { readFile } from 'node:fs/promises'
import { normalizeMovieTitle } from './movie-titles.mjs'
import { superheroFranchise } from './grid-variety.mjs'

const read = async (path) => JSON.parse(await readFile(path, 'utf8'))

export async function loadGridCatalog(region) {
  const actors = new Map(), movies = new Map()
  function add(id, name, img, film, fame) {
    if (!actors.has(id)) actors.set(id, { id, name, img, films: new Set(), fame: 0 })
    const a = actors.get(id)
    if (!a.img && img) a.img = img
    if (!a.films.has(film)) { a.films.add(film); a.fame += fame }
  }
  if (region === 'korea') {
    const [cast, quizzes, portraits] = await Promise.all([
      read('data/kobis-cast.json'), read('data/quizzes.json'), read('data/kobis-portraits.json'),
    ])
    const photos = new Map(Object.entries(portraits.byPeopleCd).filter(([, p]) => p.imageUrl).map(([id, p]) => [id, p.imageUrl]))
    try {
      const fill = await read('data/naver-fill.json')
      for (const [id, p] of Object.entries(fill.byPeopleCd)) if (p.status === 'verified' && p.imageUrl && !photos.has(id)) photos.set(id, p.imageUrl)
    } catch (e) { if (e.code !== 'ENOENT') throw e }
    for (const q of quizzes.quizzes) movies.set(q.movieCd, { title: q.title, popularity: q.audiAcc ?? 0, aliases: [] })
    // Keep the existing KOBIS name merge: some actors have several person codes.
    for (const [film, castList] of Object.entries(cast.castByMovie)) {
      if (!movies.has(film)) continue
      for (const p of castList) {
        if (!['1', '2'].includes(p.actorGb) || !p.peopleCd || !p.name) continue
        add(p.name, p.name, photos.get(p.peopleCd), film, movies.get(film).popularity * (p.actorGb === '1' ? 1 : 0.3))
      }
    }
  } else if (region === 'hollywood') {
    const [catalog, overrides, titles, fame] = await Promise.all([
      read('data/hollywood-catalog.json'), read('data/quiz-overrides.json'),
      read('data/kobis-titles.json'), read('data/imdb-fame.json'),
    ])
    const excluded = new Set(overrides.excluded?.hollywood ?? [])
    const seen = new Set()
    for (const m of catalog.movies) {
      if (!m.quizEligible || !m.titleKo || !m.titleEn || excluded.has(m.bomId)) continue
      // Korean attendance alone excluded many dramas and comedies. Add US hits
      // only with a high-confidence Korean title match, avoiding ambiguous remakes.
      const familiar = (m.krAudi ?? 0) >= 100000
      const international = m.gross >= 20000000 && titles.byBomId[m.bomId]?.match?.confidence === 'high'
      if (!familiar && !international) continue
      const film = m.rtUrl || m.movieCd || m.bomId
      if (seen.has(film)) continue
      seen.add(film)
      movies.set(film, {
        title: overrides.titles?.hollywood?.[m.bomId] ?? m.titleKo, popularity: m.krAudi ?? 0,
        aliases: [m.titleEn], franchise: superheroFranchise(m.titleEn),
      })
      for (const p of m.actors ?? []) {
        if (!p.name) continue
        add(p.url || p.name, p.name, p.imageUrlLarge || p.imageUrl, film, 0)
      }
    }
    // Rank actors by recognition across their careers, not ensemble box office.
    for (const actor of actors.values()) actor.fame = fame.byName[actor.name] ?? 0
  } else throw new Error('Unknown grid region: ' + region)

  // Runtime compares normalized titles. Omit ambiguous remakes instead of merging casts.
  const counts = new Map()
  for (const m of movies.values()) {
    const key = normalizeMovieTitle(m.title)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [id, m] of movies) if (counts.get(normalizeMovieTitle(m.title)) > 1) {
    movies.delete(id)
    for (const a of actors.values()) a.films.delete(id)
  }
  return { actors: [...actors.values()], movies }
}
