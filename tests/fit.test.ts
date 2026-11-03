import { describe, it, expect } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { parseFit } from '../src/fit'
const M = Profile.MesgNum, start = new Date('2026-11-10T06:00:00Z'), at = (s: number) => new Date(start.getTime() + s * 1000)
function fit(session: Record<string, unknown>, rec: (s: number) => Record<string, unknown>) {
  const e = new Encoder(), T = 2040, D = 5000
  e.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'suunto', product: 0, timeCreated: start, serialNumber: 1 })
  for (let s = 0; s <= T; s += 5) e.onMesg(M.RECORD, { timestamp: at(s), distance: D * s / T, heartRate: 150, ...rec(s) })
  e.onMesg(M.SESSION, { timestamp: at(T), startTime: start, sport: 'running', totalElapsedTime: T, totalTimerTime: T, totalDistance: D, firstLapIndex: 0, numLaps: 1, ...session })
  e.onMesg(M.ACTIVITY, { timestamp: at(T), numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', totalTimerTime: T })
  const b = e.close(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer
}
describe('lettura FIT', () => {
  it('legge quota e cadenza, raddoppiando i passi del singolo piede', () => {
    const r = parseFit(fit({}, s => ({ enhancedAltitude: 120 + 15 * Math.sin(s / 300), cadence: 82 })))
    expect(r.km).toBe(5); expect(r.cadence).toBe(164); expect(r.ascent).toBeGreaterThan(20)
    const p = r.trace!.at(-1)!; expect(p.length).toBe(5); expect(p[3]).toBeGreaterThan(100); expect(p[4]).toBe(164)
  })
  it('non raddoppia se il file dà già i passi al minuto e preferisce il dislivello del Suunto', () => {
    const r = parseFit(fit({ totalAscent: 42 }, () => ({ cadence: 165, enhancedAltitude: 100 })))
    expect(r.cadence).toBe(165); expect(r.ascent).toBe(42)
  })
  it('funziona senza quota né cadenza', () => {
    const r = parseFit(fit({}, () => ({})))
    expect(r.cadence).toBeNull(); expect(r.ascent).toBeNull(); expect(r.trace!.at(-1)![1]).toBe(150)
  })
})
