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
