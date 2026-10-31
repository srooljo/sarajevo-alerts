import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bolt, Reload, MapPin, Trash, Plus, ExternalLink, NotificationBell } from '@openai/apps-sdk-ui/components/Icon'
import { CSS } from './theme.js'
import { HOOD_NAMES } from './hoods.js'
import {
  KINDS, KIND_BY_ID, MUNICIPALITIES, matchesFor, phase, dayLabel, timeAgo, todayISO, nowHM,
} from './domain.js'

// Domain glyphs for the utilities (the icon set has a bolt but no drop/flame/cone).
const Drop = (p) => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c-.3 0-.6.15-.8.4C9.4 5.3 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0c0-3.9-3.9-9.2-5.7-11.6a1 1 0 0 0-.8-.4Z" />
  </svg>
)
const Flame = (p) => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} fill="currentColor" aria-hidden="true">
    <path d="M13.2 2.3c.4 2.6-.6 4.4-2 6-1.3 1.4-2.7 2.9-2.7 5.2 0 1 .3 1.9.8 2.6-1.9-.8-3.3-2.6-3.3-5 0 .1-2 2.3-2 5.4A8 8 0 0 0 12 22.5a8 8 0 0 0 8-8c0-5.7-4-10-6.8-12.2Zm-1 18.2a3 3 0 0 1-3-3c0-2 1.6-3 2.4-4.6.9 1.2 3.6 2.8 3.6 4.6a3 3 0 0 1-3 3Z" />
  </svg>
)
const Cone = (p) => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} fill="currentColor" aria-hidden="true">
    <path d="M10.2 3h3.6l1.1 4H9.1l1.1-4Zm-1.6 6h6.8l1.1 4H7.5l1.1-4Zm-1.7 6h10.2l1.2 4.2H20a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2h1.7L6.9 15Z" />
  </svg>
)
const KIND_ICON = { power: Bolt, water: Drop, heating: Flame, traffic: Cone }
const kc = (kind) => ({ '--kc': `var(--k-${kind})` })
const store = () => window.mobius?.storage

function Toggle({ on, onChange, label, sub }) {
  return (
    <div className="sa-switch" onClick={() => onChange(!on)}>
      <div><div style={{ fontWeight: 650 }}>{label}</div>{sub && <div className="sa-hint">{sub}</div>}</div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="sa-toggle"
        onClick={(e) => { e.stopPropagation(); onChange(!on) }} />
    </div>
  )
}

function EventCard({ ev, mine, open, onToggle, flash, today, hm }) {
  const Icon = KIND_ICON[ev.kind] || Bolt
  const ph = phase(ev, today, hm)
  const badge = { now: 'Sada', later: 'Kasnije danas', today: 'Danas', upcoming: '', ended: 'Završeno', news: 'Vijest' }[ph]
  const names = (ev.streets || []).map((s) => s.name)
  const shown = names.slice(0, 5)
  const when = ev.timeFrom ? `${ev.timeFrom}–${ev.timeTo || '?'}` : ev.ongoing ? 'U toku' : null
  return (
    <div id={`ev-${ev.id}`} role="button" tabIndex={0} aria-expanded={open}
      className={`sa-card${mine.length ? ' mine' : ''}${ph === 'ended' ? ' ended' : ''}${flash ? ' flash' : ''}`}
      style={kc(ev.kind)} onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}>
      <div className="sa-card-top">
        <span className="sa-card-ico"><Icon size={16} /></span>
        <span className="sa-card-title">{ev.title}</span>
        {badge && <span className={`sa-badge${ph === 'now' ? ' now' : ''}`}>{badge}</span>}
      </div>
      <div className="sa-meta">
        {when && <span><b>{when}</b></span>}
        {ev.area && <span>{ev.area}</span>}
        <span>{ev.sourceName}</span>
      </div>
      {ev.hoods?.length > 0 && (
        <div className="sa-hoods" aria-label="Naselja">
          {ev.hoods.map((h) => <span key={h}>{h}</span>)}
        </div>
      )}
      {!open && shown.length > 0 && (
        <div className="sa-streets">
          {shown.join(', ')}{names.length > shown.length ? ` i još ${names.length - shown.length}` : ''}
        </div>
      )}
      {mine.length > 0 && (
        <div className="sa-mine">{mine.map((m) => <span key={m}><MapPin width={12} height={12} />{m}</span>)}</div>
      )}
      {open && (
        <div className="sa-more" onClick={(e) => e.stopPropagation()}>
          {ev.source === 'epbih' ? (
            <table><tbody>
              {ev.streets.map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.numbers}</td></tr>)}
            </tbody></table>
          ) : (
            <p>{ev.text}</p>
          )}
          {ev.url && (
            <a className="sa-link" href={ev.url} target="_blank" rel="noreferrer">
              Otvori na: {ev.sourceName} <ExternalLink width={14} height={14} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Notices({ data, places, streetMuni, focusId, onRefresh, busy }) {
  const [kind, setKind] = useState(null)
  const [onlyMine, setOnlyMine] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [showEnded, setShowEnded] = useState(false)
  const today = todayISO()
  const hm = nowHM()

  const events = useMemo(() => (data?.events || [])
    .filter((e) => !e.date || e.date >= today || e.ongoing)
    .map((e) => ({ ev: e, mine: matchesFor(e, places, streetMuni) })), [data, places, streetMuni, today])

  useEffect(() => {
    if (!focusId) return
    setKind(null); setOnlyMine(false); setOpenId(focusId); setShowEnded(true)
    setTimeout(() => document.getElementById(`ev-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
  }, [focusId])

  const counts = Object.fromEntries(KINDS.map((k) => [k.id, events.filter(({ ev }) =>
    ev.kind === k.id && phase(ev, today, hm) !== 'ended' && (ev.date === today || ev.ongoing || !ev.date)).length]))
  const live = Object.fromEntries(KINDS.map((k) => [k.id, events.some(({ ev }) => ev.kind === k.id && phase(ev, today, hm) === 'now')]))

  const visible = events.filter(({ ev, mine }) => (!kind || ev.kind === kind) && (!onlyMine || mine.length))
  const endedToday = visible.filter(({ ev }) => phase(ev, today, hm) === 'ended')
  const rest = visible.filter(({ ev }) => phase(ev, today, hm) !== 'ended' || showEnded)
  const groups = []
  for (const item of rest) {
    const key = item.ev.ongoing ? '' : item.ev.date || ''
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push(g = { key, items: [] })
    g.items.push(item)
  }
  // Today first, then long-running conditions, then the coming days.
  const rank = (k) => (k === today ? '0' : k === '' ? '1' : `2${k}`)
  groups.sort((a, b) => rank(a.key).localeCompare(rank(b.key)))
  const mineCount = events.filter(({ ev, mine }) => mine.length && phase(ev, today, hm) !== 'ended').length

  return (
    <>
      <div className="sa-strip" role="group" aria-label="Filtriraj po vrsti">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k.id]
          return (
            <button key={k.id} type="button" className="sa-tile" style={kc(k.id)} aria-pressed={kind === k.id}
              onClick={() => setKind(kind === k.id ? null : k.id)}
              aria-label={`${k.label}: danas ${counts[k.id]}`}>
              {live[k.id] && <span className="sa-tile-live" aria-hidden="true" />}
              <span className="sa-tile-ico"><Icon size={17} /></span>
              <span className="sa-tile-n">{counts[k.id]}</span>
              <span className="sa-tile-l">{k.label} danas</span>
            </button>
          )
        })}
      </div>

      <div className="sa-bar">
        <button type="button" className="sa-chip" aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>
          <MapPin width={14} height={14} /> Moja mjesta{mineCount ? ` · ${mineCount}` : ''}
        </button>
        <span className="sa-hint">{visible.length} obavještenja</span>
      </div>

      {!data && <div className="sa-empty"><strong>Prikupljam obavještenja…</strong>Prva provjera svih izvora traje nekoliko sekundi.</div>}
      {data && visible.length === 0 && (
        <div className="sa-empty">
          <strong>{onlyMine ? 'Ništa za vaša mjesta' : 'Sve je mirno'}</strong>
          {onlyMine ? (places.length ? 'Trenutno nema obavještenja za vaše ulice i naselja.' : 'Dodajte ulice ili naselja pod Moja mjesta.') : 'Trenutno nema obavještenja za ovaj filter.'}
        </div>
      )}

      {endedToday.length > 0 && !showEnded && (
        <button type="button" className="sa-earlier" onClick={() => setShowEnded(true)}>
          Prikaži završene danas ({endedToday.length})
        </button>
      )}

      {groups.map((g) => (
        <section key={g.key || 'ongoing'}>
          <h2 className="sa-day">{g.key ? dayLabel(g.key, today) : 'U toku'}</h2>
          {g.items.map(({ ev, mine }) => (
            <EventCard key={ev.id} ev={ev} mine={mine} today={today} hm={hm}
              open={openId === ev.id} flash={focusId === ev.id}
              onToggle={() => setOpenId(openId === ev.id ? null : ev.id)} />
          ))}
        </section>
      ))}

      {data?.status && (
        <div className="sa-sources">
          Izvori · provjereno {timeAgo(data.updatedAt)}, svakih 30 minuta
          <ul>
            {[
              ['epbih', 'Elektroprivreda BiH — planska isključenja struje'],
              ['vik', 'ViK Sarajevo — radovi na vodovodnoj mreži'],
              ['gras', 'GRAS — izmjene javnog prevoza'],
              ['bihamk', 'BIHAMK — stanje na cestama'],
              ['news', 'Klix, N1, FENA, Avaz — vijesti o nestancima i saobraćaju'],
              ['toplane', 'Toplane Sarajevo — obavještenja o grijanju'],
            ].map(([id, label]) => {
              const s = data.status[id]
              return (
                <li key={id}>
                  <span className={`sa-dot${s && !s.ok ? ' bad' : ''}`} />{label}
                  {s && !s.ok && (id === 'toplane' ? ' (stranica nedostupna — grijanje iz vijesti)' : ' (nedostupno pri ovoj provjeri)')}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

function Places({ watch, saveWatch, streetNames }) {
  const suggestions = useMemo(() => [...new Set([...HOOD_NAMES, ...streetNames])], [streetNames])
  const [mode, setMode] = useState('place')
  const [value, setValue] = useState('')
  const [number, setNumber] = useState('')
  const [area, setArea] = useState(null)
  const [kinds, setKinds] = useState(KINDS.map((k) => k.id))
  const places = watch.places || []
  const canAdd = (mode === 'place' ? value.trim().length > 1 : !!area) && kinds.length > 0

  function add() {
    if (!canAdd) return
    const p = mode === 'place'
      ? { id: `p${Date.now()}`, type: 'place', value: value.trim(), number: number.trim() || undefined, kinds }
      : { id: `a${Date.now()}`, type: 'area', value: area, kinds }
    saveWatch({ ...watch, places: [...places, p] })
    window.mobius?.signal?.('item_created', { type: p.type })
    setValue(''); setNumber(''); setArea(null)
  }
  function remove(id) {
    saveWatch({ ...watch, places: places.filter((p) => p.id !== id) })
    window.mobius?.signal?.('item_deleted')
  }
  const toggleKind = (id) => setKinds(kinds.includes(id) ? kinds.filter((k) => k !== id) : [...kinds, id])

  return (
    <>
      <div className="sa-panel">
        <h3>Dodaj mjesto za praćenje</h3>
        <div className="sa-hint">Dobit ćete obavještenje kad se novo upozorenje odnosi na njega.</div>
        <div className="sa-seg" role="group">
          <button type="button" aria-pressed={mode === 'place'} onClick={() => setMode('place')}>Ulica ili naselje</button>
          <button type="button" aria-pressed={mode === 'area'} onClick={() => setMode('area')}>Cijela općina</button>
        </div>
        {mode === 'place' ? (
          <div className="sa-row">
            <input className="sa-input" list="sa-streets" placeholder="npr. Zmaja od Bosne, Hrasno"
              value={value} onChange={(e) => setValue(e.target.value)} aria-label="Ulica ili naselje"
              onKeyDown={(e) => e.key === 'Enter' && add()} />
            <input className="sa-input num" placeholder="Br." value={number} inputMode="text"
              onChange={(e) => setNumber(e.target.value)} aria-label="Kućni broj (neobavezno)" />
            <datalist id="sa-streets">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        ) : (
          <div className="sa-munis">
            {MUNICIPALITIES.map((m) => (
              <button key={m} type="button" className="sa-chip" aria-pressed={area === m} onClick={() => setArea(area === m ? null : m)}>{m}</button>
            ))}
          </div>
        )}
        <span className="sa-label">Obavijesti me o</span>
        <div className="sa-kinds">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="sa-kchip" style={kc(k.id)} aria-pressed={kinds.includes(k.id)} onClick={() => toggleKind(k.id)}>
              <i />{k.label}
            </button>
          ))}
        </div>
        <button type="button" className="sa-primary" disabled={!canAdd} onClick={add}><Plus width={16} height={16} /> Dodaj mjesto</button>
      </div>

      <div className="sa-panel">
        <h3>Moja mjesta</h3>
        {places.length === 0 && <div className="sa-hint" style={{ padding: '8px 0' }}>Još ništa. Dodajte svoju ulicu, naselje u kojem radite ili gdje žive vaši roditelji.</div>}
        {places.map((p) => (
          <div key={p.id} className="sa-place">
            <MapPin width={18} height={18} />
            <div className="sa-place-main">
              <div className="sa-place-name">{p.value}{p.number ? ` ${p.number}` : ''}</div>
              <div className="sa-place-sub">
                {p.type === 'area' ? 'Općina' : 'Ulica / naselje'} ·
                {(p.kinds?.length ? p.kinds : KINDS.map((k) => k.id)).map((k) => (
                  <span key={k} style={{ ...kc(k), display: 'inline-flex', alignItems: 'center', gap: 4 }}><i />{KIND_BY_ID[k].label}</span>
                ))}
              </div>
            </div>
            <button type="button" className="sa-icon-btn" aria-label={`Ukloni ${p.value}`} onClick={() => remove(p.id)}><Trash width={18} height={18} /></button>
          </div>
        ))}
      </div>

      <div className="sa-panel">
        <Toggle on={!watch.paused} onChange={(on) => saveWatch({ ...watch, paused: !on })}
          label="Obavještenja na telefon" sub="Provjera svakih 30 minuta. Svako upozorenje stiže samo jednom." />
      </div>
    </>
  )
}

export default function App({ appId, token }) {
  const [tab, setTab] = useState('notices')
  const [data, setData] = useState(null)
  const [watch, setWatch] = useState({ places: [] })
  const [streetMuni, setStreetMuni] = useState({})
  const [streetNames, setStreetNames] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [focusId, setFocusId] = useState(null)
  const ready = useRef(false)

  useEffect(() => {
    const s = store()
    if (!s) return
    const unsubs = [
      s.subscribe('events.json', (v) => {
        setData(v || null)
        if (!ready.current) { ready.current = true; window.mobius?.signal?.('app_ready', { item_count: v?.events?.length || 0 }) }
      }),
      s.subscribe('watch.json', (v) => setWatch(v && Array.isArray(v.places) ? v : { places: [] })),
      s.subscribe('streets.json', (v) => setStreetMuni(v || {})),
      s.subscribe('street-names.json', (v) => setStreetNames(Array.isArray(v) ? v : [])),
    ]
    return () => unsubs.forEach((u) => u?.())
  }, [])

  // First open: nothing collected yet, so run the collector once.
  useEffect(() => {
    const t = setTimeout(() => { if (!ready.current) refresh() }, 2500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onIntent = (event) => {
      if (event.source !== window.parent || event.data?.type !== 'moebius:app-intent') return
      const m = /^event:(.+)$/.exec(event.data.intent || '')
      if (m) { setTab('notices'); setFocusId(m[1]) }
    }
    window.addEventListener('message', onIntent)
    return () => window.removeEventListener('message', onIntent)
  }, [])

  async function saveWatch(next) {
    setWatch(next)
    try { await store().set('watch.json', next) } catch (e) {
      setErr('Mjesta nisu sačuvana — provjerite internet vezu.')
      window.mobius?.signal?.('error', { message: String(e?.message || e), source: 'save_watch' })
    }
  }

  async function refresh() {
    if (busy) return
    setBusy(true); setErr('')
    const before = data?.updatedAt
    try {
      const r = await fetch(`/api/apps/${appId}/run-job`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status}`)
      for (let i = 0; i < 30; i++) {
        await new Promise((res) => setTimeout(res, 3000))
        const g = await fetch(`/api/storage/apps/${appId}/events.json`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (g.ok) {
          const v = await g.json()
          if (v?.updatedAt && v.updatedAt !== before) { setData(v); break }
        }
      }
    } catch (e) {
      setErr('Osvježavanje nije uspjelo. Automatska provjera i dalje radi svakih 30 minuta.')
      window.mobius?.signal?.('error', { message: String(e?.message || e), source: 'refresh' })
    } finally { setBusy(false) }
  }

  return (
    <div className="sa-root">
      <style>{CSS}</style>
      <header className="sa-head">
        <div>
          <div className="sa-over">Struja · voda · grijanje · saobraćaj</div>
          <h1 className="sa-title">Status Šehera</h1>
        </div>
        <button type="button" className="sa-refresh" onClick={refresh} disabled={busy} aria-label="Provjeri izvore sada">
          <Reload width={15} height={15} className={busy ? 'sa-spin' : ''} />
          {busy ? 'Provjeravam…' : data?.updatedAt ? timeAgo(data.updatedAt) : 'Provjeri'}
        </button>
      </header>

      <div className="sa-tabs" role="tablist">
        <button type="button" role="tab" className="sa-tab" aria-selected={tab === 'notices'} onClick={() => setTab('notices')}>Obavještenja</button>
        <button type="button" role="tab" className="sa-tab" aria-selected={tab === 'places'} onClick={() => setTab('places')}>
          <NotificationBell width={14} height={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Moja mjesta{watch.places?.length ? ` · ${watch.places.length}` : ''}
        </button>
      </div>

      {err && <div className="sa-err" role="alert">{err}</div>}

      {tab === 'notices'
        ? <Notices data={data} places={watch.places || []} streetMuni={streetMuni} focusId={focusId} onRefresh={refresh} busy={busy} />
        : <Places watch={watch} saveWatch={saveWatch} streetNames={streetNames} />}
    </div>
  )
}
