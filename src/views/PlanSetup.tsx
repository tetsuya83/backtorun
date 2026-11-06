import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { data, saveCustomPlan, saveState, startCustomPlan, uid } from '../api'
import { addDays, baseDaysOk, DAYS, mondayOf, type BaseDays, type Day, type Week } from '../../shared/engine'
import { DEFAULT_PACE, generatePlan, MAX_KM, MIN_KM, minSessions, RACES, regenerate, settings, suggestedSessions, type Generated, type GoalInput, type RaceType } from '../../shared/generator'
import { runHour, type WeatherPrefs } from '../../shared/weather'
import { prefsOf } from '../weather'
import { fmtDate, todayISO, WEEKDAY } from '../guide'
import { Field, nav, Note } from '../ui'
import { DayPicker } from './MyPlan'

const num = (v: string) => v === '' ? 0 : +v.replace(',', '.') || 0
const longDate = (s: string) => fmtDate(s, { day: 'numeric', month: 'long', year: 'numeric' })
const nextMon = () => addDays(mondayOf(todayISO()), 7)
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`
const short = (d: Day) => WEEKDAY[d].slice(0, 3)
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MAX_TIMES = [0, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 210, 240]
const showMin = (m: number) => !m ? 'Senza limite' : m < 60 ? `${m} minuti` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} ${m === 60 ? 'ora' : 'ore'}`
const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const PACES = Array.from({ length: 19 }, (_, i) => 300 + i * 15)

/** Un consiglio breve, con la lampadina. */
const Tip = ({ children }: { children: ComponentChildren }) => <p class="tip"><span aria-hidden="true">💡</span><span>{children}</span></p>

type Path = 'zero' | 'ritorno' | 'corro' | 'migliora'
const PATHS: { id: Path; label: string; hint: string; set: Partial<GoalInput> }[] = [
  { id: 'zero', label: 'Inizio da zero', hint: 'Non corro, o ho appena cominciato', set: { weeklyKm: 0, longestKm: 0, ambition: 'finire', easyPace: DEFAULT_PACE.zero } },
  { id: 'ritorno', label: 'Riprendo dopo uno stop', hint: 'Ho già corso, ma mi sono fermato', set: { weeklyKm: 0, longestKm: 1, ambition: 'finire', easyPace: DEFAULT_PACE.ritorno } },
  { id: 'corro', label: 'Corro già', hint: 'Esco con regolarità e voglio un obiettivo', set: { weeklyKm: 15, longestKm: 8, ambition: 'finire', easyPace: DEFAULT_PACE.corro } },
  { id: 'migliora', label: 'Voglio migliorare', hint: 'Corro da tempo e cerco un tempo migliore', set: { weeklyKm: 25, longestKm: 12, ambition: 'migliorare', easyPace: DEFAULT_PACE.migliora } },
]

/** Fonti mostrate a chi sceglie meno uscite del minimo. */
const SOURCES: [string, string][] = [
  ['Rasmussen e colleghi, Int J Sports Phys Ther, 2013', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3625790/'],
  ['Doherty e colleghi, J Sci Med Sport, 2020', 'https://pubmed.ncbi.nlm.nih.gov/31704026/'],
  ['Programma FIRST, Furman University', 'https://www.marathon-training-program.com/three-day-background'],
]

/** Quando puoi correre: ogni giorno con l'ora e il tempo che hai. */
export function WhenForm({ g, up }: { g: GoalInput; up: (p: Partial<GoalInput>) => void }) {
  const toggle = (d: Day) => {
    const days = g.days.includes(d) ? g.days.filter(x => x !== d) : [...g.days, d], sorted = DAYS.filter(x => days.includes(x))
    up({ days: sorted, longDay: sorted.includes(g.longDay) ? g.longDay : (sorted.includes('dom') ? 'dom' : sorted.at(-1) ?? 'dom'), qualityDay: g.qualityDay && sorted.includes(g.qualityDay) ? g.qualityDay : null })
  }
  const hour = (d: Day) => g.hours?.[d] ?? (d === 'dom' ? 8 : 6)
  return <>
    <ul class="dayrows">{DAYS.map(d => {
      const on = g.days.includes(d)
      return <li key={d} class={on ? 'on' : ''}>
        <label class="check"><input type="checkbox" checked={on} onChange={() => toggle(d)} /> <b>{WEEKDAY[d]}</b></label>
        {on && <div class="grid2">
          <Field label="Ora"><select value={hour(d)} onChange={e => up({ hours: { ...g.hours, [d]: +e.currentTarget.value } })}>{HOURS.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></Field>
          <Field label="Tempo che hai"><select value={g.maxMin?.[d] ?? 0} onChange={e => up({ maxMin: { ...g.maxMin, [d]: +e.currentTarget.value || undefined } })}>{MAX_TIMES.map(m => <option key={m} value={m}>{showMin(m)}</option>)}</select></Field>
        </div>}
      </li>
    })}</ul>
    {g.days.length < 2 && <p class="err">Scegli almeno due giorni.</p>}
    <Tip>Segna tutti i giorni in cui potresti uscire, anche quelli incerti: al passo dopo scegli quante volte correre davvero, e l'app distribuisce le uscite nei giorni migliori.</Tip>
    <Tip>Il tempo che hai serve solo nei giorni stretti: le sedute più lunghe vengono accorciate per starci. Il giorno del lungo lascialo il più libero possibile.</Tip>
  </>
}

/** Rischio: spiegazione con le fonti e conferma. */
function RiskBox({ g, up, res }: { g: GoalInput; up: (p: Partial<GoalInput>) => void; res: Generated | null }) {
  const n = settings(g).sessions, min = minSessions(g.km)
  return <Note tone="stop">
    <p><strong>Sotto il minimo consigliato.</strong> Per {g.km >= 40 ? 'una maratona' : 'questa distanza'} servono almeno {min} uscite a settimana: con {n} {n === 1 ? 'uscita' : 'uscite'} il lungo diventa quasi l'unico allenamento.</p>
    <ul class="why">
      <li>Su 662 maratoneti danesi, chi correva meno di 30 km a settimana si è infortunato circa il doppio di chi ne correva tra 30 e 60.</li>
      <li>Una meta-analisi di 85 studi lega più uscite e più km a settimana a tempi migliori in maratona.</li>
      <li>Il metodo FIRST arriva alla maratona con 3 uscite, ma con corridori esperti e due sedute di bici, nuoto o vogatore in più.</li>
    </ul>
    <p>Se scegli di andare avanti, tieni il lungo sempre facile, fermati al primo dolore che cambia il passo e usa i giorni liberi per nuoto, bici o forza.</p>
    <p class="src">Fonti: {SOURCES.map(([t, u], i) => <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noopener">{t}</a></span>)}</p>
    <label class="check"><input type="checkbox" checked={!!g.risk} onChange={e => up({ risk: e.currentTarget.checked })} /> Ho capito, procedo a mio rischio</label>
    {res && g.risk && res.reachedLong < res.targetLong && <p>Il lungo arriverà a {res.reachedLong} km.</p>}
  </Note>
}

/** La settimana: uscite, lungo, sedute impegnative e forza. */
export function WeekForm({ g, up, res }: { g: GoalInput; up: (p: Partial<GoalInput>) => void; res: Generated | null }) {
  const cfg = settings(g), days = cfg.days, min = minSessions(g.km), sug = suggestedSessions(g.km, g.ambition)
  const counts = Array.from({ length: Math.max(1, days.length) }, (_, i) => i + 1).filter(n => n >= 2 || days.length === 1)
  const maxQ = cfg.sessions >= 4 ? 2 : cfg.sessions >= 2 ? 1 : 0
  return <>
    <fieldset class="scale"><legend>Quante volte corri a settimana?</legend>
      <div class="seg num">{counts.map(n => <button type="button" key={n} class={cfg.sessions === n ? 'sel' : ''} aria-pressed={cfg.sessions === n} onClick={() => up({ sessions: n, risk: n >= min ? false : g.risk, quality: Math.min(g.quality ?? 1, n >= 4 ? 2 : 1) })}>
        {n}{n === Math.min(sug, days.length) && <small>consigliato</small>}</button>)}</div>
    </fieldset>
    {days.length < sug && <Tip>Per questa distanza molti allenatori consigliano {sug} uscite: se puoi, aggiungi un giorno al passo precedente.</Tip>}
    {cfg.sessions < min && <RiskBox g={g} up={up} res={res} />}
    {cfg.sessions >= min && cfg.sessions < sug && g.km >= 21 && <Note>Con {cfg.sessions} uscite la distanza è fattibile: il metodo FIRST, testato alla Furman University, ne usa 3, più due sedute di bici o nuoto. Il tuo nuoto e la palestra contano.</Note>}
    {cfg.sessions > 2 && <label class="check"><input type="checkbox" checked={cfg.gradual} onChange={e => up({ gradual: e.currentTarget.checked })} /> Parti con meno uscite e aggiungine una alla volta</label>}
    {cfg.sessions > 3 && cfg.fromZero && <Tip>Consigliato se parti da zero: le prime settimane bastano 3 uscite, poi le altre arrivano quando il fisico è pronto.</Tip>}
    {cfg.sessions > 2 && !cfg.fromZero && <Tip>Utile se oggi esci meno spesso di così: per le prime settimane fai un'uscita in meno.</Tip>}
    {days.length > 1 && <fieldset class="scale"><legend>Giorno del lungo</legend><div class="seg">{days.map(d => <button type="button" key={d} class={g.longDay === d ? 'sel' : ''} aria-pressed={g.longDay === d} onClick={() => up({ longDay: d, qualityDay: g.qualityDay === d ? null : g.qualityDay })}>{short(d)}</button>)}</div></fieldset>}
    {days.length > 1 && <Tip>Il lungo è la seduta più importante: mettilo nel giorno con più tempo e più riposo il giorno dopo.</Tip>}
    {maxQ > 0 && <fieldset class="scale"><legend>Sedute impegnative a settimana</legend><div class="seg">{[0, 1, 2].filter(n => n <= maxQ).map(n => <button type="button" key={n} class={cfg.quality === n ? 'sel' : ''} aria-pressed={cfg.quality === n} onClick={() => up({ quality: n })}>{['Nessuna', 'Una', 'Due'][n]}</button>)}</div></fieldset>}
    {maxQ > 0 && <p class="sub pad">Ripetute, salite o ritmo medio. {cfg.quality === 0 ? 'Senza, tutte le uscite restano facili: va bene per finire, meno per migliorare.' : cfg.quality === 2 ? 'Due sono adatte a chi corre da tempo e vuole migliorare: l\'app le aggiunge a metà piano.' : 'Una basta alla maggior parte dei corridori.'}</p>}
    {cfg.quality > 0 && days.length > 2 && <fieldset class="scale"><legend>Giorno della seduta impegnativa</legend><div class="seg"><button type="button" class={!g.qualityDay ? 'sel' : ''} onClick={() => up({ qualityDay: null })}>Auto</button>{days.filter(d => d !== g.longDay).map(d => <button type="button" key={d} class={g.qualityDay === d ? 'sel' : ''} aria-pressed={g.qualityDay === d} onClick={() => up({ qualityDay: d })}>{short(d)}</button>)}</div></fieldset>}
    {g.qualityDay && Math.abs(DAYS.indexOf(g.qualityDay) - DAYS.indexOf(g.longDay)) % 6 === 1 && <Tip>Seduta impegnativa e lungo in giorni vicini caricano molto le gambe: con Auto l'app li tiene lontani.</Tip>}
    <DayPicker label="Forza, facoltativa" value={g.strengthDays} onChange={l => up({ strengthDays: l.slice(-3) })} />
    <Tip>Due sedute di forza a settimana proteggono da molti infortuni della corsa. Mettile nei giorni senza corsa: se cadono in un giorno di uscita, l'app le toglie da quel giorno.</Tip>
  </>
}

/** Opzioni per chi vuole regolare tutto. */
export function AdvancedForm({ g, up }: { g: GoalInput; up: (p: Partial<GoalInput>) => void }) {
  const [day, setDay] = useState(nextMon())
  const pauses = [...new Set(g.pauses ?? [])].sort()
  return <details class="more">
    <summary>Altre opzioni</summary>
    <div class="stack">
      <fieldset class="scale"><legend>Settimana di scarico</legend><div class="seg"><button type="button" class={(g.cutEvery ?? 4) === 4 ? 'sel' : ''} onClick={() => up({ cutEvery: 4 })}>Ogni 4</button><button type="button" class={g.cutEvery === 3 ? 'sel' : ''} onClick={() => up({ cutEvery: 3 })}>Ogni 3</button></div></fieldset>
      <Tip>Ogni 3 settimane recuperi di più: è una scelta comune dopo i 40 anni o se riprendi dopo un infortunio.</Tip>
      <fieldset class="scale"><legend>Crescita del lungo</legend><div class="seg"><button type="button" class={(g.progression ?? 'normale') === 'normale' ? 'sel' : ''} onClick={() => up({ progression: 'normale' })}>Normale</button><button type="button" class={g.progression === 'prudente' ? 'sel' : ''} onClick={() => up({ progression: 'prudente' })}>Prudente</button></div></fieldset>
      <p class="sub pad">Normale: fino al 10% in più a settimana. Prudente: 1 km alla volta, poi il 6%. Il piano dura qualche settimana in più.</p>
      <Field label="Il tuo ritmo facile, al km"><select value={g.easyPace ?? 420} onChange={e => up({ easyPace: +e.currentTarget.value })}>{PACES.map(p => <option key={p} value={p}>{pace(p)}</option>)}</select></Field>
      <p class="sub pad">Serve a trasformare in km il tempo che hai ogni giorno. Se non lo sai, lascia quello proposto.</p>
      <fieldset class="scale"><legend>Settimane di pausa</legend>
        {pauses.length > 0 && <ul class="chips">{pauses.map(p => <li key={p}>Dal {fmtDate(p, { day: 'numeric', month: 'short' })}<button type="button" class="link" aria-label={`Togli la pausa dal ${longDate(p)}`} onClick={() => up({ pauses: pauses.filter(x => x !== p) })}>✕</button></li>)}</ul>}
        <div class="row wx-find"><Field label="Settimana che contiene il giorno"><input type="date" value={day} min={todayISO()} onChange={e => setDay(e.currentTarget.value)} /></Field>
          <button type="button" class="btn ghost" disabled={!day || pauses.includes(mondayOf(day))} onClick={() => up({ pauses: [...pauses, mondayOf(day)] })}>Aggiungi</button></div>
      </fieldset>
      <p class="sub pad">Vacanze o impegni: quella settimana non trovi sedute e il piano riprende da dove l'avevi lasciato. Con una gara in calendario, il piano parte prima per arrivarci lo stesso.</p>
    </div>
  </details>
}

/** Riepilogo: numeri, avvisi, fasi e la prima settimana. */
function Preview({ res, g, from }: { res: Generated; g: GoalInput; from?: number }) {
  const weeks = res.plan.weeks
  const phases = weeks.slice(from ?? 0).reduce<{ name: string; n: number; km: number }[]>((a, w) => {
    const name = w.pause ? 'Pausa' : res.plan.meta.phases[String(w.phase)], l = a.at(-1)
    if (l?.name === name) { l.n++; l.km = Math.max(l.km, w.total ?? 0) } else a.push({ name, n: 1, km: w.total ?? 0 })
    return a
  }, [])
  const first: Week | undefined = weeks[from ?? 0]
  const hour = (d: Day) => g.hours?.[d] ?? (d === 'dom' ? 8 : 6)
  return <>
    <div class="stats"><div><b>{res.weeks}</b><span>settimane</span></div><div><b>{res.reachedLong}</b><span>km di lungo</span></div><div><b>{Math.round(res.peakWeek)}</b><span>km a settimana, al massimo</span></div></div>
    {res.warnings.map(w => <Note key={w} tone={res.blocked ? 'stop' : undefined}>{w}</Note>)}
    {res.blocked && res.belowMin && !g.risk && <Note tone="stop">Hai scelto meno uscite del minimo: torna alla settimana e conferma il rischio, oppure aggiungi un'uscita.</Note>}
    {res.blocked && res.earliestRace && <Note>Una gara dal {longDate(res.earliestRace)} in poi ti lascia il tempo giusto. Puoi scegliere un'altra data o una distanza più corta.</Note>}
    {first && <section class="panel"><h2>{from ? 'La prossima settimana' : 'La prima settimana'}</h2><ul class="weekprev">{first.sessions.map(s => <li key={s.day}><b>{WEEKDAY[s.day]}, {clock(hour(s.day))}</b><span>{s.text}</span></li>)}</ul></section>}
    <ul class="weekprev phases">{phases.map((p, i) => <li key={i}><b>{p.name}</b><span>{p.n} {p.n === 1 ? 'settimana' : 'settimane'}{p.km ? `, fino a ${Math.round(p.km)} km` : ''}</span></li>)}</ul>
  </>
}

const defaultHours = (p: WeatherPrefs): Partial<Record<Day, number>> => Object.fromEntries(DAYS.map((d, i) => [d, runHour(p, addDays('2026-11-09', i))]))
/** Le ore scelte vanno anche al meteo, che le usa per la previsione. */
const weatherWith = (p: WeatherPrefs, g: GoalInput): WeatherPrefs => ({ ...p, days: { ...p.days, ...Object.fromEntries(g.days.map(d => [d, g.hours?.[d] ?? runHour(p, addDays('2026-11-09', DAYS.indexOf(d)))])) } })

/** Procedura guidata: un passo alla volta, con suggerimenti. */
export function NewPlan() {
  const d = data.value!, prefs = prefsOf(d)
  const [step, setStep] = useState(0), [path, setPath] = useState<Path | null>(null), [id] = useState(() => uid().slice(0, 8))
  const [g, setG] = useState<GoalInput>({ id, race: '10k', km: 10, raceName: '', raceDate: null, ambition: 'finire', weeklyKm: 0, longestKm: 0, days: ['mar', 'gio', 'dom'], longDay: 'dom', strengthDays: [], startDate: nextMon(), hours: defaultHours(prefs), easyPace: 420 })
  const up = (p: Partial<GoalInput>) => setG(x => ({ ...x, ...p }))
  const free = g.race === 'trail' || g.race === 'altro'
  const kmOk = g.km >= MIN_KM && g.km <= MAX_KM
  const dateOk = !g.raceDate || g.raceDate > g.startDate
  const res = useMemo(() => kmOk && g.days.length >= 1 ? generatePlan(g) : null, [g])
  const steps = ['Da dove parti?', 'Il tuo obiettivo', 'Come stai oggi', 'Quando puoi correre?', 'La tua settimana', 'Il tuo piano']
  const sessionsOk = settings(g).sessions >= minSessions(g.km) || !!g.risk
  const can = [!!path, kmOk && dateOk, true, g.days.length >= 2, sessionsOk && g.days.length >= 2, !!res && !res.blocked][step], fit = g.race === 'forma', runner = path === 'corro' || path === 'migliora'
  const go = (n: number) => {
    // all'arrivo sulla settimana, le uscite partono dal consiglio
    if (n === 4 && g.sessions == null) up({ sessions: Math.min(suggestedSessions(g.km, g.ambition), g.days.length) })
    setStep(n); scrollTo(0, 0)
  }
  const create = () => {
    if (!res) return
    startCustomPlan(res.plan, { startDate: res.startDate, raceDate: g.raceDate || null, raceName: g.raceName || null, weather: weatherWith(prefs, g) })
    nav('piano')
  }
  return (
    <form class="stack form" onSubmit={e => e.preventDefault()}>
      <section class="head"><div class="progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / steps.length * 100}%` }} /></div><p class="eyebrow">Passo {step + 1} di {steps.length}</p><h1>{steps[step]}</h1></section>
      {step === 0 && <><ul class="cards">{PATHS.map(x => <li key={x.id}><button type="button" class={path === x.id ? 'on' : ''} aria-pressed={path === x.id} onClick={() => { setPath(x.id); up(x.set) }}><span><b>{x.label}</b><small>{x.hint}</small></span></button></li>)}</ul>
        {path === 'ritorno' && <Note>Se ti sei fermato per un infortunio, senti il medico prima di ripartire.</Note>}
        <Tip>Nel dubbio scegli la risposta più prudente: partire piano costa poche settimane, partire troppo forte può fermarti per mesi.</Tip></>}
      {step === 1 && <>
        <fieldset class="scale"><legend>Cosa vuoi raggiungere?</legend><div class="seg race">{RACES.map(r => <button type="button" key={r.id} class={g.race === r.id ? 'sel' : ''} aria-pressed={g.race === r.id} onClick={() => up({ race: r.id as RaceType, km: r.km ?? (g.km || 15), sessions: undefined, risk: false })}>{r.label}</button>)}</div></fieldset>
        {free && <Field label={`Distanza in km, da ${MIN_KM} a ${MAX_KM}`}><input inputMode="decimal" value={g.km || ''} onInput={e => up({ km: num(e.currentTarget.value) })} /></Field>}
        {free && g.km > 0 && !kmOk && <p class="err">Per una distanza così usa la tabella da compilare a mano.</p>}
        {g.race === 'trail' && <p class="sub pad">Conta i km della gara: per il dislivello il piano aggiunge salite e lunghi su sterrato.</p>}
        {!fit && <Field label="Data della gara, se ce l'hai"><input type="date" value={g.raceDate ?? ''} onChange={e => up({ raceDate: e.currentTarget.value || null })} /></Field>}
        {!dateOk && <p class="err">La gara deve essere dopo l'inizio del piano.</p>}
        {!fit && <Field label="Nome della gara, facoltativo"><input value={g.raceName ?? ''} onInput={e => up({ raceName: e.currentTarget.value })} maxLength={50} /></Field>}
        {fit && <p class="sub pad">Niente gara: il percorso ti porta a correre 10 km con continuità.</p>}
        {!fit && !g.raceDate && <Tip>Senza data l'app usa il tempo ideale e ti dice quando saresti pronto. La data la puoi aggiungere anche dopo, nelle impostazioni del piano.</Tip>}
        {g.km >= 40 && path === 'zero' && <Tip>Dalla prima corsa alla maratona servono di solito almeno 10-12 mesi: scegli una gara lontana.</Tip>}
      </>}
      {step === 2 && <>
        {runner && <Field label="Quanti km corri a settimana adesso?"><input inputMode="decimal" value={g.weeklyKm || ''} placeholder="0" onInput={e => up({ weeklyKm: num(e.currentTarget.value) })} /></Field>}
        {runner && <Field label="La corsa più lunga dell'ultimo mese, in km"><input inputMode="decimal" value={g.longestKm || ''} placeholder="0" onInput={e => up({ longestKm: num(e.currentTarget.value) })} /></Field>}
        {runner && <Tip>Scrivi i numeri reali delle ultime 4 settimane, non quelli dei periodi migliori.</Tip>}
        {g.longestKm < 3 && <Note>Il piano partirà dal cammino-corsa: tratti brevi di corsa alternati al cammino.</Note>}
        <Field label="Quando vuoi iniziare?"><input type="date" value={g.startDate} min={todayISO()} onChange={e => up({ startDate: e.currentTarget.value || nextMon() })} /></Field>
        <Tip>Il piano parte sempre di lunedì: se scegli un altro giorno, inizia dal lunedì di quella settimana.</Tip>
      </>}
      {step === 3 && <WhenForm g={g} up={up} />}
      {step === 4 && <><WeekForm g={g} up={up} res={res} /><AdvancedForm g={g} up={up} /></>}
      {step === 5 && res && <>
        <p class="pad">Inizi il {longDate(res.startDate)}{g.raceDate ? `, gara il ${longDate(g.raceDate)}` : ''}.</p>
        <Preview res={res} g={g} />
        <p class="sub pad">Le progressioni sono stime da allenatore e non sostituiscono il parere del medico. Dopo la creazione puoi cambiare ogni seduta, o le impostazioni del piano in qualsiasi momento.</p>
      </>}
      <div class="row">
        {step > 0 ? <button type="button" class="btn ghost" onClick={() => go(step - 1)}>Indietro</button> : <a class="btn ghost" href="#/mio-piano">Annulla</a>}
        {step < steps.length - 1 ? <button type="button" class="btn" disabled={!can} onClick={() => go(step + 1)}>Avanti</button> : <button type="button" class="btn" disabled={!can} onClick={create}>Attiva il piano</button>}
      </div>
    </form>
  )
}

/** Impostazioni del piano personale: si cambiano quando vuoi, il piano si ricalcola dalla prossima settimana. */
export function PlanSettings() {
  const d = data.value!, plan = d.custom, prefs = prefsOf(d), today = todayISO()
  const saved = plan?.meta.goal
  const [g, setG] = useState<GoalInput | null>(() => saved && plan ? { ...saved, id: plan.meta.id!, hours: { ...defaultHours(prefs), ...saved.hours, ...Object.fromEntries(saved.days.map(x => [x, runHour(prefs, addDays('2026-11-09', DAYS.indexOf(x)))])) } } : null)
  const [keep, setKeep] = useState(true), [done, setDone] = useState(false)
  const st = d.state.mode === 'custom' ? d.state : { ...d.state, ...d.state.other } as typeof d.state
  const r = useMemo(() => { if (!g || !plan) return null; try { return regenerate(plan, st, g, today, keep) } catch { return null } }, [g, keep])
  if (!plan) return <div class="stack"><section class="head"><h1>Nessun piano personale</h1><a class="btn" href="#/mio-piano/nuovo">Crea il tuo piano</a></section></div>
  if (!g) return <div class="stack"><section class="head"><h1>Impostazioni del piano</h1><p>Questo piano è stato creato prima delle impostazioni modificabili: per cambiarle crealo di nuovo. Gli allenamenti registrati restano.</p></section><a class="btn" href="#/mio-piano/nuovo">Crea un nuovo piano</a><a class="btn ghost" href="#/mio-piano/modifica">Modifica le sedute a mano</a></div>
  const up = (p: Partial<GoalInput>) => { setG(x => ({ ...x!, ...p })); setDone(false) }
  const okSessions = settings(g).sessions >= minSessions(g.km) || !!g.risk
  const apply = () => {
    if (!r) return
    saveCustomPlan(r.plan)
    const weather = weatherWith(prefs, g)
    if (d.state.mode === 'custom') saveState({ ...r.state, weather })
    else saveState({ ...d.state, weather, other: { ...d.state.other, startDate: r.state.startDate, raceDate: r.state.raceDate, raceName: r.state.raceName, repeats: r.state.repeats } })
    setDone(true); scrollTo(0, 0)
  }
  return (
    <form class="stack form" onSubmit={e => e.preventDefault()}>
      <section class="head"><h1>Impostazioni del piano</h1><p>Cambia quello che vuoi: le settimane fatte e quella in corso restano come sono, dalla prossima il piano riparte da dove sei arrivato.</p></section>
      {done && <Note tone="go">Piano aggiornato. <a href="#/piano">Vedi il piano</a></Note>}
      <h2 class="phase">Obiettivo</h2>
      {g.race !== 'forma' && <Field label="Data della gara"><input type="date" value={g.raceDate ?? ''} min={today} onChange={e => up({ raceDate: e.currentTarget.value || null })} /></Field>}
      {g.race !== 'forma' && <Field label="Nome della gara"><input value={g.raceName ?? ''} maxLength={50} onInput={e => up({ raceName: e.currentTarget.value })} /></Field>}
      <p class="sub pad">Per cambiare distanza crea un piano nuovo: la preparazione cambia troppo.</p>
      <h2 class="phase">Quando puoi correre</h2>
      <WhenForm g={g} up={up} />
      <h2 class="phase">La tua settimana</h2>
      <WeekForm g={g} up={up} res={r?.result ?? null} />
      <AdvancedForm g={g} up={up} />
      <h2 class="phase">Come diventa</h2>
      {r ? <>
        {r.edited > 0 && <label class="check"><input type="checkbox" checked={keep} onChange={e => setKeep(e.currentTarget.checked)} /> Tieni le {r.edited === 1 ? 'settimana futura che hai' : `${r.edited} settimane future che hai`} modificato a mano</label>}
        <Preview res={{ ...r.result, weeks: r.plan.weeks.length }} g={g} from={r.kept} />
      </> : <Note tone="stop">Con queste scelte il piano non si può calcolare: prova a cambiare giorni o data.</Note>}
      <div class="row savebar"><a class="btn ghost" href="#/mio-piano">Chiudi</a><button type="button" class="btn" disabled={!r || r.result.blocked || !okSessions || g.days.length < 2} onClick={apply}>Applica</button></div>
    </form>
  )
}

/** Maratona graduale sui tuoi giorni: quattro uscite, il lungo e la forza. */
export function BaseDaysView() {
  const d = data.value!, st = d.state, prefs = prefsOf(d), cur = baseDaysOk(st.baseDays) ? st.baseDays : null
  const [b, setB] = useState<BaseDays>(cur ?? { days: ['mar', 'mer', 'ven', 'dom'], long: 'dom', strength: ['lun', 'gio'] })
  const [hours, setHours] = useState<Partial<Record<Day, number>>>(defaultHours(prefs)), [done, setDone] = useState(false)
  const set = (p: Partial<BaseDays>) => { setB(x => { const n = { ...x, ...p }; return { ...n, long: n.days.includes(n.long) ? n.long : n.days.at(-1) ?? 'dom', strength: n.strength.filter(s => !n.days.includes(s)) } }); setDone(false) }
  const ok = baseDaysOk(b)
  const save = () => {
    const weather = { ...prefs, days: { ...prefs.days, ...Object.fromEntries(b.days.map(x => [x, hours[x] ?? 6])) } }
    if (st.mode === 'custom') saveState({ ...st, weather, other: { ...st.other, baseDays: b } })
    else saveState({ ...st, baseDays: b, weather })
    setDone(true)
  }
  const reset = () => { if (st.mode === 'custom') saveState({ ...st, other: { ...st.other, baseDays: null } }); else saveState({ ...st, baseDays: null }); setB({ days: ['mar', 'mer', 'ven', 'dom'], long: 'dom', strength: ['lun', 'gio'] }); setDone(true) }
  return (
    <form class="stack form" onSubmit={e => e.preventDefault()}>
      <section class="head"><h1>I giorni della Maratona graduale</h1><p>Il percorso pronto prevede quattro uscite. Scegli i tuoi giorni: le sedute si spostano, i contenuti restano.</p></section>
      {done && <Note tone="go">Giorni salvati.</Note>}
      <DayPicker label={`Giorni di corsa: ${b.days.length} di 4`} value={b.days} onChange={l => { if (l.length <= 4) set({ days: DAYS.filter(x => l.includes(x)) }) }} />
      {b.days.length < 4 && <p class="sub pad">Scegline ancora {4 - b.days.length}. Nelle prime fasi il piano ne usa solo tre.</p>}
      {b.days.length === 4 && <fieldset class="scale"><legend>Giorno del lungo</legend><div class="seg">{b.days.map(x => <button type="button" key={x} class={b.long === x ? 'sel' : ''} aria-pressed={b.long === x} onClick={() => set({ long: x })}>{short(x)}</button>)}</div></fieldset>}
      <Tip>La seduta impegnativa va nel giorno più lontano dal lungo. La maratona resta di domenica, come nel piano originale.</Tip>
      {b.days.length === 4 && <div class="grid2">{b.days.map(x => <Field key={x} label={`Ora ${WEEKDAY[x].toLowerCase()}`}><select value={hours[x] ?? 6} onChange={e => setHours({ ...hours, [x]: +e.currentTarget.value })}>{HOURS.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></Field>)}</div>}
      <DayPicker label="Forza" value={b.strength} disabled={b.days} onChange={l => set({ strength: l.slice(-3) })} />
      <div class="row savebar"><button type="button" class="btn ghost" onClick={reset}>Giorni originali</button><button type="button" class="btn" disabled={!ok} onClick={save}>Salva</button></div>
      <a class="btn ghost" href="#/mio-piano">Chiudi</a>
    </form>
  )
}

