import { describe, expect, it } from 'vitest'
import { guideSteps, parseBlocks } from '../shared/blocks'
import { badSegments, fromLaps, segmentsOf, fromTrace, lapNames, workSummary, withHr } from '../shared/segments'
import real from './fixtures/walk-run-2026-11-10.json'

const steps = (t: string) => guideSteps(parseBlocks(t)!)
const walkRun = steps("5×[3' corsa + 2' cammino]")

describe('tratti dalla traccia', () => {
  it('ricostruisce la seduta del 10 novembre: 5 corse e 5 camminate, tagliate dove cambia il passo', () => {
    const l = fromTrace(real as any, walkRun)!
    expect(l).toHaveLength(10)
    expect(lapNames(l).slice(0, 4)).toEqual(['Corsa 1', 'Cammino', 'Corsa 2', 'Cammino'])
    l.filter(x => x.work).forEach(x => { expect(x.sec).toBeGreaterThan(170); expect(x.sec).toBeLessThan(205) })
    l.filter(x => !x.work).slice(0, 4).forEach(x => { expect(x.sec).toBeGreaterThan(100); expect(x.sec).toBeLessThan(135) })
    const w = workSummary(l)!
    expect(w.n).toBe(5)
    expect(w.pace).toBeGreaterThan(330); expect(w.pace).toBeLessThan(450) // tra 5'30" e 7'30": molto più veloce della media con il cammino
    expect(w.hr).toBeGreaterThan(150)
  })
  it('una corsa continua resta senza tratti', () => {
    expect(fromTrace(real as any, steps('Facile 3 km'))).toBeNull()
  })
})

describe('lap dell\'orologio', () => {
  const lap = (sec: number, m: number, hr = 150) => ({ sec, m, hr })
  it('usa i lap che corrispondono ai passi del piano, anche con un lap in più alla fine', () => {
    const raw = [lap(185, 440), lap(118, 140, 110), lap(182, 430), lap(121, 150, 112), lap(180, 450), lap(120, 140), lap(181, 445), lap(119, 150), lap(183, 450), lap(115, 140), lap(4, 5)]
    const l = fromLaps(raw, walkRun)!
    expect(l).toHaveLength(10)
    expect(l[0]).toMatchObject({ label: 'Corri', sec: 185, m: 440, work: true })
    expect(l[1]).toMatchObject({ label: 'Cammina', effort: 'walk', work: false, hr: 110 })
  })
  it('senza piano separa corsa e cammino per ritmo', () => {
    const l = fromLaps([lap(180, 450), lap(120, 140), lap(180, 440), lap(120, 150)], null)!
    expect(l.map(x => x.work)).toEqual([true, false, true, false])
    expect(l[1].effort).toBe('walk')
  })
  it('ignora l\'autolap al chilometro', () => {
    expect(fromLaps([lap(400, 1000), lap(410, 1000), lap(395, 1000)], null)).toBeNull()
  })
})

describe('tratti del cronometro guidato', () => {
  it('prende il battito dalla traccia', () => {
    const l = withHr([{ label: 'Corri', sec: 190, m: 440, effort: 'easy', work: true }, { label: 'Cammina', sec: 120, m: 140, effort: 'walk', work: false }], real as any)
    expect(l[0].hr).toBeGreaterThan(140); expect(l[1].hr).toBeGreaterThan(100)
  })
})

describe('lap del Suunto del 10 novembre: tratti e autolap al km mescolati', () => {
  // come arrivano nel file: in ordine di fine, i km (1000 m) si sovrappongono ai tratti
  const mixed: [number, number, number, number, boolean][] = [[0, 180, 417, 144, false], [180, 120, 161, 128, false], [0, 472, 1000, 142, true], [300, 180, 442, 151, false], [480, 120, 175, 132, false], [600, 180, 451, 151, false], [780, 120, 192, 136, false], [472, 492, 1000, 142, true], [900, 180, 450, 156, false], [1080, 120, 178, 140, false], [1200, 180, 488, 158, false], [964, 442, 1000, 154, true], [1380, 108, 149, 135, false]]
  const raw = (withStart: boolean, withAuto: boolean) => mixed.map(([start, sec, m, hr, auto]) => ({ sec, m, hr, ...(withStart ? { start } : {}), ...(withAuto ? { auto } : {}) }))
  const check = (l: ReturnType<typeof fromLaps>) => {
    expect(l).toHaveLength(10)
    expect(l!.some(x => x.m === 1000)).toBe(false)
    expect(lapNames(l!).slice(0, 3)).toEqual(['Corsa 1', 'Cammino', 'Corsa 2'])
    expect(workSummary(l)!.n).toBe(5)
  }
  it('scarta l\'autolap segnato come tale', () => check(fromLaps(raw(false, true), walkRun)))
  it('separa le serie sovrapposte anche senza il segno di autolap', () => check(fromLaps(raw(true, false), walkRun)))
  it('senza piano sceglie comunque la serie dei tratti', () => { const l = fromLaps(raw(true, false), null)!; expect(l).toHaveLength(10); expect(l.some(x => x.m === 1000)).toBe(false) })
  it('riconosce i tratti salvati male, che durano più della corsa', () => {
    const bad = mixed.map(([, sec, m, hr]) => ({ label: 'Corri', sec, m, effort: 'easy' as const, hr, work: true }))
    expect(badSegments({ id: 'x', date: '2026-11-10', type: 'corsa', source: 'fit', seconds: 1513, guide: bad })).toBe(true)
    expect(badSegments({ id: 'x', date: '2026-11-10', type: 'corsa', source: 'fit', seconds: 1513, guide: fromLaps(raw(true, true), walkRun) })).toBe(false)
  })
})

describe('ultimo recupero senza lap', () => {
  it('lo ricava dalla traccia, come nella corsa del 10 novembre', () => {
    const steps9 = fromLaps([[180, 417], [120, 161], [180, 442], [120, 175], [180, 451], [120, 192], [180, 450], [120, 178], [180, 488]].map(([sec, m]) => ({ sec, m, hr: 150 })), walkRun)!
    expect(steps9).toHaveLength(9)
    const l = segmentsOf({ id: 'x', date: '2026-11-10', type: 'corsa', source: 'fit', seconds: 1513, trace: real as any, guide: steps9, segFrom: 'orologio' }, walkRun)!
    expect(l).toHaveLength(10)
    expect(lapNames(l)[9]).toBe('Cammino')
    expect(l[9]).toMatchObject({ effort: 'walk', work: false })
    expect(l[9].sec).toBeGreaterThan(110); expect(l[9].sec).toBeLessThan(140)
    expect(l[9].m).toBeGreaterThan(120); expect(l[9].m).toBeLessThan(220)
  })
  it('non aggiunge nulla se i lap coprono tutta la corsa', () => {
    const full = fromTrace(real as any, walkRun)!
    expect(segmentsOf({ id: 'x', date: '2026-11-10', type: 'corsa', source: 'fit', seconds: 1513, trace: real as any, guide: full, segFrom: 'orologio' }, walkRun)).toHaveLength(10)
  })
})
