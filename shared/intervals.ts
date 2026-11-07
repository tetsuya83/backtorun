import type { Activity } from './engine'

/** Un allenamento letto da Intervals.icu, ridotto a ciò che serve a BackToRun. */
export interface Remote { id: string; name: string; type: Activity['type']; date: string; km: number | null; seconds: number | null; hrAvg: number | null; hrMax: number | null; ascent: number | null }
const TYPES: Record<string, Activity['type']> = { Run: 'corsa', TrailRun: 'corsa', VirtualRun: 'corsa', Ride: 'bici', GravelRide: 'bici', MountainBikeRide: 'bici', VirtualRide: 'bici', Swim: 'nuoto', OpenWaterSwim: 'nuoto', WeightTraining: 'forza' }
const n = (v: unknown) => typeof v === 'number' && v > 0 ? v : null

/** Le attività arrivate da Strava non sono leggibili con l'API: Intervals.icu ne restituisce solo un segnaposto. */
export const isStrava = (r: any) => r?.source === 'STRAVA' || !!r?._note
export function remoteOf(r: any): Remote | null {
  const date = String(r?.start_date_local ?? r?.start_date ?? '').slice(0, 10)
  if (!r?.id || isStrava(r) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const m = n(r.distance) ?? n(r.icu_distance)
  return {
    id: String(r.id), name: String(r.name ?? ''), type: TYPES[r.type] ?? 'altro', date,
    km: m ? Math.round(m / 10) / 100 : null, seconds: n(r.moving_time) ?? n(r.elapsed_time),
    hrAvg: n(r.average_heartrate), hrMax: n(r.max_heartrate), ascent: n(r.total_elevation_gain),
  }
}
const near = (a: number | null | undefined, b: number | null, tol: number) => a == null || b == null || Math.abs(a - b) <= Math.max(.3, b * tol)
/** Un file caricato a mano per lo stesso allenamento non deve produrre un doppione. */
const uploaded = (r: Remote, a: Activity) => !a.externalId && a.date === r.date && a.type === r.type && ['fit', 'gpx', 'tcx'].includes(a.source) && near(a.km, r.km, .1)
export const pendingImports = (list: Remote[], acts: Activity[]) => list.filter(r => !acts.some(a => a.externalId === r.id || uploaded(r, a))).sort((a, b) => a.date.localeCompare(b.date))
/** Una seduta già scritta a mano o col GPS del telefono si completa, così fatica e dolori restano. */
export const mergeTarget = (r: Remote, acts: Activity[]) => acts.find(a => !a.externalId && a.date === r.date && a.type === r.type && (a.source === 'manuale' || a.source === 'gps') && near(a.km, r.km, .2))

/* Sedute del piano verso l'orologio: Intervals.icu le riceve come allenamenti e le passa a Suunto o Garmin. */
import type { Block, Part } from './blocks'
const ZONE: Record<Part['effort'], [string, string]> = { walk: ['Cammino', 'Z1'], easy: ['Facile', 'Z2'], steady: ['Medio', 'Z3'], race: ['Ritmo gara', 'Z3'], hard: ['Forte', 'Z4'], max: ['Molto forte', 'Z5'] }
const amount = (p: Part) => p.m ? (p.m >= 1000 ? `${Math.round(p.m / 10) / 100}km` : `${p.m}mtr`) : `${Math.floor((p.sec ?? 0) / 60) ? `${Math.floor((p.sec ?? 0) / 60)}m` : ''}${(p.sec ?? 0) % 60 ? `${(p.sec ?? 0) % 60}s` : ''}` || '1m'
/** Un passo: l'intensità scritta per esteso, perché alcuni orologi Suunto non mostrano il bersaglio. */
const step = (p: Part, word?: string) => `- ${word ?? ZONE[p.effort][0]} ${amount(p)} ${ZONE[p.effort][1]} HR`
const HEAD: Partial<Record<Block['kind'], string>> = { warm: 'Riscaldamento', cool: 'Defaticamento', strides: 'Allunghi', hills: 'Salite' }
/** Il testo che Intervals.icu trasforma in allenamento strutturato, con il battito come unico bersaglio. */
export function workoutText(l: Block[]): string {
  return l.map(b => {
    if (b.reps && b.rest) return `${HEAD[b.kind] ? HEAD[b.kind] + ' ' : ''}${b.reps}x\n${step(b.part, b.kind === 'hills' ? 'Salita' : undefined)}\n${step(b.rest, b.rest.effort === 'walk' ? 'Recupero camminando' : 'Recupero')}`
    if (b.reps) return `${HEAD[b.kind] ?? ''} ${b.reps}x\n${step(b.part)}`.trim()
    return `${HEAD[b.kind] ?? ''}\n${step(b.part)}`.trim()
  }).join('\n\n')
}
export interface WatchEvent { id: string; date: string; name: string; description: string }
const EVENT_ID = /^[\w.-]{1,80}$/
export const watchEventError = (e: any) => !e || !EVENT_ID.test(e.id ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') || typeof e.name !== 'string' || e.name.length > 120 || typeof e.description !== 'string' || e.description.length > 4000
