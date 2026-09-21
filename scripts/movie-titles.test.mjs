import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Script } from "node:vm"
import { findMovieTitles, uniqueMovieTitles, loadMovieTitles, normalizeMovieTitle, titleSuggestionsScript, mountTitleSuggestions } from "./movie-titles.mjs"

test("similar films are searchable independently of the answer set", () => {
  const titles = ["괴물", "괴물들", "괴물의 아이", "서울괴담"]
  assert.deepEqual(findMovieTitles(titles, "괴물"), ["괴물", "괴물들", "괴물의 아이"])
  assert.deepEqual(findMovieTitles(titles, "없는영화"), [])
  assert.deepEqual(findMovieTitles(titles, "  "), [])
})

test("exact and prefix matches precede titles with an internal match", () => {
  assert.deepEqual(findMovieTitles(["신과함께-인과 연", "다시 함께", "함께", "함께 가자"], "함께"),
    ["함께", "함께 가자", "다시 함께", "신과함께-인과 연"])
})

test("Korean spacing, punctuation, composed text and English casing are normalized", () => {
  assert.deepEqual(findMovieTitles(["신과함께-인과 연"], "신과 함께"), ["신과함께-인과 연"])
  assert.deepEqual(findMovieTitles(["The Dark Knight"], "DARK KNIGHT"), ["The Dark Knight"])
  assert.equal(normalizeMovieTitle("기생충".normalize("NFD")), "기생충")
  assert.deepEqual(uniqueMovieTitles([null, "", "신과 함께", "신과함께", "기생충"]), ["기생충", "신과 함께"])
  assert.equal(findMovieTitles(Array.from({ length: 20 }, (_, i) => "영화 " + i), "영").length, 8)
})

test("generated autocomplete remains valid with HTML-like titles", () => {
  const script = titleSuggestionsScript(["영화 </script><b>제목</b>", "따옴표 ' \""])
  assert.ok(!script.includes("</script>"))
  assert.doesNotThrow(() => new Script(script))
})

// Minimal event surface for the input controller; no browser or network is required.
class Element {
  constructor(id = "") { this.id = id; this.value = ""; this.dataset = {}; this.children = []; this.attributes = {}; this.events = {} }
  setAttribute(key, value) { this.attributes[key] = value }
  removeAttribute(key) { delete this.attributes[key] }
  addEventListener(name, callback) { (this.events[name] ??= []).push(callback) }
  replaceChildren() { this.children = [] }
  append(child) { this.children.push(child) }
  contains(child) { return this.children.includes(child) }
  closest() { return this }
  focus() { this.focused = true }
  dispatch(name, properties = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, ...properties }
    for (const callback of this.events[name] ?? []) callback(event)
    return event
  }
}

test("suggestion selection fills the answer without submitting, including IME and keyboard input", () => {
  const input = new Element("guess"), list = new Element("sugg")
  input.form = new Element("form")
  const context = {
    document: { createElement: () => new Element() }, input, list,
    normalizeMovieTitle, findMovieTitles,
  }
  new Script(`(${mountTitleSuggestions.toString()})(input, list, ['괴물', '괴물들', '괴물의 아이'])`).runInNewContext(context)
  let submissions = 0
  input.form.addEventListener("submit", () => submissions++)

  input.dispatch("compositionstart")
  input.value = "괴"
  input.dispatch("input", { isComposing: true })
  assert.equal(list.hidden, true)
  input.value = "괴물"
  input.dispatch("compositionend")
  assert.equal(list.children.length, 3)
  assert.equal(input.attributes["aria-expanded"], "true")
  input.dispatch("keydown", { key: "ArrowDown" })
  assert.equal(input.attributes["aria-activedescendant"], "sugg-0")
  const enter = input.dispatch("keydown", { key: "Enter" })
  assert.equal(enter.defaultPrevented, true)
  assert.equal(input.value, "괴물")
  assert.equal(submissions, 0)
  assert.equal(list.hidden, true)

  input.value = "괴물"
  input.dispatch("input")
  assert.equal(list.dispatch("mousedown").defaultPrevented, true)
  list.dispatch("click", { target: list.children[1] })
  assert.equal(input.value, "괴물들")
  assert.equal(submissions, 0)

  input.dispatch("input")
  input.dispatch("keydown", { key: "Escape" })
  assert.equal(list.hidden, true)
  assert.equal(input.value, "괴물들")
  input.dispatch("input")
  input.form.dispatch("submit")
  assert.equal(submissions, 1)
  assert.equal(list.hidden, true)
})

test("available catalog includes non-quiz Korean movies and international titles", async () => {
  const quizzes = JSON.parse(await readFile("data/quizzes.json", "utf8")).quizzes
  const quizSet = new Set(quizzes.map((q) => normalizeMovieTitle(q.title)))
  const all = await loadMovieTitles(quizzes.map((q) => q.title))
  const outsideQuiz = all.filter((title) => !quizSet.has(normalizeMovieTitle(title)))
  assert.ok(outsideQuiz.length > 500)
  const example = outsideQuiz.find((title) => /[가-힣]/.test(title))
  assert.equal(findMovieTitles(all, example)[0], example)
  assert.ok(findMovieTitles(all, "inception").includes("Inception"))
  console.log(`자동완성 ${all.length}개 제목 · 기존 퀴즈 밖 ${outsideQuiz.length}개`)
})

test("focusing a form button preserves suggestions until submission, so mobile clicks land", () => {
  const input = new Element("guess"), list = new Element("sugg"), submit = new Element("submit")
  input.form = new Element("form")
  input.form.append(submit)
  const context = { document: { createElement: () => new Element() }, input, list, normalizeMovieTitle, findMovieTitles }
  new Script(`(${mountTitleSuggestions.toString()})(input, list, ['Inception'])`).runInNewContext(context)
  input.value = 'Inception'
  input.dispatch('input')
  input.dispatch('blur', { relatedTarget: submit })
  input.form.dispatch('focusout', { relatedTarget: submit })
  assert.equal(list.hidden, false)
  input.form.dispatch('submit')
  assert.equal(list.hidden, true)
  input.dispatch('input')
  input.form.dispatch('focusout', { relatedTarget: new Element('outside') })
  assert.equal(list.hidden, true)
})
