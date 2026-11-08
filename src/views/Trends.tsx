import { easyPace, easyTrend, MIN_RUNS, paceRange, walkFrom } from '../../shared/paces'
import { useState } from 'preact/hooks'
import { data } from '../api'
import { topKg } from '../../shared/training'
import { loadAlert, samePace, weeklyLoads, zonesOf } from '../../shared/analysis'
import { Field, Note } from '../ui'
import { addDays, buildTimeline, isCustom, planFor, sessionKey, upper, type Slot } from '../../shared/engine'
import { fmtDate, PAIN, todayISO } from '../guide'
import { zoneCounts, zoneLabel } from '../../shared/pain'
import { paceOf } from '../fit'

const W = 340
function Bars({ rows, title, unit }: { rows: { label: string; done: number; plan: number | null }[]; title: string; unit: string }) {
  const h = 150, y0 = 18, tickEvery = Math.ceil(rows.length / 5), max = Math.max(10, ...rows.map(r => Math.max(r.done, r.plan ?? 0)))
  const band = (W - 8) / Math.max(rows.length, 8), y = (v: number) => y0 + (h - y0) * (1 - v / max)
  return <figure class="chart"><figcaption>{title}</figcaption>
    <svg viewBox={`0 0 ${W} ${h + 20}`} role="img" aria-label={title}>
      {rows.map((r, i) => <g key={i}>
        {r.plan != null && <rect x={4 + i * band} y={y(r.plan)} width={band - 4} height={h - y(r.plan)} class="plan"><title>{`${r.label}: previsti ${r.plan} ${unit}`}</title></rect>}
        <rect x={4 + i * band + 2} y={y(r.done)} width={band - 8} height={h - y(r.done)} class="real"><title>{`${r.label}: fatti ${r.done} ${unit}`}</title></rect>
        {i % tickEvery === 0 && <text x={4 + i * band} y={h + 15} class="tick">{r.label}</text>}
      </g>)}
    </svg></figure>
}
export function Line({ pts, title, max, min = 0, unit, ref2, dots = true }: { pts: { label: string; v: number; t?: number | null }[]; title: string; max: number; min?: number; unit: string; ref2?: number; dots?: boolean }) {
  const h = 130, y0 = 12, x = (i: number) => 14 + (W - 28) * (pts.length > 1 ? i / (pts.length - 1) : .5), y = (v: number) => y0 + (h - y0) * (1 - (v - min) / (max - min))
  const path = (k: 'v' | 't') => pts.map((p, i) => p[k] == null ? '' : `${x(i)},${y(p[k]!)}`).join(' ')
  return <figure class="chart"><figcaption>{title}</figcaption>
    <svg viewBox={`0 0 ${W} ${h + 20}`} role="img" aria-label={title}>
      {ref2 != null && <><line x1="0" x2={W} y1={y(ref2)} y2={y(ref2)} class="ref" /><text x={W - 2} y={y(ref2) - 4} text-anchor="end" class="tick">limite {ref2}</text></>}
      {pts.some(p => p.t != null) && <polyline points={path('t')} class="target" />}
      <polyline points={path('v')} class="val" />
      {dots && pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="3.5" class="dot"><title>{`${p.label}: ${p.v}${unit}`}</title></circle>)}
      <text x="2" y={h + 15} class="tick">{pts[0]?.label}</text><text x={W - 2} y={h + 15} text-anchor="end" class="tick">{pts.at(-1)?.label}</text>
    </svg></figure>
}
function Loads() {
  const acts = data.value!.activities.filter(a => a.sets?.length)
  const names = new Map(acts.flatMap(a => a.sets!.filter(x => topKg(x) > 0).map(x => [x.id, x.name] as const)))
  const [sel, setSel] = useState<string | null>(null), id = sel ?? [...names.keys()][0]
  if (!id) return null
  const pts = acts.flatMap(a => { const l = a.sets!.find(x => x.id === id); return l && topKg(l) ? [{ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: topKg(l) }] : [] }).slice(-16)
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs)
  return <section class="stack"><Field label="Carico per esercizio"><select value={id} onChange={e => setSel(e.currentTarget.value)}>{[...names].map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
    {pts.length > 1 ? <Line pts={pts} min={Math.max(0, lo - 5)} max={hi + 5} title={`${names.get(id)}, carico massimo`} unit=" kg" /> : <p class="sub pad">Serve una seconda seduta per vedere l'andamento.</p>}</section>
}
/** Il ritmo facile dalle corse continue delle ultime 4 settimane, con l'andamento settimanale. */
export function EasyPaceCard() {
  const d = data.value!, today = todayISO(), z = zonesOf(d), walk = walkFrom(buildTimeline(planFor(d), d.state))
  const p = easyPace(d.activities, z, today, walk), tr = easyTrend(d.activities, z, today, 8, walk).filter(w => w.v != null)
  if (!p) return <section class="panel"><h2>Il tuo ritmo facile</h2><p class="sub">Servono almeno {MIN_RUNS} corse continue facili nelle ultime 4 settimane, con il fiato segnato o il battito. Il cammino-corsa non conta, perché i tratti al passo falsano la media.</p></section>
  const lo = Math.min(...tr.map(w => w.v!)), hi = Math.max(...tr.map(w => w.v!))
  return <section class="panel pace-c">
    <h2>Il tuo ritmo facile</h2>
    <p class="big">{paceRange(p)} <small>al km</small></p>
    {tr.length > 1 && <Line pts={tr.map(w => ({ label: fmtDate(w.monday, { day: 'numeric', month: 'short' }), v: w.v! }))} min={lo - 20} max={hi + 20} title="Ritmo facile, settimana per settimana" unit=" s/km" />}
    <p class="sub">Da {p.n} corse continue delle ultime 4 settimane, con fiato da frasi complete o battito in Z2.{tr.length > 1 ? ' Più in basso nel grafico vuol dire più veloce.' : ''}</p>
  </section>
}
export function Trends({ embedded }: { embedded?: boolean }) {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO()
  const runs = d.activities.filter(a => a.type === 'corsa')
  const totKm = runs.reduce((s, a) => s + (a.km ?? 0), 0)
  const extra = d.activities.filter(a => a.type !== 'corsa').length
  if (!d.activities.length) return <div class="stack"><section class="head">{!embedded && <h1>Andamento</h1>}<p>Registra il primo allenamento e qui vedrai come cresci settimana dopo settimana.</p><a class="btn" href="#/registra">Registra allenamento</a></section></div>
  const found = t.slots.findIndex(s => today < addDays(s.monday, 7)), cur = found < 0 ? t.slots.length - 1 : found
  const end = Math.max(cur, 0) + 1
  const win: Slot[] = t.slots.slice(Math.max(0, end - 12), end)
  const rows = win.map(s => ({ label: fmtDate(s.monday, { day: 'numeric', month: 'numeric' }), plan: s.total ? Math.round(s.total) : null, done: Math.round(runs.filter(a => a.date >= s.monday && a.date < addDays(s.monday, 7)).reduce((x, a) => x + (a.km ?? 0), 0) * 10) / 10 }))
  const ses = new Map(t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x] as const)))
  const last = runs.slice(-16), acts0 = d.activities.slice(-30), zones = zoneCounts(acts0.filter(a => a.pains), 1)
  const fat = last.filter(a => a.fatica != null).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: a.fatica!, t: a.sessionKey ? upper(ses.get(a.sessionKey)?.fatica) : null }))
  const knee = last.filter(a => a.knee != null).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: a.knee! }))
  const z2 = zonesOf(d)?.[1] ?? null
  const loads = weeklyLoads(d.activities, today, 8), alert = loadAlert(loads), shown = loads.slice(Math.max(0, loads.findIndex(w => w.load > 0))), noLoad = loads.reduce((s, w) => s + w.missing, 0)
  const cad = samePace(runs).slice(-16).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: a.cadence! }))
  // efficienza: secondi al km alla stessa FC di Z2, più basso è meglio
  const eff = runs.filter(a => z2 && a.km && a.seconds && a.hrAvg && a.hrAvg >= z2.lo && a.hrAvg <= z2.hi).slice(-16).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: Math.round(a.seconds! / a.km! ) }))
  const best = eff.length ? eff.reduce((m, x) => x.v < m ? x.v : m, 9999) : 0
  return (
    <div class="stack">
      <section class="head">{!embedded && <h1>Andamento</h1>}
        <div class="stats"><div><b>{Math.round(totKm)}</b><span>km corsi</span></div><div><b>{runs.length}</b><span>corse</span></div><div><b>{extra}</b><span>sedute extra</span></div></div>
      </section>
      <Bars rows={rows} title="Chilometri a settimana, fatti su previsti" unit="km" />
      <EasyPaceCard />
      {alert && <Note><strong>Carico in salita.</strong> Questa settimana sei a {alert.load}, il {alert.pct}% sopra la media recente di {alert.avg}. Se non lo hai scelto tu, tieni facili le prossime sedute.</Note>}
      {loads.some(w => w.load > 0) && <><Bars rows={shown.map(w => ({ label: fmtDate(w.monday, { day: 'numeric', month: 'numeric' }), done: w.load, plan: null }))} title="Carico settimanale" unit="punti" /><p class="sub pad">Minuti per fatica di tutti gli allenamenti.{noLoad ? ` ${noLoad} senza durata o fatica non sono conteggiati.` : ''}</p></>}
      {fat.length > 1 && <Line pts={fat} max={10} title="Fatica reale e attesa" unit="/10" />}
      {knee.length > 1 && <Line pts={knee} max={10} title={PAIN.chart} unit="/10" ref2={2} />}
      {zones.length > 0 && <section class="panel"><h2>Zone che hanno dato dolore</h2><table class="splits"><tbody>{zones.map(z => <tr key={z.zone}><td>{zoneLabel(z.zone)}</td><td>{z.times} {z.times === 1 ? 'volta' : 'volte'}</td><td>fino a {z.top}</td></tr>)}</tbody></table><p>Negli ultimi 30 allenamenti. Se una zona torna spesso, conviene farla valutare.</p></section>}
      <Loads />
      {!z2 && <p class="sub pad"><a href="#/impostazioni/corpo">Imposta la FC massima</a> per vedere il ritmo in Z2.</p>}
      {cad.length > 1 && <Line pts={cad} min={Math.min(...cad.map(c => c.v)) - 6} max={Math.max(...cad.map(c => c.v)) + 6} title="Cadenza a ritmo simile" unit=" passi/min" />}
      {eff.length > 1 && <><Line pts={eff.map(e => ({ ...e }))} min={best - 30} max={Math.max(...eff.map(e => e.v)) + 15} title="Ritmo in Z2, più basso è meglio" unit=" s/km" /><p class="sub pad">Miglior ritmo con FC media in Z2: {paceOf(1, best)}.</p></>}
    </div>
  )
}
