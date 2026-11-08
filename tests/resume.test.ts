import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { addDays, buildTimeline, defaultState, sessionDate, slotForDate, type Activity, type Plan, type State } from '../shared/engine'
import { applyResume, resumeFor, stopGuess, trialPain, undoResume } from '../shared/resume'

const P = plan as unknown as Plan
const st: State = { ...defaultState, raceDate: '2027-10-24' }
const t = buildTimeline(P, st)
const mon = (w: number) => t.slots.find(s => s.week === w)!.monday
let n = 0
const id = () => 'x' + ++n
const run = (date: string, extra: Partial<Activity> = {}): Activity => ({ id: id(), date, type: 'corsa', source: 'manuale', ...extra } as Activity)

describe('ripresa dopo uno stop', () => {
  it('quanto tornare indietro dipende dai giorni di stop', () => {
    const from = addDays(mon(7), 1)
    expect(resumeFor(t, from, addDays(from, 4), 'altro')).toMatchObject({ back: 0, week: null, trial: false })
    expect(resumeFor(t, from, addDays(from, 9), 'altro')).toMatchObject({ back: 1, week: 6, trial: false })
    expect(resumeFor(t, from, addDays(from, 19), 'malattia')).toMatchObject({ back: 2, week: 5, trial: true })
    expect(resumeFor(t, from, addDays(from, 40), 'altro')).toMatchObject({ back: 3, week: 4, trial: true })
    expect(resumeFor(t, from, addDays(from, 3), 'dolore')).toMatchObject({ back: 0, trial: true })
  })
  it('non si torna prima della settimana 1', () => {
    expect(resumeFor(t, addDays(mon(2), 1), addDays(mon(2), 30), 'altro').week).toBe(1)
  })
  it('nel blocco maratona non si torna indietro', () => {
    const r = resumeFor(t, addDays(mon(40), 1), addDays(mon(40), 15), 'altro')
    expect(r.week).toBeNull(); expect(r.note).toMatch(/gara/)
  })
  it('confermata, la settimana di ripresa diventa quella proposta e le corse dopo slittano', () => {
    const today = addDays(mon(9), 2), from = addDays(mon(7), 1), to = addDays(today, -1)
    const next = applyResume(P, st, from, to, 'malattia', today, id)
    const tt = buildTimeline(P, next), now = slotForDate(tt, today)!
    expect(now.week).toBe(5) // fermo durante la 7, 2 settimane indietro
    expect(now.monday).toBe(mon(9))
    expect(next.resumes!.at(-1)!.trials!.length).toBe(2)
    expect(next.planned!.filter(x => x.name === 'Uscita di prova').length).toBe(2)
    expect(next.planned!.every(x => x.date >= today)).toBe(true)
    // le settimane prima della ripresa non cambiano
    expect(slotForDate(tt, addDays(mon(8), 1))!.week).toBe(8)
    expect(undoResume(next)).toMatchObject({ resumes: [], planned: [] })
  })
  it('suggerisce lo stop solo dopo 8 giorni senza corse previste', () => {
    const today = addDays(mon(6), 3)
    const acts = [run(addDays(today, -9))]
    expect(stopGuess(t, acts, st, today)).toMatchObject({ from: addDays(today, -8) })
    expect(stopGuess(t, [run(addDays(today, -3))], st, today)).toBeNull()
    const done = applyResume(P, st, addDays(today, -8), addDays(today, -1), 'altro', today, id)
    expect(stopGuess(buildTimeline(P, done), acts, done, today)).toBeNull()
  })
  it('un dolore sopra 2 in un\'uscita di prova viene segnalato', () => {
    const today = addDays(mon(9), 2)
    const next = applyResume(P, st, addDays(mon(7), 1), addDays(today, -1), 'dolore', today, id)
    const d = next.resumes!.at(-1)!.trials![0]
    expect(trialPain(next, [run(d, { knee: 2 })])).toBeNull()
    expect(trialPain(next, [run(d, { knee: 4 })])).toMatchObject({ level: 4, date: d })
  })
  it('le uscite di prova cadono su giorni di corsa', () => {
    const today = addDays(mon(9), 0)
    const next = applyResume(P, st, addDays(mon(7), 1), addDays(today, -1), 'dolore', today, id)
    const tt = buildTimeline(P, next)
    for (const d of next.resumes!.at(-1)!.trials!) {
      const s = slotForDate(tt, d)!
      expect(s.sessions.some(x => sessionDate(s, x.day) === d)).toBe(true)
    }
  })
})
