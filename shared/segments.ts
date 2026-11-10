/* Tratti di una seduta a ripetute: corsa e recuperi separati, invece degli intertempi al chilometro.
   Si usano, in quest'ordine: i tratti del cronometro guidato, i lap dell'orologio, la ricostruzione dal piano. */
import type { Activity } from './engine'
import { blocksOf, guideSteps, type Block, type GStep, type Lap } from './blocks'

type Trace = NonNullable<Activity['trace']>
/** Un lap dell'orologio, già ridotto a durata, metri e battito medio. */
export interface RawLap { sec: number; m: number; hr: number | null }

const WALK_SPEED = 1.9 // sotto i 9'00" al km è cammino
const RUN_CADENCE = 135 // passi al minuto: sopra si corre
const SNAP = 40 // secondi di tolleranza per trovare il cambio vero tra corsa e cammino

/** Vero se la seduta alterna tratti diversi: una corsa continua resta con gli intertempi al km. */
export const structured = (steps: GStep[]) => steps.length > 1 && new Set(steps.map(s => `${s.effort}-${s.tone}`)).size > 1
const isWalk = (s: GStep) => s.effort === 'walk'
const toLap = (s: GStep, sec: number, m: number, hr: number | null): Lap => ({ label: s.label, sec: Math.round(sec), m: Math.round(m), effort: s.effort, hr, work: s.tone === 'work' })

/* ---------- Lap dell'orologio ---------- */
/** Fa coincidere i lap con i passi del piano; se il numero non torna, li classifica per ritmo. */
export function fromLaps(raw: RawLap[] | null | undefined, steps: GStep[] | null): Lap[] | null {
  let l = (raw ?? []).filter(x => x.sec > 0)
  while (l.length > 1 && l.at(-1)!.sec < 15 && l.at(-1)!.m < 30) l = l.slice(0, -1) // il lap vuoto chiuso a fine allenamento
  if (l.length < 2) return null
  if (steps && structured(steps)) {
    const fit = align(l, steps)
    if (fit) return fit
  }
  return byPace(l)
}
/** Errore medio tra lap e passi del piano, in proporzione alla durata prevista. */
function gap(l: RawLap[], steps: GStep[], o: number) {
  let e = 0, n = 0
  for (let i = 0; i < steps.length && o + i < l.length; i++) {
    const s = steps[i], x = l[o + i]
    if (s.sec) { e += Math.abs(x.sec - s.sec) / s.sec; n++ } else if (s.m) { e += Math.abs(x.m - s.m) / s.m; n++ }
  }
  return n ? e / n : Infinity
}
function align(l: RawLap[], steps: GStep[]): Lap[] | null {
  let best = -1, err = Infinity
  for (let o = 0; o <= Math.max(0, l.length - steps.length); o++) { const e = gap(l, steps, o); if (e < err) { err = e; best = o } }
  if (best < 0 || err > .35) return null
  const used = Math.min(steps.length, l.length - best)
  if (used < Math.min(steps.length, 2)) return null
  const out: Lap[] = []
  const extra = (x: RawLap, label: string): Lap => { const walk = x.m / x.sec < WALK_SPEED; return { label, sec: Math.round(x.sec), m: Math.round(x.m), effort: walk ? 'walk' : 'easy', hr: x.hr, work: false } }
  l.slice(0, best).forEach(x => out.push(extra(x, 'Prima della seduta')))
  for (let i = 0; i < used; i++) { const x = l[best + i]; out.push(toLap(steps[i], x.sec, x.m, x.hr)) }
  l.slice(best + used).forEach(x => out.push(extra(x, 'Dopo la seduta')))
  return out
}
/** Senza piano: i lap più veloci sono corsa, gli altri cammino o recupero. Lap tutti simili (autolap al km) non dicono nulla. */
function byPace(l: RawLap[]): Lap[] | null {
  const v = l.map(x => x.m / x.sec), sorted = [...v].sort((a, b) => a - b)
  if (l.length < 3 || sorted[0] <= 0 || sorted.at(-1)! / sorted[0] < 1.3) return null
  let cut = 0, big = 0 // il salto di velocità più grande separa i due gruppi
  for (let i = 1; i < sorted.length; i++) { const r = sorted[i] / sorted[i - 1]; if (r > big) { big = r; cut = Math.sqrt(sorted[i] * sorted[i - 1]) } }
  return l.map((x, i) => {
    const fast = v[i] >= cut, walk = v[i] < WALK_SPEED
    return { label: fast ? 'Corri' : walk ? 'Cammina' : 'Recupera', sec: Math.round(x.sec), m: Math.round(x.m), effort: fast ? (walk ? 'walk' : 'easy') : walk ? 'walk' : 'easy', hr: x.hr, work: fast }
  })
}

/* ---------- Ricostruzione dal piano ---------- */
/** Corsa o cammino in un punto della traccia: la cadenza è il segnale più netto, poi la velocità. */
function moving(tr: Trace) {
  return tr.map((p, i) => {
    if (p[4] != null && p[4] > 0) return p[4] >= RUN_CADENCE
    const a = tr[Math.max(0, i - 1)], b = tr[Math.min(tr.length - 1, i + 1)]
    const dt = b[0] - a[0], dm = (b[2] ?? 0) - (a[2] ?? 0)
    return dt > 0 && b[2] != null && a[2] != null ? dm / dt >= WALK_SPEED : null
  })
}
/** Taglia la traccia sui tempi del piano, spostando ogni cambio corsa-cammino dove è avvenuto davvero. */
export function fromTrace(tr: Trace | null | undefined, steps: GStep[] | null): Lap[] | null {
  if (!tr || tr.length < 10 || !steps || !structured(steps) || steps.some(s => !s.sec && !s.m)) return null
  const run = moving(tr), end = tr.at(-1)![0], dist = (i: number) => { for (let j = i; j >= 0; j--) if (tr[j][2] != null) return tr[j][2]!; return 0 }
  const at = (t: number) => { let i = 0; while (i < tr.length - 1 && tr[i][0] < t) i++; return i }
  const cuts: number[] = [] // indice del punto dove inizia ogni passo dopo il primo
  let from = 0
  for (let k = 0; k < steps.length - 1; k++) {
    const s = steps[k], t0 = tr[from][0]
    let i: number
    if (s.sec) i = at(t0 + s.sec)
    else { const goal = dist(from) + s.m!; i = from; while (i < tr.length - 1 && dist(i) < goal) i++ }
    if (tr[i][0] >= end) break
    if (isWalk(s) !== isWalk(steps[k + 1])) i = snap(tr, run, i, !isWalk(s), from)
    if (i <= from) i = from + 1
    if (i >= tr.length - 1) break
    cuts.push(i); from = i
  }
  const bounds = [0, ...cuts, tr.length - 1]
  const out: Lap[] = []
  for (let k = 0; k < bounds.length - 1; k++) {
    const a = bounds[k], b = bounds[k + 1], pts = tr.slice(a, b + 1), hrs = pts.slice(0, -1).map(p => p[1]).filter((x): x is number => !!x)
    out.push(toLap(steps[k], tr[b][0] - tr[a][0], dist(b) - dist(a), hrs.length ? Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length) : null))
  }
  return out.length >= 2 ? out : null
}
/** Cerca, vicino al tempo previsto, il punto che separa meglio "prima corsa" da "dopo cammino" (o il contrario). */
function snap(tr: Trace, run: (boolean | null)[], i: number, wasRun: boolean, from: number) {
  const t = tr[i][0]
  let best = i, score = -1
  for (let c = from + 1; c < tr.length; c++) {
    if (tr[c][0] < t - SNAP) continue
    if (tr[c][0] > t + SNAP) break
    let sc = 0
    for (let j = c - 1; j >= from && tr[j][0] >= tr[c][0] - 30; j--) if (run[j] === wasRun) sc++
    for (let j = c; j < tr.length && tr[j][0] < tr[c][0] + 30; j++) if (run[j] === !wasRun) sc++
    if (sc > score || (sc === score && Math.abs(tr[c][0] - t) < Math.abs(tr[best][0] - t))) { score = sc; best = c }
  }
  return run.some(x => x != null) ? best : i
}

/* ---------- Lettura ---------- */
/** Il battito medio di ogni tratto, preso dalla traccia quando il tratto non lo ha (cronometro guidato). */
export function withHr(laps: Lap[], tr: Trace | null | undefined): Lap[] {
  if (!tr?.length || laps.every(l => l.hr != null)) return laps
  let t = tr[0][0]
  return laps.map(l => {
    const a = t, b = t + l.sec; t = b
    if (l.hr != null) return l
    const hrs = tr.filter(p => p[0] >= a && p[0] < b && p[1]).map(p => p[1]!)
    return { ...l, hr: hrs.length ? Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length) : null }
  })
}
const REST = /^(Cammina|Recupera|Scendi|Pausa|Riscaldamento|Defaticamento|Prima|Dopo)/
export const isWork = (l: Lap) => l.work ?? !REST.test(l.label)
const NOUN: Record<string, string> = { Corri: 'Corsa', 'Corri facile': 'Facile', 'Ritmo medio': 'Medio', 'Al massimo': 'Massimo', Cammina: 'Cammino', Recupera: 'Recupero', 'Scendi piano': 'Discesa' }
/** Nome da mostrare: i tratti di lavoro sono numerati. */
export function lapNames(laps: Lap[]) {
  let n = 0
  return laps.map(l => {
    const base = NOUN[l.label] ?? l.label
    return isWork(l) ? `${base} ${++n}` : base
  })
}
export interface WorkSummary { n: number; sec: number; m: number; pace: number | null; hr: number | null }
/** Solo i tratti di corsa: il ritmo e il battito che contano in una seduta a ripetute. */
export function workSummary(laps: Lap[] | null | undefined): WorkSummary | null {
  const w = (laps ?? []).filter(isWork)
  if (!w.length || w.length === laps!.length) return null
  const sec = w.reduce((a, l) => a + l.sec, 0), m = w.reduce((a, l) => a + l.m, 0), h = w.filter(l => l.hr)
  const ht = h.reduce((a, l) => a + l.sec, 0)
  return { n: w.length, sec, m, pace: m > 0 ? Math.round(sec / m * 1000) : null, hr: ht ? Math.round(h.reduce((a, l) => a + l.hr! * l.sec, 0) / ht) : null }
}
/** I tratti di una corsa: lap dell'orologio o cronometro, altrimenti ricostruiti dal piano. */
export const segmentsOf = (a: Activity, steps: GStep[] | null): Lap[] | null =>
  a.guide?.length ? withHr(a.guide, a.trace) : fromTrace(a.trace, steps)
/** I passi di una seduta del piano, solo per la corsa. */
export function stepsOf(ses: { text: string; km?: number | null; blocks?: Block[] | null } | null | undefined): GStep[] | null {
  if (!ses || ses.km === 0) return null
  const b = blocksOf(ses)
  return b?.length ? guideSteps(b) : null
}
/** Cosa salvare da un file dell'orologio: i suoi lap come tratti, oppure il segno che non ne aveva di utili. */
export function watchSegments(lapList: RawLap[] | null | undefined, steps: GStep[] | null): Pick<Activity, 'guide' | 'segFrom'> | null {
  if (!lapList) return null
  const l = fromLaps(lapList, steps)
  return l ? { guide: l, segFrom: 'orologio' } : { segFrom: 'nessuno' }
}
