import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { intervalSteps, parseIntervals, routineById, ROUTINES, stepAt, totalOf, type Intervals, type Step } from '../../shared/training'
import { buzz, clearScheduled, keepAwake, local, say, schedule, unlockSound, type Cue } from '../sound'
import { Field, Note } from '../ui'
import { Anim, sceneForStep } from '../anim'
import { timeOf } from '../fit'

const clock = (s: number) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
const KEY = 'btr-timer'
interface Saved { sig: string; base: number; since: number | null; worked?: number }

function Player({ steps, sig, title, note, after, lockable }: { steps: Step[]; sig: string; title: string; note?: string; after?: (sec: number) => any; lockable?: boolean }) {
  const saved = useMemo(() => { const s = local.get<Saved>(KEY); return s?.sig === sig ? s : null }, [sig])
  const total = totalOf(steps)
  const clk = useRef({ base: saved ? saved.base + (saved.since ? (Date.now() - saved.since) / 1000 : 0) : 0, since: null as number | null, worked: saved?.worked ?? 0 })
  const [, tick] = useState(0), [run, setRun] = useState(false), [locked, setLocked] = useState(false), [ended, setEnded] = useState(false)
  const sleep = useRef<null | (() => void)>(null), last = useRef(-1)
  const at = () => clk.current.base + (clk.current.since ? (Date.now() - clk.current.since) / 1000 : 0)
  const store = () => local.set(KEY, { sig, base: clk.current.base, since: clk.current.since, worked: clk.current.worked })
  const bank = () => { const c = clk.current; if (c.since) c.worked += (Date.now() - c.since) / 1000 } // i tratti saltati non contano come allenamento
  const plan = () => { // programma i suoni di tutti i cambi ancora da fare
    clearScheduled()
    const t = at(), list: { at: number; cue: Cue }[] = []
    let end = 0
    steps.forEach((s, i) => {
      end += s.seconds
      const next = steps[i + 1]
      if (s.seconds >= 8 && next) for (const p of [3, 2, 1]) if (end - p > t) list.push({ at: end - p - t, cue: 'pip' })
      if (end > t) list.push({ at: end - t, cue: next ? next.tone : 'end' })
    })
    schedule(list)
  }
  const stop = () => { clearScheduled(); sleep.current?.(); sleep.current = null }
  const go = () => { unlockSound(); clk.current.since = Date.now(); store(); plan(); sleep.current ??= keepAwake(); setRun(true); if (lockable) setLocked(true); const s = stepAt(steps, at()); last.current = s.i; say(steps[s.i].label); buzz(200) }
  const pause = () => { bank(); clk.current.base = at(); clk.current.since = null; store(); stop(); setRun(false) }
  const finish = () => { bank(); clk.current.base = Math.min(at(), total); clk.current.since = null; stop(); local.del(KEY); setRun(false); setLocked(false); setEnded(true) }
  const skip = () => { const s = stepAt(steps, at()); bank(); clk.current.base = s.start + steps[s.i].seconds; if (clk.current.since) clk.current.since = Date.now(); store(); if (clk.current.base >= total) finish(); else if (run) plan(); tick(n => n + 1) }
  useEffect(() => {
    const iv = setInterval(() => {
      if (!clk.current.since) return
      const s = stepAt(steps, at())
      if (s.done) { buzz([300, 120, 300, 120, 500]); say('Finito'); finish(); return }
      if (s.i !== last.current) { last.current = s.i; buzz(steps[s.i].tone === 'work' ? [250, 100, 250] : 500); if (document.visibilityState === 'visible') say(steps[s.i].label) }
      tick(n => n + 1)
    }, 250)
    return () => { clearInterval(iv); stop() }
  }, [sig])
  const s = stepAt(steps, at()), cur = steps[s.i], next = steps[s.i + 1], scene = sceneForStep(cur.label)
  const hold = useRef<any>(null)
  if (ended) return <div class="stack"><section class="hero"><p class="eyebrow">{title}</p><h1>Finito</h1><p class="sub">{timeOf(Math.round(clk.current.worked)) ?? `0'00"`} di allenamento.</p></section>{after?.(Math.round(clk.current.worked))}<a class="btn ghost" href="#/oggi">Torna ad Allenati</a></div>
  return (
    <div class="stack timer" data-tone={cur.tone}>
      <p class="eyebrow">{title}</p>
      <section class="tm" aria-live="off">
        <p class="tm-label">{cur.label}</p>
        <p class="tm-time">{clock(s.left)}</p>
        {cur.tone === 'move' && scene && <Anim key={scene} id={scene} small />}
        {cur.cue && <p class="tm-cue">{cur.cue}</p>}
        <div class="tm-bar"><i style={{ width: `${Math.min(100, at() / total * 100)}%` }} /></div>
        <p class="sub">{next ? `Poi: ${next.label} ${clock(next.seconds)}` : 'Ultimo tratto'}, restano {clock(total - at())}</p>
      </section>
      <div class="row">
        {run ? <button class="btn" onClick={pause}>Pausa</button> : <button class="btn" onClick={go}>{at() > 0 ? 'Riprendi' : 'Avvia'}</button>}
        <button class="btn ghost" onClick={skip}>Salta</button>
      </div>
      {at() > 0 && <button class="btn ghost" onClick={finish}>Termina qui</button>}
      {note && <Note>{note}</Note>}
      {locked && <div class="veil"><button class="btn ghost hold" onPointerDown={() => { hold.current = setTimeout(() => setLocked(false), 800) }} onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)} onContextMenu={e => e.preventDefault()}>Tieni premuto per sbloccare</button></div>}
    </div>
  )
}

const SAFE = 'Tieni lo schermo acceso: col telefono bloccato suoni e vibrazione possono fermarsi. Se compare dolore, cammina e fermati.'
function Manual() {
  const [v, setV] = useState({ reps: 6, work: 1, rest: 2 }), [on, setOn] = useState<Intervals | null>(null)
  if (on) return <Player steps={intervalSteps(on)} sig={`m${on.reps}-${on.work}-${on.rest}`} title="Timer libero" note={SAFE} lockable />
  const up = (k: keyof typeof v, x: string) => setV({ ...v, [k]: Math.max(0, +x.replace(',', '.') || 0) })
  return <div class="stack form"><section class="head"><h1>Timer libero</h1><p>Imposta ripetizioni di corsa e cammino.</p></section>
    <div class="grid3">
      <Field label="Ripetizioni"><input inputMode="numeric" value={v.reps} onInput={e => up('reps', e.currentTarget.value)} /></Field>
      <Field label="Corsa (min)"><input inputMode="decimal" value={v.work} onInput={e => up('work', e.currentTarget.value)} /></Field>
      <Field label="Cammino (min)"><input inputMode="decimal" value={v.rest} onInput={e => up('rest', e.currentTarget.value)} /></Field>
    </div>
    <button class="btn" disabled={!v.reps || !v.work || v.reps > 50} onClick={() => setOn({ reps: v.reps, work: Math.round(v.work * 60), rest: Math.round(v.rest * 60), workLabel: 'Corri', restLabel: 'Cammina', partial: false })}>Prepara il timer</button>
  </div>
}
export function TimerView({ route }: { route: string }) {
  const q = new URLSearchParams(route.split('?')[1] ?? ''), text = q.get('text'), key = q.get('key'), date = q.get('date')
  const parsed = text ? parseIntervals(text) : null
  if (!parsed) return <Manual />
  const reg = (sec: number) => key ? <a class="btn" href={`#/registra?key=${encodeURIComponent(key)}&date=${date}&sec=${sec}`}>Registra allenamento</a> : null
  return <Player steps={intervalSteps(parsed)} sig={`s${key ?? text}`} title={text!} after={reg} lockable note={parsed.partial ? 'Il timer copre solo le ripetizioni: riscaldati prima con la corsa facile prevista.' : SAFE} />
}
export function RoutineView({ route }: { route: string }) {
  const r = routineById(new URLSearchParams(route.split('?')[1] ?? '').get('id'))
  if (r) return <Player steps={r.steps} sig={`r${r.id}`} title={r.name} note={/^(cool|mob)/.test(r.id) ? 'Aiuta a chiudere con calma. Allunga fin dove è comodo, senza dolore.' : 'Movimenti controllati, senza dolore.'} />
  return <div class="stack"><section class="head"><h1>Routine</h1><p>Sequenze a tempo: l'app segnala ogni cambio.</p></section>
    <a class="btn ghost" href="#/timer">Timer libero corsa e cammino</a>
    <ul class="hist">{ROUTINES.map(x => <li key={x.id}><a href={`#/routine?id=${x.id}`}><b>{x.name}</b><span>{Math.round(totalOf(x.steps) / 60)} min</span></a><p class="sub pad">{x.when}</p></li>)}</ul>
  </div>
}
