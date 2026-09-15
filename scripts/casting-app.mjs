/** Browser controller, embedded by build-casting-play.mjs. */
export function castingApp(project, actors) {
  const $ = (id) => document.getElementById(id)
  const byId = new Map(actors.map((actor) => [actor.id, actor]))
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  const normalize = (value) => value.normalize("NFC").toLowerCase().replace(/\s+/g, "")
  const key = "noorung-casting-v1-" + project.id
  let picks = {}
  let active = 0
  let expanded = false
  let limit = 12
  let saved = true
  let results = false

  const photo = (actor, className = "") => `<span class="portrait ${className}"><span class="photo-fallback" aria-hidden="true">${esc(actor.name.slice(0, 1))}</span>${actor.image ? `<img src="${esc(actor.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>`
  // Keep a named, legible card if a third-party portrait cannot load.
  document.addEventListener("error", (event) => {
    if (event.target instanceof HTMLImageElement) event.target.hidden = true
  }, true)

  function storeDraft() {
    try { localStorage.setItem(key, JSON.stringify(picks)); saved = true } catch { saved = false }
    $("save-note").textContent = saved ? "선택 내용은 이 브라우저에 자동 저장됩니다." : "자동 저장을 사용할 수 없어요. 완성 후 공유 링크를 보관해 주세요."
    // An edited shared link should always represent what is on screen.
    if (location.hash.startsWith("#cast=")) history.replaceState(null, "", encodeCasting(picks, project, actors))
    $("share-panel").hidden = true
  }

  function renderBoard() {
    const count = Object.keys(picks).length
    $("progress-label").textContent = `${count} / ${project.roles.length} 캐스팅`
    $("casting-progress").value = count
    $("role-board").innerHTML = project.roles.map((role, index) => {
      const actor = byId.get(picks[role.id])
      return `<button type="button" class="role-slot ${index === active && !results ? "active" : ""} ${actor ? "filled" : ""}" data-role="${index}" aria-label="${esc(role.name)}: ${actor ? esc(actor.name) + ", 변경" : "배우 선택"}"${index === active && !results ? ' aria-current="step"' : ""}>
        ${actor ? photo(actor) : `<span class="empty-slot" aria-hidden="true">${String(index + 1).padStart(2, "0")}<span>+</span></span>`}
        <span class="slot-role">${esc(role.name)}</span><strong>${actor ? esc(actor.name) : "누구를 고를까요?"}</strong>
      </button>`
    }).join("")
    $("finish").textContent = count === project.roles.length ? "완성한 캐스팅 보기 →" : `내 캐스팅 보기 (${count}/${project.roles.length})`
    $("share").disabled = count !== project.roles.length
    $("result-note").textContent = count === project.roles.length ? "이 조합으로 극장에서 만난다면? 친구에게 캐스팅을 보여주세요." : `아직 ${project.roles.length - count}명의 자리가 비어 있어요. 배역을 눌러 캐스팅을 이어가세요.`
  }

  function renderRole() {
    const role = project.roles[active]
    const actor = byId.get(picks[role.id])
    $("role-number").textContent = `ROLE ${String(active + 1).padStart(2, "0")} / ${String(project.roles.length).padStart(2, "0")}`
    $("role-name").textContent = role.name
    $("role-person").textContent = role.person
    $("role-cue").textContent = role.cue
    $("original-actor").innerHTML = photo({ name: role.originalKo, image: role.image }, "original-photo") + `<span><small>원작 배우</small><strong>${esc(role.originalKo)}</strong></span>`
    $("chosen-actor").innerHTML = actor ? photo(actor, "chosen-photo") + `<span><small>나의 캐스팅</small><strong>${esc(actor.name)}</strong></span>` : '<span class="selection-empty">후보에서 배우를 골라주세요.</span>'
    $("clear-role").hidden = !actor
    $("previous").disabled = active === 0
    $("next").textContent = active === project.roles.length - 1 ? "완성본 보기 →" : "다음 배역 →"
    $("candidate-title").textContent = `${role.name}, 누구로 할까요?`
    renderCandidates()
  }

  function renderCandidates() {
    const role = project.roles[active]
    const query = normalize($("actor-search").value.trim())
    let candidates
    if (query) {
      candidates = actors.filter((a) => normalize(a.name).includes(query) || normalize(a.nameEn).includes(query))
      candidates.sort((a, b) => Number(normalize(b.name) === query) - Number(normalize(a.name) === query) || Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)))
    } else if (expanded) {
      candidates = actors
    } else {
      candidates = role.picks.map((id) => byId.get(id)).filter(Boolean)
    }
    const visible = candidates.slice(0, limit)
    $("candidate-count").textContent = query ? `검색 결과 ${candidates.length}명` : expanded ? `전체 배우 ${candidates.length.toLocaleString("ko-KR")}명` : "먼저 둘러볼 후보 · 다른 배우도 검색할 수 있어요"
    $("candidate-grid").innerHTML = visible.map((actor) => {
      const occupied = project.roles.find((r) => r.id !== role.id && picks[r.id] === actor.id)
      const selected = picks[role.id] === actor.id
      return `<button type="button" class="actor-card ${selected ? "selected" : ""}" data-actor="${actor.id}" aria-label="${esc(actor.name)}${occupied ? ", " + esc(occupied.name) + " 배역에 선택됨" : " 선택"}" aria-pressed="${selected}" ${occupied ? "disabled" : ""}>
        ${photo(actor)}<span class="actor-info"><strong>${esc(actor.name)}</strong><span class="actor-credit">${esc(actor.credits.slice(0, 2).join(" · "))}</span><span class="pick-label">${selected ? "✓ 선택됨" : occupied ? esc(occupied.name) + " 배역에 선택됨" : "캐스팅 +"}</span></span>
      </button>`
    }).join("")
    $("no-results").hidden = candidates.length > 0
    $("show-more").hidden = candidates.length <= limit
    $("show-more").textContent = `배우 더 보기 (${Math.min(limit, candidates.length)} / ${candidates.length})`
    $("browse-all").hidden = !!query || expanded
  }

  function showRole(index, focus = false) {
    active = index
    results = false
    expanded = false
    limit = 12
    $("actor-search").value = ""
    $("casting-editor").hidden = false
    $("result-header").hidden = true
    $("result-actions").hidden = true
    $("editor-actions").hidden = false
    $("share-panel").hidden = true
    $("role-board").classList.remove("result-board")
    renderBoard()
    renderRole()
    if (focus) {
      $("role-name").focus({ preventScroll: true })
      $("casting-editor").scrollIntoView({ block: "start" })
    }
  }

  function showResults(focus = true) {
    results = true
    $("casting-editor").hidden = true
    $("result-header").hidden = false
    $("result-actions").hidden = false
    $("editor-actions").hidden = true
    $("role-board").classList.add("result-board")
    renderBoard()
    if (focus) $("result-title").focus()
  }

  $("role-board").addEventListener("click", (event) => {
    const button = event.target.closest("[data-role]")
    if (button) showRole(Number(button.dataset.role), true)
  })
  $("candidate-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-actor]")
    if (!button || button.disabled) return
    const role = project.roles[active]
    const id = button.dataset.actor
    if (!byId.has(id)) return
    picks[role.id] = id
    storeDraft()
    renderBoard()
    renderRole()
    $("announcement").textContent = `${role.name}에 ${byId.get(id).name} 배우를 선택했어요.`
    $("candidate-grid").querySelector(`[data-actor="${id}"]`)?.focus({ preventScroll: true })
  })
  $("actor-search").addEventListener("input", () => { limit = 12; renderCandidates() })
  $("browse-all").addEventListener("click", () => { expanded = true; limit = 12; renderCandidates() })
  $("show-more").addEventListener("click", () => { limit += 12; renderCandidates() })
  $("clear-role").addEventListener("click", () => {
    delete picks[project.roles[active].id]
    storeDraft(); renderBoard(); renderRole()
    $("actor-search").focus()
  })
  $("previous").addEventListener("click", () => showRole(Math.max(0, active - 1), true))
  $("next").addEventListener("click", () => active === project.roles.length - 1 ? showResults() : showRole(active + 1, true))
  $("finish").addEventListener("click", () => showResults())
  $("edit").addEventListener("click", () => showRole(Math.max(0, project.roles.findIndex((role) => !picks[role.id])), true))
  $("share").addEventListener("click", async () => {
    const url = new URL(location.href)
    url.hash = encodeCasting(picks, project, actors)
    url.search = ""
    $("share-url").value = url.href
    $("share-panel").hidden = false
    try {
      await navigator.clipboard.writeText(url.href)
      $("share-status").textContent = "링크를 복사했어요. 친구에게 보내면 이 캐스팅을 볼 수 있어요."
    } catch {
      $("share-status").textContent = "아래 링크를 선택해 복사해 주세요."
      $("share-url").focus(); $("share-url").select()
    }
  })
  $("share-url").addEventListener("click", () => $("share-url").select())

  let shared = decodeCasting(location.hash, project, actors)
  if (shared) {
    picks = shared
    $("save-note").textContent = "공유받은 캐스팅입니다. 배역을 눌러 나만의 조합으로 바꿀 수 있어요."
  } else {
    try { picks = cleanCasting(JSON.parse(localStorage.getItem(key)), project.roles, actors) } catch {
      $("save-note").textContent = "이전 캐스팅을 불러오지 못했어요. 새롭게 배우를 선택해 주세요."
    }
    if (location.hash.startsWith("#cast=")) $("announcement").textContent = "캐스팅 링크를 읽을 수 없어 내 캐스팅을 열었어요."
  }
  if (shared) showResults(false)
  else showRole(Math.max(0, project.roles.findIndex((role) => !picks[role.id])))

  window.addEventListener("hashchange", () => {
    shared = decodeCasting(location.hash, project, actors)
    if (shared) {
      picks = shared
      $("save-note").textContent = "공유받은 캐스팅입니다. 배역을 눌러 나만의 조합으로 바꿀 수 있어요."
      $("share-panel").hidden = true
      showResults()
    }
  })
}
