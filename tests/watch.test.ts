import { describe, expect, it } from 'vitest'
import { workoutText, watchEventError } from '../shared/intervals'
import { watchEvents } from '../shared/watch'
import type { Timeline } from '../shared/engine'

describe('sedute verso l\'orologio', () => {
  it('scrive le ripetute nel formato di Intervals.icu', () => {
    expect(workoutText([
      { kind: 'warm', part: { sec: 600, effort: 'easy' } },
      { kind: 'reps', reps: 5, part: { sec: 180, effort: 'hard' }, rest: { sec: 120, effort: 'walk' } },
      { kind: 'cool', part: { sec: 330, effort: 'easy' } },
    ])).toBe('Riscaldamento\n- Facile 10m Z2 HR\n\n5x\n- Forte 3m Z4 HR\n- Recupero camminando 2m Z1 HR\n\nDefaticamento\n- Facile 5m30s Z2 HR')
    expect(workoutText([{ kind: 'run', part: { m: 8000, effort: 'easy' } }, { kind: 'reps', reps: 6, part: { m: 400, effort: 'max' }, rest: { sec: 90, effort: 'easy' } }])).toBe('- Facile 8km Z2 HR\n\n6x\n- Molto forte 400mtr Z5 HR\n- Recupero 1m30s Z2 HR')
  })
  it('prende solo le corse dei prossimi sette giorni', () => {
    const t: Timeline = { raceTooClose: false, earliestRace: '', spareWeeks: 0, slots: [{ week: 3, phase: 1, scarico: false, skippable: false, total: 10, monday: '2026-11-09', key: 'w3', occurrence: 1, sessions: [
      { day: 'lun', text: 'Forza', km: 0 }, { day: 'mar', text: "Corsa facile 30'", km: 5 }, { day: 'dom', text: 'Lungo 10 km', km: 10 },
    ] }] }
    const e = watchEvents(t, [{ id: 'x', name: 'Nuoto', sport: 'nuoto', text: 'Nuoto', km: null, blocks: [], date: '2026-11-11', mode: 'add' }], '2026-11-10')
    expect(e.map(x => x.date)).toEqual(['2026-11-10', '2026-11-15'])
    expect(e[0].id).toBe('w3-mar')
    expect(e.every(x => !watchEventError(x))).toBe(true)
    expect(watchEvents(t, [], '2026-11-11', 3)).toEqual([])
  })
})
