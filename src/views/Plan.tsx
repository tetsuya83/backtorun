import { useEffect, useRef, useState } from 'preact/hooks'
import { data, saveState } from '../api'
import { addDays, buildTimeline, sessionDate, sessionKey, slotForDate, type Slot } from '../../shared/engine'
import { fmtDate, STRENGTH, todayISO, WEEKDAY } from '../guide'
import { phaseName, weekLabel } from './Today'
import { Gauge } from '../ui'

function WeekRow({ s, open, toggle, current }: { s: Slot; open: boolean; toggle: () => void; current: boolean }) {
  const d = data.value!
  const n = typeof s.week === 'number' ? s.week : 0
  const ses = s.sessions.filter(x => x.km !== 0)
  const doneN = ses.filter(x => d.activities.some(a => a.sessionKey === sessionKey(s, x.day))).length
  const canSkip = s.skippable && !d.state.skips.includes(n)
  const past = addDays(s.monday, 7) <= todayISO()
  return (
    <li class={'wk' + (current ? ' cur' : '') + (s.scarico ? ' down' : '')} id={current ? 'now' : undefined}>
      <button class="wk-head" onClick={toggle} aria-expanded={open}>
        <span class="wk-n">{s.maintenance ? 'M' : s.week}</span>
        <span class="wk-t"><b>{fmtDate(s.monday, { day: 'numeric', month: 'short' })}</b><small>{s.scarico ? 'Scarico' : s.occurrence ? 'Ripetuta' : s.skippable ? 'Saltabile' : s.total ? 'Carico' : 'Cammino-corsa'}</small></span>
        <span class="wk-km">{s.total ? `${Math.round(s.total)} km` : ''}</span>
        <span class={'wk-dots' + (past && doneN < ses.length ? ' miss' : '')}>{doneN}/{ses.length}</span>
      </button>
      {open && <div class="wk-body">
        <p class="strength">Forza lunedì e giovedì: {STRENGTH[String(s.phase)]}</p>
        {s.sessions.map(x => {
          const date = sessionDate(s, x.day), key = sessionKey(s, x.day), a = d.activities.find(z => z.sessionKey === key)
          return <div class="ses" key={x.day}>
            <div class="ses-h"><b>{WEEKDAY[x.day]} {fmtDate(date, { day: 'numeric' })}</b>{a ? <a href={`#/registra?id=${a.id}`}>Fatto, modifica</a> : x.km !== 0 && <a href={`#/registra?key=${key}&date=${date}`}>Registra</a>}</div>
            <p>{x.text}</p>
            <Gauge fiato={x.fiato} fatica={x.fatica} />
          </div>
        })}
        {!s.maintenance && n <= 34 && <div class="row">
          <button class="btn ghost" onClick={() => saveState({ ...d.state, repeats: [...d.state.repeats, n] })}>Ripeti questa settimana</button>
          {canSkip && <button class="btn ghost" onClick={() => saveState({ ...d.state, skips: [...d.state.skips, n] })}>Salta</button>}
        </div>}
      </div>}
    </li>
  )
}
export function PlanView() {
  const d = data.value!, t = buildTimeline(d.plan, d.state), today = todayISO()
  const cur = slotForDate(t, today) ?? t.slots[0]
  const [open, setOpen] = useState<string | null>(cur.key)
  const did = useRef(false)
  useEffect(() => { if (!did.current) { did.current = true; document.getElementById('now')?.scrollIntoView({ block: 'center' }) } }, [])
  const limit = d.state.raceDate ? t.slots.length : t.slots.findIndex(s => s.maintenance) + 4
  const shown = t.slots.slice(0, limit)
  const groups: { name: string; slots: Slot[] }[] = []
  for (const s of shown) {
    const name = phaseName(d.plan, s.phase), g = groups.at(-1)
    if (g?.name === name) g.slots.push(s); else groups.push({ name, slots: [s] })
  }
  const skipped = d.state.skips.length, reps = d.state.repeats.length
  return (
    <div class="stack">
      <section class="head">
        <h1>Il piano</h1>
        <p>{d.state.raceDate ? <>Gara il {fmtDate(d.state.raceDate, { day: 'numeric', month: 'long', year: 'numeric' })}{d.state.raceName ? `, ${d.state.raceName}` : ''}.</> : <>Maratona possibile dal {fmtDate(t.earliestRace, { day: 'numeric', month: 'long', year: 'numeric' })}. <a href="#/impostazioni">Scegli la gara</a></>}</p>
        {(skipped > 0 || reps > 0) && <p class="sub">{skipped} {skipped === 1 ? 'settimana saltata' : 'settimane saltate'}, {reps} {reps === 1 ? 'ripetuta' : 'ripetute'}. <button class="link" onClick={() => saveState({ ...d.state, skips: [], repeats: [] })}>Annulla tutto</button></p>}
      </section>
      {t.raceTooClose && <div class="note stop"><strong>Gara troppo vicina.</strong> Il blocco maratona dura 16 settimane: la data più vicina è {fmtDate(t.earliestRace, { day: 'numeric', month: 'long', year: 'numeric' })}.</div>}
      {groups.map(g => <section key={g.name + g.slots[0].key}>
        <h2 class="phase">{g.name}</h2>
        <ul class="weeks">{g.slots.map(s => <WeekRow key={s.key} s={s} current={s === cur} open={open === s.key} toggle={() => setOpen(open === s.key ? null : s.key)} />)}</ul>
      </section>)}
      {!d.state.raceDate && <p class="sub pad">Il blocco maratona di 16 settimane si aggiunge quando scegli una gara.</p>}
    </div>
  )
}
