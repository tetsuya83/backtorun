import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { addDays, buildTimeline, defaultState, planError, planFor, strengthDays, type Day, type Plan } from '../shared/engine'
import { generatePlan, pickDays, regenerate, type GoalInput } from '../shared/generator'
const P = plan as unknown as Plan

const runner: GoalInput = { id: 'o', race: '42k', km: 42.195, ambition: 'finire', weeklyKm: 25, longestKm: 12, days: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'], longDay: 'dom', strengthDays: [], startDate: '2026-11-09' }
const runDays = (r: ReturnType<typeof generatePlan>) => r.plan.weeks.filter(w => !w.pause).map(w => w.sessions.filter(s => !s.race).length)

describe('piano personalizzabile', () => {
  it('uscite separate dai giorni disponibili', () => {
    const r = generatePlan({ ...runner, sessions: 4, gradual: false })
    expect(Math.max(...runDays(r).slice(0, -1))).toBe(4)
    expect(planError(r.plan)).toBeNull()
  })
  it('i giorni scelti sono ben distanziati', () => {
    expect(pickDays(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'], 'dom', 3)).toEqual(['mer', 'ven', 'dom'])
    expect(pickDays(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'], 'dom', 2, 'mer')).toEqual(['mer', 'dom'])
  })
  it('crescita graduale delle uscite', () => {
    const w = runDays(generatePlan({ ...runner, sessions: 5, gradual: true }))
    expect(w[0]).toBe(4); expect(Math.max(...w)).toBe(5)
  })
  it('da 0 a 2 sedute impegnative', () => {
    const hard = (q: number) => generatePlan({ ...runner, sessions: 5, gradual: false, quality: q }).plan.weeks.map(w => w.sessions.filter(s => /Ripetute|Fondo|Fartlek|Salite|Medio/.test(s.text)).length)
    expect(Math.max(...hard(0))).toBe(0); expect(Math.max(...hard(1))).toBe(1); expect(Math.max(...hard(2))).toBe(2)
  })
  it('sotto il minimo serve accettare il rischio', () => {
    const r = generatePlan({ ...runner, sessions: 2 })
    expect(r.belowMin).toBe(true); expect(r.blocked).toBe(true)
    const ok = generatePlan({ ...runner, sessions: 2, risk: true })
    expect(ok.blocked).toBe(false); expect(ok.warnings.join()).toContain('rischio')
    expect(generatePlan({ ...runner, race: '10k', km: 10, sessions: 2 }).blocked).toBe(false)
  })
  it('il tempo massimo accorcia le sedute', () => {
    const r = generatePlan({ ...runner, sessions: 4, maxMin: { mer: 40 }, easyPace: 400 })
    const mar = r.plan.weeks.flatMap(w => w.sessions.filter(s => s.day === 'mer' && s.km).map(s => s.km!))
    expect(Math.max(...mar)).toBeLessThanOrEqual(6); expect(r.timeCapped).toContain('mer')
  })
  it('un lungo troppo corto per il tempo blocca la maratona', () => {
    const r = generatePlan({ ...runner, raceDate: '2027-10-03', maxMin: { dom: 90 }, easyPace: 420 })
    expect(r.blocked).toBe(true); expect(r.warnings[0]).toContain('domenica')
  })
  it('scarico ogni 3 settimane', () => {
    const w = generatePlan({ ...runner, cutEvery: 3 }).plan.weeks.filter(x => x.phase > 0 && x.phase < 4).map(x => x.scarico)
    expect(w.slice(0, 6)).toEqual([false, false, true, false, false, true])
  })
  it('le settimane di pausa non spostano la gara', () => {
    const base = generatePlan({ ...runner, raceDate: '2027-10-03' })
    const r = generatePlan({ ...runner, raceDate: '2027-10-03', pauses: ['2027-08-09', '2027-08-16'] })
    const t = buildTimeline(r.plan, { ...defaultState, startDate: r.startDate, raceDate: '2027-10-03' })
    expect(t.slots.at(-1)!.monday).toBe('2027-09-27')
    expect(t.slots.filter(s => s.pause).map(s => s.monday)).toEqual(['2027-08-09', '2027-08-16'])
    expect(r.weeks).toBe(base.weeks + 2)
  })
  it('le impostazioni restano nel piano', () => {
    const r = generatePlan({ ...runner, sessions: 4, hours: { mar: 6 } })
    expect(r.plan.meta.goal?.sessions).toBe(4); expect(r.plan.meta.goal?.hours?.mar).toBe(6)
  })
})

describe('ricalcolo', () => {
  const g: GoalInput = { ...runner, raceDate: '2027-10-03', sessions: 4 }
  const first = generatePlan(g), st = { ...defaultState, startDate: first.startDate, raceDate: g.raceDate!, mode: 'custom' as const }
  const today = addDays(first.startDate, 7 * 5 + 2)
  it('tiene il passato e arriva alla stessa gara', () => {
    const r = regenerate(first.plan, st, { ...g, sessions: 3, days: ['mar', 'gio', 'sab'], longDay: 'sab' }, today, true)
    expect(r.plan.weeks.slice(0, 6)).toEqual(first.plan.weeks.slice(0, 6))
    const t = buildTimeline(r.plan, r.state), last = t.slots.at(-1)!
    expect(last.monday).toBe('2027-09-27'); expect(last.sessions.find(s => s.race)!.day).toBe('dom')
    expect(r.plan.weeks[6].sessions.map(s => s.day)).toEqual(['mar', 'gio', 'sab'])
    expect(planError(r.plan)).toBeNull()
  })
  it('le settimane modificate a mano si possono tenere', () => {
    const edited: Plan = { ...first.plan, weeks: first.plan.weeks.map((w, i) => i === 10 ? { ...w, edited: true, sessions: [{ day: 'lun', text: 'Mia seduta', km: 5 }] } : w) }
    expect(regenerate(edited, st, g, today, true).plan.weeks[10].sessions[0].text).toBe('Mia seduta')
    expect(regenerate(edited, st, g, today, false).plan.weeks[10].sessions[0].text).not.toBe('Mia seduta')
  })
})

describe('Maratona graduale sui tuoi giorni', () => {
  it('sposta le uscite e la forza, la maratona resta di domenica', () => {
    const p = planFor({ plan: P, state: { ...defaultState, baseDays: { days: ['lun', 'mer', 'gio', 'sab'], long: 'sab', strength: ['mar', 'ven'] } } })
    const days = new Set(p.weeks.flatMap(w => w.sessions.filter(s => !s.race).map(s => s.day)))
    expect([...days].sort()).toEqual(['gio', 'lun', 'mer', 'sab'].sort() as Day[])
    expect(p.weeks.at(-1)!.sessions.find(s => s.race)!.day).toBe('dom')
    expect(strengthDays(p)).toEqual(['mar', 'ven'])
    expect(p.weeks[19].sessions.find(s => s.day === 'mer')!.text).toContain('Salite')
  })
})

describe('combinazioni', () => {
  it('ogni combinazione di opzioni dà un piano valido', () => {
    for (const km of [5, 10, 21.097, 42.195]) for (const longestKm of [0, 5, 15]) for (const sessions of [2, 3, 4, 5, 6]) for (const quality of [0, 1, 2])
      for (const cutEvery of [3, 4] as const) for (const progression of ['prudente', 'normale'] as const) for (const gradual of [true, false]) {
        const r = generatePlan({ ...runner, km, race: km > 40 ? '42k' : '10k', longestKm, weeklyKm: longestKm * 2, sessions, quality, cutEvery, progression, gradual, risk: true, maxMin: { mar: 45, dom: 150 } })
        expect(planError(r.plan)).toBeNull()
        for (const w of r.plan.weeks) {
          expect(new Set(w.sessions.map(s => s.day)).size).toBe(w.sessions.length)
          expect(w.sessions.filter(s => !s.race).length).toBeLessThanOrEqual(sessions)
          for (const s of w.sessions) expect(s.text).not.toMatch(/undefined|NaN/)
        }
      }
  })
})
