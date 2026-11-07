import { useEffect, useRef, useState } from 'preact/hooks'
import { data, saveState } from '../api'
import { addDays, buildTimeline, isCustom, planFor, sessionDate, sessionKey, slotForDate, strengthDays, type Slot } from '../../shared/engine'
import { dayList, fmtDate, STRENGTH, todayISO, WEEKDAY } from '../guide'
import { phaseName, weekLabel } from './Home'
import { BlockList, Gauge } from '../ui'
import { blocksOf } from '../../shared/blocks'
import { learnFor } from '../learn'
import { PlannedRow, SaveSession } from './Workouts'
import { testInfo } from '../../shared/tests'

function WeekRow({ s, open, toggle, current }: { s: Slot; open: boolean; toggle: () => void; current: boolean }) {
  const d = data.value!, plan = planFor(d), custom = isCustom(plan), force = strengthDays(plan)
  const n = typeof s.week === 'number' ? s.week : 0
  const ses = s.sessions.filter(x => x.km !== 0)
  const doneN = ses.filter(x => d.activities.some(a => a.sessionKey === sessionKey(s, x.day))).length
  const canSkip = s.skippable && !d.state.skips.includes(n)
  const past = addDays(s.monday, 7) <= todayISO()
  // fiato e fatica uguali in tutte le sedute: si scrivono una volta sola
  const same = ses.length > 1 && ses.every(x => x.fiato === ses[0].fiato && x.fatica === ses[0].fatica) && (ses[0].fiato || ses[0].fatica) ? ses[0] : null
  return (
    <li class={'wk' + (current ? ' cur' : '') + (s.scarico ? ' down' : '')} id={current ? 'now' : undefined}>
      <button class="wk-head" onClick={toggle} aria-expanded={open}>
        <span class="wk-n">{s.maintenance ? 'M' : s.week}</span>
        <span class="wk-t"><b>{fmtDate(s.monday, { day: 'numeric', month: 'short' })}</b><small>{s.scarico ? 'Scarico' : s.occurrence ? 'Ripetuta' : s.skippable ? 'Saltabile' : s.total ? 'Carico' : 'Cammino-corsa'}</small></span>
        <span class="wk-km">{s.total ? `${Math.round(s.total)} km` : ''}</span>
        {ses.length > 0 && (past && doneN >= ses.length ? <span class="wk-dots ok">Fatta</span> : past || current ? <span class={'wk-dots' + (past ? ' miss' : '')}>{doneN} di {ses.length}</span> : <span class="wk-dots" />)}
      </button>
      {open && <div class="wk-body">
        {force.length > 0 && <p class="strength">Forza {dayList(force)}: {STRENGTH[String(s.phase)] ?? STRENGTH['1']}</p>}
        {!s.sessions.length && <p class="sub">Settimana da compilare. <a href="#/mio-piano/modifica">Modifica il piano</a></p>}
        {same && <p class="sub">Tutte così: {[same.fiato?.toLowerCase(), same.fatica ? `fatica ${same.fatica}` : null].filter(Boolean).join(', ')}</p>}
        {s.sessions.map(x => {
          const date = sessionDate(s, x.day), key = sessionKey(s, x.day), a = d.activities.find(z => z.sessionKey === key), b = blocksOf(x), art = learnFor(x.text)
          return <div class="ses" key={x.day}>
            <div class="ses-h"><b>{WEEKDAY[x.day]} {fmtDate(date, { day: 'numeric' })}</b>{a ? <a href={`#/registra?id=${a.id}`}>Fatto, modifica</a> : x.km !== 0 && <a href={`#/registra?key=${key}&date=${date}`}>Registra</a>}</div>
            <p>{x.text}</p>{x.replaced && <p class="sub">Scelta da te al posto della seduta del piano</p>}
            {b && b.length > 1 && x.km !== 0 && <BlockList blocks={b} compact />}
            {!same && <Gauge fiato={x.fiato} fatica={x.fatica} />}
            <div class="b-act">{b && x.km !== 0 && !a && <a class="chip-a" href={`#/guida?key=${key}&date=${date}`}>Avvia guidato</a>}{art && <a href={`#/impara/${art.id}`}>Cos'è</a>}{b && x.km !== 0 && <SaveSession s={x} link />}</div>
          </div>
        })}
        {(d.state.planned ?? []).filter(p => p.mode === 'add' && p.date >= s.monday && p.date < addDays(s.monday, 7)).map(p => <PlannedRow key={p.id} p={p} />)}
        {!s.maintenance && (custom || n <= 34) && <div class="row">
          <button class="btn ghost" onClick={() => saveState({ ...d.state, repeats: [...d.state.repeats, n] })}>Ripeti questa settimana</button>
          {canSkip && <button class="btn ghost" onClick={() => saveState({ ...d.state, skips: [...d.state.skips, n] })}>Salta</button>}
        </div>}
      </div>}
    </li>
  )
}
export function PlanView() {
  const d = data.value!, plan = planFor(d), custom = isCustom(plan), t = buildTimeline(plan, d.state), today = todayISO()
  const cur = slotForDate(t, today) ?? t.slots[0]
  const [open, setOpen] = useState<string | null>(cur.key)
  const did = useRef(false)
  useEffect(() => { if (!did.current) { did.current = true; document.getElementById('now')?.scrollIntoView({ block: 'center' }) } }, [])
  const limit = d.state.raceDate || custom ? t.slots.length : t.slots.findIndex(s => s.maintenance) + 4
  const shown = t.slots.slice(0, limit)
  const groups: { name: string; slots: Slot[] }[] = []
  for (const s of shown) {
    const name = phaseName(plan, s.phase), g = groups.at(-1)
    if (g?.name === name) g.slots.push(s); else groups.push({ name, slots: [s] })
  }
  const lastTest = [...d.tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const skipped = d.state.skips.length, reps = d.state.repeats.length, idx = slotForDate(t, today) ? t.slots.indexOf(cur) : -1
  return (
    <div class="stack">
      <div class="head-row"><h1>Piano</h1><a class="btn small ghost" href="#/mio-piano">Il tuo percorso</a></div>
      <section class="panel goal">
        <div class="goal-h"><h2>{custom ? plan.meta.name : 'Maratona graduale'}</h2>{idx >= 0 && <span>sett. {idx + 1} di {shown.length}</span>}</div>
        <div class="bar" aria-hidden="true"><i style={{ width: `${Math.max(2, (idx + 1) / shown.length * 100)}%` }} /></div>
        <a class="card-l in" href="#/gara"><span><b>{d.state.raceDate ? `Gara il ${fmtDate(d.state.raceDate, { day: 'numeric', month: 'long', year: 'numeric' })}${d.state.raceName ? `, ${d.state.raceName}` : ''}` : 'Gara: scegli la data'}</b><small>{d.state.raceDate ? 'Gara e calendario' : custom ? `Fine del piano il ${fmtDate(t.earliestRace, { day: 'numeric', month: 'long', year: 'numeric' })}` : `Maratona possibile dal ${fmtDate(t.earliestRace, { day: 'numeric', month: 'long', year: 'numeric' })}`}</small></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></a>
        <a class="card-l in" href="#/test"><span><b>Test e condizione</b><small>{lastTest ? `Ultimo: ${testInfo(lastTest.kind)?.name ?? lastTest.kind}, ${fmtDate(lastTest.date, { day: 'numeric', month: 'short' })}` : 'Scala, Cooper, 5 km e cammino'}</small></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></a>
        {(skipped > 0 || reps > 0) && <p class="sub">{skipped} {skipped === 1 ? 'settimana saltata' : 'settimane saltate'}, {reps} {reps === 1 ? 'ripetuta' : 'ripetute'}. <button class="link" onClick={() => saveState({ ...d.state, skips: [], repeats: [] })}>Annulla tutto</button></p>}
      </section>
      {groups.length > 1 && <nav class="phases" aria-label="Fasi">{groups.map((g, i) => <button type="button" key={i} class={g.slots.includes(cur) ? 'sel' : ''} onClick={() => document.getElementById('fase-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{g.name}</button>)}</nav>}
      {t.raceTooClose && <div class="note stop"><strong>{custom ? 'Il piano finisce dopo la gara.' : 'Gara troppo vicina.'}</strong> {custom ? 'Annulla una ripetizione, oppure togli una settimana dal piano.' : 'Il blocco maratona dura 16 settimane: la data più vicina è '}{!custom && fmtDate(t.earliestRace, { day: 'numeric', month: 'long', year: 'numeric' })}{!custom && '.'}</div>}
      {groups.map((g, i) => <section key={g.name + g.slots[0].key} id={'fase-' + i} class="fase">
        <h2 class="phase">{g.name}</h2>
        <ul class="weeks">{g.slots.map(s => <WeekRow key={s.key} s={s} current={s === cur} open={open === s.key} toggle={() => setOpen(open === s.key ? null : s.key)} />)}</ul>
      </section>)}
      {!d.state.raceDate && !custom && <p class="sub pad">Il blocco maratona di 16 settimane si aggiunge quando scegli una gara.</p>}
    </div>
  )
}
