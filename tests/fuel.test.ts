import { describe, expect, it } from 'vitest'
import plan from '../shared/plan.json'
import { fuelPlan } from '../shared/fuel'
import { buildTimeline, defaultState, type Plan, type Slot } from '../shared/engine'
import { nextLong, raceDay, sessionMin, tipsFor } from '../shared/tips'
import { advise, manualHour } from '../shared/weather'
import { ARTICLES, GROUPS } from '../src/learn'

const slot = (monday: string, text: string, km: number): Slot => ({ week: 1, phase: 1, scarico: false, skippable: false, total: km, sessions: [{ day: 'dom', text, km }], monday, key: 'k', occurrence: 0 })

describe('calcolatore per il lungo', () => {
  it('sotto l\'ora niente carboidrati, solo liquidi', () => {
    expect(fuelPlan(45, 'fresco')).toMatchObject({ rate: null, carbs: null, gels: null, liters: [.3, .4] })
  })
  it('da 1 a 2,5 ore 30-60 g l\'ora', () => {
    expect(fuelPlan(120, 'mite')).toMatchObject({ rate: [30, 60], carbs: [60, 120], gels: [3, 5], everyMin: 50, water: [500, 700], liters: [1, 1.4] })
  })
  it('oltre 2,5 ore 60-90 g l\'ora', () => {
    expect(fuelPlan(240, 'caldo')).toMatchObject({ rate: [60, 90], carbs: [240, 360], water: [600, 800] })
  })
  it('rifiuta valori senza senso', () => {
    for (const x of [0, NaN, 2000]) expect(fuelPlan(x, 'mite')).toBeNull()
    expect(fuelPlan(120, 'mite', NaN)).toBeNull()
  })
})

describe('consigli dal piano', () => {
  const base = { today: '2026-07-01', runKm: 0, hour: 12 }
  it('il lungo fa scattare la scheda giusta', () => {
    expect(tipsFor({ ...base, slots: [slot('2026-06-29', 'Lungo 15 km', 15)] })[0].to).toBe('calcolatore-lungo')
    expect(tipsFor({ ...base, slots: [slot('2026-06-29', 'Lungo 30 km', 30)] })[0].to).toBe('prova-generale')
    expect(tipsFor({ ...base, slots: [slot('2026-06-29', 'Facile 5 km', 5)] })).toEqual([])
  })
  it('la gara viene prima di tutto e cambia con i giorni', () => {
    const slots = [slot('2026-06-29', 'Lungo 30 km', 30)]
    expect(tipsFor({ ...base, slots, raceDate: '2026-07-02' })[0].to).toBe('colazione-gara')
    expect(tipsFor({ ...base, slots, raceDate: '2026-07-05' })[0].to).toBe('carico-carboidrati')
    expect(tipsFor({ ...base, slots, raceDate: '2026-07-15' })[0].to).toBe('rifinitura-gara')
  })
  it('buio, freddo e scarpe', () => {
    const l = tipsFor({ slots: [], today: '2026-11-09', runKm: 1040, hour: 6 }).map(x => x.key)
    expect(l).toEqual(['scarpe-2', 'buio-2026', 'freddo-2026'])
  })
  it('trova gara e lunghi nel piano base', () => {
    const t = buildTimeline(plan as unknown as Plan, { ...defaultState, raceDate: '2028-05-07' })
    expect(raceDay(t.slots)).toBe('2028-05-07')
    const l = nextLong(t.slots, defaultState.startDate)
    expect(l && sessionMin(l.ses)).toBeGreaterThanOrEqual(60)
  })
})

describe('schede di Impara', () => {
  it('gli indirizzi sono unici e ogni scheda ha una categoria', () => {
    expect(new Set(ARTICLES.map(a => a.id)).size).toBe(ARTICLES.length)
    for (const a of ARTICLES) expect(GROUPS.some(g => g[0] === a.group)).toBe(true)
  })
  it('i consigli portano a schede esistenti', () => {
    const l = tipsFor({ slots: [slot('2026-11-09', 'Lungo 30 km', 30), slot('2026-11-02', 'Lungo 15 km', 15)], today: '2026-11-09', raceDate: '2026-11-11', runKm: 600, hour: 6 })
    for (const t of l) expect(ARTICLES.some(a => a.id === t.to)).toBe(true)
  })
  it('Cosa mi metto usa le stesse regole del meteo', () => {
    const a = advise(manualHour({ feels: 2, rain: true, wind: true, dark: true }), 'facile')
    expect(a.wear).toMatch(/antipioggia/)
    expect(a.wear).toMatch(/riflettenti/)
    expect(a.tips.join(' ')).toMatch(/controvento/)
  })
})
