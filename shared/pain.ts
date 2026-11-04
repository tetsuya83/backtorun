/* Dolori per zona del corpo. Il campo knee resta il valore più alto, così regole e dati storici non cambiano. */
export type Side = 'sx' | 'dx' | 'both'
export type PainWhen = 'sempre' | 'inizio' | 'forte' | 'fine' | 'dopo'
export interface Pain { zone: string; side?: Side | null; level: number; when?: PainWhen | null }
export const ZONES: { id: string; label: string; paired: boolean }[] = [
  { id: 'ginocchio', label: 'Ginocchio', paired: true }, { id: 'polpaccio', label: 'Polpaccio', paired: true },
  { id: 'caviglia', label: 'Caviglia', paired: true }, { id: 'achille', label: 'Tendine d\'Achille', paired: true },
  { id: 'piede', label: 'Piede o pianta', paired: true }, { id: 'tibia', label: 'Tibia', paired: true },
  { id: 'coscia-ant', label: 'Coscia davanti', paired: true }, { id: 'coscia-post', label: 'Coscia dietro', paired: true },
  { id: 'anca', label: 'Anca o inguine', paired: true }, { id: 'gluteo', label: 'Gluteo', paired: true },
  { id: 'schiena', label: 'Schiena', paired: false }, { id: 'altro', label: 'Altro', paired: false },
]
export const WHEN: [PainWhen, string][] = [['sempre', 'Sempre'], ['inizio', "All'inizio"], ['forte', 'Nei tratti forti'], ['fine', 'Alla fine'], ['dopo', 'Dopo']]
export const zoneLabel = (id: string) => ZONES.find(z => z.id === id)?.label ?? id
const SIDE: Record<Side, string> = { sx: 'sinistro', dx: 'destro', both: 'entrambi i lati' }
export const painText = (p: Pain) => [zoneLabel(p.zone), p.side ? SIDE[p.side] : null].filter(Boolean).join(' ').toLowerCase().replace(/^./, c => c.toUpperCase())
export const worstOf = (l: Pain[]) => l.length ? Math.max(...l.map(p => p.level)) : null
/** I dolori di un'attività: quelli vecchi avevano un solo valore, riferito al ginocchio nel piano base. */
export function painsOf(a: { pains?: Pain[] | null; knee?: number | null }, kneeZone = 'ginocchio'): Pain[] {
  if (a.pains) return a.pains
  return a.knee != null && a.knee > 0 ? [{ zone: kneeZone, level: a.knee }] : []
}
export const withPains = <T extends object>(a: T, pains: Pain[]) => ({ ...a, pains, knee: worstOf(pains) })
/** Quante volte ogni zona ha dato dolore oltre la soglia, dalla più frequente. */
export function zoneCounts(acts: { pains?: Pain[] | null; knee?: number | null }[], from = 1) {
  const n = new Map<string, { zone: string; times: number; top: number }>()
  for (const a of acts) for (const p of painsOf(a)) {
    if (p.level < from) continue
    const x = n.get(p.zone) ?? { zone: p.zone, times: 0, top: 0 }
    x.times++; x.top = Math.max(x.top, p.level); n.set(p.zone, x)
  }
  return [...n.values()].sort((a, b) => b.times - a.times || b.top - a.top)
}
