import { solveGrid } from './grid-engine.mjs'

// Classify films, not actors: a Marvel cast member's dramas and comedies still count.
export function superheroFranchise(title) {
  if (/avengers|iron man|captain america|\bthor\b|spider.man|black panther|ant.man|doctor strange|guardians of the galaxy|captain marvel|the marvels|\bhulk\b|eternals|shang.chi|black widow|thunderbolts|deadpool|x.men|wolverine|^logan$|fantastic four|venom|morbius|madame web|kraven|daredevil|elektra|ghost rider|punisher|^blade\b/i.test(title)) return 'marvel'
  if (/batman|dark knight|superman|man of steel|justice league|wonder woman|aquaman|shazam|suicide squad|birds of prey|black adam|blue beetle|the flash|green lantern|^joker\b|watchmen|constantine/i.test(title)) return 'dc'
  return null
}

/** Find nine distinct answers while allowing at most `limit` restricted films. */
export function solveGridWithLimit(cells, restricted, limit) {
  const ordinary = cells.map((cell) => cell.filter((film) => !restricted.has(film)))
  const forced = ordinary.flatMap((cell, i) => cell.length ? [] : [i])
  if (forced.length > limit) return null
  const eligible = cells.flatMap((cell, i) => ordinary[i].length && cell.some((film) => restricted.has(film)) ? [i] : [])
  const allowed = new Set(forced)
  function visit(start, remaining) {
    const solution = solveGrid(cells.map((cell, i) => allowed.has(i) ? cell : ordinary[i]))
    if (solution) return solution
    if (!remaining) return null
    for (let i = start; i < eligible.length; i++) {
      allowed.add(eligible[i])
      const found = visit(i + 1, remaining - 1)
      allowed.delete(eligible[i])
      if (found) return found
    }
    return null
  }
  return visit(0, limit - forced.length)
}
