/* Percorsi: misure, semplificazione e scambio GPX con le app degli orologi. */
import { meters } from './gps'
export type LngLat = [number, number]
export type Pt = [number, number] | [number, number, number]
export interface Leg { c: Pt[]; m: number }
export interface RouteSession { key: string; date: string; label: string; km: number | null }
export interface Route { id: string; name: string; way: LngLat[]; track: Pt[]; cuts: number[]; km: number; ascent: number | null; source: 'editor' | 'gpx'; session?: RouteSession | null; updatedAt?: number }
export const MAX_ROUTES = 30
export const MAX_TRACK = 1500
const near = (a: Pt, b: Pt) => meters({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] })
export const lengthOf = (c: Pt[]) => c.reduce((n, p, i) => i ? n + near(c[i - 1], p) : 0, 0)
/** Dislivello positivo: la soglia di 3 m evita di sommare il rumore della quota. */
export function gainOf(c: Pt[]): number | null {
  let gain = 0, ref: number | null = null
  for (const p of c) { const q = p[2]; if (q == null) continue; if (ref == null || q < ref) ref = q; else if (q - ref >= 3) { gain += q - ref; ref = q } }
  return ref == null ? null : Math.round(gain)
}
/** Distanza di un punto dal segmento, in metri, su un piano locale: basta per tratti brevi. */
function off(p: Pt, a: Pt, b: Pt) {
  const k = Math.cos(a[1] * Math.PI / 180) * 111320, K = 111320
  const px = (p[0] - a[0]) * k, py = (p[1] - a[1]) * K, bx = (b[0] - a[0]) * k, by = (b[1] - a[1]) * K, l = bx * bx + by * by
  const t = l ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0
  return Math.hypot(px - t * bx, py - t * by)
}
/** Toglie i punti superflui senza cambiare la forma, così il file resta leggero per gli orologi. */
export function simplify(c: Pt[], tol = 6): Pt[] {
  if (c.length < 3) return c
  const keep = new Array(c.length).fill(false), stack: [number, number][] = [[0, c.length - 1]]
  keep[0] = keep[c.length - 1] = true
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0, at = -1
    for (let i = a + 1; i < b; i++) { const d = off(c[i], c[a], c[b]); if (d > max) { max = d; at = i } }
    if (max > tol) { keep[at] = true; stack.push([a, at], [at, b]) }
  }
  return c.filter((_, i) => keep[i])
}
const join = (l: Leg[], tol: number) => { const track: Pt[] = [], cuts: number[] = []; for (const x of l) { cuts.push(Math.max(0, track.length - 1)); const s = simplify(x.c, tol); track.push(...(track.length ? s.slice(1) : s)) } return { track, cuts } }
/** Unisce i tratti disegnati in un percorso da salvare. */
export function buildRoute(id: string, name: string, way: LngLat[], legs: Leg[], source: Route['source'], session?: RouteSession | null): Route {
  let tol = 6, r = join(legs, tol)
  while (r.track.length > MAX_TRACK) { tol *= 1.5; r = join(legs, tol) }
  const m = legs.reduce((n, x) => n + x.m, 0)
  return { id, name: name.trim(), way, ...r, km: Math.round(m / 10) / 100, ascent: gainOf(legs.flatMap(x => x.c)), source, session: session ?? null }
}
/** Ricostruisce i tratti per poter modificare un percorso salvato. */
export function legsOf(r: Pick<Route, 'track' | 'cuts'>): Leg[] {
  return r.cuts.map((a, i) => { const c = r.track.slice(a, (r.cuts[i + 1] ?? r.track.length - 1) + 1); return { c, m: lengthOf(c) } })
}
/** Divide un anello proposto in tratti, così i punti si possono trascinare come in un percorso disegnato. */
/** m è la distanza data dal servizio: i tratti la ripartono, così i km restano quelli della proposta. */
export function splitLoop(c: Pt[], parts = 4, m?: number): { way: LngLat[]; legs: Leg[] } {
  const acc = [0]; for (let i = 1; i < c.length; i++) acc.push(acc[i - 1] + near(c[i - 1], c[i]))
  const tot = acc[acc.length - 1], idx = [0]
  for (let k = 1; k < parts; k++) { const i = acc.findIndex(x => x >= tot * k / parts); if (i > idx[idx.length - 1] && i < c.length - 1) idx.push(i) }
  idx.push(c.length - 1)
  const k = m && tot ? m / tot : 1, legs = idx.slice(1).map((b, i) => { const s = c.slice(idx[i], b + 1); return { c: s, m: lengthOf(s) * k } })
  return { way: idx.map(i => [c[i][0], c[i][1]] as LngLat), legs }
}
export const mirror = (l: Leg[]): Leg[] => [...l].reverse().map(x => ({ c: [...x.c].reverse(), m: x.m }))
export function fitOf(km: number, target: number | null | undefined) {
  if (!target) return null
  const d = Math.round((km - target) * 10) / 10, ok = Math.abs(km - target) <= Math.max(.3, target * .05), a = String(Math.abs(d)).replace('.', ',')
  return { ok, text: ok ? 'In linea con la seduta' : d < 0 ? `Mancano ${a} km alla seduta` : `${a} km oltre la seduta`, ratio: Math.min(1, km / target) }
}
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
export function buildGpx(r: Pick<Route, 'name' | 'track'>) {
  const pts = r.track.map(p => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ''}</trkpt>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="BackToRun" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(r.name)}</name></metadata><trk><name>${esc(r.name)}</name><trkseg>${pts}</trkseg></trk></gpx>\n`
}
/** Un GPX senza orari è un percorso; con gli orari è un allenamento registrato. */
export const isRouteGpx = (xml: string) => /<gpx\b/i.test(xml) && /<(trkpt|rtept)\b/i.test(xml) && !/<(?:\w+:)?time\b[^>]*>[^<]*<\/(?:\w+:)?time>\s*(?:<[^>]*>[^<]*<\/[^>]*>\s*)*<\/(?:trkpt|rtept)>/i.test(xml)
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
export function parseRouteGpx(xml: string, fallback = 'Percorso importato'): { name: string; way: LngLat[]; leg: Leg } {
  if (!/<gpx\b/i.test(xml)) throw new Error('Questo file non è un GPX valido.')
  const c: Pt[] = []
  for (const m of xml.matchAll(/<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi)) {
    const lat = parseFloat(m[2].match(/\blat="([-\d.]+)"/)?.[1] ?? ''), lon = parseFloat(m[2].match(/\blon="([-\d.]+)"/)?.[1] ?? ''), e = m[3]?.match(/<ele>\s*([-\d.]+)\s*<\/ele>/i)?.[1]
    if (isFinite(lat) && isFinite(lon)) c.push(e != null ? [lon, lat, Math.round(parseFloat(e) * 10) / 10] : [lon, lat])
  }
  if (c.length < 2) throw new Error('Il file GPX non contiene un percorso.')
  const name = unesc(xml.match(/<name>\s*(?:<!\[CDATA\[)?([^<\]]+)/i)?.[1] ?? '').slice(0, 60) || fallback
  return { name, way: [[c[0][0], c[0][1]], [c[c.length - 1][0], c[c.length - 1][1]]], leg: { c, m: lengthOf(c) } }
}
const coord = (p: any) => Array.isArray(p) && p.length >= 2 && p.length <= 3 && p.every((x: any) => typeof x === 'number' && isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
/** Restituisce il problema del percorso, oppure null se va bene. */
export function routeError(r: any): string | null {
  const n = String(r?.name ?? '').trim()
  if (!r?.id || !/^[\w-]{1,60}$/.test(r.id)) return 'Percorso non valido.'
  if (!n || n.length > 60) return 'Dai al percorso un nome di massimo 60 caratteri.'
  if (!Array.isArray(r.track) || r.track.length < 2 || r.track.length > MAX_TRACK || !r.track.every(coord)) return 'Percorso non valido.'
  if (!Array.isArray(r.way) || r.way.length > 300 || !r.way.every(coord) || !Array.isArray(r.cuts) || !r.cuts.every((x: any) => Number.isInteger(x) && x >= 0 && x < r.track.length)) return 'Percorso non valido.'
  if (typeof r.km !== 'number' || !(r.km >= 0) || r.km > 1000) return 'Percorso non valido.'
  return null
}

/* Il fondo di un anello, dai dati di openrouteservice: fondo indicato e, quando manca, tipo di strada. */
export type Ground = 'asfalto' | 'sterrato' | 'sentieri'
export type Mix = Record<Ground | 'ignoto', number>
export const GROUNDS: [Ground, string][] = [['asfalto', 'Asfalto'], ['sterrato', 'Sterrato e ghiaia'], ['sentieri', 'Sentieri e prati']]
const PAVED = [1, 3, 4, 6, 7, 14, 18], LOOSE = [2, 8, 10, 11, 12], SOFT = [15, 17]
export function groundOf(surface: number, way: number): Ground | 'ignoto' {
  if (PAVED.includes(surface)) return way === 4 ? 'sentieri' : 'asfalto'
  if (SOFT.includes(surface)) return 'sentieri'
  if (LOOSE.includes(surface)) return way === 4 ? 'sentieri' : 'sterrato'
  if (way === 4) return 'sentieri'
  if (way === 5) return 'sterrato'
  if ([1, 2, 3, 6, 7].includes(way)) return 'asfalto'
  return 'ignoto'
}
type Ranges = [number, number, number][]
const at = (r: Ranges | undefined, i: number) => r?.find(x => i >= x[0] && i < x[1])?.[2] ?? 0
/** Quote di fondo lungo il percorso, pesate sulla distanza di ogni tratto. */
export function mixOf(c: Pt[], surface?: Ranges, way?: Ranges): Mix | null {
  if (!surface && !way) return null
  const m: Mix = { asfalto: 0, sterrato: 0, sentieri: 0, ignoto: 0 }
  let tot = 0
  for (let i = 0; i < c.length - 1; i++) { const d = near(c[i], c[i + 1]); m[groundOf(at(surface, i), at(way, i))] += d; tot += d }
  if (!tot) return null
  for (const k of Object.keys(m) as (keyof Mix)[]) m[k] = Math.round(m[k] / tot * 100) / 100
  return m
}
/** Quanto un anello rispetta i fondi scelti: nessuna scelta vale tutto. */
export const matchOf = (mix: Mix | null | undefined, want: Ground[]) => !want.length ? 1 : mix ? Math.round(want.reduce((n, g) => n + mix[g], 0) * 100) / 100 : 0
export function rankLoops<T extends { m: number; mix?: Mix | null }>(l: T[], want: Ground[], km: number, n = 3): (T & { match: number })[] {
  return l.map(x => ({ ...x, match: matchOf(x.mix, want) })).sort((a, b) => b.match - a.match || Math.abs(a.m / 1000 - km) - Math.abs(b.m / 1000 - km)).slice(0, n)
}
