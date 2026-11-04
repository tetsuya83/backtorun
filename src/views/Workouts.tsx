import { useState } from 'preact/hooks'
import { addPlanned, data, deleteWorkout, removePlanned, saveWorkout, uid } from '../api'
import { blocksKm, blocksOf, blocksSec } from '../../shared/blocks'
import { buildTimeline, MAX_WORKOUTS, plannedKey, plannedOn, planFor, sessionDate, slotForDate, type Planned, type Session, type Workout } from '../../shared/engine'
import { fmtDate, todayISO } from '../guide'
import { BlockList, Field, nav, Note } from '../ui'
import { Builder } from './Builder'

const SPORT = { corsa: 'Corsa', nuoto: 'Nuoto' }
const facts = (w: Workout) => { const k = blocksKm(w.blocks, w.sport); return [SPORT[w.sport], `circa ${Math.round(blocksSec(w.blocks, w.sport) / 60)} min`, k ? w.sport === 'nuoto' ? `${Math.round(k * 1000)} m` : `${String(k).replace('.', ',')} km` : null].filter(Boolean).join(', ') }
const day = (s: string) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' })

/** Salva una seduta del piano tra gli allenamenti personali. */
export function SaveSession({ s, link }: { s: Session; link?: boolean }) {
  const [ok, setOk] = useState(false), list = data.value!.workouts ?? [], there = ok || list.some(w => w.text === s.text)
  const save = () => { const b = blocksOf(s); if (!b || list.length >= MAX_WORKOUTS) return; saveWorkout({ id: uid(), name: s.text.slice(0, 60), sport: 'corsa', text: s.text, km: s.km, blocks: b, fiato: s.fiato, fatica: s.fatica }); setOk(true) }
  if (link) return there ? <span class="sub">Salvata</span> : <button type="button" class="link" onClick={save}>Salva</button>
  return <button type="button" class="btn ghost" disabled={there} onClick={save}>{there ? 'Già tra i miei allenamenti' : 'Salva tra i miei allenamenti'}</button>
}
/** Un allenamento aggiunto al calendario, nella settimana del piano. */
export function PlannedRow({ p }: { p: Planned }) {
  const a = data.value!.activities.find(x => x.sessionKey === plannedKey(p))
  return <div class="ses"><div class="ses-h"><b>{fmtDate(p.date, { weekday: 'long', day: 'numeric' }).replace(/^./, c => c.toUpperCase())}, in più</b>{a ? <a href={`#/registra?id=${a.id}`}>Fatto, modifica</a> : <a href={`#/guida?planned=${p.id}`}>Avvia</a>}</div><p>{p.name}</p><div class="b-act"><button type="button" class="link danger" onClick={() => removePlanned(p.id)}>Togli dal piano</button></div></div>
}
/** Gli allenamenti aggiunti alla giornata di oggi. */
export function PlannedToday() {
  const d = data.value!, l = plannedOn(d.state, todayISO())
  if (!l.length) return null
  return <section class="panel"><p class="eyebrow">In più oggi</p>{l.map(p => { const a = d.activities.find(x => x.sessionKey === plannedKey(p)); return <div class="stack" key={p.id}><h2>{p.name}</h2>{a ? <div class="done"><strong>Registrato</strong><span>Bel lavoro</span></div> : <a class="btn ghost" href={`#/guida?planned=${p.id}`}>Inizia</a>}</div> })}</section>
}
function ToPlan({ w }: { w: Workout }) {
  const d = data.value!, plan = planFor(d), [date, setDate] = useState(todayISO()), [mode, setMode] = useState<'add' | 'replace'>('add'), [done, setDone] = useState('')
  const slot = slotForDate(buildTimeline(plan, { ...d.state, planned: [] }), date), ses = slot?.sessions.find(x => sessionDate(slot, x.day) === date)
  const can = !!ses && ses.km !== 0 && !ses.race && w.sport === 'corsa', use = can ? mode : 'add', past = date < todayISO()
  const go = () => { addPlanned({ id: uid(), workoutId: w.id, name: w.name, sport: w.sport, text: w.text, km: w.km, blocks: w.blocks, fiato: w.fiato, fatica: w.fatica, date, mode: use }); setDone(`Inserito per ${day(date)}.`) }
  const mine = (d.state.planned ?? []).filter(p => p.workoutId === w.id && p.date >= todayISO())
  return <section class="panel"><h2>Inserisci nel piano</h2>
    <Field label="Giorno"><input type="date" min={todayISO()} value={date} onChange={e => { setDate(e.currentTarget.value || todayISO()); setDone('') }} /></Field>
    {ses ? <p>Quel giorno è prevista: {ses.text}.</p> : <p>Quel giorno non ci sono sedute di corsa.</p>}
    {can && <><div class="seg" role="group" aria-label="Come inserirlo"><button type="button" class={mode === 'add' ? 'sel' : ''} aria-pressed={mode === 'add'} onClick={() => setMode('add')}>Aggiungi</button><button type="button" class={mode === 'replace' ? 'sel' : ''} aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>Al suo posto</button></div>
      {mode === 'replace' ? <Note>La seduta del piano viene sostituita solo quel giorno. Il carico della settimana cambia.</Note> : <Note>Sarebbero due allenamenti nello stesso giorno: valuta se il corpo è pronto.</Note>}</>}
    {ses?.race && <p class="sub">Il giorno della gara si può solo aggiungere.</p>}
    <button type="button" class="btn" disabled={past} onClick={go}>Inserisci nel piano</button>
    {done && <Note tone="go">{done}</Note>}
    {mine.map(p => <div class="ses-h" key={p.id}><span>{day(p.date)}{p.mode === 'replace' ? ', al posto della seduta' : ''}</span><button type="button" class="link danger" onClick={() => removePlanned(p.id)}>Togli dal piano</button></div>)}
  </section>
}
function Detail({ w }: { w: Workout }) {
  const [edit, setEdit] = useState(false), n = data.value!.workouts?.length ?? 0
  if (edit) return <Builder initial={w.blocks} sport={w.sport} fiato={w.fiato} fatica={w.fatica} named name={w.name} cta="Salva le modifiche" onCancel={() => setEdit(false)} onDone={b => { saveWorkout({ ...w, name: b.name, text: b.text, km: b.km, blocks: b.blocks, fiato: b.fiato || null, fatica: b.fatica || null }); setEdit(false) }} />
  const copy = () => { const id = uid(); saveWorkout({ ...w, id, name: `${w.name.slice(0, 52)} (copia)` }); nav('allenamenti/' + id) }
  return <div class="stack">
    <section class="head"><p class="eyebrow"><a href="#/allenamenti">I miei allenamenti</a></p><h1>{w.name}</h1><p>{facts(w)}</p>{(w.fiato || w.fatica) && <p class="sub">{[w.fiato, w.fatica ? `fatica ${w.fatica}` : null].filter(Boolean).join(', ')}</p>}</section>
    <section class="panel"><BlockList blocks={w.blocks} sport={w.sport} /></section>
    <a class="btn" href={`#/guida?workout=${w.id}`}>Avvia allenamento</a>
    <ToPlan w={w} />
    <div class="row"><button type="button" class="btn ghost" onClick={() => setEdit(true)}>Modifica</button><button type="button" class="btn ghost" disabled={n >= MAX_WORKOUTS} onClick={copy}>Duplica</button></div>
    <button type="button" class="btn ghost danger" onClick={() => { if (confirm(`Eliminare ${w.name}? Quello che hai già inserito nel piano resta.`)) { deleteWorkout(w.id); nav('allenamenti') } }}>Elimina</button>
  </div>
}
export function Workouts({ route }: { route: string }) {
  const list = data.value!.workouts ?? [], id = route.split('/')[1], w = list.find(x => x.id === id), [f, setF] = useState<'tutti' | 'corsa' | 'nuoto'>('tutti')
  if (w) return <Detail w={w} />
  const shown = list.filter(x => f === 'tutti' || x.sport === f)
  return <div class="stack">
    <section class="head"><h1>I miei allenamenti</h1><p>Salvali una volta, avviali quando vuoi o mettili nel piano.</p></section>
    {list.length < MAX_WORKOUTS ? <a class="btn" href="#/costruisci">Nuovo allenamento</a> : <Note>Hai raggiunto il massimo di {MAX_WORKOUTS} allenamenti.</Note>}
    {list.length > 0 && <div class="seg" role="group" aria-label="Filtra">{([['tutti', 'Tutti'], ['corsa', 'Corsa'], ['nuoto', 'Nuoto']] as const).map(([x, l]) => <button type="button" key={x} class={f === x ? 'sel' : ''} aria-pressed={f === x} onClick={() => setF(x)}>{l}</button>)}</div>}
    {!list.length && <p class="sub pad">Non hai ancora allenamenti salvati. Puoi crearne uno, oppure salvare una seduta dal piano.</p>}
    <ul class="cards">{shown.map(x => <li key={x.id}><a href={`#/allenamenti/${x.id}`}><span><b>{x.name}</b><small>{facts(x)}</small></span></a></li>)}</ul>
  </div>
}
