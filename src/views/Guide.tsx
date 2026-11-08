import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { data } from '../api'
import { advance, blocksOf, effortInfo, finishStep, guideProgress, guideSteps, startGuide, stepLeft, timedAhead, type Block, type GStep, type GuideState, type Sport } from '../../shared/blocks'
import { buildTimeline, plannedKey, planFor, sessionKey } from '../../shared/engine'
import { addFix, newTrack } from '../../shared/gps'
import { kmSplits, zoneHint, zonesOf } from '../../shared/analysis'
import { cooldownFor, totalOf, warmupFor } from '../../shared/training'
import { buzz, clearScheduled, keepAwake, local, say, schedule, unlockSound, type Cue } from '../sound'
import { BlockList, goBack, nav, Note } from '../ui'
import { timeOf, paceOf } from '../fit'
import { learnFor } from '../learn'
import type { Activity } from '../../shared/engine'
import { SaveSession } from './Workouts'

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

function Player({ steps, sig, title, mode, regUrl, sport, auto, cta = 'Registra allenamento' }: { steps: GStep[]; sig: string; title: string; mode: Mode; regUrl: string; sport: Sport; auto?: boolean; cta?: string }) {
  const saved = useMemo(() => { const s = local.get<Saved>(KEY); return s?.sig === sig ? s : null }, [sig])
  const st = useRef<GuideState>(saved?.st ?? startGuide()), last = useRef<number | null>(null), pendingM = useRef(0)
  const trace = useRef<Trace>(saved?.trace ?? []), alt = useRef<number | null>(null), mark = useRef(0), kmSaid = useRef(Math.floor((saved?.st.dist ?? 0) / 1000))
  const [, tick] = useState(0), [run, setRun] = useState(false), [locked, setLocked] = useState(false), [ended, setEnded] = useState(false)
  const sleep = useRef<null | (() => void)>(null), hold = useRef<any>(null), near = useRef(-1)
  const [count, setCount] = useState<number | null>(auto && !saved ? 3 : null)
  useImmersive()
  const useGpsNow = mode === 'gps'
  const gps = useGps(useGpsNow, (m, a) => { if (a != null) alt.current = a; if (last.current != null) pendingM.current += m })
  const hr = useMemo(() => zonesOf(data.value!), [])
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
  // Parti dalla Home: tre secondi per mettere il telefono in tasca, poi si va da soli
  useEffect(() => {
    if (count == null) return
    if (count === 0) { setCount(null); go(); return }
    buzz(80); const t = setTimeout(() => setCount(c => c == null ? null : c - 1), 1000)
    return () => clearTimeout(t)
  }, [count])
  const go = () => { unlockSound(); gps.reset(); last.current = Date.now(); sleep.current ??= keepAwake(); setRun(true); setLocked(useGpsNow); store(); queue(); say(steps[st.current.i].label); tick(n => n + 1) }
  const pause = () => { step(); last.current = null; pendingM.current = 0; clearScheduled(); sleep.current?.(); sleep.current = null; setRun(false); store() }
  const next = () => { // Fatto o Salta: con l'orologio il tratto vale quanto previsto
    const c = steps[st.current.i], s = st.current, full = !useGpsNow && c.m ? c.m : s.m
    st.current = finishStep(steps, { ...s, m: full, dist: s.dist + full - s.m })
    if (st.current.done) { finish(); return }
    announce(false); store(); tick(n => n + 1)
  }
  const s = st.current, c = steps[s.i], after = steps[s.i + 1], left = stepLeft(c, s), byDist = c.m != null && c.m > 0
  const tap = byDist && !useGpsNow
  const zone = effortInfo(c.effort, sport).zone, hint = zone ? zoneHint(zone, hr) : null, swim = sport === 'nuoto'
  if (ended) {
    const km = s.dist >= 50 ? Math.round(s.dist / 10) / 100 : null, seconds = Math.round(s.total)
    const save = () => {
      const tr = trace.current, every = Math.max(1, Math.ceil(tr.length / 240)), kept = useGpsNow && km ? tr.filter((_, i) => i % every === 0 || i === tr.length - 1) : null
      local.set(RESULT, { km, seconds, trace: kept, splits: kept ? kmSplits(tr).filter(x => !x.partial).map(x => fmtSplit(x.seconds)).join(' - ') || null : null, guide: s.laps, source: useGpsNow && km ? 'gps' : 'manuale' } satisfies GuideResult)
      location.hash = regUrl
    }
    return <div class="stack"><section class="hero"><p class="eyebrow">{title}</p><h1>Finito</h1>
      <div class="stats run"><div><b>{timeOf(seconds) ?? `0'00"`}</b><span>tempo</span></div><div><b>{km ?? '-'}</b><span>km{!useGpsNow && km ? ' previsti' : ''}</span></div><div><b>{paceOf(km, seconds)?.replace('/km', '') ?? '-'}</b><span>al km</span></div></div>
      <button class="btn" onClick={save}>{cta}</button></section>
      {!useGpsNow && <Note>{swim ? 'I metri sono quelli previsti: correggili se hai nuotato di più o di meno.' : "Con l'orologio i dati esatti sono nel suo file: puoi caricarlo nella pagina di registrazione."}</Note>}
      <section><h2 class="phase">Tratti</h2><table class="splits"><tbody>{s.laps.map((l, i) => <tr key={i}><td>{l.label}</td><td>{clock(l.sec)}</td><td>{l.m ? `${kmText(l.m)}${l.m >= 1000 ? ' km' : ' m'}` : ''}</td></tr>)}</tbody></table></section>
    </div>
  }
  const close = () => { if (run && !confirm('Uscire dalla seduta? La ritrovi in pausa quando torni.')) return; if (run) pause(); setCount(null); goBack('home') }
  const segs = steps.map((x, i) => ({ w: x.sec ?? (x.m ?? 0) / 3, on: i < s.i ? 'done' : i === s.i ? 'now' : '' }))
  return (
    <div class="stack timer full" data-tone={c.tone}>
      <div class="tm-top">
        <button type="button" class="round" aria-label="Chiudi" onClick={close}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <p class="eyebrow">{title}</p>
        {useGpsNow ? <span class={'gps ' + (gps.status === 'ok' ? 'ok' : gps.status === 'negato' || gps.status === 'debole' ? 'bad' : '')} role="status">{GPS_TEXT[gps.status]}</span> : <span class="gps">{swim ? 'Vasca' : 'Orologio'}</span>}
      </div>
      <div class="tm-segs" aria-hidden="true">{segs.map((x, i) => <i key={i} class={x.on} style={{ flexGrow: Math.max(x.w, 1) }} />)}</div>
      <section class="tm" aria-live="off">
        {count != null ? <><p class="tm-label">Si parte tra</p><p class="tm-time">{count}</p><p class="sub">{c.label}: {stepText(c).replace(c.label + ' ', '')}</p></> : <>
        <p class="tm-label">{c.label}</p>
        {byDist && !tap ? <p class="tm-time">{kmText(left.m!)}<small>{left.m! >= 1000 ? ' km' : ' m'}</small></p> : tap ? <p class="tm-time">{kmText(c.m!)}<small>{c.m! >= 1000 ? ' km' : ' m'}</small></p> : <p class="tm-time">{clock(left.sec ?? 0)}</p>}
        {byDist && <p class="sub">{tap ? `${swim ? 'Tocca Fatto a fine tratto' : "Guarda l'orologio e tocca Fatto"}. Sei a ${clock(s.t)}` : `Da ${clock(s.t)}`}{c.sec ? `, massimo ${clock(c.sec)}` : ''}</p>}
        {c.cue && <p class="tm-cue">{c.cue}</p>}
        {hint && <p class="zonehint">{hint}</p>}</>}
      </section>
      <div class="tm-next"><span><small>Poi</small> <b>{after ? stepText(after) : 'Fine'}</b></span><span><small>In tutto</small> <b>{clock(s.total)}{useGpsNow && s.dist > 0 ? ` · ${kmText(s.dist)}${s.dist >= 1000 ? ' km' : ' m'}` : ''}</b></span></div>
      {gps.status === 'negato' && <Note tone="stop"><strong>Non riesco a usare il GPS.</strong> Controlla il permesso di posizione del browser, oppure chiudi e scegli l'orologio.</Note>}
      <div class="tm-ctl">
        <button type="button" class={'btn ghost' + (tap ? ' strong' : '')} onClick={next} disabled={count != null}>{tap ? 'Fatto' : 'Salta tratto'}</button>
        {count != null ? <button type="button" class="play" aria-label="Parti subito" onClick={() => { setCount(null); go() }}><svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg></button>
          : run ? <button type="button" class="play" aria-label="Pausa" onClick={pause}><svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg></button>
          : <button type="button" class="play" aria-label={s.total > 0 ? 'Riprendi' : 'Avvia'} onClick={go}><svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg></button>}
        <button type="button" class="round" aria-label="Blocca lo schermo" onClick={() => setLocked(true)} disabled={!run}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></button>
      </div>
      {s.total > 0 && <button type="button" class="link tm-end" onClick={finish}>Termina e registra</button>}
      <p class="sub tm-note">{swim ? "Telefono a bordo vasca, al riparo dall'acqua, schermo acceso." : "Tieni l'app aperta: a telefono bloccato suoni e GPS possono fermarsi. Se compare dolore, cammina e fermati."}</p>
      {locked && <div class="veil"><button class="btn ghost hold" onPointerDown={() => { hold.current = setTimeout(() => setLocked(false), 800) }} onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)} onContextMenu={e => e.preventDefault()}>Tieni premuto per sbloccare</button></div>}
    </div>
  )
}
/** Durante la seduta spariscono barra delle schede e intestazione. */
export function useImmersive() {
  useEffect(() => { document.documentElement.classList.add('immersive'); return () => document.documentElement.classList.remove('immersive') }, [])
}
const fromSaved = (sig: string) => local.get<Saved>(KEY)?.sig === sig

/** Prepara la seduta: schema, fonte della distanza, riscaldamento. */
export function GuideView({ route }: { route: string }) {
  const d = data.value!, q = new URLSearchParams(route.split('?')[1] ?? ''), key = q.get('key'), date = q.get('date')
  const ses = useMemo(() => { if (!key) return null; const plan = planFor(d); for (const s of buildTimeline(plan, d.state).slots) for (const x of s.sessions) if (sessionKey(s, x.day) === key) return x; return null }, [key])
  const free = useMemo(() => {
    if (q.get('free')) return local.get<{ blocks: Block[]; text: string; sport?: Sport; back?: string }>(FREE)
    if (q.get('workout')) return (d.workouts ?? []).find(w => w.id === q.get('workout')) ?? null
    if (q.get('planned')) return (d.state.planned ?? []).find(p => p.id === q.get('planned')) ?? null
    return null
  }, [])
  const blocks = ses ? blocksOf(ses) : free?.blocks ?? null, title = ses?.text ?? (free as any)?.name ?? free?.text ?? 'Allenamento', sport: Sport = free?.sport ?? 'corsa', swim = sport === 'nuoto'
  const steps = useMemo(() => blocks ? guideSteps(blocks, sport) : [], [blocks]), sig = `g${key ?? q.get('workout') ?? q.get('planned') ?? title}`
  const needsDist = steps.some(s => s.m)
  const [mode, setMode] = useState<Mode>(d.state.watch || swim ? 'watch' : 'gps'), [start, setStart] = useState(() => fromSaved(sig) || !!q.get('go'))
  if (!blocks) return <div class="stack"><section class="head"><h1>Seduta non guidabile</h1><p>Questa seduta non ha blocchi. Puoi costruirne una adesso.</p></section><a class="btn" href="#/costruisci">Costruisci allenamento</a></div>
  const pl = q.get('planned') ? free as any : null, linked = key ?? (pl ? plannedKey(pl) : null), when = date ?? pl?.date
  // un test torna alla sua pagina per inserire il risultato, invece di passare dalla registrazione
  const back = q.get('free') ? (free as any)?.back as string | undefined : undefined
  const reg = back ? `#/${back}` : `#/registra?${linked ? `key=${encodeURIComponent(linked)}&date=${when}&` : ''}type=${swim ? 'nuoto' : 'corsa'}&guide=1`
  const m = local.get<Saved>(KEY)
  if (start) return <Player steps={steps} sig={sig} title={title} mode={m?.sig === sig ? m.mode : mode} regUrl={reg} sport={sport} auto={!!q.get('go') && !fromSaved(sig)} cta={back ? 'Inserisci il risultato' : undefined} />
  const warm = warmupFor(title), cool = cooldownFor(title, ses?.km), art = swim ? null : learnFor(title), hasWarm = blocks.some(b => b.kind === 'warm')
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Allenamento guidato</p><h1>{title}</h1>{ses && (ses.fiato || ses.fatica) && <p>{[ses.fiato, ses.fatica ? `fatica ${ses.fatica}` : null].filter(Boolean).join(', ')}</p>}</section>
    <section class="panel"><BlockList blocks={blocks} sport={sport} /></section>
    {swim && <Note>In piscina il telefono non misura i metri: i tratti a tempo avanzano da soli, quelli a distanza con Fatto.</Note>}
    {needsDist && !swim && <fieldset class="scale"><legend>Come misuri la distanza?</legend><div class="seg"><button type="button" class={mode === 'gps' ? 'sel' : ''} aria-pressed={mode === 'gps'} onClick={() => setMode('gps')}>GPS del telefono</button><button type="button" class={mode === 'watch' ? 'sel' : ''} aria-pressed={mode === 'watch'} onClick={() => setMode('watch')}>Orologio</button></div>
      <small>{mode === 'gps' ? 'I tratti a distanza finiscono da soli.' : "Guardi i km sull'orologio e tocchi Fatto a fine tratto."}</small></fieldset>}
    {!hasWarm && !swim && <a class="btn ghost" href={`#/routine?id=${warm.id}`}>Prima: {warm.name}, {Math.round(totalOf(warm.steps) / 60)} min</a>}
    <button class="btn" onClick={() => { unlockSound(); setStart(true) }}>Prepara la partenza</button>
    {art && <a class="btn ghost" href={`#/impara/${art.id}`}>Cos'è: {art.title}</a>}
    {!swim && <a class="btn ghost" href={`#/routine?id=${cool.id}`}>Dopo: {cool.name}</a>}
    {ses && <SaveSession s={ses} />}
    {reg && !back && <button type="button" class="link" onClick={() => nav(reg.slice(2).replace('guide=1', '').replace(/&$/, ''))}>Registra senza guida</button>}
  </div>
}
