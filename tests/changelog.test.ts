import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { APP_VERSION, CHANGELOG, parseChangelog } from '../src/changelog'

const num = (v: string) => v.split('.').map(Number)
const newer = (a: string, b: string) => { const [x, y] = [num(a), num(b)]; return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }

describe('registro delle versioni', () => {
  it('legge versioni, sezioni e voci, ignorando le sezioni sconosciute', () => {
    const r = parseChangelog('# Titolo\n\nTesto\n\n## 1.2.0 - 2026-01-02\n\n### Aggiunto\n\n- Uno\n- Due\n\n### Tolto\n\n- Tre\n\n### Altro\n\n- Scartata\n\n## 1.1.0 - 2026-01-01\n\n### Modificato\n\n- Quattro\n')
    expect(r.map(x => x.version)).toEqual(['1.2.0', '1.1.0'])
    expect(r[0].changes).toEqual([{ kind: 'Aggiunto', items: ['Uno', 'Due'] }, { kind: 'Tolto', items: ['Tre'] }])
  })
  it('la versione dell\'app coincide con la prima del registro', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
  it('le versioni vanno dalla più recente alla prima, senza doppioni né date invertite', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(newer(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0)
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
    }
  })
  it('ogni versione dice cosa è cambiato', () => {
    for (const r of CHANGELOG) {
      expect(r.changes.length).toBeGreaterThan(0)
      for (const c of r.changes) expect(c.items.length).toBeGreaterThan(0)
    }
  })
})
import { CHANGELOG as ALL, unseen } from '../src/changelog'
describe('novità in breve', () => {
  it('ogni nuova versione ha da 1 a 5 punti brevi', () => {
    expect(ALL[0].brief.length).toBeGreaterThan(0)
    expect(ALL[0].brief.length).toBeLessThanOrEqual(5)
    for (const t of ALL[0].brief) expect(t.length).toBeLessThanOrEqual(90)
  })
  it('mostra solo le versioni non ancora viste', () => {
    const l = parseChangelog('## 1.24.0 - 2026-11-10\n\n### In breve\n\n- Due\n\n### Aggiunto\n\n- X\n\n## 1.23.0 - 2026-11-07\n\n### In breve\n\n- Uno\n\n## 1.22.0 - 2026-11-06\n\n### Aggiunto\n\n- Y\n')
    expect(l[0].changes).toEqual([{ kind: 'Aggiunto', items: ['X'] }])
    expect(unseen(null, l).map(r => r.version)).toEqual(['1.24.0', '1.23.0'])
    expect(unseen('1.23.0', l).map(r => r.version)).toEqual(['1.24.0'])
    expect(unseen('1.24.0', l)).toEqual([])
    expect(unseen('1.9.0', l).length).toBe(2)
  })
})
