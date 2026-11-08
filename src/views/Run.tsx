import { data } from '../api'
import { buildTimeline, planFor, sessionKey } from '../../shared/engine'
import { drift, hrMaxOf, kmSplits, timeInZones, zonesOf } from '../../shared/analysis'
import { fmtDate } from '../guide'
import { paceOf, timeOf } from '../fit'
import { Line } from './Trends'

const mmss = (s: number) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`
export function RunView({ route }: { route: string }) {
  const d = data.value!, id = new URLSearchParams(route.split('?')[1] ?? '').get('id'), a = d.activities.find(x => x.id === id)
  if (!a) return <div class="stack"><section class="head"><h1>Corsa non trovata</h1></section><a class="btn ghost" href="#/andamento">Torna ad Andamento</a></div>
  const plan = planFor(d), t = buildTimeline(plan, d.state)
  const ses = a.sessionKey ? t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x] as const)).find(([k]) => k === a.sessionKey)?.[1] : undefined
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
  const stats = [[a.km ? `${a.km}` : null, 'km'], [timeOf(a.seconds), 'tempo'], [paceOf(a.km, a.seconds), 'ritmo'], [a.hrAvg, 'FC media'], [a.hrMax, 'FC max'], [a.cadence, 'passi/min'], [a.ascent != null ? `${a.ascent} m` : null, 'dislivello']].filter(x => x[0] != null)
  return (
    <div class="stack">
      <section class="head"><p class="eyebrow">{fmtDate(a.date)}</p><h1>{ses?.text ?? 'Corsa'}</h1></section>
      <div class="stats run">{stats.map(([v, l]) => <div key={l as string}><b>{v}</b><span>{l}</span></div>)}</div>
      {!tr.length && <p class="sub pad">Carica il file FIT per vedere grafici e intertempi.</p>}
      {hr.length > 1 && <Line pts={hr} {...range(hr, 8)} title={`Frequenza cardiaca${span(hr)} bpm`} unit=" bpm" dots={false} />}
      {inZ && zTot > 0 && <section class="zones"><h2>Tempo in zona</h2>{zones!.map((z, i) => <div class="zn" key={z.id}><span>{z.name}</span><i><u style={{ width: `${inZ[i] / zTot * 100}%` }} /></i><b>{Math.round(inZ[i] / zTot * 100)}%</b></div>)}</section>}
      {!zones && tr.length > 0 && <p class="sub pad"><a href="#/impostazioni/corpo">Imposta la FC massima</a> per vedere il tempo in zona.</p>}
      {dr && <section class="panel"><h2>Deriva cardiaca: {String(dr.value).replace('.', ',')}%, {dr.level}</h2><p>{dr.level === 'bassa' ? 'Il cuore ha tenuto: nella seconda metà ritmo e battiti sono rimasti allineati.' : 'Nella seconda metà servivano più battiti per lo stesso ritmo.'} Caldo, salite, poco sonno e soste possono alterare il dato: guarda la tendenza, non la singola corsa.</p></section>}
      {km.length > 0 && <section><h2 class="phase">Intertempi</h2><table class="splits"><thead><tr><th>Km</th><th>Tempo</th><th>FC</th></tr></thead><tbody>{km.map(k => <tr key={k.km} class={k.seconds === fastest && varied ? 'best' : ''}><td>{k.partial ? `${k.km}, parziale` : k.km}</td><td>{mmss(k.seconds)}</td><td>{k.hr ?? ''}</td></tr>)}</tbody></table></section>}
      {cad.length > 1 && <Line pts={cad} {...range(cad, 6)} title={`Cadenza${span(cad)}`} unit=" passi/min" dots={false} />}
      {alt.length > 1 && <Line pts={alt} {...range(alt, 5)} title={`Quota${span(alt)} m`} unit=" m" dots={false} />}
      <a class="btn ghost" href={`#/registra?id=${a.id}`}>Modifica allenamento</a>
    </div>
  )
}
