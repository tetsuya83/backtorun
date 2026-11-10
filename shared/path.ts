/* Il percorso di una corsa registrata dall'orologio: dove sei passato, i giri da riproporre e quanto lungo serve un giro. */
import type { Activity, Session, Timeline } from './engine'
import { addDays, sessionKey } from './engine'
import { meters } from './gps'
import { buildRoute, simplify, splitLoop, type Pt, type Route, type RouteSession } from './route'
import { sessionMin } from './tips'

/** Un punto del percorso: secondi dalla partenza, longitudine, latitudine. */
export type PathPt = [number, number, number]
export const MAX_PATH = 500
const r5 = (x: number) => Math.round(x * 1e5) / 1e5

/** Dai punti GPS al percorso da salvare: punti assurdi scartati, forma semplificata, al massimo 500 punti. */
export function pathFrom(pts: { t: number; lat?: number | null; lon?: number | null }[]): PathPt[] | null {
  const ok = pts.filter(p => p.lat != null && p.lon != null && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0))
  if (ok.length < 10) return null
  const t0 = ok[0].t, c: Pt[] = ok.map((p, i) => [p.lon!, p.lat!, i])
  let tol = 3, s = simplify(c, tol)
  while (s.length > MAX_PATH) { tol *= 1.5; s = simplify(c, tol) }
  return s.map(p => [Math.round(ok[p[2]!].t - t0), r5(p[0]), r5(p[1])])
}
/** Le coordinate del FIT sono in semicerchi: si portano in gradi. */
export const deg = (v: number | null | undefined) => v == null ? null : Math.abs(v) > 180 ? v * 180 / 2 ** 31 : v

export const lengthKm = (p: PathPt[]) => p.reduce((n, x, i) => i ? n + meters({ lat: p[i - 1][2], lon: p[i - 1][1] }, { lat: x[2], lon: x[1] }) : 0, 0) / 1000

/** Il percorso diviso nei tratti della seduta: corsa e cammino, ognuno con i suoi punti. */
export function pathParts(p: PathPt[], laps: { sec: number; work?: boolean | null }[] | null): { c: Pt[]; work: boolean | null }[] {
  const all = p.map(x => [x[1], x[2]] as Pt)
  if (!laps?.length) return [{ c: all, work: null }]
  const out: { c: Pt[]; work: boolean | null }[] = []
  let from = 0, i = 0
  for (const l of laps) {
    const to = from + l.sec, c: Pt[] = []
    if (i > 0) c.push([p[i - 1][1], p[i - 1][2]]) // ogni tratto parte dove finisce il precedente
    while (i < p.length && p[i][0] <= to) { c.push([p[i][1], p[i][2]]); i++ }
    if (c.length > 1) out.push({ c, work: !!l.work })
    from = to
  }
  if (i < p.length) out.push({ c: p.slice(Math.max(0, i - 1)).map(x => [x[1], x[2]] as Pt), work: false })
  return out
}

/** Il giro di una corsa diventa un percorso, come quelli disegnati: si modifica e si manda all'orologio. */
export function routeFromRun(a: Activity, id: string, name: string, session?: RouteSession | null): Route {
  const c = (a.path ?? []).map(x => [x[1], x[2]] as Pt), m = a.km ? a.km * 1000 : lengthKm(a.path ?? []) * 1000
  const { way, legs } = splitLoop(c, 4, m)
  return { ...buildRoute(id, name, way, legs, 'corsa', session), ascent: a.ascent ?? null, fromRun: a.id }
}

const DEF_WALK = 540, DEF_EASY = 420
/** Quanti km servono per una seduta: quelli del piano, oppure i minuti previsti per i km che fai davvero a ogni minuto
 *  di seduta simile (così contano anche riscaldamento e defaticamento); senza storico, il ritmo facile o un ritmo prudente. */
export function targetKm(ses: Session, t: Timeline, acts: Activity[], today: string, easyMid: number | null): number | null {
  if (ses.km) return ses.km
  const min = sessionMin(ses)
  if (!min) return null
  const walk = /cammin/i.test(ses.text), from = addDays(today, -42)
  const plan = new Map(t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x] as const)))
  let km = 0, planned = 0
  for (const a of acts) {
    const x = a.sessionKey ? plan.get(a.sessionKey) : undefined
    if (a.type !== 'corsa' || !x || !a.km || a.date < from || a.date > today || x.km || /cammin/i.test(x.text) !== walk) continue
    km += a.km; planned += sessionMin(x)
  }
  const r = planned >= 15 ? km / planned : 60 / (walk ? DEF_WALK : easyMid ?? DEF_EASY)
  return Math.round(min * r * 10) / 10
}

export type Choice = { kind: 'route'; r: Route; km: number } | { kind: 'run'; a: Activity; km: number }
export const TOLERANCE = .1
export const inRange = (km: number, target: number) => Math.abs(km - target) <= target * TOLERANCE
/** I giri che conosci di lunghezza simile: prima i percorsi salvati, poi le corse con il percorso, le più recenti per prime. */
export function choicesFor(target: number, routes: Route[], acts: Activity[], max = 3): Choice[] {
  const saved = routes.filter(r => inRange(r.km, target)).sort((a, b) => Math.abs(a.km - target) - Math.abs(b.km - target)).map(r => ({ kind: 'route' as const, r, km: r.km }))
  const from = new Set(routes.map(r => r.fromRun).filter(Boolean))
  const runs: Choice[] = []
  for (const a of [...acts].filter(a => a.type === 'corsa' && (a.path?.length ?? 0) > 9 && a.km && !from.has(a.id) && inRange(a.km, target)).sort((a, b) => b.date.localeCompare(a.date))) {
    const s = a.path![0], same = runs.some(x => x.kind === 'run' && Math.abs(x.km - a.km!) <= x.km * .03 && meters({ lat: s[2], lon: s[1] }, { lat: x.a.path![0][2], lon: x.a.path![0][1] }) < 150)
    if (!same) runs.push({ kind: 'run', a, km: a.km! })
  }
  return [...saved, ...runs].slice(0, max)
}
