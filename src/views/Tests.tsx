import { useState } from 'preact/hooks'
import { data, saveState, saveTest, uid } from '../api'
import { isCustom, planFor, ROUNDS, scalaResult, type ScalaRound } from '../../shared/engine'
import { fmtDate, todayISO } from '../guide'
import { breathHint, Field, Note, Scale } from '../ui'

const empty = (): ScalaRound => ({ finished: null, fiato: null, fatica: null, knee: null, hrEnd: null, hr1: null, quit: null, quitMin: null })
const FAIL = ['Fiato', 'Gambe', 'Dolore', 'Testa', 'Niente']
export function Tests() {
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
  const persist = (extra = {}) => saveTest({ id, date: last?.date ?? todayISO(), kind: 'scala', data: { rounds: rs, first, swollen, wedKnee: wed, result: res, ...extra } })
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
