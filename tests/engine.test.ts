import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { buildTimeline, defaultState, reviewWeek, scalaResult, slotForDate, sessionKey, type Plan, type Activity, type ScalaRound } from '../shared/engine'
const P = plan as unknown as Plan
describe('calendario', () => {
  it('50 settimane con gara a fine ottobre 2027', () => {
    const t = buildTimeline(P, { ...defaultState, raceDate: '2027-10-24' })
    expect(t.spareWeeks).toBe(0); expect(t.slots.length).toBe(50); expect(t.slots.at(-1)!.monday).toBe('2027-10-18')
    expect(t.earliestRace).toBe('2027-10-24')
  })
  it('6 salti portano a settembre', () => {
    const t = buildTimeline(P, { ...defaultState, skips: [2, 5, 7, 11, 14, 23] })
    expect(t.earliestRace).toBe('2027-09-12')
  })
  it('settimane risparmiate diventano mantenimento', () => {
    const t = buildTimeline(P, { ...defaultState, skips: [2, 5], raceDate: '2027-10-24' })
    expect(t.spareWeeks).toBe(2); expect(t.slots.filter(s => s.maintenance).length).toBe(2); expect(t.slots.at(-1)!.monday).toBe('2027-10-18')
  })
  it('una ripetizione sposta tutto di una settimana', () => {
    const t = buildTimeline(P, { ...defaultState, repeats: [3] })
    expect(t.earliestRace).toBe('2027-10-31'); expect(t.slots[3].key).toBe('w3.1')
  })
  it('gara troppo vicina', () => { expect(buildTimeline(P, { ...defaultState, raceDate: '2027-04-11' }).raceTooClose).toBe(true) })
  it('partenza dal test', () => {
    const t = buildTimeline(P, { ...defaultState, startWeek: 6 })
    expect(t.slots[0].week).toBe(6); expect(slotForDate(t, '2026-11-10')!.week).toBe(6)
  })
})
describe('regola del lungo', () => {
  it('rispetta 10% o 1 km su ogni combinazione di salti', () => {
    const sk = [2, 5, 7, 11, 14, 23]
    for (let m = 0; m < 64; m++) {
      const skips = sk.filter((_, i) => m >> i & 1)
      const w = P.weeks.filter(x => !skips.includes(x.week as number) && (x.week as number) >= 9 && (x.week as number) < 50)
      const ls = w.map(x => x.sessions.find(s => s.day === 'dom')!.km!)
      ls.forEach((d, i) => { const b = Math.max(0, ...ls.slice(Math.max(0, i - 4), i)); if (b && d > b) expect(d / b <= 1.1 || d - b <= 1).toBe(true) })
    }
  })
})
describe('revisione settimana', () => {
  const t = buildTimeline(P, defaultState), s = t.slots[0]
  const run = (day: any, f: number, x = {}): Activity => ({ id: day, date: '2026-11-10', type: 'corsa', source: 'manuale', sessionKey: sessionKey(s, day), fatica: f, knee: 1, ...x })
  const forza = (id: string): Activity => ({ id, date: '2026-11-09', type: 'forza', source: 'manuale' })
  it('propone il salto', () => expect(reviewWeek(t, s, [run('mar', 3), run('ven', 3), run('dom', 3), forza('a'), forza('b')]).canSkip).toBe(true))
  it('senza forza niente salto', () => expect(reviewWeek(t, s, [run('mar', 3), run('ven', 3), run('dom', 3), forza('a')]).canSkip).toBe(false))
  it('gonfiore blocca', () => expect(reviewWeek(t, s, [run('mar', 3, { swelling: true }), run('ven', 3), run('dom', 3), forza('a'), forza('b')]).canSkip).toBe(false))
  it('sovraccarico', () => expect(reviewWeek(t, s, [run('mar', 6), run('ven', 6), run('dom', 3)]).overload).toBe(true))
})
describe('Scala', () => {
  const ok: ScalaRound = { finished: true, fiato: 2, fatica: 4, knee: 1 }
  const no: ScalaRound = { finished: null, fiato: null, fatica: null, knee: null }
  it('R3', () => expect(scalaResult([ok, ok, ok, no, no]).week).toBe(3))
  it('R4', () => expect(scalaResult([ok, ok, ok, ok, no]).week).toBe(5))
  it('bonus', () => expect(scalaResult([ok, ok, ok, ok, ok]).week).toBe(7))
  it('R5 duro', () => expect(scalaResult([ok, ok, ok, ok, { ...ok, fiato: 3, fatica: 5 }]).week).toBe(6))
  it('gonfiore', () => expect(scalaResult([ok, ok, ok, ok, { ...ok, fiato: 3 }], true).week).toBe(4))
  it('solo consecutivi', () => expect(scalaResult([ok, no, ok, ok, ok]).week).toBe(1))
})
