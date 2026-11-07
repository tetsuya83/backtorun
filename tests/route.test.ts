import { describe, expect, it } from 'vitest'
import { splitLoop, buildGpx, buildRoute, fitOf, gainOf, isRouteGpx, legsOf, lengthOf, MAX_TRACK, mirror, parseRouteGpx, routeError, simplify, type Leg, type Pt } from '../shared/route'
import { parseGpx } from '../shared/track'

const line = (n: number, y = 45.5): Pt[] => Array.from({ length: n }, (_, i) => [9 + i * .001, y, 120 + (i % 5)])
const leg = (c: Pt[]): Leg => ({ c, m: lengthOf(c) })
describe('percorsi', () => {
  it('misura la distanza con buona precisione', () => {
    expect(lengthOf([[9, 45], [9, 46]]) / 1000).toBeCloseTo(111.2, 0)
  })
  it('semplifica senza cambiare forma', () => {
    const s = simplify(line(100))
    expect(s.length).toBe(2)
    expect(simplify([[9, 45], [9.001, 45.001], [9.002, 45]]).length).toBe(3)
  })
  it('ignora il rumore della quota', () => {
    expect(gainOf([[0, 0, 100], [0, 0, 101], [0, 0, 100], [0, 0, 110]])).toBe(10)
    expect(gainOf([[0, 0], [1, 1]])).toBeNull()
  })
  it('riapre i tratti di un percorso salvato', () => {
    const a = line(4), b: Pt[] = [a[3], [9.01, 45.51, 130], [9.02, 45.52, 131]]
    const r = buildRoute('x', ' Prova ', [[9, 45.5], [9.003, 45.5], [9.02, 45.52]], [leg(a), leg(b)], 'editor')
    const l = legsOf(r)
    expect(r.name).toBe('Prova')
    expect(l.length).toBe(2)
    expect(l[1].c[0]).toEqual(l[0].c[l[0].c.length - 1])
    expect(r.km).toBeCloseTo((leg(a).m + leg(b).m) / 1000, 1)
  })
  it('resta sotto il limite di punti', () => {
    const c: Pt[] = Array.from({ length: 6000 }, (_, i) => [9 + i * .0002, 45.5 + Math.sin(i / 3) * .002])
    expect(buildRoute('x', 'A', [[9, 45.5]], [leg(c)], 'editor').track.length).toBeLessThanOrEqual(MAX_TRACK)
  })
  it('andata e ritorno raddoppia e torna alla partenza', () => {
    const l = [leg(line(3)), leg(line(3, 45.6))], b = mirror(l)
    expect(b[0].c[0]).toEqual(l[1].c[2])
    expect(b[1].c[2]).toEqual(l[0].c[0])
  })
  it('crea un GPX leggibile e lo rilegge', () => {
    const xml = buildGpx({ name: 'Giro <Naviglio> & parco', track: line(3) }), r = parseRouteGpx(xml)
    expect(xml).toContain('Giro &lt;Naviglio&gt; &amp; parco')
    expect(r.name).toBe('Giro <Naviglio> & parco')
    expect(r.leg.c.length).toBe(3)
    expect(r.leg.c[0][2]).toBe(120)
    expect(isRouteGpx(xml)).toBe(true)
  })
  it('distingue un percorso da un allenamento', () => {
    const run = '<gpx><trk><trkseg><trkpt lat="45" lon="9"><ele>1</ele><time>2026-11-05T06:00:00Z</time></trkpt><trkpt lat="45.1" lon="9"><time>2026-11-05T06:30:00Z</time></trkpt></trkseg></trk></gpx>'
    expect(isRouteGpx(run)).toBe(false)
    expect(parseGpx(run).km).toBeGreaterThan(10)
    expect(isRouteGpx('<gpx><metadata><time>2026-11-05T06:00:00Z</time></metadata><rte><rtept lat="45" lon="9"/><rtept lat="45.1" lon="9"/></rte></gpx>')).toBe(true)
    expect(parseRouteGpx('<gpx><rte><name>R</name><rtept lat="45" lon="9"/><rtept lat="45.1" lon="9"/></rte></gpx>').name).toBe('R')
  })
  it('rifiuta file e dati non validi', () => {
    expect(() => parseRouteGpx('<gpx></gpx>')).toThrow()
    expect(routeError({ id: 'a', name: 'x', track: [[1]], way: [], cuts: [], km: 1 })).toBeTruthy()
    expect(routeError(buildRoute('a', 'x', [[9, 45]], [leg(line(3))], 'gpx'))).toBeNull()
  })
  it('confronta il percorso con la seduta', () => {
    expect(fitOf(18.2, 18)!.ok).toBe(true)
    expect(fitOf(15, 18)!.text).toBe('Mancano 3 km alla seduta')
    expect(fitOf(20.5, 18)!.text).toBe('2,5 km oltre la seduta')
    expect(fitOf(10, null)).toBeNull()
  })
})
describe('anelli proposti', () => {
  it('si dividono in tratti che si richiudono sulla partenza', () => {
    const c: Pt[] = Array.from({ length: 41 }, (_, i) => { const a = i / 40 * 2 * Math.PI; return [9 + Math.sin(a) * .01, 45.5 + (1 - Math.cos(a)) * .007, 100] })
    const s = splitLoop(c)
    expect(s.legs.length).toBe(4)
    expect(s.way.length).toBe(5)
    expect(s.way[0]).toEqual(s.way[4])
    expect(s.legs.reduce((n, l) => n + l.m, 0)).toBeCloseTo(lengthOf(c), 0)
    expect(s.legs[1].c[0]).toEqual(s.legs[0].c[s.legs[0].c.length - 1])
    expect(splitLoop(c, 4, 9000).legs.reduce((n, l) => n + l.m, 0)).toBeCloseTo(9000, 3)
  })
})
import { groundOf, matchOf, mixOf, rankLoops } from '../shared/route'
describe('fondo degli anelli', () => {
  it('classifica fondo e tipo di strada', () => {
    expect(groundOf(3, 3)).toBe('asfalto')
    expect(groundOf(10, 5)).toBe('sterrato')
    expect(groundOf(11, 4)).toBe('sentieri')
    expect(groundOf(0, 4)).toBe('sentieri')
    expect(groundOf(0, 3)).toBe('asfalto')
    expect(groundOf(0, 0)).toBe('ignoto')
  })
  it('pesa le quote sulla distanza', () => {
    const c: Pt[] = [[9, 45.5], [9.01, 45.5], [9.02, 45.5], [9.04, 45.5]]
    const m = mixOf(c, [[0, 2, 3], [2, 3, 10]], [[0, 3, 3]])!
    expect(m.asfalto).toBe(.5)
    expect(m.sterrato).toBe(.5)
    expect(mixOf(c)).toBeNull()
  })
  it('mette prima gli anelli più vicini alle preferenze', () => {
    const a = { m: 8000, mix: { asfalto: .9, sterrato: .1, sentieri: 0, ignoto: 0 } }, b = { m: 9000, mix: { asfalto: .2, sterrato: .5, sentieri: .3, ignoto: 0 } }
    expect(rankLoops([a, b], ['sterrato', 'sentieri'], 8)[0].m).toBe(9000)
    expect(rankLoops([b, a], [], 8)[0].m).toBe(8000)
    expect(matchOf(null, ['asfalto'])).toBe(0)
  })
})
import { isSent, routeSig } from '../shared/route'
describe('percorso sull\'orologio', () => {
  it('risulta inviato finché non lo modifichi', () => {
    const r = buildRoute('a', 'Giro', [[9, 45.5]], [{ c: [[9, 45.5], [9.01, 45.5]], m: 780 }], 'editor')
    expect(isSent(r)).toBe(false)
    const s = { ...r, sentSig: routeSig(r) }
    expect(isSent(s)).toBe(true)
    expect(isSent({ ...s, track: [...s.track, [9.02, 45.5] as Pt], km: 1.56 })).toBe(false)
  })
})
