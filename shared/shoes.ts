import type { Activity, Shoe, State } from './engine'

/* Chilometri delle scarpe: i km di partenza più quelli delle corse fatte con quel paio. */

/** Il paio di una corsa: quello scelto, oppure il predefinito per le corse senza scelta fatte da quando lo hai. */
export function shoeOf(a: Activity, st: Pick<State, 'shoes' | 'defaultShoe'>): string | null {
  if (a.type !== 'corsa') return null
  if (a.shoe !== undefined) return a.shoe
  const s = (st.shoes ?? []).find(x => x.id === st.defaultShoe)
  return s && !s.retired && a.date >= s.since ? s.id : null
}

export interface ShoeUse { shoe: Shoe; km: number; runs: number; last: string | null; level: 'ok' | 'quasi' | 'cambia' }
export function shoeUse(st: Pick<State, 'shoes' | 'defaultShoe'>, acts: Activity[]): ShoeUse[] {
  return (st.shoes ?? []).map(shoe => {
    const mine = acts.filter(a => shoeOf(a, st) === shoe.id)
    const km = Math.round((shoe.startKm || 0) + mine.reduce((t, a) => t + (a.km ?? 0), 0))
    return { shoe, km, runs: mine.length, last: mine.at(-1)?.date ?? null, level: km >= shoe.limitKm ? 'cambia' : km >= shoe.limitKm * .9 ? 'quasi' : 'ok' }
  })
}

/** Quando si salva una corsa senza scelta, prende il paio predefinito (se c'è ed è ancora in uso). */
export function withShoe(a: Activity, st: Pick<State, 'shoes' | 'defaultShoe'>): Activity {
  if (a.type !== 'corsa' || a.shoe !== undefined) return a
  const s = (st.shoes ?? []).find(x => x.id === st.defaultShoe && !x.retired)
  return s && a.date >= s.since ? { ...a, shoe: s.id } : a
}
export const DEFAULT_LIMIT = 700
