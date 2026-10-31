// Pure logic shared by the views. Mirrors fetch.py's matching so the open app
// highlights the same notices the background job alerts about.

export const KINDS = [
  { id: 'power', label: 'Struja', long: 'Struja' },
  { id: 'water', label: 'Voda', long: 'Voda' },
  { id: 'heating', label: 'Grijanje', long: 'Grijanje' },
  { id: 'traffic', label: 'Saobraćaj', long: 'Saobraćaj' },
]
export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]))

export const MUNICIPALITIES = [
  'Centar', 'Stari Grad', 'Novo Sarajevo', 'Novi Grad', 'Ilidža',
  'Vogošća', 'Hadžići', 'Ilijaš', 'Trnovo',
]

export function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dj/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function numberMatches(want, numbers) {
  const w = (want || '').toUpperCase().replace(/\s/g, '')
  if (!w || !numbers) return true
  const n = /^\d+$/.test(w) ? parseInt(w, 10) : null
  return numbers.toUpperCase().split(/,\s*/).some((raw) => {
    const tok = raw.trim().replace(/\.$/, '').replace(/\s/g, '')
    if (tok === w) return true
    const r = tok.match(/^(\d+)-(\d+)$/)
    return !!(r && n !== null && +r[1] <= n && n <= +r[2])
  })
}

export function matchEvent(ev, watch, streetMuni) {
  if (watch.kinds?.length && !watch.kinds.includes(ev.kind)) return null
  const hay = ` ${norm(`${ev.title} ${ev.text || ''}`)} `
  if (watch.type === 'area') {
    const area = watch.value
    if (ev.area === area) return area
    for (const st of ev.streets || []) {
      if (streetMuni?.[norm(st.name)] === area) return `${st.name} (${area})`
    }
    return hay.includes(` ${norm(area)} `) ? area : null
  }
  const q = norm(watch.value)
  if (!q) return null
  const hood = (ev.hoods || []).find((h) => norm(h) === q)
  if (hood && !watch.number) return hood
  for (const st of ev.streets || []) {
    if (norm(st.name) === q) {
      if (watch.number && !numberMatches(watch.number, st.numbers)) return null
      return st.name + (watch.number ? ` ${watch.number}` : '')
    }
  }
  return hay.includes(` ${q} `) ? watch.value : null
}

export function matchesFor(ev, places, streetMuni) {
  const out = new Set()
  for (const w of places) {
    const r = matchEvent(ev, w, streetMuni)
    if (r) out.add(r)
  }
  return [...out]
}

// ---- time helpers: always Sarajevo wall time, whatever the device's zone

function sarajevoParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

export function todayISO(d = new Date()) {
  const p = sarajevoParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

export function nowHM(d = new Date()) {
  const p = sarajevoParts(d)
  return `${p.hour}:${p.minute}`
}

export function phase(ev, today = todayISO(), hm = nowHM()) {
  if (ev.ongoing) return 'now'
  if (!ev.date) return 'news'
  if (ev.date < today) return 'ended'
  if (ev.date > today) return 'upcoming'
  if (ev.timeTo && ev.timeTo < hm) return 'ended'
  if (ev.timeFrom && ev.timeFrom > hm) return 'later'
  return ev.timeFrom ? 'now' : 'today'
}

const DAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function dayLabel(iso, today = todayISO()) {
  if (!iso) return 'U toku'
  const d = new Date(`${iso}T12:00:00`)
  const t = new Date(`${today}T12:00:00`)
  const diff = Math.round((d - t) / 86400000)
  const nice = `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`
  if (diff === 0) return `Danas · ${nice}`
  if (diff === 1) return `Sutra · ${nice}`
  return nice
}

export function timeAgo(iso) {
  if (!iso) return 'nikad'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'upravo'
  if (mins < 60) return `prije ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `prije ${h} h`
  const d = new Date(iso)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}
