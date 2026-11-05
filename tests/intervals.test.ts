import { describe, it, expect } from 'vitest'
import { isStrava, mergeTarget, pendingImports, remoteOf, type Remote } from '../shared/intervals'
import type { Activity } from '../shared/engine'

const raw = { id: 'i42', name: 'Corsa', type: 'Run', start_date_local: '2026-11-10T06:02:00', distance: 6230, moving_time: 2300, average_heartrate: 141, max_heartrate: 160, total_elevation_gain: 12, source: 'SUUNTO' }
const r = remoteOf(raw) as Remote
const act = (p: Partial<Activity>) => ({ id: 'a', date: '2026-11-10', type: 'corsa', source: 'manuale', ...p }) as Activity

describe('lettura da Intervals.icu', () => {
  it('converte i campi', () => expect(r).toEqual({ id: 'i42', name: 'Corsa', type: 'corsa', date: '2026-11-10', km: 6.23, seconds: 2300, hrAvg: 141, hrMax: 160, ascent: 12 }))
  it('riconosce gli sport e tiene da parte gli sconosciuti', () => {
    expect(remoteOf({ ...raw, type: 'Swim' })?.type).toBe('nuoto')
    expect(remoteOf({ ...raw, type: 'WeightTraining' })?.type).toBe('forza')
    expect(remoteOf({ ...raw, type: 'Yoga' })?.type).toBe('altro')
  })
  it('scarta le attività di Strava e quelle senza data', () => {
    expect(isStrava({ id: 'x', source: 'STRAVA' })).toBe(true)
    expect(remoteOf({ id: 'x', source: 'STRAVA', start_date_local: '2026-11-10T06:00:00' })).toBeNull()
    expect(remoteOf({ id: 'x', _note: 'STRAVA activities are not available via the API', start_date_local: '2026-11-10T06:00:00' })).toBeNull()
    expect(remoteOf({ id: 'x' })).toBeNull()
  })
  it('tollera i campi assenti', () => expect(remoteOf({ id: 'i1', type: 'Run', start_date_local: '2026-11-10T06:00:00' })).toMatchObject({ km: null, seconds: null, hrAvg: null }))
})
describe('allenamenti da proporre', () => {
  it('non ripropone quelli già importati', () => expect(pendingImports([r], [act({ externalId: 'i42', source: 'fit' })])).toEqual([]))
  it('non crea doppioni con un file caricato a mano', () => expect(pendingImports([r], [act({ source: 'fit', km: 6.2 })])).toEqual([]))
  it('propone una seconda uscita diversa nello stesso giorno', () => expect(pendingImports([r], [act({ source: 'fit', km: 12 })])).toEqual([r]))
  it('mostra prima i più vecchi', () => {
    const old = { ...r, id: 'i1', date: '2026-11-08' }
    expect(pendingImports([r, old], []).map(x => x.id)).toEqual(['i1', 'i42'])
  })
})
describe('completare una seduta già registrata', () => {
  it('sceglie la seduta scritta a mano dello stesso giorno', () => expect(mergeTarget(r, [act({ id: 'm', fatica: 4 })])?.id).toBe('m'))
  it('sceglie quella registrata col GPS con distanza simile', () => expect(mergeTarget(r, [act({ id: 'g', source: 'gps', km: 6 })])?.id).toBe('g'))
  it('ignora una distanza troppo diversa, un altro sport o un altro giorno', () => {
    expect(mergeTarget(r, [act({ km: 12 })])).toBeUndefined()
    expect(mergeTarget(r, [act({ type: 'bici' })])).toBeUndefined()
    expect(mergeTarget(r, [act({ date: '2026-11-09' })])).toBeUndefined()
  })
})
