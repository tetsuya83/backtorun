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
