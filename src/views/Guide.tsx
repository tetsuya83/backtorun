import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { data } from '../api'
import { advance, blocksOf, EFFORTS, finishStep, guideProgress, guideSteps, startGuide, stepLeft, timedAhead, type Block, type GStep, type GuideState } from '../../shared/blocks'
import { buildTimeline, planFor, sessionKey } from '../../shared/engine'
import { addFix, newTrack } from '../../shared/gps'
import { hrMaxOf, kmSplits, zoneHint, zonesFrom } from '../../shared/analysis'
import { cooldownFor, totalOf, warmupFor } from '../../shared/training'
import { buzz, clearScheduled, keepAwake, local, say, schedule, unlockSound, type Cue } from '../sound'
import { BlockList, nav, Note } from '../ui'
import { timeOf, paceOf } from '../fit'
import { learnFor } from '../learn'
import type { Activity } from '../../shared/engine'

const KEY = 'btr-guide'
export const RESULT = 'btr-guide-result'
export const FREE = 'btr-guide-free'
type Mode = 'gps' | 'watch'
type Trace = NonNullable<Activity['trace']>
interface Saved { sig: string; st: GuideState; last: number | null; mode: Mode; trace: Trace }
export interface GuideResult { km: number | null; seconds: number; trace: Trace | null; splits: string | null; guide: GuideState['laps']; source: 'gps' | 'manuale' }
const clock = (s: number) => { const t = Math.max(0, Math.ceil(s)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` : `${m}:${String(t % 60).padStart(2, '0')}` }
const kmText = (m: number) => m >= 1000 ? (m / 1000).toFixed(2).replace('.', ',') : String(Math.round(m))
const fmtSplit = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`
const stepText = (c?: GStep) => !c ? '' : `${c.label} ${c.m ? kmText(c.m) + (c.m >= 1000 ? ' km' : ' m') : clock(c.sec ?? 0)}`

type Gps = 'off' | 'cerco' | 'ok' | 'debole' | 'negato'
/** Ascolta il GPS del telefono. I metri passano solo mentre la seduta è in corso. */
function useGps(on: boolean, sink: (m: number, alt?: number | null) => void) {
  const [status, setStatus] = useState<Gps>(on ? 'cerco' : 'off')
  const tr = useRef(newTrack())
  useEffect(() => {
    if (!on) { setStatus('off'); return }
    if (!('geolocation' in navigator)) { setStatus('negato'); return }
    setStatus('cerco')
    const id = navigator.geolocation.watchPosition(p => {
      const m = addFix(tr.current, { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp, alt: p.coords.altitude })
      setStatus(tr.current.weak ? 'debole' : 'ok')
      sink(m, p.coords.altitude)
    }, e => setStatus(e.code === e.PERMISSION_DENIED ? 'negato' : 'debole'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [on])
  return { status, reset: () => { tr.current.last = null } }
}
const GPS_TEXT: Record<Gps, string> = { off: '', cerco: 'Cerco il GPS', ok: 'GPS pronto', debole: 'GPS debole', negato: 'GPS non disponibile' }

function Player({ steps, sig, title, mode, regUrl }: { steps: GStep[]; sig: string; title: string; mode: Mode; regUrl: string }) {
  const saved = useMemo(() => { const s = local.get<Saved>(KEY); return s?.sig === sig ? s : null }, [sig])
  const st = useRef<GuideState>(saved?.st ?? startGuide()), last = useRef<number | null>(null), pendingM = useRef(0)
  const trace = useRef<Trace>(saved?.trace ?? []), alt = useRef<number | null>(null), mark = useRef(0), kmSaid = useRef(Math.floor((saved?.st.dist ?? 0) / 1000))
  const [, tick] = useState(0), [run, setRun] = useState(false), [locked, setLocked] = useState(false), [ended, setEnded] = useState(false)
  const sleep = useRef<null | (() => void)>(null), hold = useRef<any>(null), near = useRef(-1)
  const useGpsNow = mode === 'gps'
  const gps = useGps(useGpsNow, (m, a) => { if (a != null) alt.current = a; if (last.current != null) pendingM.current += m })
  const hr = useMemo(() => { const m = hrMaxOf(data.value!); return m ? zonesFrom(m) : null }, [])
  const store = () => local.set(KEY, { sig, st: st.current, last: last.current, mode, trace: trace.current } satisfies Saved)
  const queue = () => { // suoni in anticipo solo fin dove il tempo è certo
    clearScheduled()
    const list: { at: number; cue: Cue }[] = []
    for (const x of timedAhead(steps, st.current)) {
      if (x.at > 4) for (const p of [3, 2, 1]) list.push({ at: x.at - p, cue: 'pip' })
      list.push({ at: x.at, cue: x.next ? x.next.tone : 'end' })
    }
    schedule(list)
  }
  const announce = (fromDistance: boolean) => {
    const c = steps[st.current.i]
    buzz(c.tone === 'work' ? [250, 100, 250] : 500)
    if (fromDistance) schedule([{ at: 0, cue: c.tone }])
    if (document.visibilityState === 'visible') say(c.label)
    near.current = -1
    queue()
  }
  const point = () => { const s = st.current; trace.current = [...trace.current, [Math.round(s.total), null, Math.round(s.dist), alt.current != null ? Math.round(alt.current) : null, null]]; mark.current = s.total }
  const finish = () => {
    clearScheduled(); sleep.current?.(); sleep.current = null; last.current = null; point(); setRun(false); setLocked(false); setEnded(true); local.del(KEY)
  }
  const step = () => {
    const now = Date.now(), dt = last.current ? (now - last.current) / 1000 : 0, dm = pendingM.current
    last.current = now; pendingM.current = 0
    const was = st.current, wasStep = steps[was.i], next = advance(steps, was, dt, dm)
    st.current = next
    if (next.done) { buzz([300, 120, 300, 120, 500]); say('Finito'); finish(); return }
    if (next.i !== was.i) announce(!!wasStep.m)
    const c = steps[next.i]
    if (c.m && useGpsNow && c.m - next.m <= 100 && c.m >= 300 && near.current !== next.i) { near.current = next.i; schedule([{ at: 0, cue: 'pip' }]) }
    const km = Math.floor(next.dist / 1000)
    if (useGpsNow && km > kmSaid.current) { kmSaid.current = km; if (document.visibilityState === 'visible') say(`${km} ${km === 1 ? 'chilometro' : 'chilometri'}`) }
    if (next.total - mark.current >= 10) { point(); store() }
    tick(n => n + 1)
  }
  useEffect(() => { const iv = setInterval(() => { if (last.current != null) step() }, 500); return () => { clearInterval(iv); clearScheduled(); sleep.current?.() } }, [sig])
  const go = () => { unlockSound(); gps.reset(); last.current = Date.now(); sleep.current ??= keepAwake(); setRun(true); setLocked(true); store(); queue(); say(steps[st.current.i].label); tick(n => n + 1) }
  const pause = () => { step(); last.current = null; pendingM.current = 0; clearScheduled(); sleep.current?.(); sleep.current = null; setRun(false); store() }
  const next = () => { // Fatto o Salta: con l'orologio il tratto vale quanto previsto
    const c = steps[st.current.i], s = st.current, full = !useGpsNow && c.m ? c.m : s.m
    st.current = finishStep(steps, { ...s, m: full, dist: s.dist + full - s.m })
    if (st.current.done) { finish(); return }
    announce(false); store(); tick(n => n + 1)
  }
  const s = st.current, c = steps[s.i], after = steps[s.i + 1], left = stepLeft(c, s), byDist = c.m != null && c.m > 0
  const tap = byDist && !useGpsNow
  const hint = c.effort && EFFORTS[c.effort].zone ? zoneHint(EFFORTS[c.effort].zone!, hr) : null
  if (ended) {
    const km = s.dist >= 50 ? Math.round(s.dist / 10) / 100 : null, seconds = Math.round(s.total)
    const save = () => {
      const tr = trace.current, every = Math.max(1, Math.ceil(tr.length / 240)), kept = useGpsNow && km ? tr.filter((_, i) => i % every === 0 || i === tr.length - 1) : null
      local.set(RESULT, { km, seconds, trace: kept, splits: kept ? kmSplits(tr).filter(x => !x.partial).map(x => fmtSplit(x.seconds)).join(' - ') || null : null, guide: s.laps, source: useGpsNow && km ? 'gps' : 'manuale' } satisfies GuideResult)
      location.hash = regUrl
    }
    return <div class="stack"><section class="hero"><p class="eyebrow">{title}</p><h1>Finito</h1>
      <div class="stats run"><div><b>{timeOf(seconds) ?? `0'00"`}</b><span>tempo</span></div><div><b>{km ?? '-'}</b><span>km{!useGpsNow && km ? ' previsti' : ''}</span></div><div><b>{paceOf(km, seconds)?.replace('/km', '') ?? '-'}</b><span>al km</span></div></div>
      <button class="btn" onClick={save}>Registra allenamento</button></section>
      {!useGpsNow && <Note>Con l'orologio i dati esatti sono nel suo file: puoi caricarlo nella pagina di registrazione.</Note>}
      <section><h2 class="phase">Tratti</h2><table class="splits"><tbody>{s.laps.map((l, i) => <tr key={i}><td>{l.label}</td><td>{clock(l.sec)}</td><td>{l.m ? `${kmText(l.m)}${l.m >= 1000 ? ' km' : ' m'}` : ''}</td></tr>)}</tbody></table></section>
    </div>
  }
  return (
    <div class="stack timer" data-tone={c.tone}>
      <p class="eyebrow">{title}</p>
      {useGpsNow && <span class={'gps ' + (gps.status === 'ok' ? 'ok' : gps.status === 'negato' || gps.status === 'debole' ? 'bad' : '')} role="status">{GPS_TEXT[gps.status]}</span>}
      <section class="tm" aria-live="off">
        <p class="tm-label">{c.label}</p>
        {byDist && !tap ? <p class="tm-time">{kmText(left.m!)}<small>{left.m! >= 1000 ? ' km' : ' m'}</small></p> : tap ? <p class="tm-time">{kmText(c.m!)}<small>{c.m! >= 1000 ? ' km' : ' m'}</small></p> : <p class="tm-time">{clock(left.sec ?? 0)}</p>}
        {byDist && <p class="sub">{tap ? `Guarda l'orologio e tocca Fatto. Sei a ${clock(s.t)}` : `Da ${clock(s.t)}`}{c.sec ? `, massimo ${clock(c.sec)}` : ''}</p>}
        {c.cue && <p class="tm-cue">{c.cue}</p>}
        {hint && <p class="zonehint">{hint}</p>}
        <div class="tm-bar"><i style={{ width: `${guideProgress(steps, s) * 100}%` }} /></div>
        <p class="sub">{after ? `Poi: ${stepText(after)}` : 'Ultimo tratto'}. In tutto {clock(s.total)}{useGpsNow && s.dist > 0 ? `, ${kmText(s.dist)}${s.dist >= 1000 ? ' km' : ' m'}` : ''}</p>
      </section>
      <div class="row">
        {run ? <button class="btn" onClick={pause}>Pausa</button> : <button class="btn" onClick={go}>{s.total > 0 ? 'Riprendi' : 'Avvia'}</button>}
        <button class={'btn' + (tap ? '' : ' ghost')} onClick={next}>{tap ? 'Fatto' : 'Salta'}</button>
      </div>
      {s.total > 0 && <button class="btn ghost" onClick={finish}>Termina qui</button>}
      {gps.status === 'negato' && <Note tone="stop"><strong>Non riesco a usare il GPS.</strong> Controlla il permesso di posizione del browser, oppure torna indietro e scegli l'orologio.</Note>}
      <Note>Tieni l'app aperta e lo schermo acceso: a telefono bloccato GPS, suoni e vibrazione possono fermarsi. Se compare dolore, cammina e fermati.</Note>
      {locked && <div class="veil"><button class="btn ghost hold" onPointerDown={() => { hold.current = setTimeout(() => setLocked(false), 800) }} onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)} onContextMenu={e => e.preventDefault()}>Tieni premuto per sbloccare</button></div>}
    </div>
  )
}
const fromSaved = (sig: string) => local.get<Saved>(KEY)?.sig === sig

/** Prepara la seduta: schema, fonte della distanza, riscaldamento. */
export function GuideView({ route }: { route: string }) {
  const d = data.value!, q = new URLSearchParams(route.split('?')[1] ?? ''), key = q.get('key'), date = q.get('date')
  const ses = useMemo(() => { if (!key) return null; const plan = planFor(d); for (const s of buildTimeline(plan, d.state).slots) for (const x of s.sessions) if (sessionKey(s, x.day) === key) return x; return null }, [key])
  const free = useMemo(() => q.get('free') ? local.get<{ blocks: Block[]; text: string }>(FREE) : null, [])
  const blocks = ses ? blocksOf(ses) : free?.blocks ?? null, title = ses?.text ?? free?.text ?? 'Allenamento'
  const steps = useMemo(() => blocks ? guideSteps(blocks) : [], [blocks]), sig = `g${key ?? title}`
  const needsDist = steps.some(s => s.m)
  const [mode, setMode] = useState<Mode>(d.state.watch ? 'watch' : 'gps'), [start, setStart] = useState(() => fromSaved(sig))
  if (!blocks) return <div class="stack"><section class="head"><h1>Seduta non guidabile</h1><p>Questa seduta non ha blocchi. Puoi costruirne una adesso.</p></section><a class="btn" href="#/costruisci">Costruisci allenamento</a></div>
  const reg = `#/registra?${key ? `key=${encodeURIComponent(key)}&date=${date}&` : ''}guide=1`
  const m = local.get<Saved>(KEY)
  if (start) return <Player steps={steps} sig={sig} title={title} mode={m?.sig === sig ? m.mode : mode} regUrl={reg} />
  const warm = warmupFor(title), cool = cooldownFor(title, ses?.km), art = learnFor(title), hasWarm = blocks.some(b => b.kind === 'warm')
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Allenamento guidato</p><h1>{title}</h1>{ses && (ses.fiato || ses.fatica) && <p>{[ses.fiato, ses.fatica ? `fatica ${ses.fatica}` : null].filter(Boolean).join(', ')}</p>}</section>
    <section class="panel"><BlockList blocks={blocks} /></section>
    {needsDist && <fieldset class="scale"><legend>Come misuri la distanza?</legend><div class="seg"><button type="button" class={mode === 'gps' ? 'sel' : ''} aria-pressed={mode === 'gps'} onClick={() => setMode('gps')}>GPS del telefono</button><button type="button" class={mode === 'watch' ? 'sel' : ''} aria-pressed={mode === 'watch'} onClick={() => setMode('watch')}>Orologio</button></div>
      <small>{mode === 'gps' ? 'I tratti a distanza finiscono da soli.' : "Guardi i km sull'orologio e tocchi Fatto a fine tratto."}</small></fieldset>}
    {!hasWarm && <a class="btn ghost" href={`#/routine?id=${warm.id}`}>Prima: {warm.name}, {Math.round(totalOf(warm.steps) / 60)} min</a>}
    <button class="btn" onClick={() => { unlockSound(); setStart(true) }}>Prepara la partenza</button>
    {art && <a class="btn ghost" href={`#/impara/${art.id}`}>Cos'è: {art.title}</a>}
    <a class="btn ghost" href={`#/routine?id=${cool.id}`}>Dopo: {cool.name}</a>
    {reg && <button type="button" class="link" onClick={() => nav(reg.slice(2).replace('guide=1', '').replace(/&$/, ''))}>Registra senza guida</button>}
  </div>
}
