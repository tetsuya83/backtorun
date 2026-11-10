import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { buildTimeline, defaultState, sessionKey, type Activity, type Plan, type Session } from '../shared/engine'
import { choicesFor, deg, inRange, lengthKm, pathFrom, pathParts, routeFromRun, targetKm, type PathPt } from '../shared/path'
import type { Route } from '../shared/route'
import { sessionMin } from '../shared/tips'

// un anello di circa 3 km attorno a un punto, un punto ogni 3 secondi
const ring = (km: number, lat = 43.77, lon = 11.25, n = 600) => {
  const r = km * 1000 / (2 * Math.PI), k = 111320
  return Array.from({ length: n + 1 }, (_, i) => { const a = 2 * Math.PI * i / n; return { t: i * 3, lat: lat + r * Math.sin(a) / k, lon: lon + r * (1 - Math.cos(a)) / (k * Math.cos(lat * Math.PI / 180)) } })
}
let n = 0
const run = (date: string, km: number, extra: Partial<Activity> = {}): Activity => ({ id: 'a' + ++n, date, type: 'corsa', source: 'fit', km, seconds: km * 420, ...extra } as Activity)

describe('percorso dalla corsa', () => {
  it('semplifica restando sotto i 500 punti e con la stessa lunghezza', () => {
    const p = pathFrom(ring(3, 43.77, 11.25, 3000))!
    expect(p.length).toBeLessThanOrEqual(500)
    expect(lengthKm(p)).toBeCloseTo(3, 1)
    expect(p[0][0]).toBe(0)
  })
  it('senza GPS niente percorso', () => {
    expect(pathFrom(ring(3).map(x => ({ t: x.t })))).toBeNull()
    expect(pathFrom(ring(3).map(x => ({ t: x.t, lat: 0, lon: 0 })))).toBeNull()
  })
  it('i semicerchi del FIT diventano gradi', () => {
    expect(deg(Math.round(43.77 * 2 ** 31 / 180))).toBeCloseTo(43.77, 5)
    expect(deg(11.25)).toBe(11.25)
    expect(deg(undefined)).toBeNull()
  })
  it('divide il percorso nei tratti di corsa e di cammino, senza buchi', () => {
    const p: PathPt[] = Array.from({ length: 11 }, (_, i) => [i * 30, 11 + i * .001, 43])
    const parts = pathParts(p, [{ sec: 60, work: true }, { sec: 90, work: false }, { sec: 60, work: true }])
    expect(parts.map(x => x.work)).toEqual([true, false, true, false])
    for (let i = 1; i < parts.length; i++) expect(parts[i].c[0]).toEqual(parts[i - 1].c.at(-1))
    expect(pathParts(p, null)).toHaveLength(1)
  })
  it('una corsa diventa un percorso da modificare e mandare all\'orologio', () => {
    const a = run('2026-11-10', 3.15, { path: pathFrom(ring(3.15)) })
    const r = routeFromRun(a, 'r1', 'Giro del 10 novembre')
    expect(r).toMatchObject({ id: 'r1', source: 'corsa', fromRun: a.id, km: 3.15 })
    expect(r.way.length).toBeGreaterThanOrEqual(2)
    expect(r.track.length).toBeGreaterThan(10)
  })
})

describe('proposte di percorso', () => {
  const P = plan as unknown as Plan, t = buildTimeline(P, { ...defaultState, startDate: '2026-11-09' })
  const w1 = t.slots[0], walkSes = w1.sessions.find(s => /cammin/i.test(s.text))!
  it('per una seduta a tempo stima i km da quelli fatti a ogni minuto di sedute simili', () => {
    const k = sessionKey(w1, walkSes.day), w2 = t.slots[1], next = w2.sessions.find(s => /cammin/i.test(s.text))!
    const acts = [run('2026-11-10', 3.15, { seconds: 1540, sessionKey: k })]
    const per = 3.15 / sessionMin(walkSes)
    expect(targetKm(next, t, acts, '2026-11-17', null)).toBeCloseTo(sessionMin(next) * per, 1)
    expect(targetKm(next, t, [], '2026-11-17', null)).toBeCloseTo(sessionMin(next) * 60 / 540, 1)
    expect(targetKm({ ...next, km: 6 } as Session, t, acts, '2026-11-17', null)).toBe(6)
  })
  it('valgono i giri entro il 10%', () => {
    expect(inRange(3.3, 3)).toBe(true); expect(inRange(3.31, 3)).toBe(false); expect(inRange(2.7, 3)).toBe(true); expect(inRange(2.69, 3)).toBe(false)
  })
  it('prima i percorsi salvati, poi le corse; niente doppioni dello stesso giro', () => {
    const path = pathFrom(ring(3))
    const a1 = run('2026-11-10', 3.05, { path }), a2 = run('2026-11-12', 3.02, { path }), a3 = run('2026-11-11', 3.6, { path: pathFrom(ring(3.6)) })
    const saved: Route = { ...routeFromRun(run('2026-11-01', 2.9, { path }), 'r', 'Parco'), km: 2.9 }
    const c = choicesFor(3, [saved], [a1, a2, a3])
    expect(c.map(x => x.kind)).toEqual(['route', 'run'])
    expect(c[1].kind === 'run' && c[1].a.id).toBe(a2.id) // la più recente dello stesso giro
    const fromRun = { ...saved, fromRun: a2.id }
    expect(choicesFor(3, [fromRun], [a2]).length).toBe(1)
  })
})
