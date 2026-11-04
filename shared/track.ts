/* Lettura di GPX e TCX, i formati esportati da Garmin, Coros, Polar, Strava, Apple Salute (tramite app) e altri. */
import type { Activity } from './engine'
import { meters } from './gps'
export type Imported = Partial<Activity> & { date: string; sport: string; laps: number }
interface Pt { t: number; lat?: number; lon?: number; alt?: number; hr?: number; cad?: number; dist?: number }
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>\\s*([^<]*?)\\s*</(?:[\\w-]+:)?${name}>`, 'i')); return m ? m[1] : null }
const numTag = (xml: string, ...names: string[]) => { for (const n of names) { const v = tag(xml, n); if (v != null && v !== '' && isFinite(+v)) return +v } return undefined }
const blocks = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*?(?:/>|>[\\s\\S]*?</(?:[\\w-]+:)?${name}>)`, 'gi'))].map(m => m[0])
const fmt = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`
const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
const SPORT = (s: string) => /run|corsa|trail|treadmill|walk|hik|cammin/i.test(s) ? 'corsa' as const : /bik|cycl|bici|ride/i.test(s) ? 'bici' as const : /swim|nuoto/i.test(s) ? 'nuoto' as const : s ? 'altro' as const : 'corsa' as const

function summarize(p: Pt[], sport: string, opt: { laps: number; seconds?: number; km?: number; source: 'gpx' | 'tcx' }): Imported {
  if (p.length < 2) throw new Error('Il file non contiene un allenamento con dati di tempo.')
  p.sort((a, b) => a.t - b.t)
  let total = 0, moving = 0
  const d: number[] = [0]
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], dt = (b.t - a.t) / 1000
    const step = b.dist != null && a.dist != null ? Math.max(0, b.dist - a.dist) : b.lat != null && a.lat != null ? meters(a as any, b as any) : 0
    total += step; d.push(total)
    if (dt <= 15 || step / dt > .4) moving += dt // una sosta lunga non conta come tempo di corsa
  }
  const t0 = p[0].t, dist = opt.km != null ? opt.km * 1000 : total
  const hrs = p.map(x => x.hr ?? 0).filter(x => x > 0), run = sport === 'corsa'
  const cads = p.map(x => x.cad ?? 0).filter(x => x > 30).sort((a, b) => a - b)
  const twice = run && (cads[cads.length >> 1] ?? 999) < 130 ? 2 : 1
  const splits: string[] = []
  let mark = 1000, last = t0
  p.forEach((x, i) => { if (d[i] >= mark) { splits.push(fmt((x.t - last) / 1000)); last = x.t; mark += 1000 } })
  let gain = 0, ref: number | null = null, hasAlt = false
  for (const x of p) { if (x.alt == null) continue; hasAlt = true; if (ref == null || x.alt < ref) ref = x.alt; else if (x.alt - ref >= 3) { gain += x.alt - ref; ref = x.alt } }
  const every = Math.max(1, Math.ceil(p.length / 240))
  const trace = p.flatMap((x, i): NonNullable<Activity['trace']> => i % every ? [] : [[Math.round((x.t - t0) / 1000), x.hr ?? null, Math.round(d[i]), x.alt != null ? Math.round(x.alt) : null, x.cad ? Math.round(x.cad * twice) : null]])
  const start = new Date(t0), date = new Date(t0 - start.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
  const lastKm = p.filter((x, i) => d[i] >= total - 1000 && (x.hr ?? 0) > 0).map(x => x.hr!)
  return {
    date, sport, laps: opt.laps, source: opt.source, type: sport as Activity["type"],
    km: Math.round(dist / 10) / 100, seconds: Math.round(opt.seconds ?? moving), hrAvg: avg(hrs), hrMax: hrs.length ? Math.max(...hrs) : null, hrLast: avg(lastKm),
    splits: splits.join(' - ') || null, trace, cadence: cads.length ? Math.round(avg(cads)! * twice) : null, ascent: hasAlt ? Math.round(gain) : null,
  }
}
export function parseGpx(xml: string): Imported {
  if (!/<gpx\b/i.test(xml)) throw new Error('Questo file non è un GPX valido.')
  const pts = blocks(xml, 'trkpt').flatMap((b): Pt[] => {
    const lat = b.match(/\blat="([-\d.]+)"/)?.[1], lon = b.match(/\blon="([-\d.]+)"/)?.[1], time = tag(b, 'time')
    if (!lat || !lon || !time) return []
    return [{ t: Date.parse(time), lat: +lat, lon: +lon, alt: numTag(b, 'ele'), hr: numTag(b, 'hr', 'heartrate'), cad: numTag(b, 'cad', 'cadence') }]
  })
  if (!pts.length) throw new Error('Il file GPX non ha orari: serve un allenamento registrato, non un percorso.')
  const trk = xml.slice(xml.search(/<trk\b/i))
  return summarize(pts, SPORT(tag(trk, 'type') ?? ''), { laps: 0, source: 'gpx' })
}
export function parseTcx(xml: string): Imported {
  if (!/<TrainingCenterDatabase\b/i.test(xml)) throw new Error('Questo file non è un TCX valido.')
  const sport = xml.match(/<Activity\b[^>]*Sport="([^"]+)"/i)?.[1] ?? ''
  const laps = blocks(xml, 'Lap')
  const pts = blocks(xml, 'Trackpoint').flatMap((b): Pt[] => {
    const time = tag(b, 'Time')
    if (!time) return []
    const hrBlock = b.match(/<HeartRateBpm\b[\s\S]*?<\/HeartRateBpm>/i)?.[0] ?? ''
    return [{ t: Date.parse(time), lat: numTag(b, 'LatitudeDegrees'), lon: numTag(b, 'LongitudeDegrees'), alt: numTag(b, 'AltitudeMeters'), dist: numTag(b, 'DistanceMeters'), hr: hrBlock ? numTag(hrBlock, 'Value') : undefined, cad: numTag(b, 'RunCadence', 'Cadence') }]
  })
  const sec = laps.reduce((a, l) => a + (numTag(l, 'TotalTimeSeconds') ?? 0), 0), m = laps.reduce((a, l) => a + (numTag(l.replace(/<Track>[\s\S]*<\/Track>/i, ''), 'DistanceMeters') ?? 0), 0)
  return summarize(pts, SPORT(sport), { laps: laps.length, seconds: sec || undefined, km: m ? m / 1000 : undefined, source: 'tcx' })
}
/** Decide il formato dal contenuto, non dal nome: alcune app salvano con estensioni strane. */
export function parseXmlTrack(text: string): Imported {
  if (/<gpx\b/i.test(text)) return parseGpx(text)
  if (/<TrainingCenterDatabase\b/i.test(text)) return parseTcx(text)
  throw new Error('Formato non riconosciuto. Usa un file FIT, GPX o TCX.')
}
