import { describe, it, expect } from 'vitest'
import type { Activity, State } from '../shared/engine'
import { setBound, validBounds, zonesFrom, zonesManual, zonesOf, zonesReserve } from '../shared/analysis'
import { shoeOf, shoeUse, withShoe } from '../shared/shoes'
import { easyPace, easyRun, easyTrend, paceRange } from '../shared/paces'

let n = 0
const run = (date: string, km: number, sec: number, x: Partial<Activity> = {}): Activity => ({ id: 'a' + ++n, date, type: 'corsa', source: 'manuale', km, seconds: sec, ...x } as Activity)

describe('zone cardio', () => {
  it('Karvonen tiene conto del battito a riposo', () => {
    const z = zonesReserve(186, 56)
    expect(z[0].lo).toBe(121); expect(z[4].hi).toBe(186)
    for (let i = 1; i < 5; i++) expect(z[i].lo).toBe(z[i - 1].hi + 1)
  })
  it('a mano: cambiando un confine i vicini si adeguano', () => {
    const b = [95, 114, 133, 152, 171, 190]
    expect(setBound(b, 2, 120)).toEqual([95, 114, 120, 152, 171, 190])
    expect(setBound(b, 2, 110)).toEqual([95, 109, 110, 152, 171, 190])
    expect(setBound(b, 1, 160)).toEqual([95, 160, 161, 162, 171, 190])
    expect(zonesManual(b)[1]).toMatchObject({ lo: 115, hi: 133 })
    expect(validBounds([95, 114, 114, 152, 171, 190])).toBe(false)
  })
  it('le zone in uso seguono la scelta, con ritorno alla FC max se mancano dati', () => {
    expect(zonesOf({ state: { hrMax: 186 } })).toEqual(zonesFrom(186))
    expect(zonesOf({ state: { hrMax: 186, hrZones: { mode: 'riserva', rest: 56 } } })).toEqual(zonesReserve(186, 56))
    expect(zonesOf({ state: { hrMax: 186, hrZones: { mode: 'riserva', rest: null } } })).toEqual(zonesFrom(186))
    expect(zonesOf({ state: { hrMax: null, hrZones: { mode: 'mano', bounds: [95, 114, 133, 152, 171, 190] } } })![4].hi).toBe(190)
    expect(zonesOf({ state: { hrMax: null } })).toBeNull()
  })
})

describe('scarpe', () => {
  const st: Pick<State, 'shoes' | 'defaultShoe'> = { shoes: [{ id: 'a', name: 'A', startKm: 120, limitKm: 700, since: '2026-11-01' }, { id: 'b', name: 'B', startKm: 0, limitKm: 200, since: '2026-11-01' }], defaultShoe: 'a' }
  it('si parte dai km già fatti e si contano le corse del paio', () => {
    const acts = [run('2026-10-20', 10, 3600), run('2026-11-02', 8, 3000), run('2026-11-03', 5, 1800, { shoe: 'b' }), run('2026-11-04', 6, 2000, { shoe: null })]
    const [a, b] = shoeUse(st, acts)
    expect(a).toMatchObject({ km: 128, runs: 1, level: 'ok' })
    expect(b).toMatchObject({ km: 5, runs: 1 })
  })
  it('avvisa vicino al limite', () => {
    const acts = [run('2026-11-02', 185, 60000, { shoe: 'b' })]
    expect(shoeUse(st, acts)[1].level).toBe('quasi')
    expect(shoeUse(st, [...acts, run('2026-11-03', 20, 6000, { shoe: 'b' })])[1].level).toBe('cambia')
  })
  it('una corsa nuova prende il paio predefinito, ma non quelle di prima', () => {
    expect(withShoe(run('2026-11-05', 5, 1800), st).shoe).toBe('a')
    expect(withShoe(run('2026-10-05', 5, 1800), st).shoe).toBeUndefined()
    expect(withShoe(run('2026-11-05', 5, 1800, { shoe: null }), st).shoe).toBeNull()
    expect(shoeOf({ ...run('2026-11-05', 5, 1800), type: 'forza' }, st)).toBeNull()
  })
})

describe('ritmo facile', () => {
  const z = zonesFrom(186)
  it('conta solo corse continue e facili', () => {
    expect(easyRun(run('2026-11-01', 5, 2100, { fiato: 2 }), z)).toBe(true)
    expect(easyRun(run('2026-11-01', 5, 2100, { fiato: 3 }), z)).toBe(false)
    expect(easyRun(run('2026-11-01', 5, 3000, { fiato: 1 }), z)).toBe(false) // 10:00 al km: cammino-corsa
    expect(easyRun(run('2026-11-01', 5, 2100, { hrAvg: 140 }), z)).toBe(true)
    expect(easyRun(run('2026-11-01', 5, 2100, { hrAvg: 155 }), z)).toBe(false)
    expect(easyRun(run('2026-11-01', 5, 2100, { fiato: 2, sessionKey: 'w1.0' }), z, a => a.sessionKey === 'w1.0')).toBe(false)
  })
  it('servono almeno 4 corse nelle ultime 4 settimane', () => {
    const acts = [400, 410, 420].map((p, i) => run(`2026-11-0${i + 1}`, 5, p * 5, { fiato: 2 }))
    expect(easyPace(acts, z, '2026-11-08')).toBeNull()
    const more = [...acts, run('2026-11-05', 5, 430 * 5, { fiato: 1 })]
    const p = easyPace(more, z, '2026-11-08')!
    expect(p.n).toBe(4); expect(paceRange(p)).toBe('6:50 – 7:05')
    expect(easyPace(more, z, '2026-12-20')).toBeNull()
  })
  it('andamento settimanale', () => {
    const acts = [run('2026-10-27', 5, 2200, { fiato: 2 }), run('2026-11-03', 5, 2100, { fiato: 2 })]
    const tr = easyTrend(acts, z, '2026-11-08', 3)
    expect(tr.map(w => w.v)).toEqual([null, 440, 420])
  })
})
