import { addDays, mondayOf, sessionKey, type Activity, type Timeline } from './engine'
import type { Zone } from './analysis'

/* Il tuo ritmo facile, calcolato dalle tue corse: niente formule, solo quello che hai fatto davvero. */

const SLOW = 540 // oltre 9:00 al km di media è quasi sempre cammino-corsa
const FAST = 180
export const MIN_RUNS = 4

/** Corsa continua e facile: fiato da frasi complete (o meno) oppure, senza fiato segnato, battito medio entro la Z2. */
export function easyRun(a: Activity, z: Zone[] | null, walk?: (a: Activity) => boolean) {
  if (a.type !== 'corsa' || !a.km || a.km < 2 || !a.seconds) return false
  const p = a.seconds / a.km
  if (p > SLOW || p < FAST || walk?.(a)) return false
  return a.fiato != null ? a.fiato <= 2 : a.hrAvg != null && !!z && a.hrAvg <= z[1].hi
}
const q = (v: number[], f: number) => { const s = [...v].sort((a, b) => a - b), i = (s.length - 1) * f, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo) }
const r5 = (s: number) => Math.round(s / 5) * 5

export interface EasyPace { lo: number; hi: number; n: number }
/** Fascia centrale (dal 25° al 75° percentile) dei ritmi delle corse facili delle ultime 4 settimane. */
export function easyPace(acts: Activity[], z: Zone[] | null, today: string, walk?: (a: Activity) => boolean, days = 28): EasyPace | null {
  const from = addDays(today, -days + 1)
  const v = acts.filter(a => a.date >= from && a.date <= today && easyRun(a, z, walk)).map(a => a.seconds! / a.km!)
  if (v.length < MIN_RUNS) return null
  return { lo: r5(q(v, .25)), hi: Math.max(r5(q(v, .75)), r5(q(v, .25)) + 5), n: v.length }
}
/** Ritmo facile mediano settimana per settimana, per il grafico. */
export function easyTrend(acts: Activity[], z: Zone[] | null, today: string, weeks = 8, walk?: (a: Activity) => boolean) {
  const last = mondayOf(today)
  return Array.from({ length: weeks }, (_, i) => addDays(last, -7 * (weeks - 1 - i))).map(monday => {
    const v = acts.filter(a => a.date >= monday && a.date < addDays(monday, 7) && easyRun(a, z, walk)).map(a => a.seconds! / a.km!)
    return { monday, v: v.length ? Math.round(q(v, .5)) : null, n: v.length }
  })
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
export const paceRange = (p: EasyPace) => `${mmss(p.lo)} – ${mmss(p.hi)}`
/** Vero per le corse legate a una seduta di cammino-corsa del piano. */
export function walkFrom(t: Timeline) {
  const walk = new Set(t.slots.flatMap(s => s.sessions.filter(x => /cammin/i.test(x.text)).map(x => sessionKey(s, x.day))))
  return (a: Activity) => !!a.sessionKey && walk.has(a.sessionKey)
}
