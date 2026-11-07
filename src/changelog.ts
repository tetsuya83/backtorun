import raw from '../CHANGELOG.md?raw'

/** Legge CHANGELOG.md, che è l'unica fonte: per una nuova versione basta scrivere lì. */
export const CHANGE_KINDS = ['Aggiunto', 'Modificato', 'Tolto'] as const
export type ChangeKind = typeof CHANGE_KINDS[number]
/** In breve: i punti per chi usa l'app, mostrati nel banner delle novità. Non compare nella pagina Novità, che ha già il dettaglio. */
export interface Release { version: string; date: string; changes: { kind: ChangeKind; items: string[] }[]; brief: string[] }

export function parseChangelog(text: string): Release[] {
  const out: Release[] = []
  let cur: Release['changes'][number] | null = null, brief = false
  for (const line of text.split(/\r?\n/)) {
    const v = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/.exec(line)
    if (v) { out.push({ version: v[1], date: v[2], changes: [], brief: [] }); cur = null; brief = false; continue }
    const k = /^### (.+)$/.exec(line)
    if (k) {
      cur = null; brief = k[1] === 'In breve' && out.length > 0
      if (CHANGE_KINDS.includes(k[1] as ChangeKind) && out.length) { cur = { kind: k[1] as ChangeKind, items: [] }; out[out.length - 1].changes.push(cur) }
      continue
    }
    if (brief && line.startsWith('- ')) out[out.length - 1].brief.push(line.slice(2).trim())
    else if (cur && line.startsWith('- ')) cur.items.push(line.slice(2).trim())
  }
  return out
}
export const CHANGELOG = parseChangelog(raw)
export const APP_VERSION = CHANGELOG[0].version
const num = (v: string) => v.split('.').map(Number)
export const newer = (a: string, b: string) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false }
/** Le versioni con punti In breve che non hai ancora visto. */
export const unseen = (seen: string | null | undefined, list = CHANGELOG) => list.filter(r => r.brief.length && (!seen || newer(r.version, seen)))
