import { Decoder, Stream } from '@garmin/fitsdk'
import type { Activity } from '../shared/engine'
export type FitResult = Partial<Activity> & { date: string; sport: string; laps: number }
const fmt = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`
const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null

export function parseFit(buf: ArrayBuffer): FitResult {
  const stream = Stream.fromArrayBuffer(buf)
  if (!Decoder.isFIT(stream)) throw new Error('Questo file non è un FIT valido.')
  const dec = new Decoder(stream)
  const { messages, errors } = dec.read({ convertDateTimesToDates: true, convertTypesToStrings: true, applyScaleAndOffset: true, expandSubFields: true, expandComponents: true, mergeHeartRates: true })
  const sess = (messages.sessionMesgs ?? [])[0] as any
  const rec = (messages.recordMesgs ?? []) as any[]
  const laps = (messages.lapMesgs ?? []) as any[]
  if (!sess && !rec.length) throw new Error(errors?.length ? 'Il file FIT è danneggiato.' : 'Il file FIT non contiene un allenamento.')
  const start: Date = sess?.startTime ?? rec[0]?.timestamp
  const date = new Date(start.getTime() - start.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
  const last = rec.at(-1)
  const dist = sess?.totalDistance ?? last?.distance ?? 0
  const secs = sess?.totalTimerTime ?? sess?.totalElapsedTime ?? (rec.length ? (last.timestamp - rec[0].timestamp) / 1000 : 0)
  const hrs = rec.map(r => r.heartRate).filter((x): x is number => x > 0)
  // intertempi al km dai punti GPS
  const splits: string[] = []
  let mark = 1000, t0 = rec[0]?.timestamp?.getTime?.() ?? 0
  for (const r of rec) {
    if (r.distance >= mark) { splits.push(fmt((r.timestamp.getTime() - t0) / 1000)); t0 = r.timestamp.getTime(); mark += 1000 }
  }
  const lastKm = rec.filter(r => r.distance >= dist - 1000 && r.heartRate > 0).map(r => r.heartRate)
  const step = Math.max(1, Math.ceil(rec.length / 240))
  const t00 = rec[0]?.timestamp?.getTime?.() ?? 0
  const trace = rec.filter((_, i) => i % step === 0).map(r => [Math.round((r.timestamp.getTime() - t00) / 1000), r.heartRate ?? null, r.distance != null ? Math.round(r.distance) : null] as [number, number | null, number | null])
  const sport = String(sess?.sport ?? 'running')
  return {
    date, sport, laps: laps.length, source: 'fit',
    type: sport === 'cycling' ? 'bici' : sport === 'swimming' ? 'nuoto' : sport === 'running' || sport === 'walking' ? 'corsa' : 'altro',
    km: Math.round(dist / 10) / 100, seconds: Math.round(secs),
    hrAvg: sess?.avgHeartRate ?? avg(hrs), hrMax: sess?.maxHeartRate ?? (hrs.length ? Math.max(...hrs) : null), hrLast: avg(lastKm),
    splits: splits.join(' - ') || null, trace,
  }
}
export const paceOf = (km?: number | null, s?: number | null) => km && s ? fmt(s / km) + '/km' : null
export const timeOf = (s?: number | null) => { if (!s) return null; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60); return h ? `${h}h${String(m).padStart(2, '0')}'` : `${m}'${String(x).padStart(2, '0')}"` }
