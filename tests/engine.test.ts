import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { buildTimeline, defaultState, moveRace, planError, planFor, reviewWeek, scalaResult, sessionDate, slotForDate, sessionKey, strengthDays, type Day, type Plan, type Activity, type ScalaRound } from '../shared/engine'
import { cooldownFor, intervalSteps, jointOk, parseIntervals, ROUTINES, schemeFor, stepAt, suggest, totalOf, warmupFor, WORKOUTS, type ExerciseLog } from '../shared/training'
import { drift, hrMaxOf, isSteady, kmSplits, loadAlert, loadOf, observedMax, samePace, timeInZones, weeklyLoads, zoneHint, zoneOf, zonesFrom } from '../shared/analysis'
import { data, startCustomPlan, switchPlan } from '../src/api'
import { blankPlan, generatePlan, type GoalInput, type RaceType } from '../shared/generator'
const P = plan as unknown as Plan
describe('calendario', () => {
  it('50 settimane con gara a fine ottobre 2027', () => {
    const t = buildTimeline(P, { ...defaultState, raceDate: '2027-10-24' })
    expect(t.spareWeeks).toBe(0); expect(t.slots.length).toBe(50); expect(t.slots.at(-1)!.monday).toBe('2027-10-18')
    expect(t.earliestRace).toBe('2027-10-24')
  })
  it('6 salti portano a settembre', () => {
    const t = buildTimeline(P, { ...defaultState, skips: [2, 5, 7, 11, 14, 23] })
    expect(t.earliestRace).toBe('2027-09-12')
  })
  it('settimane risparmiate diventano mantenimento', () => {
    const t = buildTimeline(P, { ...defaultState, skips: [2, 5], raceDate: '2027-10-24' })
    expect(t.spareWeeks).toBe(2); expect(t.slots.filter(s => s.maintenance).length).toBe(2); expect(t.slots.at(-1)!.monday).toBe('2027-10-18')
  })
  it('una ripetizione sposta tutto di una settimana', () => {
    const t = buildTimeline(P, { ...defaultState, repeats: [3] })
    expect(t.earliestRace).toBe('2027-10-31'); expect(t.slots[3].key).toBe('w3.1')
  })
  it('gara troppo vicina', () => { expect(buildTimeline(P, { ...defaultState, raceDate: '2027-04-11' }).raceTooClose).toBe(true) })
  it('partenza dal test', () => {
    const t = buildTimeline(P, { ...defaultState, startWeek: 6 })
    expect(t.slots[0].week).toBe(6); expect(slotForDate(t, '2026-11-10')!.week).toBe(6)
  })
})
describe('regola del lungo', () => {
  it('rispetta 10% o 1 km su ogni combinazione di salti', () => {
    const sk = [2, 5, 7, 11, 14, 23]
    for (let m = 0; m < 64; m++) {
      const skips = sk.filter((_, i) => m >> i & 1)
      const w = P.weeks.filter(x => !skips.includes(x.week as number) && (x.week as number) >= 9 && (x.week as number) < 50)
      const ls = w.map(x => x.sessions.find(s => s.day === 'dom')!.km!)
      ls.forEach((d, i) => { const b = Math.max(0, ...ls.slice(Math.max(0, i - 4), i)); if (b && d > b) expect(d / b <= 1.1 || d - b <= 1).toBe(true) })
    }
  })
})
describe('revisione settimana', () => {
  const t = buildTimeline(P, defaultState), s = t.slots[0]
  const run = (day: any, f: number, x = {}): Activity => ({ id: day, date: '2026-11-10', type: 'corsa', source: 'manuale', sessionKey: sessionKey(s, day), fatica: f, knee: 1, ...x })
  const forza = (id: string): Activity => ({ id, date: '2026-11-09', type: 'forza', source: 'manuale' })
  it('propone il salto', () => expect(reviewWeek(t, s, [run('mar', 3), run('ven', 3), run('dom', 3), forza('a'), forza('b')]).canSkip).toBe(true))
  it('senza forza niente salto', () => expect(reviewWeek(t, s, [run('mar', 3), run('ven', 3), run('dom', 3), forza('a')]).canSkip).toBe(false))
  it('gonfiore blocca', () => expect(reviewWeek(t, s, [run('mar', 3, { swelling: true }), run('ven', 3), run('dom', 3), forza('a'), forza('b')]).canSkip).toBe(false))
  it('sovraccarico', () => expect(reviewWeek(t, s, [run('mar', 6), run('ven', 6), run('dom', 3)]).overload).toBe(true))
})
describe('Scala', () => {
  const ok: ScalaRound = { finished: true, fiato: 2, fatica: 4, knee: 1 }
  const no: ScalaRound = { finished: null, fiato: null, fatica: null, knee: null }
  it('R3', () => expect(scalaResult([ok, ok, ok, no, no]).week).toBe(3))
  it('R4', () => expect(scalaResult([ok, ok, ok, ok, no]).week).toBe(5))
  it('bonus', () => expect(scalaResult([ok, ok, ok, ok, ok]).week).toBe(7))
  it('R5 duro', () => expect(scalaResult([ok, ok, ok, ok, { ...ok, fiato: 3, fatica: 5 }]).week).toBe(6))
  it('gonfiore', () => expect(scalaResult([ok, ok, ok, ok, { ...ok, fiato: 3 }], true).week).toBe(4))
  it('solo consecutivi', () => expect(scalaResult([ok, no, ok, ok, ok]).week).toBe(1))
})

describe('piano personale', () => {
  const combos = (): GoalInput[] => {
    const out: GoalInput[] = []
    for (const [race, km] of [['5k', 5], ['10k', 10], ['21k', 21.097], ['42k', 42.195], ['trail', 30], ['altro', 15], ['altro', 60], ['altro', 3]] as [RaceType, number][])
      for (const longestKm of [0, 1.5, 2.5, 5, 12, 25])
        for (const days of [['mar', 'gio', 'dom'], ['lun', 'mer', 'ven', 'dom'], ['mar', 'mer', 'ven', 'sab', 'dom']] as Day[][])
          for (const ambition of ['finire', 'migliorare'] as const)
            out.push({ id: 'x', race, km, ambition, weeklyKm: longestKm * 2, longestKm, days, longDay: 'dom', strengthDays: [], startDate: '2026-11-09' })
    return out
  }
  it('rispetta le regole di progressione su ogni combinazione', () => {
    for (const g of combos()) {
      const r = generatePlan(g), w = r.plan.weeks
      expect(planError(r.plan)).toBeNull()
      const ls = w.slice(0, -1).map(x => Math.max(0, ...x.sessions.map(s => s.km ?? 0)))
      ls.forEach((d, i) => { const b = Math.max(0, ...ls.slice(Math.max(0, i - 4), i)); if (b && d > b) expect(d / b <= 1.1 || d - b <= 1 || d <= 5).toBe(true) })
      const tot = w.slice(0, -1).map(x => x.total ?? 0)
      tot.forEach((d, i) => { const b = Math.max(0, ...tot.slice(Math.max(0, i - 4), i)); if (b && !(d <= b * 1.25 || d - b <= 7)) throw new Error(`${g.race} ${g.km} long ${g.longestKm} gg ${g.days.length} ${g.ambition}: sett ${i + 1} ${b} -> ${d}`) })
      expect(w.at(-1)!.sessions.at(-1)!.race).toBe(true)
      for (const x of w) expect(new Set(x.sessions.map(s => s.day)).size).toBe(x.sessions.length)
      for (const x of w) for (const s of x.sessions) { expect(s.text).not.toMatch(/undefined|NaN/); if (!s.race && s.km) { expect(Number.isFinite(s.km)).toBe(true) } }
    }
  })
  it('lungo fino al target senza data', () => {
    for (const g of combos()) { const r = generatePlan(g); expect(r.reachedLong).toBe(r.targetLong); expect(r.weeks).toBe(r.idealWeeks) }
  })
  it('da zero parte col cammino-corsa', () => {
    const r = generatePlan({ ...combos()[0], longestKm: 0, race: '42k', km: 42.195 })
    expect(r.plan.weeks[0].sessions[0].text).toContain('cammino'); expect(r.plan.weeks[0].sessions.length).toBe(3)
    expect(r.targetLong).toBe(30); expect(r.plan.weeks.at(-1)!.total).toBeGreaterThan(42)
  })
  const base: GoalInput = { id: 'p', race: '10k', km: 10, ambition: 'finire', weeklyKm: 15, longestKm: 7, days: ['mar', 'gio', 'dom'], longDay: 'dom', strengthDays: ['lun', 'mar'], startDate: '2026-11-09' }
  it('la gara cade nel giorno giusto e il calendario finisce lì', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-06' }), st = { ...defaultState, startDate: r.startDate, raceDate: '2027-03-06' }
    const t = buildTimeline(r.plan, st), last = t.slots.at(-1)!, s = last.sessions.find(x => x.race)!
    expect(s.day).toBe('sab'); expect(sessionDate(last, s.day)).toBe('2027-03-06'); expect(t.raceTooClose).toBe(false)
  })
  it('data ampia: il piano parte più tardi', () => {
    const r = generatePlan({ ...base, raceDate: '2027-12-05' }); expect(r.startDate > '2026-11-09').toBe(true); expect(r.blocked).toBe(false)
  })
  it('data vicina: blocca e indica la prima data', () => {
    const r = generatePlan({ ...base, race: '42k', km: 42.195, raceDate: '2027-01-10' })
    expect(r.blocked).toBe(true); expect(r.earliestRace! > '2027-01-10').toBe(true)
  })
  it('data stretta ma fattibile: avvisa', () => {
    const r = generatePlan({ ...base, race: '21k', km: 21.097, longestKm: 8, ambition: 'migliorare', raceDate: '2027-01-31' })
    expect(r.blocked).toBe(false); expect(r.reachedLong).toBeLessThan(r.targetLong); expect(r.warnings.length).toBeGreaterThan(0)
  })
  it('la forza non occupa i giorni di corsa', () => expect(generatePlan(base).plan.meta.strengthDays).toEqual(['lun']))
  it('spostare la gara sposta calendario e giorno', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-07' }), st = { ...defaultState, startDate: r.startDate, raceDate: '2027-03-07' }
    const m = moveRace(r.plan, st, '2027-03-13'), t = buildTimeline(m.plan, m.state), last = t.slots.at(-1)!
    expect(last.sessions.find(x => x.race)!.day).toBe('sab'); expect(sessionDate(last, 'sab')).toBe('2027-03-13')
  })
  it('una ripetizione oltre la data viene segnalata', () => {
    const r = generatePlan({ ...base, raceDate: '2027-03-07' })
    expect(buildTimeline(r.plan, { ...defaultState, startDate: r.startDate, raceDate: '2027-03-07', repeats: [2] }).raceTooClose).toBe(true)
  })
  it('tabella vuota e controlli', () => {
    const p = blankPlan('b', 'Mia', 4)
    expect(planError(p)).toBeNull(); expect(buildTimeline(p, defaultState).slots.length).toBe(4)
    const bad = { ...p, weeks: [{ ...p.weeks[0], sessions: [{ day: 'mar', text: 'a', km: 1 }, { day: 'mar', text: 'b', km: 1 }] }] }
    expect(planError(bad)).toContain('stesso giorno'); expect(planError({ ...p, weeks: [] })).toContain('almeno')
    expect(planError(P)).toBe('Piano non valido.')
  })
  it('il piano base resta intatto', () => {
    expect(planFor({ plan: P, custom: blankPlan('b', 'Mia', 2), state: defaultState })).toBe(P)
    expect(strengthDays(P)).toEqual(['lun', 'gio'])
    expect(buildTimeline(P, defaultState).slots[0].key).toBe('w1.0')
  })
})

describe('forza guidata', () => {
  const lp = WORKOUTS.palestra[0], hip = WORKOUTS.palestra[3], s = schemeFor(lp, 2, false, 'palestra')
  const log = (reps: number[], kg = 100, max = s.max): ExerciseLog => ({ id: 'legpress', name: 'Leg press', kind: 'load', min: 6, max, sets: reps.map(r => ({ kg, reps: r })) })
  it('rispetta gli schemi del piano', () => {
    expect(schemeFor(lp, 0, false, 'palestra')).toMatchObject({ sets: 3, min: 8, max: 12 })
    expect(s).toMatchObject({ sets: 4, min: 6, max: 8, rest: 120 })
    expect(schemeFor(lp, 2, true, 'palestra').sets).toBe(3)
    expect(schemeFor(WORKOUTS.palestra[2], 4, true, 'palestra').sets).toBe(2)
    expect(schemeFor(WORKOUTS.palestra.at(-1)!, 9, false, 'casa')).toMatchObject({ unit: 'sec' })
  })
  it('alza il carico solo con tutte le serie al massimo e articolazioni a posto', () => {
    expect(suggest(log([8, 8, 8, 8]), lp, s, true)).toMatchObject({ kg: 105, up: true })
    expect(suggest(log([8, 8, 8, 7]), lp, s, true)).toMatchObject({ kg: 100, up: false })
    expect(suggest(log([8, 8, 8]), lp, s, true).up).toBe(false)
    expect(suggest(log([8, 8, 8, 8]), lp, s, false)).toMatchObject({ kg: 100, up: false })
    expect(suggest(log([12, 12, 12, 12], 100, 12), lp, s, true)).toMatchObject({ kg: 100, up: false })
    expect(suggest({ ...log([8, 8, 8, 8]), id: 'hipthrust' }, hip, s, true).kg).toBe(102.5)
    expect(suggest(null, lp, s, true).kg).toBeNull()
  })
  it('gonfiore, blocco o dolore fermano gli aumenti', () => {
    const r = (p: Partial<Activity>): Activity => ({ id: 'a', date: '2026-11-10', type: 'corsa', source: 'manuale', ...p })
    expect(jointOk([])).toBe(true); expect(jointOk([r({ knee: 2 })])).toBe(true); expect(jointOk([r({ knee: 3 })])).toBe(false)
    expect(jointOk([r({ swelling: true })])).toBe(false); expect(jointOk([r({ locked: true })])).toBe(false)
    expect(jointOk([r({ knee: 1 }), r({ type: 'forza', knee: 4 })])).toBe(false)
    expect(jointOk([r({ knee: 5 }), r({ knee: 0 })])).toBe(true)
  })
  it('ogni esercizio ha un id unico per luogo', () => {
    for (const l of Object.values(WORKOUTS)) { const ids = l.flatMap(e => [e.id, ...(e.alt ? [e.alt.id] : [])]); expect(new Set(ids).size).toBe(ids.length) }
  })
})
describe('timer', () => {
  it('legge tutte le sedute a tempo del piano', () => {
    expect(parseIntervals(`6×[1' corsa + 2' cammino]`)).toMatchObject({ reps: 6, work: 60, rest: 120, workLabel: 'Corri', restLabel: 'Cammina', partial: false })
    expect(parseIntervals(`8×[1' corsa + 1'30" cammino]`)).toMatchObject({ reps: 8, rest: 90 })
    expect(parseIntervals(`Interval: 5×[3' Z4 + 2' facile] (8 km)`)).toMatchObject({ workLabel: 'Forte', restLabel: 'Recupera', detail: 'Z4', partial: true })
    expect(parseIntervals(`Salite: 8×20" controllate + 2' rec (6 km)`)).toMatchObject({ reps: 8, work: 20, rest: 120 })
    expect(parseIntervals(`Ripetute: 5×[1 km Z4 + 2' facile] (9 km)`)).toBeNull()
    expect(parseIntervals('Facile 5 km + 4 allunghi')).toBeNull()
    const all = (P.weeks).flatMap(w => w.sessions).filter(s => /×/.test(s.text))
    expect(all.filter(s => /corsa \+/.test(s.text)).every(s => parseIntervals(s.text))).toBe(true)
  })
  it('ricava il passo dal tempo trascorso', () => {
    const st = intervalSteps(parseIntervals(`2×[1' corsa + 2' cammino]`)!)
    expect(totalOf(st)).toBe(360); expect(stepAt(st, 0)).toMatchObject({ i: 0, left: 60 }); expect(stepAt(st, 61)).toMatchObject({ i: 1, left: 119 })
    expect(stepAt(st, 180)).toMatchObject({ i: 2, start: 180 }); expect(stepAt(st, 360).done).toBe(true); expect(stepAt(st, 9999).done).toBe(true)
  })
  it('sceglie riscaldamento e defaticamento dalla seduta', () => {
    expect(warmupFor(`6×[1' corsa + 2' cammino]`).id).toBe('warm-easy'); expect(warmupFor('Facile 6 km').id).toBe('warm-easy')
    expect(warmupFor('Facile 6 km + 4 allunghi').id).toBe('warm-work'); expect(warmupFor('Ripetute: 5×[1 km Z4 + 2\' facile] (9 km)').id).toBe('warm-work')
    expect(cooldownFor('Facile 6 km', 6).id).toBe('cool-run'); expect(cooldownFor('Lungo 18 km', 18).id).toBe('cool-long')
    for (const r of ROUTINES) { const m = totalOf(r.steps) / 60; expect(m).toBeGreaterThan(2); expect(m).toBeLessThan(16) }
  })
})

describe('zone', () => {
  const z = zonesFrom(186)
  it('riproducono la tabella Excel senza buchi', () => {
    expect(z.map(x => x.hi)).toEqual([130, 150, 159, 169, 186]); expect(z[0].lo).toBe(93)
    for (let i = 1; i < 5; i++) expect(z[i].lo).toBe(z[i - 1].hi + 1)
    expect(zoneOf(z, 150)!.id).toBe(2); expect(zoneOf(z, 151)!.id).toBe(3); expect(zoneOf(z, 80)).toBeNull(); expect(zoneOf(z, 200)!.id).toBe(5)
  })
  it('la FC massima vale per persona e Roberto parte dalla sua tabella', () => {
    expect(hrMaxOf({ state: {}, me: { isAdmin: true } })).toBe(186); expect(hrMaxOf({ state: {}, me: { isAdmin: false } })).toBeNull()
    expect(hrMaxOf({ state: { hrMax: 178 }, me: { isAdmin: true } })).toBe(178)
    expect(observedMax([{ id: 'a', date: '', type: 'corsa', source: 'fit', hrMax: 177 }, { id: 'b', date: '', type: 'corsa', source: 'fit', hrMax: 255 }])).toBe(177)
  })
  it('traduce le zone citate dalla seduta', () => {
    expect(zoneHint('Interval: 5×[3\' Z4 + 2\' facile]', z)).toBe('Z4: 160-169 bpm'); expect(zoneHint('Fartlek Z3-Z4', z)).toBe('Z3-Z4: 151-169 bpm')
    expect(zoneHint('Facile 5 km', z)).toBeNull(); expect(zoneHint('Z2', null)).toBeNull()
  })
})
describe('analisi corsa', () => {
  const run = (min: number, hr: (t: number) => number) => Array.from({ length: 241 }, (_, i) => { const t = i * min * 60 / 240; return [t, hr(t), Math.round(t * 2.5)] as [number, number, number] })
  it('misura il tempo in zona e ignora le pause', () => {
    const z = zonesFrom(186), v = timeInZones([[0, 140, 0], [30, 140, 75], [60, 165, 150], [400, 165, 200]], z)
    expect(v[1]).toBe(30); expect(v[3]).toBe(30); expect(v.reduce((a, b) => a + b)).toBe(60)
  })
  it('calcola gli intertempi al km', () => {
    const k = kmSplits(run(10, () => 150)); expect(k.length).toBe(2); expect(k[0].seconds).toBe(400); expect(k[1].partial).toBe(true); expect(k[0].hr).toBe(150)
  })
  it('riconosce la deriva solo su corse regolari e abbastanza lunghe', () => {
    expect(drift(run(60, () => 140))).toMatchObject({ value: 0, level: 'bassa' })
    const d = drift(run(60, t => 130 + t / 3600 * 30)); expect(d!.value).toBeGreaterThan(5); expect(d!.value).toBeLessThan(15)
    expect(drift(run(30, () => 140))).toBeNull(); expect(drift(run(60, () => 140), 'Ripetute: 5×[1 km Z4 + 2\' facile] (9 km)')).toBeNull()
    expect(drift(run(60, () => 140), 'Lungo 18 km')).not.toBeNull(); expect(drift(run(60, () => 140), 'Lungo 26 km, ultimi 6 a ritmo gara')).toBeNull()
    expect(drift(null)).toBeNull(); expect(isSteady('Facile 6 km + 4 allunghi')).toBe(false); expect(isSteady('Facile 6 km')).toBe(true)
  })
})
describe('carico', () => {
  const a = (date: string, min: number, f?: number): Activity => ({ id: date, date, type: 'corsa', source: 'manuale', seconds: min * 60, fatica: f })
  it('è durata per fatica e segnala ciò che manca', () => {
    expect(loadOf(a('2026-11-03', 40, 5))).toBe(200); expect(loadOf(a('2026-11-03', 40))).toBeNull()
    const w = weeklyLoads([a('2026-11-02', 40, 5), a('2026-11-08', 20, 5), a('2026-11-09', 10, 5), a('2026-11-04', 10)], '2026-11-08', 2)
    expect(w[1]).toMatchObject({ monday: '2026-11-02', load: 300, missing: 1 }); expect(w[0].load).toBe(0)
  })
  const w = (l: number[]) => l.map((load, i) => ({ monday: String(i), load, missing: 0 }))
  it('avvisa solo con storico e aumento netto', () => {
    expect(loadAlert(w([500, 500, 500, 500, 800]))).toMatchObject({ pct: 60, avg: 500 })
    expect(loadAlert(w([500, 500, 500, 500, 640]))).toBeNull()
    expect(loadAlert(w([0, 0, 100, 100, 900]))).toBeNull()
    expect(loadAlert(w([50, 50, 50, 50, 120]))).toBeNull()
  })
  it('confronta la cadenza a ritmo simile', () => {
    const r = (k: number, s: number, c?: number): Activity => ({ id: `${s}`, date: '', type: 'corsa', source: 'fit', km: k, seconds: s, cadence: c })
    expect(samePace([r(1, 400, 160), r(1, 410, 162), r(1, 300, 175), r(1, 405)]).map(x => x.cadence)).toEqual([160, 162])
  })
})

describe('FC massima e cambio piano', () => {
  it('resta quando si cambia o si crea un piano', () => {
    const custom = blankPlan('x', 'Mia', 2)
    data.value = { plan: P, custom, state: { ...defaultState, mode: 'base', hrMax: 178 }, activities: [], tests: [] }
    switchPlan('custom'); expect(data.value!.state).toMatchObject({ mode: 'custom', hrMax: 178 })
    switchPlan('base'); expect(data.value!.state).toMatchObject({ mode: 'base', hrMax: 178 })
    startCustomPlan(custom, { startDate: '2026-11-09', raceDate: null, raceName: null }); expect(data.value!.state.hrMax).toBe(178)
  })
})
