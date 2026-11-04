import { describe, it, expect } from 'vitest'
import plan from '../shared/plan.json'
import { advance, blocksError, blocksKm, blocksOf, blocksText, finishStep, guideProgress, guideSteps, parseBlocks, startGuide, TEMPLATES, timedAhead, type Block } from '../shared/blocks'
import { addFix, meters, newTrack } from '../shared/gps'
import { painsOf, painText, withPains, worstOf, zoneCounts } from '../shared/pain'
import { parseGpx, parseTcx, parseXmlTrack } from '../shared/track'
import { generatePlan } from '../shared/generator'
import { planError, type Plan, type Day } from '../shared/engine'
const P = plan as unknown as Plan
const all = [...P.weeks, ...P.maintenance].flatMap(w => w.sessions)
describe('conversione del piano in blocchi', () => {
  it('tutte le sedute di corsa del piano base diventano guidabili', () => {
    for (const s of all) expect(blocksOf(s), s.text).not.toBeNull()
    expect(all.length).toBe(198)
  })
  it('i km stimati restano vicini a quelli del piano', () => {
    for (const s of all) { if (!s.km) continue; const k = blocksKm(blocksOf(s)!); expect(Math.abs(k! - s.km), s.text).toBeLessThanOrEqual(s.km * .25 + 1) }
  })
  it('legge ripetute a tempo e a distanza', () => {
    const a = parseBlocks(`Interval: 6×[2' Z4 + 2' facile] (8 km)`)!
    expect(a.map(b => b.kind)).toEqual(['warm', 'reps', 'cool']); expect(a[1]).toMatchObject({ reps: 6, part: { sec: 120, effort: 'hard' }, rest: { sec: 120, effort: 'easy' } })
    const b = parseBlocks(`Ripetute: 4×[1,5 km Z4 + 2'30" facile] (11 km)`)!
    expect(b[1]).toMatchObject({ reps: 4, part: { m: 1500 }, rest: { sec: 150 } })
    const c = parseBlocks(`Ripetute: 8×[400 m forti + 90" facile] (6 km)`)!
    expect(c[1]).toMatchObject({ part: { m: 400, effort: 'hard' }, rest: { sec: 90 } })
  })
  it('legge cammino-corsa, fondo medio, lungo con finale, tetto di tempo e allunghi', () => {
    expect(parseBlocks(`8×[1' corsa + 1'30" cammino]`)).toEqual([{ kind: 'reps', reps: 8, part: { sec: 60, m: undefined, effort: 'easy' }, rest: { sec: 90, m: undefined, effort: 'walk' } }])
    expect(parseBlocks('Fondo medio: 2 km facili + 5 km Z3 + 2 km facili')!.map(b => b.kind)).toEqual(['warm', 'run', 'cool'])
    expect(parseBlocks('Fondo medio: 2 km facili + 5 km a frasi brevi + 1 km facile')![1].part.effort).toBe('steady')
    expect(parseBlocks('Medio: 3 km facili + 6 km ritmo gara + 1 km')!.at(-1)!.kind).toBe('cool')
    expect(parseBlocks('Lungo 28 km, ultimi 6 a ritmo gara')!.map(b => [b.part.m, b.part.effort])).toEqual([[22000, 'easy'], [6000, 'race']])
    expect(parseBlocks(`Lunghissimo 30 km o 3h15'`)![0].part).toMatchObject({ m: 30000, sec: 11700 })
    expect(parseBlocks('Facile 6 km + 6 allunghi')![1]).toMatchObject({ kind: 'strides', reps: 6, part: { sec: 15 } })
    expect(parseBlocks('Maratona', 42.195)![0].part).toMatchObject({ m: 42195, effort: 'race' })
    expect(parseBlocks('Corsa in pineta')).toBeNull()
  })
  it('tutti i piani generati sono guidabili', () => {
    const base = { id: 'x', raceName: '', ambition: 'migliorare' as const, weeklyKm: 20, longestKm: 10, days: ['mar', 'gio', 'sab', 'dom'] as Day[], longDay: 'dom' as Day, strengthDays: [], startDate: '2026-11-09', raceDate: null }
    for (const [race, km] of [['5k', 5], ['10k', 10], ['21k', 21.097], ['42k', 42.195], ['trail', 30]] as const) for (const [w, l] of [[0, 0], [20, 10]]) for (const ambition of ['finire', 'migliorare'] as const) {
      const r = generatePlan({ ...base, race, km, weeklyKm: w, longestKm: l, ambition })
      for (const s of r.plan.weeks.flatMap(x => x.sessions)) expect(blocksOf(s), s.text).not.toBeNull()
    }
  })
  it('testo e blocchi dei modelli restano coerenti', () => {
    for (const t of TEMPLATES) { const b = t.blocks(); expect(blocksError(b)).toBeNull(); const again = parseBlocks(blocksText(b), blocksKm(b)); expect(again, blocksText(b)).not.toBeNull() }
    expect(blocksText(TEMPLATES[0].blocks())).toBe('Facile 5 km')
    expect(blocksText(TEMPLATES[2].blocks())).toBe(`6×[1' corsa + 2' cammino]`)
  })
  it('il controllo rifiuta blocchi sbagliati, anche nel piano', () => {
    expect(blocksError([])).not.toBeNull()
    expect(blocksError([{ kind: 'reps', reps: 0, part: { sec: 60, effort: 'hard' }, rest: { sec: 60, effort: 'easy' } }])).toMatch(/ripetizioni/)
    expect(blocksError([{ kind: 'run', part: { effort: 'easy' } }])).toMatch(/quanto dura/)
    const p: any = { meta: { kind: 'custom', id: 'a', phases: {} }, weeks: [{ sessions: [{ day: 'lun', text: 'x', blocks: [{ kind: 'boh' }] }] }] }
    expect(planError(p)).toMatch(/non valido/)
  })
})
describe('guida', () => {
  const b: Block[] = [{ kind: 'warm', part: { m: 1000, effort: 'easy' } }, { kind: 'reps', reps: 2, part: { sec: 60, effort: 'hard' }, rest: { sec: 30, effort: 'easy' } }, { kind: 'run', part: { m: 500, effort: 'steady' } }]
  const steps = guideSteps(b)
  it('espande le ripetizioni', () => { expect(steps.map(s => s.label)).toEqual(['Riscaldamento', 'Forte', 'Recupera', 'Forte', 'Recupera', 'Ritmo medio']) })
  it('un tratto a distanza non finisce col tempo', () => {
    const s = advance(steps, startGuide(), 3600, 500); expect(s.i).toBe(0); expect(Math.round(s.m)).toBe(500)
  })
  it('il GPS chiude il tratto e il tempo in eccesso passa al successivo', () => {
    const s = advance(steps, startGuide(), 400, 1000); expect(s.i).toBe(1); expect(s.laps[0].m).toBe(1000)
  })
  it('un lungo buco di tempo attraversa più tratti a tempo', () => {
    let s = advance(steps, startGuide(), 1, 1000); s = advance(steps, s, 150, 0)
    expect(s.i).toBe(4); expect(Math.round(s.t)).toBe(0)
    expect(s.laps.length).toBe(4)
  })
  it('Fatto chiude un tratto a distanza con l\'orologio', () => {
    const s = finishStep(steps, advance(steps, startGuide(), 300, 0)); expect(s.i).toBe(1); expect(s.laps[0].sec).toBe(300)
  })
  it('termina e conta tutto', () => {
    let s = advance(steps, startGuide(), 1, 1000); s = advance(steps, s, 180, 0); s = advance(steps, s, 100, 500)
    expect(s.done).toBe(true); expect(s.laps.length).toBe(6); expect(guideProgress(steps, s)).toBe(1)
  })
  it('vince il primo limite tra km e tempo', () => {
    const l = guideSteps(parseBlocks(`Lunghissimo 30 km o 3h15'`)!); expect(advance(l, startGuide(), 11700, 20000).done).toBe(true); expect(advance(l, startGuide(), 100, 30000).done).toBe(true)
  })
  it('programma i suoni solo fino al prossimo tratto a distanza', () => {
    const s = advance(steps, startGuide(), 1, 1000); const t = timedAhead(steps, s); expect(t.length).toBe(4); expect(t[0].at).toBeCloseTo(60, 0); expect(timedAhead(steps, startGuide()).length).toBe(0)
  })
})
describe('GPS', () => {
  const at = (m: number, t: number, acc = 5) => ({ lat: 45 + m / 111195, lon: 9, acc, t: t * 1000 })
  it('calcola la distanza', () => { expect(Math.round(meters(at(0, 0), at(1000, 0)))).toBe(1000) })
  it('scarta rumore, punti imprecisi e salti', () => {
    const tr = newTrack(); let sum = addFix(tr, at(0, 0))
    expect(addFix(tr, at(2, 1))).toBe(0)
    sum += addFix(tr, at(30, 10)); expect(Math.round(sum)).toBe(30)
    expect(addFix(tr, at(60, 15, 80))).toBe(0); expect(tr.weak).toBe(true)
    expect(addFix(tr, at(600, 16))).toBe(0)
    expect(Math.round(addFix(tr, at(60, 20)))).toBe(30); expect(tr.weak).toBe(false)
  })
  it('una corsa simulata con rumore resta entro il 4%', () => {
    const tr = newTrack(); let sum = 0, seed = 7
    const r = () => (seed = seed * 16807 % 2147483647) / 2147483647 - .5
    for (let s = 0; s <= 600; s++) sum += addFix(tr, { lat: 45 + (s * 2.8 + r() * 3) / 111195, lon: 9 + r() * 3 / 78600, acc: 6, t: s * 1000 })
    expect(Math.abs(sum - 1680) / 1680).toBeLessThan(.04)
  })
})
describe('dolori', () => {
  it('i dati vecchi restano leggibili', () => { expect(painsOf({ knee: 3 })).toEqual([{ zone: 'ginocchio', level: 3 }]); expect(painsOf({ knee: 0 })).toEqual([]) })
  it('knee conserva il valore più alto', () => {
    const a = withPains({ id: 'a' }, [{ zone: 'polpaccio', level: 2, side: 'sx' }, { zone: 'anca', level: 5 }])
    expect(a.knee).toBe(5); expect(worstOf([])).toBeNull(); expect(painText({ zone: 'polpaccio', level: 2, side: 'sx' })).toBe('Polpaccio sinistro')
  })
  it('conta le zone', () => {
    expect(zoneCounts([{ pains: [{ zone: 'anca', level: 3 }] }, { pains: [{ zone: 'anca', level: 1 }, { zone: 'tibia', level: 4 }] }, { knee: 2 }])[0]).toEqual({ zone: 'anca', times: 2, top: 3 })
  })
})
describe('importazione GPX e TCX', () => {
  const pts = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('')
  const iso = (s: number) => new Date(Date.UTC(2026, 10, 10, 7, 0, s)).toISOString()
  const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns:gpxtpx="x"><trk><name>x</name><type>running</type><trkseg>${pts(601, i => `<trkpt lat="${45 + i * 2.5 / 111195}" lon="9"><ele>${100 + i / 60}</ele><time>${iso(i * 1)}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>82</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`)}</trkseg></trk></gpx>`
  it('legge un GPX', () => {
    const r = parseGpx(gpx); expect(r.km).toBe(1.5); expect(r.seconds).toBe(600); expect(r.hrAvg).toBe(150); expect(r.cadence).toBe(164); expect(r.type).toBe('corsa'); expect(r.source).toBe('gpx'); expect(r.date).toBe('2026-11-10'); expect(r.splits!.split(' - ').length).toBe(1); expect(r.ascent).toBeGreaterThan(5)
  })
  it('un percorso senza orari dà un messaggio chiaro', () => { expect(() => parseGpx('<gpx><trk><trkseg><trkpt lat="45" lon="9"></trkpt></trkseg></trk></gpx>')).toThrow(/orari/) })
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Lap StartTime="${iso(0)}"><TotalTimeSeconds>500</TotalTimeSeconds><DistanceMeters>3000</DistanceMeters><Track>${pts(100, i => `<Trackpoint><Time>${iso(i * 5)}</Time><Position><LatitudeDegrees>45</LatitudeDegrees><LongitudeDegrees>9</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters><DistanceMeters>${i * 30}</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint>`)}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
  it('legge un TCX e usa i totali dei giri', () => {
    const r = parseTcx(tcx); expect(r.km).toBe(3); expect(r.seconds).toBe(500); expect(r.type).toBe('bici'); expect(r.hrMax).toBe(140); expect(r.laps).toBe(1)
  })
  it('riconosce il formato dal contenuto', () => { expect(parseXmlTrack(gpx).source).toBe('gpx'); expect(parseXmlTrack(tcx).source).toBe('tcx'); expect(() => parseXmlTrack('<a/>')).toThrow(/FIT, GPX o TCX/) })
})
import { HELP, GUIDE_DATE } from '../src/help'
describe('guida', () => {
  it('copre tutte le sezioni, senza voci vuote', () => {
    expect(GUIDE_DATE).toBeTruthy()
    expect(HELP.map(s => s.id)).toEqual(expect.arrayContaining(['home', 'allenati', 'registra', 'consulta', 'impara', 'profilo', 'problemi']))
    for (const s of HELP) for (const i of s.items) expect(i.a.length, i.q).toBeGreaterThan(0)
  })
})
import { addPlanned, data, removePlanned } from '../src/api'
import { buildTimeline, defaultState, plannedOn, reviewWeek, sessionDate, workoutError, type Planned } from '../shared/engine'
import { blockText, SWIM_TEMPLATES } from '../shared/blocks'
describe('allenamenti salvati', () => {
  const w = { id: 'a', name: 'Prova', sport: 'corsa', blocks: TEMPLATES[0].blocks() }
  it('controlla nome, sport e blocchi', () => {
    expect(workoutError(w)).toBeNull(); expect(workoutError({ ...w, name: ' ' })).toMatch(/nome/); expect(workoutError({ ...w, sport: 'bici' })).toMatch(/valido/); expect(workoutError({ ...w, blocks: [] })).toMatch(/blocco/)
  })
  const t0 = buildTimeline(P, defaultState), s = t0.slots[0], x = s.sessions[0], date = sessionDate(s, x.day)
  const p = (mode: Planned['mode'], d = date): Planned => ({ id: 'p1', name: 'Mia', sport: 'corsa', text: 'Facile 5 km', km: 5, blocks: TEMPLATES[0].blocks(), date: d, mode })
  it('sostituisce solo quella seduta, restando seduta del piano', () => {
    const t = buildTimeline(P, { ...defaultState, planned: [p('replace')] }), n = t.slots[0].sessions[0]
    expect(n.text).toBe('Facile 5 km'); expect(n.replaced).toBe(true); expect(n.day).toBe(x.day); expect(t.slots[0].key).toBe(s.key); expect(t.slots[1].sessions[0].replaced).toBeUndefined()
  })
  it('un allenamento aggiunto non tocca sedute né revisione', () => {
    const st = { ...defaultState, planned: [p('add')] }, t = buildTimeline(P, st)
    expect(t.slots[0].sessions).toEqual(s.sessions); expect(plannedOn(st, date).length).toBe(1)
    expect(reviewWeek(t, t.slots[0], []).reasons).toEqual(reviewWeek(t0, s, []).reasons)
  })
  it('una seconda sostituzione nello stesso giorno prende il posto della prima', () => {
    data.value = { plan: P, state: { ...defaultState }, activities: [], tests: [] }
    addPlanned(p('replace')); addPlanned({ ...p('replace'), id: 'p2' }); addPlanned({ ...p('add'), id: 'p3' })
    expect(data.value!.state.planned!.map(q => q.id)).toEqual(['p2', 'p3']); removePlanned('p3'); expect(data.value!.state.planned!.length).toBe(1)
  })
})
describe('nuoto', () => {
  const b = SWIM_TEMPLATES[1].blocks()
  it('usa metri e parole del nuoto', () => {
    expect(blockText(b[1], 'nuoto')).toBe('8×[50 m forti + 20" pausa]'); expect(blocksText(b, 'nuoto')).toBe('Nuoto: 200 m facili + 8×[50 m forti + 20" pausa] + 100 m facili')
    expect(blocksKm(b, 'nuoto')).toBe(.7)
    const st = guideSteps(b, 'nuoto'); expect(st.map(x => x.label).slice(0, 3)).toEqual(['Riscaldamento', 'Forte', 'Pausa']); expect(st[2].sec).toBe(20); expect(st[1].m).toBe(50)
  })
  it('i modelli sono validi', () => { for (const t of SWIM_TEMPLATES) expect(blocksError(t.blocks())).toBeNull() })
})
describe('percorsi', () => {
  const base = { id: 'x', raceName: '', raceDate: null, days: ['mar', 'gio', 'dom'] as Day[], longDay: 'dom' as Day, strengthDays: [], startDate: '2026-11-09' }
  const paths = [[0, 0, 'finire'], [0, 1, 'finire'], [15, 8, 'finire'], [25, 12, 'migliorare']] as const
  it('ogni partenza con ogni obiettivo produce un piano valido e guidabile', () => {
    for (const [weeklyKm, longestKm, ambition] of paths) for (const [race, km] of [['forma', 10], ['5k', 5], ['10k', 10], ['21k', 21.097], ['42k', 42.195], ['trail', 30], ['altro', 15]] as const) {
      const r = generatePlan({ ...base, race, km, weeklyKm, longestKm, ambition })
      expect(r.blocked).toBe(false); expect(planError(r.plan)).toBeNull()
      for (const s of r.plan.weeks.flatMap(x => x.sessions)) expect(blocksOf(s), s.text).not.toBeNull()
    }
  })
  it('stare in forma finisce con una prova, non con una gara', () => {
    const r = generatePlan({ ...base, race: 'forma', km: 10, weeklyKm: 0, longestKm: 0, ambition: 'finire' })
    expect(r.plan.meta.name).toBe('Stare in forma'); expect(r.plan.weeks.at(-1)!.sessions.at(-1)!.text).toBe('Prova finale 10 km')
  })
})
import { mustChoose } from '../shared/engine'
describe('scelta del percorso', () => {
  it('solo chi non ha ancora scelto, mai gli account già configurati', () => {
    expect(mustChoose({ state: {}, me: { isAdmin: false } })).toBe(true)
    expect(mustChoose({ state: {}, me: { isAdmin: true } })).toBe(false)
    expect(mustChoose({ state: { mode: 'base' }, me: { isAdmin: false } })).toBe(false)
    expect(mustChoose({ state: { mode: 'custom' }, me: { isAdmin: false } })).toBe(false)
  })
})
import { restartPlan, switchPlan } from '../src/api'
describe('fermare il piano', () => {
  const mk = (x = {}) => { data.value = { plan: P, state: { ...defaultState, mode: 'base', skips: [3], repeats: [2], startWeek: 6, hrMax: 180, watch: 'Garmin', planned: [{ id: 'q' } as any], ...x }, activities: [{ id: 'a', date: '2026-11-10', type: 'corsa', source: 'manuale', sessionKey: 'w6.0-mar' }], tests: [], workouts: [{ id: 'w' } as any], me: { name: 'x', isAdmin: true } } }
  it('chiede una nuova scelta a chiunque, anche all\'amministratore, e non perde i dati', () => {
    mk(); restartPlan(); const d = data.value!
    expect(mustChoose(d)).toBe(true); expect(d.activities.length).toBe(1); expect(d.workouts!.length).toBe(1); expect(d.state.planned).toEqual([])
  })
  it('riparte dall\'inizio tenendo le impostazioni, e le vecchie sedute non risultano fatte', () => {
    mk(); restartPlan(); switchPlan('base'); const s = data.value!.state
    expect(mustChoose(data.value!)).toBe(false); expect(s.startWeek).toBe(1); expect(s.skips).toEqual([]); expect(s.repeats).toEqual([]); expect(s.hrMax).toBe(180); expect(s.watch).toBe('Garmin')
    const t = buildTimeline(P, s); expect(t.slots[0].week).toBe(1); expect(t.slots[0].key).toBe('r1.w1.0')
  })
  it('una seconda ripartenza ha chiavi ancora diverse', () => {
    mk({ round: 1 }); restartPlan(); switchPlan('base'); expect(buildTimeline(P, data.value!.state).slots[0].key).toBe('r2.w1.0')
  })
})
