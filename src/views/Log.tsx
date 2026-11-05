import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { data, deleteActivity, imports, saveActivity, uid } from '../api'
import { buildTimeline, isCustom, planFor, sessionDate, sessionKey, type Activity } from '../../shared/engine'
import { fmtDate, PAIN as words, todayISO, WEEKDAY } from '../guide'
import { breathHint, Field, Gauge, nav, Note, Scale } from '../ui'
import { paceOf, parseActivityFile, timeOf, type FitResult } from '../fit'
import { looksLikeRoute, openRouteGpx } from './Routes'
import { painsOf, watchedZones, withPains, type Pain } from '../../shared/pain'
import { PainPicker } from './Pain'
import { RESULT, type GuideResult } from './Guide'
import { local } from '../sound'

const TYPES = [['corsa', 'Corsa'], ['forza', 'Forza'], ['nuoto', 'Nuoto'], ['bici', 'Bici'], ['altro', 'Altro']] as const
const toSec = (s: string) => { const m = s.trim().match(/^(?:(\d+):)?(\d+)(?::(\d{1,2}))?$/); if (!m) return null; if (m[3] != null) return +(m[1] ?? 0) * 3600 + +m[2] * 60 + +m[3]; if (m[1] != null) return +m[1] * 60 + +m[2]; return +m[2] * 60 }
const fromSec = (s?: number | null) => { if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }
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
  const [dur, setDur] = useState(fromSec(existing?.seconds ?? a.seconds ?? (q.get('sec') ? +q.get('sec')! : null)))
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
    const { sport, laps, ...rest } = f
    setA(x => ({ ...x, ...rest, sessionKey: match?.key ?? x.sessionKey ?? null }))
    setDur(fromSec(f.seconds)); setErr('')
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
        else { setMsg(''); setErr('Non riesco a scaricare l\'allenamento. Riprova dalla Home.') }
      }
    })()
  }, [])
  const save = (e: Event) => {
    e.preventDefault()
    const secs = dur ? toSec(dur) : null
    if (dur && secs == null) { setErr('Scrivi la durata come 45:30 oppure 1:12:00.'); return }
    if (a.type === 'corsa' && a.fatica == null) { setErr('Indica la fatica: serve a capire come procedere.'); return }
    saveActivity({ ...withPains(a, shown), seconds: secs }); if (q.get('guide')) local.del(RESULT); setSaved(true); setErr('')
    setTimeout(() => nav('oggi'), 500)
  }
  const pace = paceOf(a.km, dur ? toSec(dur) : null)
  const isRun = a.type === 'corsa'
  return (
    <form class="stack form" onSubmit={save}>
      <section class="head"><h1>{existing ? 'Modifica allenamento' : 'Registra allenamento'}</h1></section>
      {linked && <section class="panel"><h2>{WEEKDAY[linked.x.day]}: {linked.x.text}</h2><Gauge fiato={linked.x.fiato} fatica={linked.x.fatica} /></section>}
      {a.type !== 'forza' && (a.source === 'manuale' || a.source === 'gps') && <section class="panel"><h2>Hai il file dell'allenamento?</h2><p>Da Suunto, Garmin, Coros, Polar, Strava e altre app: esporta il file e caricalo qui.</p>
        <input ref={file} type="file" hidden onChange={e => onFile(e.currentTarget.files?.[0])} />
        <button type="button" class="btn ghost" onClick={() => file.current?.click()}>Carica file FIT, GPX o TCX</button></section>}
      {msg && <Note tone="go">{msg}</Note>}
      {a.type === 'forza' && !existing && <a class="btn ghost" href={`#/forza?date=${a.date}`}>Usa la scheda guidata</a>}
      {existing?.trace?.length ? <a class="btn ghost" href={`#/corsa?id=${existing.id}`}>Dettaglio corsa</a> : null}
      {!!a.sets?.length && <section class="panel"><h2>Scheda</h2><ul class="sets-sum">{a.sets.map(x => <li key={x.id}><b>{x.name}</b> {x.sets.map(s => (s.kg ? `${s.kg} kg × ` : '') + s.reps).join(', ')}</li>)}</ul></section>}
      <div class="seg" role="group" aria-label="Tipo di attività">{TYPES.map(([id, l]) => <button type="button" key={id} class={a.type === id ? 'sel' : ''} aria-pressed={a.type === id} onClick={() => up({ type: id })}>{l}</button>)}</div>
      <Field label="Data"><input type="date" value={a.date} onInput={e => up({ date: e.currentTarget.value, sessionKey: null })} required /></Field>
      {isRun && near.length > 0 && !a.sessionKey?.startsWith('p-') && <Field label="Seduta del piano"><select value={a.sessionKey ?? ''} onChange={e => up({ sessionKey: e.currentTarget.value || null })}><option value="">Corsa extra</option>{near.map(o => <option key={o.key} value={o.key}>{o.x.text}</option>)}</select></Field>}
      <div class="grid2">
        {a.type !== 'forza' && <Field label="Distanza (km)"><input inputMode="decimal" value={a.km ?? ''} onInput={e => up({ km: num(e.currentTarget.value) })} /></Field>}
        <Field label="Durata (mm:ss)"><input inputMode="numeric" placeholder="45:30" value={dur} onInput={e => setDur(e.currentTarget.value)} /></Field>
      </div>
      {pace && a.type !== 'forza' && <p class="sub">Ritmo medio {pace}</p>}
      {a.type !== 'forza' && <div class="grid3">
        <Field label="FC media"><input inputMode="numeric" value={a.hrAvg ?? ''} onInput={e => up({ hrAvg: num(e.currentTarget.value) })} /></Field>
        <Field label="FC max"><input inputMode="numeric" value={a.hrMax ?? ''} onInput={e => up({ hrMax: num(e.currentTarget.value) })} /></Field>
        {isRun && <Field label="FC ultimo km"><input inputMode="numeric" value={a.hrLast ?? ''} onInput={e => up({ hrLast: num(e.currentTarget.value) })} /></Field>}
      </div>}
      {isRun && <Field label="Intertempi"><input value={a.splits ?? ''} onInput={e => up({ splits: e.currentTarget.value })} placeholder={`6'29" - 6'16"`} /></Field>}
      {isRun && <Scale label="Com'era il fiato?" max={5} value={a.fiato} onChange={v => up({ fiato: v })} hint={breathHint(a.fiato)} />}
      <Scale label="Quanta fatica?" max={10} value={a.fatica} onChange={v => up({ fatica: v })} />
      <PainPicker value={shown} onChange={setPains} required={must} />
      {isRun && <label class="check"><input type="checkbox" checked={!!a.locked} onChange={e => up({ locked: e.currentTarget.checked })} /> {words.locked}</label>}
      <Field label="Note"><textarea rows={3} value={a.note ?? ''} onInput={e => up({ note: e.currentTarget.value })} placeholder={isRun ? 'Sonno, freddo, intestino, sensazioni' : 'Esercizi, carichi, sensazioni'} /></Field>
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn" disabled={saved}>{saved ? 'Salvato' : 'Salva allenamento'}</button>
      {existing && <button type="button" class="btn ghost danger" onClick={() => { if (confirm('Eliminare questo allenamento?')) { deleteActivity(a.id); nav('oggi') } }}>Elimina allenamento</button>}
          </form>
  )
}
export function History() {
  const list = [...data.value!.activities].reverse().slice(0, 12)
  if (!list.length) return null
  return <section><h2 class="phase">Storico</h2><ul class="hist">{list.map(a => <li key={a.id}><a href={`#/registra?id=${a.id}`}><b>{fmtDate(a.date, { day: 'numeric', month: 'short' })}</b><span>{TYPES.find(t => t[0] === a.type)?.[1]}{a.km ? `, ${a.km} km` : ''}{a.fatica ? `, fatica ${a.fatica}` : ''}</span></a></li>)}</ul></section>
}
