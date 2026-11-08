import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { buildTimeline, defaultState, sessionDate, type Plan } from '../shared/engine'
import { itemsOf, listOf, minutesOf, SHEETS, sheetFor, stageOf } from '../shared/strength'
import { generatePlan } from '../shared/generator'

const P = plan as unknown as Plan
const t = buildTimeline(P, { ...defaultState, raceDate: '2027-10-24' })
const slot = (w: number) => t.slots.find(s => s.week === w)!

describe('schede di forza', () => {
  it('ogni scheda ha la versione in palestra e a corpo libero, senza doppioni', () => {
    for (const s of SHEETS) for (const l of Object.values(s.items)) {
      expect(l.length).toBeGreaterThanOrEqual(4)
      expect(new Set(l.map(e => e.id)).size).toBe(l.length)
    }
    expect(new Set(SHEETS.map(s => s.id)).size).toBe(SHEETS.length)
  })
  it('la fase della forza segue il piano, con rifinitura e settimana della gara', () => {
    expect(stageOf(t, slot(1))).toBe('ritorno')
    expect(stageOf(t, slot(10))).toBe('base')
    expect(stageOf(t, slot(20))).toBe('costruzione')
    expect(stageOf(t, slot(28))).toBe('specifico')
    expect(stageOf(t, slot(40))).toBe('specifico')
    expect(stageOf(t, slot(48))).toBe('rifinitura')
    expect(stageOf(t, slot(49))).toBe('rifinitura')
    expect(stageOf(t, slot(50))).toBe('gara')
  })
  it('lunedì scheda A, giovedì scheda B', () => {
    const s = slot(10)
    expect(sheetFor(P, t, s, sessionDate(s, 'lun')).sheet!.id).toBe('base-a')
    expect(sheetFor(P, t, s, sessionDate(s, 'gio')).sheet!.id).toBe('base-b')
    expect(sheetFor(P, t, s, sessionDate(s, 'gio')).other!.id).toBe('base-a')
  })
  it('fuori dai giorni di forza alterna con l\'ultima fatta', () => {
    const s = slot(10)
    expect(sheetFor(P, t, s, sessionDate(s, 'sab'), 'base-a').sheet!.letter).toBe('B')
    expect(sheetFor(P, t, s, sessionDate(s, 'sab'), 'base-b').sheet!.letter).toBe('A')
  })
  it('in rifinitura una sola seduta corta, nella settimana della gara nessuna', () => {
    const r = slot(49)
    expect(sheetFor(P, t, r, sessionDate(r, 'lun')).sheet!.id).toBe('rifinitura')
    expect(sheetFor(P, t, r, sessionDate(r, 'gio')).sheet).toBeNull()
    const g = slot(50)
    expect(sheetFor(P, t, g, sessionDate(g, 'lun')).sheet).toBeNull()
    const items = itemsOf(SHEETS.find(s => s.id === 'rifinitura')!, 'palestra', 4, false, true)
    expect(items.every(x => x.s.sets === 2)).toBe(true)
  })
  it('senza dolore ci sono i saltelli, con dolore spariscono', () => {
    const a = SHEETS.find(s => s.id === 'costruzione-a')!
    expect(itemsOf(a, 'casa', 2, false, true).some(x => x.ex.plyo)).toBe(true)
    expect(itemsOf(a, 'casa', 2, false, false).some(x => x.ex.plyo)).toBe(false)
  })
  it('durata plausibile e lista leggibile', () => {
    for (const s of SHEETS) for (const p of ['palestra', 'casa'] as const) {
      const m = minutesOf(itemsOf(s, p, s.stage === 'ritorno' ? 0 : 2, false, true))
      expect(m).toBeGreaterThanOrEqual(15); expect(m).toBeLessThanOrEqual(55)
    }
    expect(listOf(SHEETS[0], 'palestra')).toBe('Leg press o squat, polpacci in piedi, discese da gradino, plank')
  })
  it('anche i piani personali hanno rifinitura e gara', () => {
    const g = generatePlan({ id: 'g', race: '21k', km: 21.0975, ambition: 'finire', weeklyKm: 15, longestKm: 7, days: ['mar', 'gio', 'dom'], longDay: 'dom', strengthDays: ['lun', 'ven'], startDate: '2026-11-09', raceDate: '2027-04-18' })
    const tt = buildTimeline(g.plan, { ...defaultState, startDate: g.startDate ?? '2026-11-09', mode: 'custom', raceDate: '2027-04-18' }), last = tt.slots.filter(s => !s.maintenance).at(-1)!
    expect(stageOf(tt, last)).toBe('gara')
  })
})
