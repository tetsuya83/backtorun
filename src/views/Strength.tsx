import { useEffect, useMemo, useState } from 'preact/hooks'
import { data, saveActivity, uid } from '../api'
import { buildTimeline, planFor, slotForDate } from '../../shared/engine'
import { jointOk, lastLog, schemeFor, suggest, WORKOUTS, type Exercise, type ExerciseLog, type Place, type Scheme } from '../../shared/training'
import { fmtDate, PAIN as words, todayISO } from '../guide'
import { buzz, clearScheduled, keepAwake, local, say, schedule, unlockSound } from '../sound'
import { Field, nav, Note, Scale } from '../ui'
import { Illustration } from '../art'
import { articleById } from '../learn'
import { watchedZones, withPains, type Pain } from '../../shared/pain'
import { PainPicker } from './Pain'

const KEY = 'btr-forza', PLACE = 'btr-forza-luogo'
type Row = { kg: string; reps: string; done: boolean }
interface Draft { date: string; start: number; place: Place; alt: Record<string, boolean>; rows: Record<string, Row[]> }
const fresh = (date: string, place: Place): Draft => ({ date, start: Date.now(), place, alt: {}, rows: {} })
const num = (s: string) => { const n = +s.replace(',', '.'); return s.trim() && isFinite(n) ? n : null }

function Card({ ex, s, d, set, onDone, ok }: { ex: Exercise; s: Scheme; d: Draft; set: (f: (x: Draft) => Draft) => void; onDone: (rest: number) => void; ok: boolean }) {
  const [open, setOpen] = useState(false), [how, setHow] = useState(false)
  const act = d.alt[ex.id] && ex.alt ? { ...ex, ...ex.alt } as Exercise : ex
  const acts = data.value!.activities, last = lastLog(acts, act.id), tip = suggest(last, act, s, ok)
  const rows: Row[] = d.rows[act.id] ?? Array.from({ length: s.sets }, () => ({ kg: tip.kg != null ? String(tip.kg) : '', reps: '', done: false }))
  const up = (i: number, p: Partial<Row>) => set(x => ({ ...x, rows: { ...x.rows, [act.id]: rows.map((r, j) => j === i ? { ...r, ...p } : r) } }))
  const n = rows.filter(r => r.done).length, finished = n === rows.length, art = articleById(act.id === 'h-calfbent' ? 'calfseat' : act.id)
  return (
    <section class={'panel ex' + (finished ? ' done-ex' : '')}>
      <div class="ex-h"><h2>{act.name}</h2><span>{n}/{rows.length}</span></div>
      {finished && <button type="button" class="link" onClick={() => setOpen(!open)}>{open ? 'Chiudi' : 'Correggi'}</button>}
      <p class="sub">{s.sets} × {s.min}-{s.max} {s.unit === 'sec' ? 'secondi' : 'ripetizioni'}{act.perSide ? ' per lato' : ''}, recupero {s.rest >= 60 ? `${Math.floor(s.rest / 60)}'${s.rest % 60 ? String(s.rest % 60).padStart(2, '0') + '"' : ''}` : `${s.rest}"`}</p>
      {(open || !finished) && <>
        <p>{act.cue}</p>
        {art && <button type="button" class="link" aria-expanded={how} onClick={() => setHow(!how)}>{how ? 'Chiudi' : 'Vedi come si fa'}</button>}
        {how && art?.anim && <><Illustration id={art.anim} /><a href={`#/impara/${art.id}`}>Scheda completa</a></>}
        {last && <p class="sub">L'ultima volta: {last.sets.map(x => (x.kg ? `${x.kg} kg × ` : '') + x.reps).join(', ')}</p>}
        <p class={tip.up ? 'up' : 'sub'}>{tip.text}</p>
        {ex.alt && !n && <button type="button" class="link" onClick={() => set(x => ({ ...x, alt: { ...x.alt, [ex.id]: !x.alt[ex.id] } }))}>Fai {(d.alt[ex.id] ? ex : ex.alt).name}</button>}
        <div class="sets">
          {rows.map((r, i) => <div class={'set' + (r.done ? ' on' : '')} key={i}>
            <b>{i + 1}</b>
            {act.kind !== 'time' ? <input aria-label={`Carico serie ${i + 1}, kg`} inputMode="decimal" placeholder={act.kind === 'body' ? 'zaino' : 'kg'} value={r.kg} onInput={e => up(i, { kg: e.currentTarget.value })} /> : <span />}
            <input aria-label={`${s.unit === 'sec' ? 'Secondi' : 'Ripetizioni'} serie ${i + 1}`} inputMode="numeric" placeholder={String(s.max)} value={r.reps} onInput={e => up(i, { reps: e.currentTarget.value })} />
            <button type="button" aria-pressed={r.done} aria-label={`Serie ${i + 1} fatta`} onClick={() => { const done = !r.done; up(i, { done, reps: r.reps || String(s.max) }); if (done) onDone(s.rest) }}>{r.done ? '✓' : ''}</button>
          </div>)}
        </div>
      </>}
    </section>
  )
}

export function Strength({ route }: { route: string }) {
  const app = data.value!, plan = planFor(app)
  const date = new URLSearchParams(route.split('?')[1] ?? '').get('date') ?? todayISO()
  const slot = useMemo(() => slotForDate(buildTimeline(plan, app.state), date), [plan, app.state, date])
  const [d, setD] = useState<Draft>(() => local.get<Draft>(KEY) ?? fresh(date, local.get<Place>(PLACE) ?? 'palestra'))
  const [end, setEnd] = useState(0), [, tick] = useState(0), [fatica, setFatica] = useState<number | null>(null), [pains, setPains] = useState<Pain[]>(() => watchedZones(app).map(zone => ({ zone, level: 0 })))
  const [note, setNote] = useState(''), [err, setErr] = useState('')
  const set = (f: (x: Draft) => Draft) => setD(x => { const n = f(x); local.set(KEY, n); return n })
  useEffect(() => keepAwake(), [])
  useEffect(() => {
    const iv = setInterval(() => setEnd(e => {
      if (!e) return e
      if (Date.now() >= e) { buzz([300, 120, 300]); say('Recupero finito'); return 0 }
      tick(n => n + 1); return e
    }), 250)
    return () => { clearInterval(iv); clearScheduled() }
  }, [])
  const rest = (s: number) => { if (!logs(d).length) set(x => ({ ...x, start: Date.now() })); unlockSound(); clearScheduled(); schedule([{ at: s, cue: 'work' }]); setEnd(Date.now() + s * 1000) }
  const addRest = () => { const left = end + 30000 - Date.now(); clearScheduled(); schedule([{ at: left / 1000, cue: 'work' }]); setEnd(e => e + 30000) }
  const stale = d.date !== date && Object.values(d.rows).some(r => r.some(x => x.done))
  const list = WORKOUTS[d.place], ok = jointOk(app.activities)
  const phase = slot?.phase ?? 1, down = !!slot?.scarico
  const items = list.map(ex => ({ ex, s: schemeFor(ex, phase, down, d.place) }))
  const logs = (x: Draft): ExerciseLog[] => items.flatMap(({ ex, s }) => {
    const a = x.alt[ex.id] && ex.alt ? { ...ex, ...ex.alt } as Exercise : ex
    const sets = (x.rows[a.id] ?? []).filter(r => r.done).map(r => ({ kg: num(r.kg), reps: num(r.reps) ?? s.max }))
    return sets.length ? [{ id: a.id, name: a.name, kind: a.kind, min: s.min, max: s.max, sets }] : []
  })
  const save = () => {
    const sets = logs(d)
    if (!sets.length) { setErr('Spunta almeno una serie.'); return }
    if (fatica == null) { setErr('Indica la fatica.'); return }
    saveActivity(withPains({ id: uid(), date, type: 'forza' as const, source: 'manuale' as const, seconds: Math.min(4 * 3600, Math.round((Date.now() - d.start) / 1000)), fatica, note: note.trim() || null, sets }, pains))
    local.del(KEY); nav('home')
  }
  const last = [...app.activities].reverse().find(a => a.type === 'corsa')
  if (stale) return <div class="stack"><section class="head"><h1>Seduta non salvata</h1><p>Hai una scheda di forza aperta del {fmtDate(d.date, { day: 'numeric', month: 'long' })}.</p></section>
    <button class="btn" onClick={() => nav(`forza?date=${d.date}`)}>Riprendila</button>
    <button class="btn ghost danger" onClick={() => { const n = fresh(date, d.place); local.set(KEY, n); setD(n) }}>Scartala</button></div>
  const left = end ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : 0
  return (
    <div class="stack form strength-v">
      <section class="head"><h1>Forza</h1><p>{slot ? (down ? 'Settimana di scarico: una serie in meno.' : 'Lascia sempre due ripetizioni in riserva.') : 'Lascia sempre due ripetizioni in riserva.'}</p>
        <a href="#/routine?id=warm-gym">Riscaldamento di 5 minuti</a></section>
      {last?.locked ? <Note tone="stop"><strong>{words.stop}</strong> {words.stopText} Oggi niente esercizi per le gambe.</Note> : !ok && <Note tone="stop"><strong>{words.warn}</strong> Niente aumenti di carico: togli ciò che dà dolore.</Note>}
      <div class="seg" role="group" aria-label="Dove ti alleni">{(['palestra', 'casa'] as Place[]).map(p => <button type="button" key={p} class={d.place === p ? 'sel' : ''} aria-pressed={d.place === p} disabled={logs(d).length > 0 && d.place !== p} onClick={() => { local.set(PLACE, p); set(x => ({ ...x, place: p })) }}>{p === 'palestra' ? 'Palestra' : 'Casa'}</button>)}</div>
      {items.map(({ ex, s }) => <Card key={ex.id} ex={ex} s={s} d={d} set={set} onDone={rest} ok={ok} />)}
      <Scale label="Quanta fatica?" max={10} value={fatica} onChange={setFatica} />
      <PainPicker value={pains} onChange={setPains} />
      <Field label="Note"><textarea rows={2} value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="Esercizi saltati, sensazioni" /></Field>
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn" onClick={save}>Salva allenamento</button>
      {end > 0 && <div class="restbar" role="timer"><span>Recupero</span><b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b><button class="btn ghost" onClick={addRest}>+30"</button><button class="btn ghost" onClick={() => { clearScheduled(); setEnd(0) }}>Salta</button></div>}
    </div>
  )
}
