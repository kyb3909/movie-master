import { readFile } from "node:fs/promises"

export function normalizeMovieTitle(title) {
  return String(title).normalize("NFC").toLowerCase().replace(/[\s:;·,.\-–—!?'"()\/[\]#+\u3400-\u9FFF]/g, "")
}

export function uniqueMovieTitles(titles) {
  const seen = new Set()
  return titles.filter((title) => {
    if (typeof title !== "string" || !title.trim()) return false
    const key = normalizeMovieTitle(title)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).map((title) => title.trim()).sort((a, b) => a.localeCompare(b, "ko"))
}

/** Suggestions are a separate catalog, never an answer or difficulty filter. */
export async function loadMovieTitles(seedTitles = []) {
  const sources = [
    ["data/kobis-boxoffice.json", (d) => d.movies.flatMap((m) => [m.title])],
    ["data/kobis-boxoffice-kr.json", (d) => d.movies.flatMap((m) => [m.title])],
    ["data/kobis-boxoffice-f.json", (d) => d.movies.flatMap((m) => [m.title])],
    ["data/hollywood-catalog.json", (d) => d.movies.flatMap((m) => [m.titleKo, m.titleEn])],
    ["data/kobis-titles.json", (d) => Object.values(d.byBomId).filter((m) => m.result === "ok").flatMap((m) => [m.titleKo, m.titleEnKobis])],
  ]
  const rows = await Promise.all(sources.map(async ([path, titlesOf]) => {
    try { return titlesOf(JSON.parse(await readFile(path, "utf8"))) }
    catch (error) {
      if (error.code === "ENOENT") return []
      throw error
    }
  }))
  return uniqueMovieTitles([...seedTitles, ...rows.flat()])
}

/** Rank exact/prefix matches first. The current puzzle is deliberately not an input. */
export function findMovieTitles(titles, query, limit = 8) {
  const key = normalizeMovieTitle(query)
  if (!key) return []
  return titles.map((title) => ({ title, key: normalizeMovieTitle(title) }))
    .filter((row) => row.key.includes(key))
    .sort((a, b) => {
      const rank = (row) => row.key === key ? 0 : row.key.startsWith(key) ? 1 : 2
      return rank(a) - rank(b) || a.title.localeCompare(b.title, "ko")
    }).slice(0, limit).map((row) => row.title)
}

/** Pointer and keyboard selection fill the field; only form submission uses a try. */
export function mountTitleSuggestions(input, list, titles) {
  let matches = [], active = -1, composing = false
  input.setAttribute("role", "combobox")
  input.setAttribute("aria-autocomplete", "list")
  input.setAttribute("aria-controls", list.id)
  input.setAttribute("aria-expanded", "false")
  list.setAttribute("role", "listbox")
  list.setAttribute("aria-label", "영화 제목 자동완성")

  function clear() {
    matches = []
    active = -1
    list.replaceChildren()
    list.hidden = true
    input.setAttribute("aria-expanded", "false")
    input.removeAttribute("aria-activedescendant")
  }
  function highlight() {
    Array.from(list.children).forEach((option, index) => option.setAttribute("aria-selected", String(index === active)))
    if (active >= 0) input.setAttribute("aria-activedescendant", list.children[active].id)
    else input.removeAttribute("aria-activedescendant")
  }
  function update() {
    clear()
    matches = findMovieTitles(titles, input.value)
    if (!matches.length) return
    matches.forEach((title, index) => {
      const option = document.createElement("li")
      option.id = list.id + "-" + index
      option.dataset.titleIndex = String(index)
      option.setAttribute("role", "option")
      option.setAttribute("aria-selected", "false")
      option.textContent = title
      list.append(option)
    })
    list.hidden = false
    input.setAttribute("aria-expanded", "true")
  }
  function choose(index) {
    if (!matches[index]) return
    input.value = matches[index]
    clear()
    input.focus()
  }
  input.addEventListener("compositionstart", () => { composing = true; clear() })
  input.addEventListener("compositionend", () => { composing = false; update() })
  input.addEventListener("input", (event) => { if (!composing && !event.isComposing) update() })
  input.addEventListener("keydown", (event) => {
    if (composing || event.isComposing || event.keyCode === 229) return
    if (event.key === "Escape") { clear(); return }
    if (!matches.length) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      active = event.key === "ArrowDown" ? (active + 1) % matches.length : (active <= 0 ? matches.length - 1 : active - 1)
      highlight()
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault()
      choose(active)
    }
  })
  list.addEventListener("mousedown", (event) => event.preventDefault())
  list.addEventListener("click", (event) => {
    const option = event.target.closest("[data-title-index]")
    if (option && list.contains(option)) choose(Number(option.dataset.titleIndex))
  })
  input.addEventListener("blur", clear)
  input.form?.addEventListener("submit", clear)
  clear()
  return { clear }
}

export const titleSuggestionsCSS = `
  .title-suggestions { list-style: none; padding: 4px 0; margin: 8px 0 0;
    border: 1px solid #bcbcbc; background: var(--card); }
  .title-suggestions[hidden] { display: none; }
  .title-suggestions [role="option"] { min-height: 44px; display: flex; align-items: center;
    padding: 10px 15px; font-size: 15px; line-height: 1.5; cursor: pointer; }
  .title-suggestions [role="option"] + [role="option"] { border-top: 1px solid #eee; }
  .title-suggestions [role="option"]:hover, .title-suggestions [aria-selected="true"] { background: #ededed; }
`

export const titleSuggestionsScript = (titles) => `
${normalizeMovieTitle.toString()}
${findMovieTitles.toString()}
${mountTitleSuggestions.toString()}
const SUGGESTION_TITLES = ${JSON.stringify(titles).replace(/</g, "\\u003c")};
const titleSuggestions = mountTitleSuggestions(
  document.getElementById('guess'), document.getElementById('sugg'),
  SUGGESTION_TITLES
);
`
