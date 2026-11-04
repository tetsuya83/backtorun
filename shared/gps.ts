/* Distanza dal GPS del telefono: i punti imprecisi si scartano e i piccoli spostamenti non si sommano. */
export interface Fix { lat: number; lon: number; acc: number; t: number; alt?: number | null }
export interface Track { last: Fix | null; weak: boolean }
const MAX_ACC = 30, MAX_SPEED = 12, R = 6371000
const rad = (x: number) => x * Math.PI / 180
export function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const newTrack = (): Track => ({ last: null, weak: false })
/** Restituisce i metri da aggiungere con questo punto. */
export function addFix(tr: Track, f: Fix): number {
  tr.weak = f.acc > MAX_ACC
  if (tr.weak) return 0
  if (!tr.last) { tr.last = f; return 0 }
  const d = meters(tr.last, f), dt = (f.t - tr.last.t) / 1000
  if (dt <= 0 || d < Math.max(4, f.acc * .5)) return 0 // fermo o rumore del segnale
  if (d / dt > MAX_SPEED) return 0 // salto del segnale: più veloce di uno sprint
  tr.last = f
  return d
}
