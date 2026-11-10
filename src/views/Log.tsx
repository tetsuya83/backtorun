import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { data, deleteActivity, imports, saveActivity, uid } from '../api'
import { buildTimeline, isCustom, planFor, sessionDate, sessionKey, type Activity } from '../../shared/engine'
import { fmtDate, PAIN as words, todayISO, WEEKDAY } from '../guide'
import { stepsOf, watchSegments } from '../../shared/segments'
import { shoeOf } from '../../shared/shoes'
import { breathHint, Field, goBack, nav, Note, Scale } from '../ui'
import { paceOf, parseActivityFile, timeOf, type FitResult } from '../fit'
import { looksLikeRoute, openRouteGpx } from './Routes'
import { painsOf, watchedZones, withPains, type Pain } from '../../shared/pain'
import { PainPicker } from './Pain'
import { RESULT, type GuideResult } from './Guide'
import { local } from '../sound'

const TYPES = [['corsa', 'Corsa'], ['forza', 'Forza'], ['nuoto', 'Nuoto'], ['bici', 'Bici'], ['altro', 'Altro']] as const
type Hms = { h: string; m: string; s: string }
const split = (t?: number | null): Hms => { if (!t) return { h: '', m: '', s: '' }; return { h: t >= 3600 ? String(Math.floor(t / 3600)) : '', m: String(Math.floor(t % 3600 / 60)), s: String(t % 60).padStart(2, '0') } }
/** Ore, minuti e secondi in tre campi: null se vuoti, NaN se un campo non è un numero valido. */
const toSec = (x: Hms) => { if (!x.h.trim() && !x.m.trim() && !x.s.trim()) return null; const [h, m, s] = [x.h, x.m, x.s].map(v => v.trim() === '' ? 0 : /^\d+$/.test(v.trim()) ? +v : NaN); return m > 59 && h > 0 || s > 59 ? NaN : h * 3600 + m * 60 + s }
const num = (v: string) => v === '' ? null : +v.replace(',', '.')

export function Log({ route }: { route: string }) {
  const d = data.value!, q = new URLSearchParams(route.split('?')[1] ?? '')
  const plan = planFor(d), custom = isCustom(plan)
  const t = useMemo(() => buildTimeline(plan, d.state), [plan, d.state])
  const existing = d.activities.find(a => a.id === q.get('id'))
  const blank = (): Activity => {
    const g = q.get('guide') ? local.get<GuideResult>(RESULT) : null
    return { id: uid(), date: q.get('date') ?? todayISO(), type: (q.get('type') as Activity['type']) ?? 'corsa', sessionKey: q.get('key'), source: 'manuale', ...(g ?? {}) }
  }
  const [a, setA] = useState<Activity>(() => existing ?? blank())
  const [dur, setDur] = useState<Hms>(split(existing?.seconds ?? a.seconds ?? (q.get('sec') ? +q.get('sec')! : null)))
  const must = a.type === 'corsa' ? watchedZones(d) : []
  const [pains, setPains] = useState<Pain[]>(() => painsOf(a, custom ? 'altro' : 'ginocchio'))
  const shown = [...must.filter(z => !pains.some(p => p.zone === z)).map(zone => ({ zone, level: 0 })), ...pains]
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const up = (p: Partial<Activity>) => setA(x => ({ ...x, ...p }))
  const options = t.slots.flatMap(s => s.sessions.filter(x => x.km !== 0).map(x => ({ key: sessionKey(s, x.day), date: sessionDate(s, x.day), s, x })))
  const near = options.filter(o => o.date === a.date || o.key === a.sessionKey)
  const linked = options.find(o => o.key === a.sessionKey)
  const applyFit = (f: FitResult, name: string) => {
    const match = f.type === 'corsa' ? options.find(o => o.date === f.date) : undefined
    const { sport, laps, lapList, ...rest } = f
    const steps = stepsOf((match ?? options.find(o => o.key === a.sessionKey))?.x), seg = f.type === 'corsa' ? watchSegments(lapList, steps) : null
    setA(x => ({ ...x, ...rest, ...(seg?.guide || !x.guide?.length ? seg : null), sessionKey: match?.key ?? x.sessionKey ?? null }))
    setDur(split(f.seconds)); setErr('')
    setMsg(`${name}: ${f.km} km in ${timeOf(f.seconds)}${match ? ', collegato alla seduta del giorno' : ', data ' + fmtDate(f.date, { day: 'numeric', month: 'long' })}.`)
  }
  const onFile = async (f?: File | null) => {
    if (!f) return
    try {
      const b = await f.arrayBuffer(), t = new TextDecoder().decode(b)
      if (looksLikeRoute(t)) { openRouteGpx(t); return }
      applyFit(await parseActivityFile(b), f.name)
    }
    catch (e: any) { setErr(e.message ?? 'Non riesco a leggere questo file.'); setMsg('') }
    finally { if (file.current) file.current.value = '' }
  }
  useEffect(() => { // file ricevuto da "Condividi" su Android
    if (!location.search.includes('shared=1') || !('caches' in window)) return
    void (async () => {
      const c = await caches.open('btr-share'), r = await c.match('/shared.fit')
      if (r) {
        try {
          const b = await r.arrayBuffer(), t = new TextDecoder().decode(b)
          if (looksLikeRoute(t)) openRouteGpx(t)
          else applyFit(await parseActivityFile(b), decodeURIComponent(r.headers.get('x-name') ?? 'File'))
        }
        catch (e: any) { setErr(e.message) }
        await c.delete('/shared.fit')
      }
      history.replaceState(null, '', location.pathname + location.hash)
    })()
  }, [])
  useEffect(() => { // allenamento proposto in Home: file originale, oppure il riepilogo se il file manca
    const id = q.get('intervals')
    if (!id) return
    const r = imports.value.find(x => x.id === id)
    setMsg('Scarico l\'allenamento…')
    void (async () => {
      try {
        const res = await fetch(`/api/intervals/file/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error('file')
        const f = await parseActivityFile(await res.arrayBuffer())
        applyFit({ ...f, type: r?.type ?? f.type, externalId: id }, r?.name || 'Allenamento')
      } catch {
        if (r) applyFit({ date: r.date, type: r.type, km: r.km, seconds: r.seconds, hrAvg: r.hrAvg, hrMax: r.hrMax, ascent: r.ascent, source: 'intervals', externalId: id, sport: '', laps: 0 }, 'Solo riepilogo, senza dettagli')
        else { setMsg(''); setErr('Non riesco a scaricare l\'allenamento. Riprova da Oggi.') }
      }
    })()
  }, [])
  const save = (e: Event) => {
    e.preventDefault()
    const secs = toSec(dur)
    if (secs != null && !Number.isFinite(secs)) { setErr('Controlla la durata: ore, minuti e secondi sono numeri interi, secondi fino a 59.'); return }
    if (a.type === 'corsa' && a.fatica == null) { setErr('Indica la fatica: serve a capire come procedere.'); return }
    saveActivity({ ...withPains(a, shown), seconds: secs }); if (q.get('guide')) local.del(RESULT); setSaved(true); setErr('')
    setTimeout(() => q.get('guide') ? nav('home') : goBack('home'), 500)
  }
  const secsNow = toSec(dur), pace = paceOf(a.km, secsNow != null && Number.isFinite(secsNow) ? secsNow : null)
  const isRun = a.type === 'corsa'
  const pairs = (d.state.shoes ?? []).filter(x => !x.retired || x.id === a.shoe)
  const quick = !!(q.get('guide') || q.get('intervals') || location.search.includes('shared=1') || (existing && (existing.km || existing.seconds)))
  const kmField = a.type !== 'forza' && <Field label="Distanza (km)"><input inputMode="decimal" value={a.km ?? ''} onInput={e => up({ km: num(e.currentTarget.value) })} /></Field>
  const durField = <fieldset class="hms"><legend>Durata</legend><div>
    <label><input inputMode="numeric" aria-label="Ore" value={dur.h} placeholder="0" onInput={e => setDur({ ...dur, h: e.currentTarget.value })} /><span>ore</span></label>
    <label><input inputMode="numeric" aria-label="Minuti" value={dur.m} placeholder="0" onInput={e => setDur({ ...dur, m: e.currentTarget.value })} /><span>min</span></label>
    <label><input inputMode="numeric" aria-label="Secondi" value={dur.s} placeholder="00" onInput={e => setDur({ ...dur, s: e.currentTarget.value })} /><span>sec</span></label>
  </div></fieldset>
  const core = <>{kmField}{durField}{pace && a.type !== 'forza' && <p class="sub">Ritmo medio {pace}</p>}</>
  const expected = linked?.x.fatica ? ` Attesa ${/^\d/.test(linked.x.fatica) ? linked.x.fatica : linked.x.fatica.toLowerCase()}` : ''
  return (
    <form class="stack form log" onSubmit={save}>
      <section class="head"><h1>{existing ? 'Modifica allenamento' : q.get('guide') ? "Com'è andata?" : 'Registra allenamento'}</h1>
        {linked && <p class="sub">{WEEKDAY[linked.x.day]} {fmtDate(linked.date, { day: 'numeric', month: 'long' })} · {linked.x.text}</p>}</section>
      {quick && (a.km || a.seconds) ? <div class="stats run"><div><b>{timeOf(a.seconds) ?? '-'}</b><span>tempo</span></div><div><b>{a.km ?? '-'}</b><span>km</span></div>{paceOf(a.km, a.seconds) && <div><b>{paceOf(a.km, a.seconds)!.replace('/km', '')}</b><span>al km</span></div>}</div> : null}
      {msg && <Note tone="go">{msg}</Note>}
      {!quick && !linked && <div class="seg" role="group" aria-label="Tipo di attività">{TYPES.map(([id, l]) => <button type="button" key={id} class={a.type === id ? 'sel' : ''} aria-pressed={a.type === id} onClick={() => up({ type: id })}>{l}</button>)}</div>}
      {a.type === 'forza' && !existing && <a class="btn ghost" href={`#/forza?date=${a.date}`}>Usa la scheda guidata</a>}
      {!quick && <div class="grid2">{core}</div>}
      {isRun && <Scale label="Com'era il fiato?" max={5} value={a.fiato} onChange={v => up({ fiato: v })} hint={breathHint(a.fiato)} />}
      <Scale label={`Quanta fatica?${expected}`} max={10} value={a.fatica} onChange={v => up({ fatica: v })} />
      <PainPicker value={shown} onChange={setPains} required={must} />
      {isRun && pairs.length > 0 && <div class="field"><span>Scarpe</span><div class="seg chips-row" role="group" aria-label="Scarpe">{[...pairs.map(x => [x.id, x.name] as const), [null, 'Nessuna'] as const].map(([id, l]) => <button type="button" key={id ?? '-'} class={shoeOf(a, d.state) === id ? 'sel' : ''} aria-pressed={shoeOf(a, d.state) === id} onClick={() => up({ shoe: id })}>{l}</button>)}</div></div>}
      {isRun && <label class="check"><input type="checkbox" checked={!!a.locked} onChange={e => up({ locked: e.currentTarget.checked })} /> {words.locked}</label>}
      <Field label="Note"><input value={a.note ?? ''} onInput={e => up({ note: e.currentTarget.value })} placeholder={isRun ? 'Sonno, freddo, intestino, sensazioni' : 'Esercizi, carichi, sensazioni'} /></Field>
      <details class="more">
        <summary><b>Dettagli</b><span>{a.type === 'forza' ? 'data e scheda' : 'data, battiti, intertempi, file'}</span></summary>
        <div class="stack">
          {(quick || linked) && <div class="seg" role="group" aria-label="Tipo di attività">{TYPES.map(([id, l]) => <button type="button" key={id} class={a.type === id ? 'sel' : ''} aria-pressed={a.type === id} onClick={() => up({ type: id })}>{l}</button>)}</div>}
          <Field label="Data"><input type="date" value={a.date} onInput={e => up({ date: e.currentTarget.value, sessionKey: null })} required /></Field>
          {isRun && near.length > 0 && !a.sessionKey?.startsWith('p-') && <Field label="Seduta del piano"><select value={a.sessionKey ?? ''} onChange={e => up({ sessionKey: e.currentTarget.value || null })}><option value="">Corsa extra</option>{near.map(o => <option key={o.key} value={o.key}>{o.x.text}</option>)}</select></Field>}
          {quick && <div class="grid2">{core}</div>}
          {a.type !== 'forza' && <div class="grid3">
            <Field label="FC media"><input inputMode="numeric" value={a.hrAvg ?? ''} onInput={e => up({ hrAvg: num(e.currentTarget.value) })} /></Field>
            <Field label="FC max"><input inputMode="numeric" value={a.hrMax ?? ''} onInput={e => up({ hrMax: num(e.currentTarget.value) })} /></Field>
            {isRun && <Field label="FC ultimo km"><input inputMode="numeric" value={a.hrLast ?? ''} onInput={e => up({ hrLast: num(e.currentTarget.value) })} /></Field>}
          </div>}
          {isRun && <Field label="Intertempi"><input value={a.splits ?? ''} onInput={e => up({ splits: e.currentTarget.value })} placeholder={`6'29" - 6'16"`} /></Field>}
          {a.type !== 'forza' && (a.source === 'manuale' || a.source === 'gps') && <>
            <input ref={file} type="file" hidden onChange={e => onFile(e.currentTarget.files?.[0])} />
            <button type="button" class="btn ghost" onClick={() => file.current?.click()}>Carica file FIT, GPX o TCX</button>
            <p class="sub">Da Suunto, Garmin, Coros, Polar, Strava e altre app: esporta il file e caricalo qui.</p>
          </>}
          {!!a.sets?.length && <ul class="sets-sum">{a.sets.map(x => <li key={x.id}><b>{x.name}</b> {x.sets.map(s => (s.kg ? `${s.kg} kg × ` : '') + s.reps).join(', ')}</li>)}</ul>}
        </div>
      </details>
      {existing?.trace?.length ? <a class="btn ghost" href={`#/corsa?id=${existing.id}`}>Dettaglio corsa</a> : null}
      {err && <p class="err" role="alert">{err}</p>}
      <div class="savebar"><button class="btn" disabled={saved}>{saved ? 'Salvato' : 'Salva'}</button></div>
      {existing && <button type="button" class="btn ghost danger" onClick={() => { if (confirm('Eliminare questo allenamento?')) { deleteActivity(a.id); goBack('diario') } }}>Elimina allenamento</button>}
    </form>
  )
}
