import { describe, expect, it } from 'vitest'
import { guideSteps, parseBlocks } from '../shared/blocks'
import { fromLaps, fromTrace, lapNames, workSummary, withHr } from '../shared/segments'
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
