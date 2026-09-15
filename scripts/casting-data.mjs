/** Fan casting prompts. Original credits: https://d23.com/a-to-z/avengers-marvels-the-film/ */
export const CASTING = {
  id: "avengers-2012",
  title: "한국판 어벤져스",
  originalTitle: "The Avengers · 2012",
  source: "https://d23.com/a-to-z/avengers-marvels-the-film/",
  roles: [
    { id: "ironman", name: "아이언맨", person: "토니 스타크", original: "Robert Downey Jr.", originalKo: "로버트 다우니 주니어", cue: "수트 안의 천재, 당신의 선택은?", picks: ["10055626", "10087253", "10066899", "10062025", "10003788", "10060612"] },
    { id: "captain", name: "캡틴 아메리카", person: "스티브 로저스", original: "Chris Evans", originalKo: "크리스 에반스", cue: "팀의 중심을 잡아줄 얼굴을 골라주세요.", picks: ["20211007", "20219146", "20232067", "10057349", "20171680", "10088975"] },
    { id: "thor", name: "토르", person: "천둥의 신", original: "Chris Hemsworth", originalKo: "크리스 헴스워스", cue: "묠니르를 든 모습을 상상해 보세요.", picks: ["20170901", "10021341", "20133615", "20232067", "20111976", "10060612"] },
    { id: "hulk", name: "헐크", person: "브루스 배너", original: "Mark Ruffalo", originalKo: "마크 러팔로", cue: "차분한 배너부터 폭발하는 헐크까지.", picks: ["10019065", "10067353", "10005276", "10090290", "10029474", "20127194"] },
    { id: "widow", name: "블랙 위도우", person: "나타샤 로마노프", original: "Scarlett Johansson", originalKo: "스칼릿 조핸슨", cue: "날렵한 액션과 비밀스러운 분위기의 주인공.", picks: ["10061467", "10005064", "10087820", "10087280", "10006380", "20125838"] },
    { id: "hawkeye", name: "호크아이", person: "클린트 바튼", original: "Jeremy Renner", originalKo: "제러미 레너", cue: "화살 한 발로 존재감을 보여줄 배우는?", picks: ["10057469", "10062025", "10052465", "10000558", "10060612", "10057349"] },
    { id: "loki", name: "로키", person: "장난의 신", original: "Tom Hiddleston", originalKo: "톰 히들스턴", cue: "미워할 수 없는 이 악역, 누구에게 맡길까요?", picks: ["10000558", "20111011", "10005508", "20111341", "10040665", "20171222"] },
    { id: "fury", name: "닉 퓨리", person: "쉴드 국장", original: "Samuel L. Jackson", originalKo: "새뮤얼 L. 잭슨", cue: "이 팀을 한자리에 모을 카리스마.", picks: ["10072251", "10087518", "10035772", "10006380", "10090290", "10054128"] },
  ],
}

/** Only known catalog IDs travel in saved drafts and shared links. */
export function cleanCasting(value, roles, actors) {
  const known = new Set(actors.map((a) => a.id))
  const used = new Set()
  const picks = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return picks
  for (const role of roles) {
    const id = value[role.id]
    if (typeof id !== "string" || !known.has(id) || used.has(id)) continue
    picks[role.id] = id
    used.add(id)
  }
  return picks
}

export function encodeCasting(picks, project, actors) {
  const clean = cleanCasting(picks, project.roles, actors)
  return "#cast=" + project.id + ":" + project.roles.map((r) => clean[r.id] || "-").join(".")
}

export function decodeCasting(hash, project, actors) {
  const prefix = "#cast=" + project.id + ":"
  if (typeof hash !== "string" || !hash.startsWith(prefix) || hash.length > 500) return null
  const ids = hash.slice(prefix.length).split(".")
  if (ids.length !== project.roles.length || ids.some((id) => !/^(?:[0-9]{1,16}|-)$/.test(id))) return null
  const raw = Object.fromEntries(project.roles.map((r, i) => [r.id, ids[i]]).filter(([, id]) => id !== "-"))
  const clean = cleanCasting(raw, project.roles, actors)
  return Object.keys(raw).length === Object.keys(clean).length ? clean : null
}
