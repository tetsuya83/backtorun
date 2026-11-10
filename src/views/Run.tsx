import { useEffect } from 'preact/hooks'
import { data, saveActivity } from '../api'
import { buildTimeline, planFor, sessionKey } from '../../shared/engine'
import { drift, hrMaxOf, kmSplits, timeInZones, zonesOf } from '../../shared/analysis'
import { fmtDate } from '../guide'
import { paceOf, parseActivityFile, timeOf } from '../fit'
import { isWork, lapNames, segmentsOf, stepsOf, structured, watchSegments, workSummary } from '../../shared/segments'
import type { GStep } from '../../shared/blocks'
import type { Activity } from '../../shared/engine'
import { Line } from './Trends'

const mmss = (s: number) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`
const asked = new Set<string>()
/** Corse importate prima dei tratti: si rilegge una volta il file dell'orologio da Intervals.icu e si salvano i suoi lap. */
async function upgrade(a: Activity, steps: GStep[]) {
  if (asked.has(a.id)) return
  asked.add(a.id)
  try {
    const r = await fetch(`/api/intervals/file/${encodeURIComponent(a.externalId!)}`, { credentials: 'same-origin' })
    if (!r.ok) return
    const seg = watchSegments((await parseActivityFile(await r.arrayBuffer())).lapList ?? [], steps)
    const now = data.value?.activities.find(x => x.id === a.id)
    if (seg && now && !now.guide?.length) saveActivity({ ...now, ...seg })
  } catch { /* resta la ricostruzione dal piano */ }
}
const pace = (s: number | null) => s ? `${mmss(s)}/km` : ''
export function RunView({ route }: { route: string }) {
  const d = data.value!, id = new URLSearchParams(route.split('?')[1] ?? '').get('id'), a = d.activities.find(x => x.id === id)
  const plan = a ? planFor(d) : null, t = plan ? buildTimeline(plan, d.state) : null
  const ses = a?.sessionKey && t ? t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x] as const)).find(([k]) => k === a.sessionKey)?.[1] : undefined
  const steps = a?.type === 'corsa' ? stepsOf(ses) : null
  useEffect(() => {
    if (a?.externalId && !a.guide?.length && !a.segFrom && d.me?.intervals && steps && structured(steps)) void upgrade(a, steps)
  }, [a?.id, a?.guide, a?.segFrom])
  if (!a) return <div class="stack"><section class="head"><h1>Corsa non trovata</h1></section><a class="btn ghost" href="#/andamento">Torna ad Andamento</a></div>
  const tr = a.trace ?? [], max = hrMaxOf(d), zones = zonesOf(d)
  const inZ = zones && tr.length ? timeInZones(tr, zones) : null, zTot = inZ?.reduce((x, y) => x + y, 0) ?? 0
  const dr = drift(tr, ses?.text), km = kmSplits(tr)
  const fastest = Math.min(...km.filter(k => !k.partial).map(k => k.seconds))
  const varied = new Set(km.filter(k => !k.partial).map(k => k.seconds)).size > 1
  const span = (l: { v: number }[]) => l.length ? `, ${Math.min(...l.map(x => x.v))}-${Math.max(...l.map(x => x.v))}` : ''
  const every = Math.max(1, Math.ceil(tr.length / 70)), sample = tr.filter((_, i) => i % every === 0)
  const series = (n: 1 | 3 | 4) => sample.filter(p => p[n] != null && p[n]! > 0).map(p => ({ label: p[2] != null ? `${(p[2] / 1000).toFixed(1)} km` : mmss(p[0]), v: Math.round(p[n]!) }))
  const hr = series(1), alt = series(3), cad = series(4)
  const range = (l: { v: number }[], pad: number) => { const v = l.map(x => x.v); return { min: Math.min(...v) - pad, max: Math.max(...v) + pad } }
  const segs = a.type === 'corsa' ? segmentsOf(a, steps) : null, names = segs ? lapNames(segs) : [], work = workSummary(segs)
  const from = a.segFrom === 'orologio' ? "Dai lap dell'orologio." : a.guide?.length ? 'Dal cronometro guidato.' : 'Ricostruiti dal piano della seduta, tagliati dove cambia il passo.'
  const stats = [[a.km ? `${a.km}` : null, 'km'], [timeOf(a.seconds), 'tempo'], [paceOf(a.km, a.seconds), work ? 'ritmo medio' : 'ritmo'], [work?.pace ? pace(work.pace) : null, 'ritmo corsa'], [a.hrAvg, 'FC media'], [a.hrMax, 'FC max'], [a.cadence, 'passi/min'], [a.ascent != null ? `${a.ascent} m` : null, 'dislivello']].filter(x => x[0] != null)
  return (
    <div class="stack">
      <section class="head"><p class="eyebrow">{fmtDate(a.date)}</p><h1>{ses?.text ?? 'Corsa'}</h1></section>
      <div class="stats run">{stats.map(([v, l]) => <div key={l as string}><b>{v}</b><span>{l}</span></div>)}</div>
      {!tr.length && <p class="sub pad">Carica il file FIT per vedere grafici e intertempi.</p>}
      {hr.length > 1 && <Line pts={hr} {...range(hr, 8)} title={`Frequenza cardiaca${span(hr)} bpm`} unit=" bpm" dots={false} />}
      {inZ && zTot > 0 && <section class="zones"><h2>Tempo in zona</h2>{zones!.map((z, i) => <div class="zn" key={z.id}><span>{z.name}</span><i><u style={{ width: `${inZ[i] / zTot * 100}%` }} /></i><b>{Math.round(inZ[i] / zTot * 100)}%</b></div>)}</section>}
      {!zones && tr.length > 0 && <p class="sub pad"><a href="#/impostazioni/corpo">Imposta la FC massima</a> per vedere il tempo in zona.</p>}
      {dr && <section class="panel"><h2>Deriva cardiaca: {String(dr.value).replace('.', ',')}%, {dr.level}</h2><p>{dr.level === 'bassa' ? 'Il cuore ha tenuto: nella seconda metà ritmo e battiti sono rimasti allineati.' : 'Nella seconda metà servivano più battiti per lo stesso ritmo.'} Caldo, salite, poco sonno e soste possono alterare il dato: guarda la tendenza, non la singola corsa.</p></section>}
      {segs && <section><h2 class="phase">Tratti</h2>
        {work && <p class="facts-l pad">{work.n} {work.n === 1 ? 'tratto' : 'tratti'} di corsa: {timeOf(work.sec)} in tutto{work.m ? `, ${String(Math.round(work.m / 10) / 100).replace('.', ',')} km` : ''}{work.pace ? `, ritmo ${pace(work.pace)}` : ''}{work.hr ? `, FC media ${work.hr}` : ''}.</p>}
        <table class="splits segs"><thead><tr><th>Tratto</th><th>Tempo</th><th>Metri</th><th>Ritmo</th><th>FC</th></tr></thead><tbody>{segs.map((l, i) => <tr key={i} class={isWork(l) ? 'work' : 'rest'}><td>{names[i]}</td><td>{mmss(l.sec)}</td><td>{l.m || ''}</td><td>{l.m >= 20 ? pace(Math.round(l.sec / l.m * 1000)) : ''}</td><td>{l.hr ?? ''}</td></tr>)}</tbody></table>
        <p class="sub pad">{from}</p></section>}
      {!segs && km.length > 0 && <section><h2 class="phase">Intertempi</h2><table class="splits"><thead><tr><th>Km</th><th>Tempo</th><th>FC</th></tr></thead><tbody>{km.map(k => <tr key={k.km} class={k.seconds === fastest && varied ? 'best' : ''}><td>{k.partial ? `${k.km}, parziale` : k.km}</td><td>{mmss(k.seconds)}</td><td>{k.hr ?? ''}</td></tr>)}</tbody></table></section>}
      {cad.length > 1 && <Line pts={cad} {...range(cad, 6)} title={`Cadenza${span(cad)}`} unit=" passi/min" dots={false} />}
      {alt.length > 1 && <Line pts={alt} {...range(alt, 5)} title={`Quota${span(alt)} m`} unit=" m" dots={false} />}
      <a class="btn ghost" href={`#/registra?id=${a.id}`}>Modifica allenamento</a>
    </div>
  )
}
