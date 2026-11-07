import { describe, expect, it } from 'vitest'
import { nextAdvice, weekAdvice } from '../shared/adapt'
import { sessionKey, type Activity, type Slot, type Timeline } from '../shared/engine'

const slot = (week: number, monday: string): Slot => ({ week, phase: 1, scarico: false, skippable: false, total: 20, monday, key: `w${week}`, occurrence: 1, sessions: [
  { day: 'mar', text: 'Corsa facile 30\'', km: 5, fatica: '3-4' }, { day: 'gio', text: 'Corsa facile 30\'', km: 5, fatica: '3-4' }, { day: 'dom', text: 'Lungo 50\'', km: 8, fatica: '4' },
] })
const t: Timeline = { slots: [slot(3, '2026-11-02'), slot(4, '2026-11-09')], raceTooClose: false, earliestRace: '', spareWeeks: 0 }
const run = (s: Slot, day: 'mar' | 'gio' | 'dom', date: string, x: Partial<Activity> = {}): Activity => ({ id: date, date, type: 'corsa', source: 'manuale', sessionKey: sessionKey(s, day), fatica: 3, ...x })
const s3 = t.slots[0]

describe('piano che si adatta', () => {
  it('una settimana regolare non propone nulla', () => {
    expect(weekAdvice(t, s3, [run(s3, 'mar', '2026-11-03'), run(s3, 'gio', '2026-11-05'), run(s3, 'dom', '2026-11-08')])).toBeNull()
  })
  it('propone di ripetere con due sedute saltate', () => {
    const a = weekAdvice(t, s3, [run(s3, 'mar', '2026-11-03')])!
    expect(a.week).toBe(3)
    expect(a.reasons[0]).toBe('Hai saltato 2 sedute su 3')
  })
  it('propone di ripetere con fatica alta o dolore', () => {
    expect(weekAdvice(t, s3, [run(s3, 'mar', '2026-11-03', { fatica: 7 }), run(s3, 'gio', '2026-11-05', { fatica: 7 }), run(s3, 'dom', '2026-11-08')])!.reasons).toContain('Fatica sopra le attese in due sedute di fila')
    const p = weekAdvice(t, s3, [run(s3, 'mar', '2026-11-03'), run(s3, 'gio', '2026-11-05', { pains: [{ zone: 'polpaccio', side: 'dx', level: 5 }] }), run(s3, 'dom', '2026-11-08')])!
    expect(p.reasons[0]).toMatch(/^Dolore fino a 5/)
  })
  it('in settimana alleggerisce la seduta successiva', () => {
    const acts = [run(s3, 'mar', '2026-11-03', { fatica: 6 }), run(s3, 'gio', '2026-11-05', { fatica: 7 })]
    const a = nextAdvice(t, acts, '2026-11-05')!
    expect(a.date).toBe('2026-11-08')
    expect(a.minutes).toBe(30)
    expect(nextAdvice(t, [run(s3, 'mar', '2026-11-03', { fatica: 6 })], '2026-11-03')).toBeNull()
  })
  it('lascia agli avvisi di stop i casi gravi', () => {
    expect(nextAdvice(t, [run(s3, 'mar', '2026-11-03', { pains: [{ zone: 'ginocchio', level: 6 }], swelling: true })], '2026-11-03')).toBeNull()
    expect(nextAdvice(t, [run(s3, 'mar', '2026-11-03', { pains: [{ zone: 'ginocchio', level: 5 }] })], '2026-11-03')!.date).toBe('2026-11-05')
  })
})
import { weekSummary } from '../shared/adapt'
describe('riepilogo della settimana', () => {
  it('somma sedute, km, fatica e prossima settimana', () => {
    const s = weekSummary(t, s3, [run(s3, 'mar', '2026-11-03', { km: 5, seconds: 1800, fatica: 4 }), run(s3, 'dom', '2026-11-08', { km: 8, seconds: 3000, fatica: 5, pains: [{ zone: 'polpaccio', level: 2 }] }), { id: 'f', date: '2026-11-04', type: 'forza', source: 'manuale' }])
    expect([s.done, s.planned, s.km, s.kmPlan, s.minutes, s.fatica, s.faticaPlan, s.strength]).toEqual([2, 3, 13, 20, 80, 4.5, 4, 1])
    expect(s.pain!.level).toBe(2)
    expect(s.next!.long).toBe('Lungo 50\'')
  })
})
