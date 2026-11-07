import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import type { Activity, Plan } from '../shared/engine'
import { cooperVo2, easyFrom5k, placeBase, recentVolume, suggestTest, testDue, walkVo2, weekFromTest } from '../shared/tests'

const P = plan as unknown as Plan
const run = (date: string, km: number, sec: number, extra: Partial<Activity> = {}): Activity => ({ id: date + km, date, type: 'corsa', source: 'manuale', km, seconds: sec, ...extra })

describe('formule', () => {
  it('Cooper: 2400 m valgono circa 42 ml/kg/min', () => { expect(cooperVo2(2400)).toBeCloseTo(42.4, 1) })
  it('cammino: un uomo di 45 anni e 80 kg in 15 minuti a 130 bpm', () => {
    const v = walkVo2({ kg: 80, age: 45, male: true, sec: 900, hr: 130 })
    expect(v).toBeGreaterThan(35); expect(v).toBeLessThan(50)
  })
  it('ritmo facile dai 5 km in 25 minuti: tra 6:06 e 6:36 al km', () => { expect(easyFrom5k(1500)).toEqual([366, 396]) })
})
describe('posizione nella tabella', () => {
  it('soglie del Cooper e dei 5 km', () => {
    expect(weekFromTest('cooper', 1500)).toBe(8); expect(weekFromTest('cooper', 2100)).toBe(13); expect(weekFromTest('cooper', 3000)).toBe(27)
    expect(weekFromTest('5km', 2200)).toBe(9); expect(weekFromTest('5km', 1500)).toBe(19)
  })
  it('il volume recente frena un test molto buono', () => {
    const acts = [run('2026-11-02', 4, 1500), run('2026-11-04', 5, 1800), run('2026-11-09', 6, 2200)]
    const vol = recentVolume(acts, '2026-11-10')
    expect(vol.weekly).toBe(9); expect(vol.longest).toBe(6)
    const r = placeBase(P, 27, vol)
    expect(r.capped).toBe(true); expect(r.week).toBeGreaterThanOrEqual(9); expect(r.week).toBeLessThan(13)
  })
  it('senza corse registrate non si va oltre la settimana 13', () => {
    expect(placeBase(P, 19, recentVolume([], '2026-11-10')).week).toBe(13)
  })
  it('con il volume adatto il test decide', () => {
    const acts = ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-25'].map((d, i) => run(d, i === 3 ? 14 : 8, 3000))
    expect(placeBase(P, 19, recentVolume(acts, '2026-10-30')).week).toBe(19)
  })
})
describe('quale test', () => {
  it('con dolore recente il cammino', () => { expect(suggestTest([run('2026-11-09', 3, 1500, { knee: 4 })], '2026-11-10', 6).kind).toBe('cammino') })
  it('nella fase Ritorno la Scala', () => { expect(suggestTest([run('2026-11-09', 3, 1500)], '2026-11-10', 6).kind).toBe('scala') })
  it('con 15 minuti di fila e poco volume il Cooper', () => { expect(suggestTest([run('2026-11-09', 4, 1500)], '2026-11-10', 12).kind).toBe('cooper') })
  it('con 20 km a settimana i 5 km', () => {
    expect(suggestTest([run('2026-11-09', 12, 4000), run('2026-11-11', 9, 3000)], '2026-11-12', 20).kind).toBe('5km')
  })
})
describe('promemoria', () => {
  const tests = [{ date: '2026-11-07', kind: 'scala' }]
  it('mai senza un test fatto', () => { expect(testDue({ tests: [], today: '2027-03-01', scarico: true, planTestSoon: false })).toBeNull() })
  it('dopo 8 settimane, nello scarico', () => {
    expect(testDue({ tests, today: '2026-12-28', scarico: false, planTestSoon: false })).toBeNull()
    expect(testDue({ tests, today: '2027-01-02', scarico: true, planTestSoon: false })?.weeks).toBe(8)
  })
  it('dopo 10 settimane anche senza scarico, ma non con un test del piano vicino', () => {
    expect(testDue({ tests, today: '2027-01-16', scarico: false, planTestSoon: false })).not.toBeNull()
    expect(testDue({ tests, today: '2027-01-16', scarico: false, planTestSoon: true })).toBeNull()
  })
  it('rimandato o spento', () => {
    expect(testDue({ tests, today: '2027-01-16', scarico: true, planTestSoon: false, snooze: '2027-02-01' })).toBeNull()
    expect(testDue({ tests, today: '2027-01-16', scarico: true, planTestSoon: false, off: true })).toBeNull()
  })
})
