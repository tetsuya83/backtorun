import { data } from '../api'
import { addDays, buildTimeline, isCustom, planFor, sessionKey, upper, type Slot } from '../../shared/engine'
import { fmtDate, painWords, todayISO } from '../guide'
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
function Line({ pts, title, max, min = 0, unit, ref2 }: { pts: { label: string; v: number; t?: number | null }[]; title: string; max: number; min?: number; unit: string; ref2?: number }) {
  const h = 130, y0 = 12, x = (i: number) => 14 + (W - 28) * (pts.length > 1 ? i / (pts.length - 1) : .5), y = (v: number) => y0 + (h - y0) * (1 - (v - min) / (max - min))
  const path = (k: 'v' | 't') => pts.map((p, i) => p[k] == null ? '' : `${x(i)},${y(p[k]!)}`).join(' ')
  return <figure class="chart"><figcaption>{title}</figcaption>
    <svg viewBox={`0 0 ${W} ${h + 20}`} role="img" aria-label={title}>
      {ref2 != null && <><line x1="0" x2={W} y1={y(ref2)} y2={y(ref2)} class="ref" /><text x={W - 2} y={y(ref2) - 4} text-anchor="end" class="tick">limite {ref2}</text></>}
      {pts.some(p => p.t != null) && <polyline points={path('t')} class="target" />}
      <polyline points={path('v')} class="val" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="3.5" class="dot"><title>{`${p.label}: ${p.v}${unit}`}</title></circle>)}
      <text x="2" y={h + 15} class="tick">{pts[0]?.label}</text><text x={W - 2} y={h + 15} text-anchor="end" class="tick">{pts.at(-1)?.label}</text>
    </svg></figure>
}
export function Trends() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO()
  const runs = d.activities.filter(a => a.type === 'corsa')
  const totKm = runs.reduce((s, a) => s + (a.km ?? 0), 0)
  const extra = d.activities.filter(a => a.type !== 'corsa').length
  if (!d.activities.length) return <div class="stack"><section class="head"><h1>Andamento</h1><p>Registra il primo allenamento e qui vedrai come cresci settimana dopo settimana.</p><a class="btn" href="#/registra">Registra allenamento</a></section></div>
  const found = t.slots.findIndex(s => today < addDays(s.monday, 7)), cur = found < 0 ? t.slots.length - 1 : found
  const end = Math.max(cur, 0) + 1
  const win: Slot[] = t.slots.slice(Math.max(0, end - 12), end)
  const rows = win.map(s => ({ label: fmtDate(s.monday, { day: 'numeric', month: 'numeric' }), plan: s.total ? Math.round(s.total) : null, done: Math.round(runs.filter(a => a.date >= s.monday && a.date < addDays(s.monday, 7)).reduce((x, a) => x + (a.km ?? 0), 0) * 10) / 10 }))
  const ses = new Map(t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x] as const)))
  const last = runs.slice(-16)
  const fat = last.filter(a => a.fatica != null).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: a.fatica!, t: a.sessionKey ? upper(ses.get(a.sessionKey)?.fatica) : null }))
  const knee = last.filter(a => a.knee != null).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: a.knee! }))
  // efficienza: secondi al km alla stessa FC di Z2, più basso è meglio
  const eff = runs.filter(a => a.km && a.seconds && a.hrAvg && a.hrAvg >= 125 && a.hrAvg <= 152).slice(-16).map(a => ({ label: fmtDate(a.date, { day: 'numeric', month: 'short' }), v: Math.round(a.seconds! / a.km! ) }))
  const best = eff.length ? eff.reduce((m, x) => x.v < m ? x.v : m, 9999) : 0
  return (
    <div class="stack">
      <section class="head"><h1>Andamento</h1>
        <div class="stats"><div><b>{Math.round(totKm)}</b><span>km corsi</span></div><div><b>{runs.length}</b><span>corse</span></div><div><b>{extra}</b><span>sedute extra</span></div></div>
      </section>
      <Bars rows={rows} title="Chilometri a settimana, fatti su previsti" unit="km" />
      {fat.length > 1 && <Line pts={fat} max={10} title="Fatica reale e attesa" unit="/10" />}
      {knee.length > 1 && <Line pts={knee} max={10} title={painWords(isCustom(plan)).chart} unit="/10" ref2={2} />}
      {eff.length > 1 && <><Line pts={eff.map(e => ({ ...e }))} min={best - 30} max={Math.max(...eff.map(e => e.v)) + 15} title="Ritmo in Z2, più basso è meglio" unit=" s/km" /><p class="sub pad">Miglior ritmo con FC media in Z2: {paceOf(1, best)}.</p></>}
    </div>
  )
}
