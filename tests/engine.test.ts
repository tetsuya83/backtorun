import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { buildTimeline, defaultState, moveRace, planError, planFor, reviewWeek, scalaResult, sessionDate, slotForDate, sessionKey, strengthDays, type Day, type Plan, type Activity, type ScalaRound } from '../shared/engine'
import { blankPlan, generatePlan, type GoalInput, type RaceType } from '../shared/generator'
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

describe('piano personale', () => {
  const combos = (): GoalInput[] => {
    const out: GoalInput[] = []
    for (const [race, km] of [['5k', 5], ['10k', 10], ['21k', 21.097], ['42k', 42.195], ['trail', 30], ['altro', 15], ['altro', 60], ['altro', 3]] as [RaceType, number][])
      for (const longestKm of [0, 1.5, 2.5, 5, 12, 25])
        for (const days of [['mar', 'gio', 'dom'], ['lun', 'mer', 'ven', 'dom'], ['mar', 'mer', 'ven', 'sab', 'dom']] as Day[][])
          for (const ambition of ['finire', 'migliorare'] as const)
            out.push({ id: 'x', race, km, ambition, weeklyKm: longestKm * 2, longestKm, days, longDay: 'dom', strengthDays: [], startDate: '2026-11-09' })
    return out
  }
  it('rispetta le regole di progressione su ogni combinazione', () => {
    for (const g of combos()) {
      const r = generatePlan(g), w = r.plan.weeks
      expect(planError(r.plan)).toBeNull()
      const ls = w.slice(0, -1).map(x => Math.max(0, ...x.sessions.map(s => s.km ?? 0)))
      ls.forEach((d, i) => { const b = Math.max(0, ...ls.slice(Math.max(0, i - 4), i)); if (b && d > b) expect(d / b <= 1.1 || d - b <= 1 || d <= 5).toBe(true) })
      const tot = w.slice(0, -1).map(x => x.total ?? 0)
      tot.forEach((d, i) => { const b = Math.max(0, ...tot.slice(Math.max(0, i - 4), i)); if (b && !(d <= b * 1.25 || d - b <= 7)) throw new Error(`${g.race} ${g.km} long ${g.longestKm} gg ${g.days.length} ${g.ambition}: sett ${i + 1} ${b} -> ${d}`) })
      expect(w.at(-1)!.sessions.at(-1)!.race).toBe(true)
      for (const x of w) expect(new Set(x.sessions.map(s => s.day)).size).toBe(x.sessions.length)
      for (const x of w) for (const s of x.sessions) { expect(s.text).not.toMatch(/undefined|NaN/); if (!s.race && s.km) { expect(Number.isFinite(s.km)).toBe(true) } }
    }
  })
  it('lungo fino al target senza data', () => {
    for (const g of combos()) { const r = generatePlan(g); expect(r.reachedLong).toBe(r.targetLong); expect(r.weeks).toBe(r.idealWeeks) }
  })
  it('da zero parte col cammino-corsa', () => {
    const r = generatePlan({ ...combos()[0], longestKm: 0, race: '42k', km: 42.195 })
    expect(r.plan.weeks[0].sessions[0].text).toContain('cammino'); expect(r.plan.weeks[0].sessions.length).toBe(3)
    expect(r.targetLong).toBe(30); expect(r.plan.weeks.at(-1)!.total).toBeGreaterThan(42)
  })
  const base: GoalInput = { id: 'p', race: '10k', km: 10, ambition: 'finire', weeklyKm: 15, longestKm: 7, days: ['mar', 'gio', 'dom'], longDay: 'dom', strengthDays: ['lun', 'mar'], startDate: '2026-11-09' }
  it('la gara cade nel giorno giusto e il calendario finisce lì', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-06' }), st = { ...defaultState, startDate: r.startDate, raceDate: '2027-03-06' }
    const t = buildTimeline(r.plan, st), last = t.slots.at(-1)!, s = last.sessions.find(x => x.race)!
    expect(s.day).toBe('sab'); expect(sessionDate(last, s.day)).toBe('2027-03-06'); expect(t.raceTooClose).toBe(false)
  })
  it('data ampia: il piano parte più tardi', () => {
    const r = generatePlan({ ...base, raceDate: '2027-12-05' }); expect(r.startDate > '2026-11-09').toBe(true); expect(r.blocked).toBe(false)
  })
  it('data vicina: blocca e indica la prima data', () => {
    const r = generatePlan({ ...base, race: '42k', km: 42.195, raceDate: '2027-01-10' })
    expect(r.blocked).toBe(true); expect(r.earliestRace! > '2027-01-10').toBe(true)
  })
  it('data stretta ma fattibile: avvisa', () => {
    const r = generatePlan({ ...base, race: '21k', km: 21.097, longestKm: 8, ambition: 'migliorare', raceDate: '2027-01-31' })
    expect(r.blocked).toBe(false); expect(r.reachedLong).toBeLessThan(r.targetLong); expect(r.warnings.length).toBeGreaterThan(0)
  })
  it('la forza non occupa i giorni di corsa', () => expect(generatePlan(base).plan.meta.strengthDays).toEqual(['lun']))
  it('spostare la gara sposta calendario e giorno', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-07' }), st = { ...defaultState, startDate: r.startDate, raceDate: '2027-03-07' }
    const m = moveRace(r.plan, st, '2027-03-13'), t = buildTimeline(m.plan, m.state), last = t.slots.at(-1)!
    expect(last.sessions.find(x => x.race)!.day).toBe('sab'); expect(sessionDate(last, 'sab')).toBe('2027-03-13')
  })
  it('una ripetizione oltre la data viene segnalata', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-07' })
    expect(buildTimeline(r.plan, { ...defaultState, startDate: r.startDate, raceDate: '2027-03-07', repeats: [2] }).raceTooClose).toBe(true)
  })
  it('tabella vuota e controlli', () => {
    const p = blankPlan('b', 'Mia', 4)
    expect(planError(p)).toBeNull(); expect(buildTimeline(p, defaultState).slots.length).toBe(4)
    const bad = { ...p, weeks: [{ ...p.weeks[0], sessions: [{ day: 'mar', text: 'a', km: 1 }, { day: 'mar', text: 'b', km: 1 }] }] }
    expect(planError(bad)).toContain('stesso giorno'); expect(planError({ ...p, weeks: [] })).toContain('almeno')
    expect(planError(P)).toBe('Piano non valido.')
  })
  it('il piano base resta intatto', () => {
    expect(planFor({ plan: P, custom: blankPlan('b', 'Mia', 2), state: defaultState })).toBe(P)
    expect(strengthDays(P)).toEqual(['lun', 'gio'])
    expect(buildTimeline(P, defaultState).slots[0].key).toBe('w1.0')
  })
})
