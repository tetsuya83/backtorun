import raw from '../CHANGELOG.md?raw'

/** Legge CHANGELOG.md, che è l'unica fonte: per una nuova versione basta scrivere lì. */
export const CHANGE_KINDS = ['Aggiunto', 'Modificato', 'Tolto'] as const
export type ChangeKind = typeof CHANGE_KINDS[number]
export interface Release { version: string; date: string; changes: { kind: ChangeKind; items: string[] }[] }

export function parseChangelog(text: string): Release[] {
  const out: Release[] = []
  let cur: Release['changes'][number] | null = null
  for (const line of text.split(/\r?\n/)) {
    const v = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/.exec(line)
    if (v) { out.push({ version: v[1], date: v[2], changes: [] }); cur = null; continue }
    const k = /^### (.+)$/.exec(line)
    if (k) {
      cur = null
      if (CHANGE_KINDS.includes(k[1] as ChangeKind) && out.length) { cur = { kind: k[1] as ChangeKind, items: [] }; out[out.length - 1].changes.push(cur) }
      continue
    }
    if (cur && line.startsWith('- ')) cur.items.push(line.slice(2).trim())
  }
  return out
}
export const CHANGELOG = parseChangelog(raw)
export const APP_VERSION = CHANGELOG[0].version
