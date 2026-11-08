import { addDays, mondayOf, type Activity } from './engine'
import { warmupFor } from './training'

/* ---------- Zone ---------- */
export interface Zone { id: number; name: string; lo: number; hi: number }
const TOP = [.7, .81, .86, .91, 1] // le percentuali della tua tabella Excel
/** Le zone sono continue: ogni battito cade in una sola zona. */
export function zonesFrom(hrMax: number): Zone[] {
  let lo = Math.ceil(hrMax * .5)
  return TOP.map((p, i) => { const hi = i === 4 ? hrMax : Math.floor(hrMax * p), z = { id: i + 1, name: `Z${i + 1}`, lo, hi }; lo = hi + 1; return z })
}
export const validHr = (n?: number | null) => n != null && n >= 120 && n <= 230
/** La FC massima scelta dalla persona; per Roberto vale quella della tabella finché non la cambia. */
export const HRMAX_BASE = 186
export const hrMaxOf = (d: { state: { hrMax?: number | null }; me?: { isAdmin: boolean } }) => d.state.hrMax ?? (d.me?.isAdmin ? HRMAX_BASE : null)
/** Karvonen: le stesse percentuali applicate alla riserva cardiaca (massima meno riposo). */
export function zonesReserve(hrMax: number, rest: number): Zone[] {
  const r = hrMax - rest
  let lo = Math.ceil(rest + r * .5)
  return TOP.map((p, i) => { const hi = i === 4 ? hrMax : Math.floor(rest + r * p), z = { id: i + 1, name: `Z${i + 1}`, lo, hi }; lo = hi + 1; return z })
}
/** Zone scritte a mano: inizio della Z1 e fine di ogni zona, sei numeri in fila. */
export const zonesManual = (b: number[]): Zone[] => [1, 2, 3, 4, 5].map(i => ({ id: i, name: `Z${i}`, lo: i === 1 ? b[0] : b[i - 1] + 1, hi: b[i] }))
export const boundsOf = (z: Zone[]) => [z[0].lo, ...z.map(x => x.hi)]
export const validBounds = (b?: number[] | null): b is number[] => !!b && b.length === 6 && b.every((x, i) => Number.isFinite(x) && x >= 40 && x <= 240 && (!i || x > b[i - 1]))
export const validRest = (n?: number | null) => n != null && n >= 30 && n <= 100
/** Cambia un confine e sposta i vicini quanto basta perché le zone restino in fila senza buchi. */
export function setBound(b: number[], i: number, v: number) {
  const n = [...b]; n[i] = Math.round(v)
  for (let j = i + 1; j < n.length; j++) n[j] = Math.max(n[j], n[j - 1] + 1)
  for (let j = i - 1; j >= 0; j--) n[j] = Math.min(n[j], n[j + 1] - 1)
  return n
}
type HrData = { state: { hrMax?: number | null; hrZones?: { mode: 'max' | 'riserva' | 'mano'; rest?: number | null; bounds?: number[] | null } | null }; me?: { isAdmin: boolean } }
/** Le zone in uso: a mano, con la riserva cardiaca o dalla sola FC massima. */
export function zonesOf(d: HrData): Zone[] | null {
  const z = d.state.hrZones, max = hrMaxOf(d)
  if (z?.mode === 'mano' && validBounds(z.bounds)) return zonesManual(z.bounds)
  if (!max) return null
  if (z?.mode === 'riserva' && validRest(z.rest) && z.rest! < max - 40) return zonesReserve(max, z.rest!)
  return zonesFrom(max)
}
export const observedMax = (acts: Activity[]) => { const v = acts.map(a => a.hrMax ?? 0).filter(x => validHr(x)); return v.length ? Math.max(...v) : null }
export const zoneOf = (z: Zone[], hr: number) => hr < z[0].lo ? null : z.find(x => hr <= x.hi) ?? z[4]
/** "Z2: 131-150 bpm" per le sedute che citano una zona. */
export function zoneHint(text: string, z: Zone[] | null) {
  if (!z) return null
  const m = text.match(/Z([1-5])(?:-Z([1-5]))?/)
  if (!m) return null
  const a = z[+m[1] - 1], b = z[+(m[2] ?? m[1]) - 1]
  return `${m[2] ? `Z${m[1]}-Z${m[2]}` : a.name}: ${a.lo}-${b.hi} bpm`
}

/* ---------- Dati della singola corsa ---------- */
type Trace = NonNullable<Activity['trace']>
const MAX_GAP = 60 // una pausa lunga non conta come tempo in zona
export function timeInZones(tr: Trace, z: Zone[]) {
  const out = z.map(() => 0)
  for (let i = 1; i < tr.length; i++) {
    const dt = tr[i][0] - tr[i - 1][0], hr = tr[i][1]
    if (hr == null || dt <= 0 || dt > MAX_GAP) continue
    const x = zoneOf(z, hr); if (x) out[x.id - 1] += dt
  }
  return out
}
export interface KmSplit { km: number; seconds: number; hr: number | null; partial: boolean }
export function kmSplits(tr: Trace): KmSplit[] {
  const out: KmSplit[] = []
  let mark = 1000, t0 = tr[0]?.[0] ?? 0, d0 = 0, hrs: number[] = []
  const close = (t: number, partial: boolean) => out.push({ km: out.length + 1, seconds: Math.round(t - t0), hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null, partial })
  for (const p of tr) {
    if (p[1]) hrs.push(p[1])
    if ((p[2] ?? 0) >= mark) { close(p[0], false); t0 = p[0]; d0 = p[2]!; mark += 1000; hrs = [] }
  }
  const last = tr.at(-1)
  if (last && (last[2] ?? 0) - d0 >= 200) close(last[0], true)
  return out
}
const NOT_STEADY = /×|ritmo gara|test/i
export const isSteady = (text?: string | null) => !text || (warmupFor(text).id === 'warm-easy' && !NOT_STEADY.test(text))
export const DRIFT_MIN_SEC = 60 * 60
export interface Drift { value: number; level: 'bassa' | 'media' | 'alta' }
/** Quanto calano i metri per battito dalla prima alla seconda metà, dopo i primi 10 minuti. */
export function drift(tr: Trace | null | undefined, text?: string | null): Drift | null {
  if (!tr?.length || !isSteady(text) || tr.at(-1)![0] - tr[0][0] < DRIFT_MIN_SEC) return null
  const from = tr[0][0] + 600, pts = tr.filter(p => p[0] >= from && p[1] && p[2] != null)
  if (pts.length < 20 || pts.length / tr.filter(p => p[0] >= from).length < .8) return null
  const mid = (pts[0][0] + pts.at(-1)![0]) / 2, a = pts.filter(p => p[0] <= mid), b = pts.filter(p => p[0] > mid)
  const ef = (l: Trace) => { const s = l.at(-1)![0] - l[0][0], m = l.at(-1)![2]! - l[0][2]!, hr = l.reduce((x, p) => x + p[1]!, 0) / l.length; return s > 0 && m > 0 ? m / s / hr : 0 }
  const e1 = ef(a), e2 = ef(b)
  if (!e1 || !e2) return null
  const value = Math.round((e1 - e2) / e1 * 1000) / 10
  return { value, level: value <= 5 ? 'bassa' : value <= 10 ? 'media' : 'alta' }
}

/* ---------- Carico ---------- */
export const loadOf = (a: Activity) => a.seconds && a.fatica ? Math.round(a.seconds / 60 * a.fatica) : null
export interface WeekLoad { monday: string; load: number; missing: number }
export function weeklyLoads(acts: Activity[], today: string, n: number): WeekLoad[] {
  const last = mondayOf(today)
  return Array.from({ length: n }, (_, i) => {
    const monday = addDays(last, -7 * (n - 1 - i)), end = addDays(monday, 7), l = acts.filter(a => a.date >= monday && a.date < end)
    return { monday, load: l.reduce((s, a) => s + (loadOf(a) ?? 0), 0), missing: l.filter(a => loadOf(a) == null).length }
  })
}
export const LOAD_RATIO = 1.3, LOAD_MIN_GAP = 100
/** Serve uno storico di almeno tre settimane su quattro: all'inizio i confronti non dicono nulla. */
export function loadAlert(w: WeekLoad[]) {
  const cur = w.at(-1), prev = w.slice(-5, -1).filter(x => x.load > 0)
  if (!cur || prev.length < 3) return null
  const avg = prev.reduce((s, x) => s + x.load, 0) / prev.length
  return cur.load > avg * LOAD_RATIO && cur.load - avg >= LOAD_MIN_GAP ? { avg: Math.round(avg), load: cur.load, pct: Math.round((cur.load / avg - 1) * 100) } : null
}
/** Tiene le corse con un ritmo vicino alla mediana, così la cadenza si confronta a parità di andatura. */
export function samePace<T extends Activity>(runs: T[], band = 25) {
  const l = runs.filter(a => a.km && a.seconds && a.cadence)
  if (!l.length) return []
  const pace = (a: T) => a.seconds! / a.km!, s = l.map(pace).sort((x, y) => x - y), med = s[Math.floor(s.length / 2)]
  return l.filter(a => Math.abs(pace(a) - med) <= band)
}
