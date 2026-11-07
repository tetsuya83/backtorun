import { useMemo, useState } from 'preact/hooks'
import { data, saveState, saveTest, uid } from '../api'
import { addDays, buildTimeline, mondayOf, sessionDate, slotForDate } from '../../shared/engine'
import { cooperVo2, easyFrom5k, easyFromCooper, placeBase, recentVolume, suggestTest, testInfo, TESTS, walkVo2, weekFromTest, type TestKind } from '../../shared/tests'
import type { Block } from '../../shared/blocks'
import { local } from '../sound'
import { FREE, RESULT, type GuideResult } from './Guide'
import { nav } from '../ui'
import { isCustom, planFor, ROUNDS, scalaResult, type ScalaRound } from '../../shared/engine'
import { fmtDate, todayISO } from '../guide'
import { breathHint, Field, Note, Scale } from '../ui'

const empty = (): ScalaRound => ({ finished: null, fiato: null, fatica: null, knee: null, hrEnd: null, hr1: null, quit: null, quitMin: null })
const FAIL = ['Fiato', 'Gambe', 'Dolore', 'Testa', 'Niente']
function Scala() {
  const d = data.value!, custom = isCustom(planFor(d))
  const last = [...d.tests].filter(t => t.kind === 'scala').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const [id] = useState(last?.id ?? uid())
  const [rs, setRs] = useState<ScalaRound[]>(last?.data.rounds ?? ROUNDS.map(empty))
  const [cur, setCur] = useState(0)
  const [first, setFirst] = useState<string | null>(last?.data.first ?? null)
  const [swollen, setSwollen] = useState<boolean>(last?.data.swollen ?? false)
  const [wed, setWed] = useState<number | null>(last?.data.wedKnee ?? null)
  const [applied, setApplied] = useState(false)
  const r = rs[cur]
  const up = (p: Partial<ScalaRound>) => { setRs(x => x.map((y, i) => i === cur ? { ...y, ...p } : y)); setApplied(false) }
  const res = scalaResult(rs, swollen, wed)
  const anyDone = rs.some(x => x.finished != null)
  const num = (v: string) => v === '' ? null : +v
  const persist = (extra = {}) => saveTest({ id, date: last?.date ?? todayISO(), kind: 'scala', data: { rounds: rs, first, swollen, wedKnee: wed, result: res, summary: `${res.closedRounds} round chiusi${custom ? '' : `, partenza dalla settimana ${res.week}`}`, ...extra } })
  const stop = r.finished === false || (r.fiato ?? 0) >= 4 || (r.knee ?? 0) > 2
  return (
    <div class="stack form">
      <section class="head"><h1>La Scala</h1><p>5 round di corsa facile, a frasi complete. 5' di camminata prima e dopo, 2' tra i round.</p>{custom && <p class="sub">Il risultato serve a misurarti: la partenza del piano base non cambia il tuo piano personale.</p>}{last && <p class="sub">Ultimo test del {fmtDate(last.date, { day: 'numeric', month: 'long' })}</p>}</section>
      <div class="ladder" role="group" aria-label="Round">
        {ROUNDS.map((m, i) => <button key={i} type="button" onClick={() => setCur(i)} aria-pressed={cur === i} class={(cur === i ? 'sel ' : '') + (rs[i].finished ? 'ok' : rs[i].finished === false ? 'ko' : '')} style={{ height: `${44 + m * 6}px` }}><b>{m}'</b><small>R{i + 1}</small></button>)}
      </div>
      <section class="panel">
        <h2>Round {cur + 1}: {ROUNDS[cur]}' di corsa{cur === 4 ? ', senza guardare l\'orologio' : ''}</h2>
        <div class="seg"><button type="button" class={r.finished === true ? 'sel' : ''} onClick={() => up({ finished: true })}>Finito</button><button type="button" class={r.finished === false ? 'sel' : ''} onClick={() => up({ finished: false })}>Fermato prima</button></div>
      </section>
      <Scale label="Fiato" max={5} value={r.fiato} onChange={v => up({ fiato: v })} hint={breathHint(r.fiato)} />
      <Scale label="Fatica" max={10} value={r.fatica} onChange={v => up({ fatica: v })} />
      <Scale label="Dolore" min={0} max={10} value={r.knee} onChange={v => up({ knee: v })} />
      <div class="grid2">
        <Field label="FC a fine corsa"><input inputMode="numeric" value={r.hrEnd ?? ''} onInput={e => up({ hrEnd: num(e.currentTarget.value) })} /></Field>
        <Field label="FC dopo 1' di cammino"><input inputMode="numeric" value={r.hr1 ?? ''} onInput={e => up({ hr1: num(e.currentTarget.value) })} /></Field>
      </div>
      <Scale label="Voglia di smettere" min={0} max={10} value={r.quit} onChange={v => up({ quit: v })} />
      {stop && <Note tone="stop"><strong>Fermati qui.</strong> Fiato a 4 per oltre 1', dolore sopra 2 o corsa scomposta chiudono il test.</Note>}
      {cur < 4 && r.finished && !stop && <button type="button" class="btn ghost" onClick={() => { setCur(cur + 1); persist(); scrollTo(0, 0) }}>Vai al round {cur + 2}</button>}
      {anyDone && <section class="panel go result">
        <p class="eyebrow">{res.closedRounds ? `${res.closedRounds} ${res.closedRounds === 1 ? 'round chiuso' : 'round chiusi'}` : 'Nessun round chiuso'}{res.bonus ? ', con bonus' : ''}</p>
        {!custom && <h2>Parti dalla settimana {res.week}</h2>}
        <fieldset class="scale"><legend>Cosa ha ceduto per primo?</legend><div class="seg">{FAIL.map(f => <button type="button" key={f} class={first === f ? 'sel' : ''} onClick={() => setFirst(f)}>{f}</button>)}</div></fieldset>
        <Scale label="Il giorno dopo: dolore al mattino" min={0} max={10} value={wed} onChange={setWed} />
        <label class="check"><input type="checkbox" checked={swollen} onChange={e => setSwollen(e.currentTarget.checked)} /> Il giorno dopo ho gonfiore</label>
        {custom ? <button class="btn ghost" type="button" onClick={() => persist()}>Salva il test</button> : <button class="btn" type="button" onClick={() => { persist(); saveState({ ...d.state, startWeek: res.week, skips: [], repeats: [] }); setApplied(true) }}>{applied ? 'Partenza impostata' : `Parti dalla settimana ${res.week}`}</button>}
      </section>}
      <p class="sub pad">Test non validato: le soglie sono stime da allenatore.</p>
    </div>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const range = (r: readonly [number, number]) => `${mmss(r[0])}-${mmss(r[1])} al km`
const SOURCES: [string, string][] = [
  ['Cooper, JAMA 1968: test dei 12 minuti e VO2max', 'https://lida.sport-iat.de/ta/Record/4077559?lng=en'],
  ['Kline e altri, 1987: test del cammino di un miglio', 'https://pubmed.ncbi.nlm.nih.gov/3600239/'],
  ['Stevens e altri, 2015: affidabilità dei 5 km a tempo', 'https://researchers.westernsydney.edu.au/en/publications/the-reliability-of-running-performance-in-a-5-km-time-trial-on-a-/'],
  ['Murias e altri, 2010: tempi di adattamento del VO2max', 'https://elmi.hbku.edu.qa/en/publications/time-course-and-mechanisms-of-adaptations-in-cardiorespiratory-fi/'],
  ['Montero e altri, 2015: VO2max dopo 6 settimane di allenamento', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4606528'],
]
/** La settimana in corso della Maratona graduale, o quella di partenza se il piano non è iniziato. */
function baseNow() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), slot = slotForDate(t, todayISO())
  return typeof slot?.week === 'number' ? slot.week : d.state.startWeek
}
const lastOf = (k: TestKind) => [...data.value!.tests].filter(t => t.kind === k).sort((a, b) => a.date.localeCompare(b.date)).at(-1)

/** Il centro test: quale fare, i risultati, ogni quanto rifarli. */
export function Tests({ route }: { route: string }) {
  const q = new URLSearchParams(route.split('?')[1] ?? ''), k = q.get('k') as TestKind | null
  if (k === 'scala') return <Scala />
  if (k === 'cooper' || k === '5km' || k === 'cammino') return <FieldTest key={k} kind={k} fromGuide={!!q.get('from')} />
  return <Hub />
}
function Hub() {
  const d = data.value!, today = todayISO(), custom = isCustom(planFor(d)), sug = suggestTest(d.activities, today, custom ? null : baseNow())
  const list = [...d.tests].sort((a, b) => b.date.localeCompare(a.date)), info = testInfo(sug.kind)!
  return <div class="stack">
    <section class="head"><h1>Test</h1><p>Misura la tua condizione e scopri da quale punto della tabella partire. Rifarli è facoltativo.</p></section>
    <section class="panel go">
      <p class="eyebrow">Ti consiglio</p>
      <h2>{info.name}</h2>
      <p>{sug.why}</p>
      <a class="btn" href={`#/test?k=${sug.kind}`}>Apri il test</a>
    </section>
    <h2 class="phase">Tutti i test</h2>
    <ul class="cards">{TESTS.map(t => { const l = lastOf(t.kind); return <li key={t.kind}><a href={`#/test?k=${t.kind}`}><span><b>{t.name}</b><small>{t.short}. {t.who}.{l ? ` Ultimo: ${fmtDate(l.date, { day: 'numeric', month: 'short' })}.` : ''}</small></span></a></li> })}</ul>
    {list.length > 0 && <section><h2 class="phase">I tuoi risultati</h2><ul class="hist">{list.map(t => <li key={t.id}><a href={`#/test?k=${t.kind}`}><b>{fmtDate(t.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b><span>{testInfo(t.kind)?.name ?? t.kind}{t.data?.summary ? `: ${t.data.summary}` : ''}</span></a></li>)}</ul></section>}
    <label class="check"><input type="checkbox" checked={d.state.testRemind !== false} onChange={e => saveState({ ...d.state, testRemind: e.currentTarget.checked, testSnooze: null })} /> Proponimi un test di controllo ogni 8 settimane, nella settimana di scarico</label>
    <details class="more">
      <summary><b>Perché ogni 8 settimane</b><span>e quale test scegliere</span></summary>
      <div class="stack">
        <p>Il VO2max comincia a salire già dopo 3 settimane di allenamento e cresce ancora fino a 12; dopo 6 settimane l'aumento medio è intorno al 9%. Ripetere un test più spesso misurerebbe soprattutto la stanchezza del giorno.</p>
        <p>Ogni 8 settimane, nella settimana di scarico, il miglioramento è più grande dell'errore del test: nei 5 km la differenza tra due prove uguali è circa l'1%. Il promemoria non arriva se il piano ha già un test nei 14 giorni successivi.</p>
        <p>Il test giusto dipende da quanto corri: la Scala finché non corri 15 minuti di fila, il cammino se hai dolore, il Cooper fino a 20 km a settimana, poi i 5 km. Cooper e 5 km sono massimali: si fanno solo senza dolore e dopo un giorno facile.</p>
        <p>Le soglie che collegano un risultato a una settimana della tabella sono stime da allenatore, non validate: il volume che corri già ha sempre l'ultima parola.</p>
        <ul class="src">{SOURCES.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noopener">{t}</a></li>)}</ul>
      </div>
    </details>
  </div>
}

const GUIDE: Partial<Record<TestKind, { text: string; blocks: Block[] }>> = {
  cooper: { text: 'Test di Cooper', blocks: [{ kind: 'warm', part: { sec: 600, effort: 'easy' } }, { kind: 'run', part: { sec: 720, effort: 'max' } }, { kind: 'cool', part: { sec: 300, effort: 'walk' } }] },
  '5km': { text: '5 km a tempo', blocks: [{ kind: 'warm', part: { sec: 600, effort: 'easy' } }, { kind: 'run', part: { m: 5000, effort: 'race' } }, { kind: 'cool', part: { sec: 300, effort: 'walk' } }] },
  cammino: { text: 'Test del cammino', blocks: [{ kind: 'warm', part: { sec: 300, effort: 'walk' } }, { kind: 'run', part: { m: 1609, effort: 'walk' } }] },
}
const HOW: Record<Exclude<TestKind, 'scala'>, string[]> = {
  cooper: ['Su una pista o un percorso piatto che conosci, dopo un giorno facile.', '10 minuti di corsa facile, poi 12 minuti alla massima distanza che riesci a coprire, con un ritmo che puoi tenere fino in fondo.', "Annota i metri: dall'orologio, dal GPS o contando i giri di pista. Poi 5 minuti di cammino."],
  '5km': ['Su un percorso piatto e misurato, o in pista, dopo un giorno facile.', '10 minuti di corsa facile, poi 5 km al tuo meglio, partendo controllato e chiudendo forte.', 'Annota il tempo, poi 5 minuti di cammino.'],
  cammino: ['Su un percorso piatto di 1,6 km, per esempio 4 giri di pista.', 'Cammina più veloce che puoi senza correre.', "All'arrivo misura subito i battiti con l'orologio o la fascia. Servono anche età, peso e sesso: restano solo su questo telefono."],
}
const num = (v: string) => { const n = +v.replace(',', '.'); return v.trim() && Number.isFinite(n) ? n : null }
function FieldTest({ kind, fromGuide }: { kind: Exclude<TestKind, 'scala'>; fromGuide: boolean }) {
  const d = data.value!, info = testInfo(kind)!, today = todayISO(), plan = planFor(d), custom = isCustom(plan)
  const guide = useMemo(() => { if (!fromGuide) return null; const r = local.get<GuideResult>(RESULT); local.del(RESULT); return r }, [])
  const lap = guide?.guide?.find(l => l.effort === 'max' || l.effort === 'race' || (kind === 'cammino' && l.m >= 1500))
  const body = local.get<{ age?: string; kg?: string; male?: boolean }>('btr-body') ?? {}
  const [m, setM] = useState(kind === 'cooper' && lap?.m ? String(lap.m) : '')
  const [min, setMin] = useState(lap && kind !== 'cooper' ? String(Math.floor(lap.sec / 60)) : ''), [sec, setSec] = useState(lap && kind !== 'cooper' ? String(lap.sec % 60).padStart(2, '0') : '')
  const [hr, setHr] = useState(''), [age, setAge] = useState(body.age ?? ''), [kg, setKg] = useState(body.kg ?? ''), [male, setMale] = useState(body.male ?? true)
  const [fatica, setFatica] = useState<number | null>(null), [pain, setPain] = useState<number | null>(null), [saved, setSaved] = useState(false), [err, setErr] = useState('')
  const sug = suggestTest(d.activities, today, custom ? null : baseNow()), vol = recentVolume(d.activities, today)
  const time = (num(min) ?? 0) * 60 + (num(sec) ?? 0)
  // il risultato, calcolato mentre scrivi
  let value: number | null = null, vo2: number | null = null, easy: readonly [number, number] | null = null
  if (kind === 'cooper' && num(m) && num(m)! >= 600 && num(m)! <= 5000) { value = num(m)!; vo2 = cooperVo2(value); easy = easyFromCooper(value) }
  if (kind === '5km' && time >= 900 && time <= 3 * 3600) { value = time; easy = easyFrom5k(value) }
  if (kind === 'cammino' && time >= 480 && time <= 3600 && num(hr) && num(age) && num(kg)) { value = time; vo2 = walkVo2({ kg: num(kg)!, age: num(age)!, male, sec: time, hr: num(hr)! }) }
  const byTest = value != null ? weekFromTest(kind, value) : null
  const place = !custom && byTest != null ? placeBase(d.plan, byTest, vol) : null
  const phases = d.plan.meta.phases, wk = place ? d.plan.weeks.find(w => w.week === place.week) : null
  const started = today >= d.state.startDate, next = addDays(mondayOf(today), 7), now = custom ? null : baseNow()
  const summary = value == null ? '' : [kind === 'cooper' ? `${value} m` : mmss(value), vo2 ? `VO2max stimato ${String(vo2).replace('.', ',')}` : null, place ? `settimana ${place.week}` : easy ? `ritmo facile ${range(easy)}` : null].filter(Boolean).join(', ')
  const save = () => {
    if (value == null) { setErr(kind === 'cooper' ? 'Scrivi i metri percorsi in 12 minuti.' : kind === '5km' ? 'Scrivi il tempo dei 5 km.' : 'Servono tempo, battiti, età e peso.'); return }
    if (kind === 'cammino') local.set('btr-body', { age, kg, male })
    saveTest({ id: uid(), date: today, kind, data: { value, vo2, easy, week: place?.week ?? null, byTest, fatica, pain, summary } })
    if (d.state.testSnooze) saveState({ ...d.state, testSnooze: null })
    setSaved(true); setErr('')
  }
  const apply = () => {
    if (!place) return
    if (!started) { saveState({ ...d.state, startWeek: place.week, skips: [], repeats: [] }); nav('piano'); return }
    if (confirm(`Il calendario riparte lunedì ${fmtDate(next, { day: 'numeric', month: 'long' })} dalla settimana ${place.week}. Le settimane già fatte e gli allenamenti registrati restano nel Diario.`)) { saveState({ ...d.state, startDate: next, startWeek: place.week, skips: [], repeats: [] }); nav('piano') }
  }
  const startGuide = () => { local.set(FREE, { ...GUIDE[kind]!, sport: 'corsa', back: `test?k=${kind}&from=guide` }); nav('guida?free=1') }
  return <div class="stack form">
    <section class="head"><p class="eyebrow">{info.who}</p><h1>{info.name}</h1><p>{info.short}, circa {info.minutes} minuti in tutto.</p></section>
    {info.maximal && sug.kind === 'cammino' && <Note tone="stop"><strong>Oggi meglio di no.</strong> {sug.why} Fai il test del cammino oppure aspetta qualche giorno senza dolore.</Note>}
    {info.maximal && sug.kind === 'scala' && <Note><strong>Prima la Scala.</strong> {sug.why}</Note>}
    <section class="panel"><ol class="nums">{HOW[kind].map(x => <li key={x}><span>{x}</span></li>)}</ol></section>
    {GUIDE[kind] && !guide && <button type="button" class="btn ghost" onClick={startGuide}>Fallo con il cronometro guidato</button>}
    {guide && <Note tone="go">Cronometro concluso{lap ? `: ${kind === 'cooper' ? (lap.m ? `${lap.m} m` : 'scrivi i metri che segna l\'orologio') : mmss(lap.sec)}` : ''}. Controlla e salva.</Note>}
    {kind === 'cooper' && <Field label="Metri percorsi in 12 minuti"><input inputMode="numeric" value={m} placeholder="2200" onInput={e => setM(e.currentTarget.value)} /></Field>}
    {kind !== 'cooper' && <fieldset class="hms"><legend>{kind === '5km' ? 'Tempo dei 5 km' : 'Tempo per 1,6 km'}</legend><div class="two">
      <label><input inputMode="numeric" aria-label="Minuti" value={min} placeholder="0" onInput={e => setMin(e.currentTarget.value)} /><span>min</span></label>
      <label><input inputMode="numeric" aria-label="Secondi" value={sec} placeholder="00" onInput={e => setSec(e.currentTarget.value)} /><span>sec</span></label>
    </div></fieldset>}
    {kind === 'cammino' && <>
      <div class="grid3">
        <Field label="FC all'arrivo"><input inputMode="numeric" value={hr} onInput={e => setHr(e.currentTarget.value)} /></Field>
        <Field label="Età"><input inputMode="numeric" value={age} onInput={e => setAge(e.currentTarget.value)} /></Field>
        <Field label="Peso, kg"><input inputMode="decimal" value={kg} onInput={e => setKg(e.currentTarget.value)} /></Field>
      </div>
      <div class="seg" role="group" aria-label="Sesso"><button type="button" class={male ? 'sel' : ''} aria-pressed={male} onClick={() => setMale(true)}>Uomo</button><button type="button" class={male ? '' : 'sel'} aria-pressed={!male} onClick={() => setMale(false)}>Donna</button></div>
      <p class="sub pad">La formula è validata tra 30 e 69 anni.</p>
    </>}
    <Scale label="Fatica" max={10} value={fatica} onChange={setFatica} />
    <Scale label="Dolore, da 0 a 10" min={0} max={10} value={pain} onChange={setPain} />
    {(pain ?? 0) > 2 && <Note tone="stop"><strong>Dolore sopra 2.</strong> Il risultato vale meno: prima di riprovare aspetta qualche giorno senza dolore.</Note>}
    {value != null && <section class="panel go result">
      <p class="eyebrow">Risultato</p>
      {vo2 != null && <h2>VO2max stimato {String(vo2).replace('.', ',')} ml/kg/min</h2>}
      {easy && <p>Ritmo facile stimato: <b>{range(easy)}</b>.</p>}
      {place && wk && <p>{place.week === now ? `Sei già nella settimana giusta, la ${place.week}.` : `Nella Maratona graduale puoi partire dalla settimana ${place.week}, fase ${phases[String(wk.phase)] ?? ''}.`}{place.capped ? ` ${place.reason}` : ''}</p>}
      {kind === 'cammino' && <p>Il cammino non sposta la tabella: serve a seguire la condizione quando non puoi correre. Senza dolore, il passo successivo è la Scala.</p>}
      {custom && easy && <p class="sub">Nel tuo piano puoi usarlo come ritmo facile: <a href="#/mio-piano/impostazioni">Impostazioni del piano</a>.</p>}
      {!saved ? <button type="button" class="btn" onClick={save}>Salva il risultato</button> : <p class="sub">Salvato tra i tuoi risultati.</p>}
      {saved && place && place.week !== now && <button type="button" class="btn ghost" onClick={apply}>{started ? `Riparti dalla settimana ${place.week}` : `Parti dalla settimana ${place.week}`}</button>}
    </section>}
    {err && <p class="err" role="alert">{err}</p>}
    <p class="sub pad">Stime da allenatore, non un esame medico. Con dolore al petto, capogiri o fiato che non torna, fermati.</p>
  </div>
}
