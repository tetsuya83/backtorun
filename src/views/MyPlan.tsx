import { useMemo, useState } from 'preact/hooks'
import { data, restartPlan, saveCustomPlan, saveState, startCustomPlan, uid, switchPlan } from '../api'
import { addDays, DAYS, mondayOf, mustChoose, planError, type Day, type Plan, type Session, type Week } from '../../shared/engine'
import { blankPlan, generatePlan, MAX_KM, MIN_KM, RACES, type GoalInput, type RaceType } from '../../shared/generator'
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
          <a class="btn ghost" href="#/mio-piano/modifica">Modifica</a>
        </div>
      </section>}
      <section class={'panel choice' + (mode === 'base' && !first ? ' go' : '')}>
        {mode === 'base' && !first && <p class="eyebrow">In uso</p>}
        <h2>Maratona graduale</h2>
        <p>Un percorso già pronto: 50 settimane dal cammino-corsa alla maratona. Con il test della Scala trovi la settimana da cui iniziare.</p>
        {(mode !== 'base' || first) && <button class="btn ghost" type="button" onClick={() => pick('base')}>Scegli questo percorso</button>}
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

type Path = 'zero' | 'ritorno' | 'corro' | 'migliora'
const PATHS: { id: Path; label: string; hint: string; set: Partial<GoalInput> }[] = [
  { id: 'zero', label: 'Inizio da zero', hint: 'Non corro, o ho appena cominciato', set: { weeklyKm: 0, longestKm: 0, ambition: 'finire' } },
  { id: 'ritorno', label: 'Riprendo dopo uno stop', hint: 'Ho già corso, ma mi sono fermato', set: { weeklyKm: 0, longestKm: 1, ambition: 'finire' } },
  { id: 'corro', label: 'Corro già', hint: 'Esco con regolarità e voglio un obiettivo', set: { weeklyKm: 15, longestKm: 8, ambition: 'finire' } },
  { id: 'migliora', label: 'Voglio migliorare', hint: 'Corro da tempo e cerco un tempo migliore', set: { weeklyKm: 25, longestKm: 12, ambition: 'migliorare' } },
]

/** Procedura guidata: percorso, obiettivo, situazione attuale, settimana, anteprima. */
export function NewPlan() {
  const [step, setStep] = useState(0), [path, setPath] = useState<Path | null>(null), [id] = useState(() => uid().slice(0, 8))
  const [g, setG] = useState<GoalInput>({ id, race: '10k', km: 10, raceName: '', raceDate: null, ambition: 'finire', weeklyKm: 0, longestKm: 0, days: ['mar', 'gio', 'dom'], longDay: 'dom', strengthDays: [], startDate: nextMon() })
  const up = (p: Partial<GoalInput>) => setG(x => ({ ...x, ...p }))
  const free = g.race === 'trail' || g.race === 'altro'
  const kmOk = g.km >= MIN_KM && g.km <= MAX_KM
  const dateOk = !g.raceDate || g.raceDate > g.startDate
  const res = useMemo(() => kmOk && g.days.length >= 3 ? generatePlan(g) : null, [g])
  const days = DAYS.filter(d => g.days.includes(d))
  const setDays = (l: Day[]) => up({ days: l, longDay: l.includes(g.longDay) ? g.longDay : (l.at(-1) ?? 'dom'), strengthDays: g.strengthDays.filter(x => !l.includes(x)) })
  const steps = ['Da dove parti?', 'Il tuo obiettivo', 'Come stai oggi', 'La tua settimana', 'Il piano']
  const can = [!!path, kmOk && dateOk, true, days.length >= 3, !!res && !res.blocked][step], fit = g.race === 'forma', runner = path === 'corro' || path === 'migliora'
  const create = () => { if (!res) return; startCustomPlan(res.plan, { startDate: res.startDate, raceDate: g.raceDate || null, raceName: g.raceName || null }); nav('piano') }
  const phases = res ? res.plan.weeks.reduce<{ name: string; n: number; km: number }[]>((a, w) => {
    const name = res.plan.meta.phases[String(w.phase)], l = a.at(-1)
    if (l?.name === name) { l.n++; l.km = Math.max(l.km, w.total ?? 0) } else a.push({ name, n: 1, km: w.total ?? 0 })
    return a
  }, []) : []
  return (
    <form class="stack form" onSubmit={e => e.preventDefault()}>
      <section class="head"><p class="eyebrow">Passo {step + 1} di 5</p><h1>{steps[step]}</h1></section>
      {step === 0 && <><ul class="cards">{PATHS.map(x => <li key={x.id}><button type="button" class={path === x.id ? 'on' : ''} aria-pressed={path === x.id} onClick={() => { setPath(x.id); up(x.set) }}><span><b>{x.label}</b><small>{x.hint}</small></span></button></li>)}</ul>
        {path === 'ritorno' && <Note>Se ti sei fermato per un infortunio, senti il medico prima di ripartire.</Note>}</>}
      {step === 1 && <>
        <fieldset class="scale"><legend>Cosa vuoi raggiungere?</legend><div class="seg race">{RACES.map(r => <button type="button" key={r.id} class={g.race === r.id ? 'sel' : ''} aria-pressed={g.race === r.id} onClick={() => up({ race: r.id as RaceType, km: r.km ?? (free ? g.km : 15) })}>{r.label}</button>)}</div></fieldset>
        {free && <Field label={`Distanza in km, da ${MIN_KM} a ${MAX_KM}`}><input inputMode="decimal" value={g.km || ''} onInput={e => up({ km: num(e.currentTarget.value) })} /></Field>}
        {free && g.km > 0 && !kmOk && <p class="err">Per una distanza così usa la tabella da compilare a mano.</p>}
        {g.race === 'trail' && <p class="sub pad">Conta i km della gara: per il dislivello il piano aggiunge salite e lunghi su sterrato.</p>}
        {!fit && <Field label="Data della gara, se ce l'hai"><input type="date" value={g.raceDate ?? ''} onChange={e => up({ raceDate: e.currentTarget.value || null })} /></Field>}
        {!dateOk && <p class="err">La gara deve essere dopo l'inizio del piano.</p>}
        {!fit && <Field label="Nome della gara, facoltativo"><input value={g.raceName ?? ''} onInput={e => up({ raceName: e.currentTarget.value })} maxLength={50} /></Field>}
        {fit && <p class="sub pad">Niente gara: il percorso ti porta a correre 10 km con continuità.</p>}
      </>}
      {step === 2 && <>
        {runner && <p class="sub pad">Scrivi i numeri reali: partire più piano costa poche settimane, partire troppo forte può fermarti per mesi.</p>}
        {runner && <Field label="Quanti km corri a settimana adesso?"><input inputMode="decimal" value={g.weeklyKm || ''} placeholder="0" onInput={e => up({ weeklyKm: num(e.currentTarget.value) })} /></Field>}
        {runner && <Field label="La corsa più lunga dell'ultimo mese, in km"><input inputMode="decimal" value={g.longestKm || ''} placeholder="0" onInput={e => up({ longestKm: num(e.currentTarget.value) })} /></Field>}
        {g.longestKm < 3 && <Note>Il piano partirà dal cammino-corsa.</Note>}
        <Field label="Quando vuoi iniziare?"><input type="date" value={g.startDate} min={todayISO()} onChange={e => up({ startDate: e.currentTarget.value || nextMon() })} /></Field>
      </>}
      {step === 3 && <>
        <DayPicker label="Giorni di corsa, almeno 3" value={g.days} onChange={l => { if (l.length <= 5) setDays(l) }} />
        {days.length >= 3 && <fieldset class="scale"><legend>Giorno del lungo</legend><div class="seg">{days.map(d => <button type="button" key={d} class={g.longDay === d ? 'sel' : ''} onClick={() => up({ longDay: d })}>{WEEKDAY[d].slice(0, 3)}</button>)}</div></fieldset>}
        <DayPicker label="Forza, facoltativa" value={g.strengthDays} disabled={g.days} onChange={l => up({ strengthDays: l.slice(-2) })} />
        <p class="sub pad">Due sedute di forza a settimana proteggono da molti infortuni della corsa.</p>
        {days.length < 3 && <p class="err">Scegli almeno 3 giorni.</p>}
      </>}
      {step === 4 && res && <>
        <div class="stats"><div><b>{res.weeks}</b><span>settimane</span></div><div><b>{res.reachedLong}</b><span>km di lungo</span></div><div><b>{Math.round(res.peakWeek)}</b><span>km a settimana, al massimo</span></div></div>
        <p class="pad">Inizi il {longDate(res.startDate)}{g.raceDate ? `, gara il ${longDate(g.raceDate)}` : ''}.</p>
        {res.warnings.map(w => <Note key={w} tone={res.blocked ? 'stop' : undefined}>{w}</Note>)}
        {res.blocked && res.earliestRace && <Note>Una gara dal {longDate(res.earliestRace)} in poi ti lascia il tempo giusto. Puoi scegliere un'altra data o una distanza più corta.</Note>}
        <ul class="hist people">{phases.map(p => <li key={p.name}><div><b>{p.name}</b><span>{p.n} {p.n === 1 ? 'settimana' : 'settimane'}{p.km ? `, fino a ${Math.round(p.km)} km` : ''}</span></div></li>)}</ul>
        <p class="sub pad">Le progressioni sono stime da allenatore e non sostituiscono il parere del medico. Dopo la creazione puoi modificare ogni seduta.</p>
      </>}
      <div class="row">
        {step > 0 ? <button type="button" class="btn ghost" onClick={() => { setStep(step - 1); scrollTo(0, 0) }}>Indietro</button> : <a class="btn ghost" href="#/mio-piano">Annulla</a>}
        {step < 4 ? <button type="button" class="btn" disabled={!can} onClick={() => { setStep(step + 1); scrollTo(0, 0) }}>Avanti</button> : <button type="button" class="btn" disabled={!can} onClick={create}>Attiva il piano</button>}
      </div>
    </form>
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
    const next = saveCustomPlan(p)
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
