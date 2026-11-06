import { useMemo, useState } from 'preact/hooks'
import { data, restartPlan, saveCustomPlan, saveState, startCustomPlan, uid, switchPlan } from '../api'
import { addDays, DAYS, mondayOf, mustChoose, planError, type Day, type Plan, type Session, type Week } from '../../shared/engine'
import { blankPlan } from '../../shared/generator'
import { fmtDate, todayISO, WEEKDAY } from '../guide'
import { BlockList, Field, nav, Note } from '../ui'
import { blocksOf } from '../../shared/blocks'
import { Builder } from './Builder'

const SHORT: Record<Day, string> = { lun: 'L', mar: 'M', mer: 'M', gio: 'G', ven: 'V', sab: 'S', dom: 'D' }
const num = (v: string) => v === '' ? 0 : +v.replace(',', '.') || 0
const longDate = (s: string) => fmtDate(s, { day: 'numeric', month: 'long', year: 'numeric' })
const nextMon = () => addDays(mondayOf(todayISO()), 7)

export function DayPicker({ label, value, onChange, disabled = [] }: { label: string; value: Day[]; onChange: (d: Day[]) => void; disabled?: Day[] }) {
  return <fieldset class="scale"><legend>{label}</legend><div class="days">
    {DAYS.map(d => <button type="button" key={d} disabled={disabled.includes(d)} class={value.includes(d) ? 'sel' : ''} aria-pressed={value.includes(d)} aria-label={WEEKDAY[d]} onClick={() => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d])}>{SHORT[d]}</button>)}
  </div></fieldset>
}

export function RestartButton() {
  return <button type="button" class="btn ghost danger" onClick={() => { if (confirm('Vuoi fermare il piano e ricominciare da una nuova scelta? Il calendario riparte da zero. Allenamenti registrati e salvati restano.')) { restartPlan(); nav('mio-piano') } }}>Ferma il piano e ricomincia</button>
}
/** Il percorso: si sceglie al primo accesso e si può cambiare quando si vuole. */
export function MyPlan() {
  const d = data.value!, mode = d.state.mode === 'custom' && d.custom ? 'custom' : 'base', first = mustChoose(d)
  const pick = (m: 'base' | 'custom') => { switchPlan(m); nav('home') }
  const replace = (e: Event) => { if (d.custom && !confirm('Il nuovo piano sostituirà quello attuale. Gli allenamenti registrati restano.')) e.preventDefault() }
  return (
    <div class="stack">
      <section class="head"><h1>{first ? 'Scegli il tuo percorso' : 'Il tuo percorso'}</h1><p>{d.state.restart ? 'Scegli come ripartire. Gli allenamenti già registrati restano.' : first ? 'Dicci da dove parti e dove vuoi arrivare: il piano si costruisce su di te.' : 'Puoi cambiare quando vuoi: gli allenamenti registrati restano.'}</p></section>
      <section class="panel choice">
        <h2>Crea il tuo percorso</h2>
        <p>Scegli da dove parti e il tuo obiettivo, dal 5 km alla maratona, oppure semplicemente stare in forma.</p>
        <a class="btn" href="#/mio-piano/nuovo" onClick={replace}>Inizia</a>
      </section>
      {d.custom && <section class={'panel choice' + (mode === 'custom' && !first ? ' go' : '')}>
        <p class="eyebrow">{mode === 'custom' && !first ? 'In uso' : 'Salvato'}</p>
        <h2>{d.custom.meta.name}</h2>
        <p>{d.custom.weeks.length} settimane{mode === 'custom' && d.state.raceDate ? `, gara il ${longDate(d.state.raceDate)}` : ''}.</p>
        <div class="row">
          {(mode !== 'custom' || first) && <button class="btn" type="button" onClick={() => pick('custom')}>Usa questo piano</button>}
          {d.custom.meta.goal && <a class="btn ghost" href="#/mio-piano/impostazioni">Impostazioni</a>}
          <a class="btn ghost" href="#/mio-piano/modifica">Modifica le sedute</a>
        </div>
      </section>}
      <section class={'panel choice' + (mode === 'base' && !first ? ' go' : '')}>
        {mode === 'base' && !first && <p class="eyebrow">In uso</p>}
        <h2>Maratona graduale</h2>
        <p>Un percorso già pronto: 50 settimane dal cammino-corsa alla maratona. Con il test della Scala trovi la settimana da cui iniziare.</p>
        <div class="row">
          {(mode !== 'base' || first) && <button class="btn ghost" type="button" onClick={() => pick('base')}>Scegli questo percorso</button>}
          <a class="btn ghost" href="#/mio-piano/giorni">{d.state.baseDays || d.state.other?.baseDays ? 'Cambia i giorni' : 'Scegli i tuoi giorni'}</a>
        </div>
      </section>
      <section class="panel choice">
        <h2>Scrivi la tua tabella</h2>
        <p>Hai già una tabella tua o del tuo allenatore? Inseriscila settimana per settimana.</p>
        <a class="btn ghost" href="#/mio-piano/tabella" onClick={replace}>Parti da una tabella vuota</a>
      </section>
      {!first && <RestartButton />}
    </div>
  )
}

/** Tabella da zero: nome, durata, inizio. */
export function BlankPlan() {
  const [name, setName] = useState('La mia tabella'), [n, setN] = useState(12), [start, setStart] = useState(nextMon())
  const create = () => {
    startCustomPlan(blankPlan(uid().slice(0, 8), name.trim() || 'La mia tabella', Math.min(80, Math.max(1, n))), { startDate: start, raceDate: null, raceName: null })
    nav('mio-piano/modifica')
  }
  return (
    <div class="stack form">
      <section class="head"><h1>La tua tabella</h1><p>Crei le settimane vuote, poi compili la prima e la duplichi.</p></section>
      <Field label="Nome"><input value={name} maxLength={50} onInput={e => setName(e.currentTarget.value)} /></Field>
      <Field label="Settimane"><input inputMode="numeric" value={n || ''} onInput={e => setN(num(e.currentTarget.value))} /></Field>
      <Field label="Inizio"><input type="date" value={start} onChange={e => setStart(e.currentTarget.value || nextMon())} /></Field>
      <div class="row"><a class="btn ghost" href="#/mio-piano">Annulla</a><button type="button" class="btn" disabled={n < 1} onClick={create}>Crea la tabella</button></div>
    </div>
  )
}

const BREATHS = ['Mai fiatone', 'Frasi complete', 'Frasi brevi, niente fiatone', 'Fiatone ok nei tratti, calmo nei recuperi', 'Fiato al limite']
function SessionEdit({ s, taken, up, remove, wizard }: { s: Session; taken: Day[]; up: (p: Partial<Session>) => void; remove: () => void; wizard: () => void }) {
  const b = blocksOf(s), [manual, setManual] = useState(false)
  return <div class="ses edit">
    <div class="grid2">
      <Field label="Giorno"><select value={s.day} onChange={e => up({ day: e.currentTarget.value as Day })}>{DAYS.filter(d => d === s.day || !taken.includes(d)).map(d => <option key={d} value={d}>{WEEKDAY[d]}</option>)}</select></Field>
      <Field label="Km"><input inputMode="decimal" value={s.km ?? ''} onInput={e => { const v = e.currentTarget.value; up({ km: v === '' ? null : num(v) }) }} /></Field>
    </div>
    {b ? <BlockList blocks={b} /> : s.text ? <p class="sub">{s.text}</p> : <p class="sub">Seduta da costruire.</p>}
    <button type="button" class="btn ghost" onClick={wizard}>{b ? 'Modifica i blocchi' : 'Costruisci la seduta'}</button>
    <button type="button" class="link" aria-expanded={manual} onClick={() => setManual(!manual)}>{manual ? 'Chiudi' : 'Scrivila a mano'}</button>
    {manual && <>
    <Field label="Cosa prevede"><input value={s.text} placeholder="Facile 6 km" onInput={e => up({ text: e.currentTarget.value, blocks: null })} /></Field>
    <div class="grid2">
      <Field label="Fiato atteso"><select value={s.fiato ?? ''} onChange={e => up({ fiato: e.currentTarget.value || null })}><option value="">Non indicato</option>{[...new Set([...BREATHS, ...(s.fiato ? [s.fiato] : [])])].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
      <Field label="Fatica attesa"><input value={s.fatica ?? ''} placeholder="3-4" onInput={e => up({ fatica: e.currentTarget.value || null })} /></Field>
    </div></>}
    <button type="button" class="link danger" onClick={remove}>Togli questa seduta</button>
  </div>
}

/** Modifica settimane e sedute; il calendario segue al salvataggio. */
export function EditPlan() {
  const d = data.value!
  const [p, setP] = useState<Plan | null>(d.custom ?? null)
  const [open, setOpen] = useState<number | null>(0), [err, setErr] = useState(''), [saved, setSaved] = useState(false), [wiz, setWiz] = useState<{ i: number; j: number } | null>(null)
  if (!p) return <div class="stack"><section class="head"><h1>Nessun piano personale</h1><a class="btn" href="#/mio-piano">Crea il tuo piano</a></section></div>
  const weeks = (fn: (w: Week[]) => Week[]) => { setP({ ...p, weeks: fn(p.weeks) }); setSaved(false); setErr('') }
  const week = (i: number, u: Partial<Week>) => weeks(l => l.map((w, j) => j === i ? { ...w, ...u } : w))
  const fresh = (w?: Week): Week => ({ week: 0, phase: w?.phase ?? 1, scarico: false, skippable: false, total: null, sessions: (w?.sessions ?? []).map(s => { const { race, ...x } = s; return x }), uid: `${p.meta.id}-${uid().slice(0, 6)}` })
  const addSession = (i: number) => {
    const w = p.weeks[i], day = DAYS.find(x => !w.sessions.some(s => s.day === x))
    if (day) week(i, { sessions: [...w.sessions, { day, text: '', km: null, fiato: null, fatica: null }] })
  }
  if (wiz) {
    const w = p.weeks[wiz.i], x = w.sessions[wiz.j]
    return <Builder initial={x.text ? blocksOf(x) : null} fiato={x.fiato} fatica={x.fatica} onCancel={() => setWiz(null)} onDone={r => { week(wiz.i, { sessions: w.sessions.map((y, k) => k === wiz.j ? { ...y, blocks: r.blocks, text: r.text, km: r.km ?? y.km, fiato: r.fiato || null, fatica: r.fatica || null } : y) }); setWiz(null) }} />
  }
  const save = () => {
    const e = planError(p); if (e) { setErr(e); return }
    const st = d.state, was = (d.custom?.weeks ?? []).map(w => w.uid)
    // le settimane cambiate a mano si possono tenere quando il piano si ricalcola
    const before = new Map((d.custom?.weeks ?? []).map(w => [w.uid, JSON.stringify([w.sessions, w.scarico])]))
    const next = saveCustomPlan({ ...p, weeks: p.weeks.map(w => w.edited || before.get(w.uid) === JSON.stringify([w.sessions, w.scarico]) ? w : { ...w, edited: true }) })
    // le ripetizioni seguono la settimana anche se la numerazione cambia
    const repeats = st.repeats.map(n => next.weeks.find(w => w.uid === was[n - 1])?.week as number | undefined).filter((x): x is number => x != null)
    if (st.mode === 'custom' && repeats.join() !== st.repeats.join()) saveState({ ...st, repeats })
    setP(next); setSaved(true)
  }
  return (
    <div class="stack form">
      <section class="head"><h1>Modifica il piano</h1></section>
      <Field label="Nome del piano"><input value={p.meta.name ?? ''} maxLength={50} onInput={e => { setP({ ...p, meta: { ...p.meta, name: e.currentTarget.value } }); setSaved(false) }} /></Field>
      <DayPicker label="Giorni di forza" value={p.meta.strengthDays ?? []} onChange={l => { setP({ ...p, meta: { ...p.meta, strengthDays: l.slice(-3) } }); setSaved(false) }} />
      <ul class="weeks">{p.weeks.map((w, i) => <li class="wk" key={w.uid}>
        <button type="button" class="wk-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
          <span class="wk-n">{i + 1}</span>
          <span class="wk-t"><b>{w.sessions.length ? `${w.sessions.length} ${w.sessions.length === 1 ? 'seduta' : 'sedute'}` : 'Da compilare'}</b><small>{w.sessions.map(s => WEEKDAY[s.day].slice(0, 3)).join(' ')}</small></span>
          <span class="wk-km">{w.sessions.some(s => s.km) ? `${Math.round(w.sessions.reduce((a, s) => a + (s.km ?? 0), 0))} km` : ''}</span><span />
        </button>
        {open === i && <div class="wk-body">
          {w.sessions.map((s, j) => <SessionEdit key={j} s={s} taken={w.sessions.map(x => x.day)}
            up={u => week(i, { sessions: w.sessions.map((x, k) => k === j ? { ...x, ...u } : x) })}
            remove={() => week(i, { sessions: w.sessions.filter((_, k) => k !== j) })} wizard={() => setWiz({ i, j })} />)}
          {w.sessions.length < 7 && <button type="button" class="btn ghost" onClick={() => addSession(i)}>Aggiungi seduta</button>}
          <label class="check"><input type="checkbox" checked={w.scarico} onChange={e => week(i, { scarico: e.currentTarget.checked })} /> Settimana di scarico</label>
          <div class="row">
            <button type="button" class="btn ghost" onClick={() => { weeks(l => [...l.slice(0, i + 1), fresh(w), ...l.slice(i + 1)]); setOpen(i + 1) }}>Duplica</button>
            {i + 1 < p.weeks.length && w.sessions.length > 0 && <button type="button" class="btn ghost" onClick={() => weeks(l => l.map((x, j) => j > i && !x.sessions.length ? { ...fresh(w), uid: x.uid, phase: x.phase } : x))}>Copia nelle vuote</button>}
            {p.weeks.length > 1 && <button type="button" class="btn ghost danger" onClick={() => { if (confirm(`Togliere la settimana ${i + 1}?`)) { weeks(l => l.filter((_, j) => j !== i)); setOpen(null) } }}>Togli</button>}
          </div>
        </div>}
      </li>)}</ul>
      <button type="button" class="btn ghost" onClick={() => { weeks(l => [...l, fresh()]); setOpen(p.weeks.length) }}>Aggiungi settimana</button>
      {err && <p class="err" role="alert">{err}</p>}
      {saved && <Note tone="go">Piano salvato.</Note>}
      <div class="row savebar"><a class="btn ghost" href="#/mio-piano">Chiudi</a><button type="button" class="btn" onClick={save}>Salva</button></div>
    </div>
  )
}
