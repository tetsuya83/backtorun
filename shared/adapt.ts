/* Piano che si adatta: legge ciò che registri e propone di rallentare. Non cambia nulla senza la tua conferma. */
import { addDays, sessionDate, sessionKey, upper, type Activity, type Session, type Slot, type Timeline } from './engine'
import { painsOf, painText } from './pain'
import { sessionMin } from './tips'

export interface Advice { id: string; kind: 'repeat' | 'lighten'; title: string; reasons: string[]; week?: number; date?: string; ses?: Session; minutes?: number }
const runs = (s: Slot) => s.sessions.filter(x => x.km !== 0 && !x.race)
const worst = (a: Activity) => [...painsOf(a, 'ginocchio')].sort((x, y) => y.level - x.level)[0]
const tooHard = (a: Activity | undefined, x: Session | undefined) => { const t = upper(x?.fatica); return !!a && a.fatica != null && !!t && a.fatica >= t + 2 }

/** Bilancio di una settimana finita: se è andata peggio del previsto, propone di ripeterla. */
export function weekAdvice(t: Timeline, slot: Slot, acts: Activity[]): Advice | null {
  if (typeof slot.week !== 'number' || slot.maintenance) return null
  const plan = runs(slot), done = plan.map(x => acts.find(a => a.sessionKey === sessionKey(slot, x.day)))
  if (!plan.length) return null
  const reasons: string[] = [], missed = done.filter(a => !a).length
  if (missed >= 2 || missed / plan.length > .4) reasons.push(`Hai saltato ${missed} ${missed === 1 ? 'seduta' : 'sedute'} su ${plan.length}`)
  for (let i = 1; i < plan.length; i++) if (tooHard(done[i - 1], plan[i - 1]) && tooHard(done[i], plan[i])) { reasons.push('Fatica sopra le attese in due sedute di fila'); break }
  const end = addDays(slot.monday, 7), week = acts.filter(a => a.type === 'corsa' && a.date >= slot.monday && a.date < end).sort((a, b) => a.date.localeCompare(b.date))
  const hurt = week.map(a => ({ a, p: worst(a) })).filter(x => x.p && x.p.level > 0)
  const top = [...hurt].sort((x, y) => y.p!.level - x.p!.level)[0]
  if (week.some(a => a.swelling)) reasons.push('Gonfiore dopo una corsa')
  else if (top && top.p!.level >= 4) reasons.push(`Dolore fino a ${top.p!.level}: ${painText(top.p!).toLowerCase()}`)
  else if (hurt.length >= 2 && hurt[hurt.length - 1].p!.level >= hurt[0].p!.level + 2) reasons.push('Dolore in aumento durante la settimana')
  if (!reasons.length) return null
  return { id: `rep-${slot.key}`, kind: 'repeat', week: slot.week, title: `Ripeti la settimana ${slot.week}`, reasons }
}

/** Durante la settimana: dopo due corse troppo faticose o un dolore, alleggerisce la prossima seduta. */
export function nextAdvice(t: Timeline, acts: Activity[], today: string): Advice | null {
  const sessions = t.slots.flatMap(s => runs(s).map(x => ({ s, x, date: sessionDate(s, x.day), key: sessionKey(s, x.day) })))
  const past = sessions.filter(v => v.date <= today).map(v => ({ ...v, a: acts.find(a => a.sessionKey === v.key) })).filter(v => v.a).slice(-2)
  const next = sessions.find(v => v.date > today && v.date <= addDays(today, 4) && !acts.some(a => a.sessionKey === v.key))
  if (!next || !past.length || /test|gara/i.test(next.x.text) || next.x.replaced) return null
  const last = past[past.length - 1].a!, p = worst(last), reasons: string[] = []
  if (last.locked || last.swelling) return null // ci pensano già gli avvisi di stop
  if (past.length === 2 && past.every(v => tooHard(v.a, v.x))) reasons.push('Fatica sopra le attese nelle ultime due corse')
  if (p && p.level >= 4) reasons.push(`Dolore ${p.level} nell'ultima corsa: ${painText(p).toLowerCase()}`)
  if (!reasons.length) return null
  const minutes = Math.max(15, Math.min(45, Math.round(sessionMin(next.x) * .6 / 5) * 5))
  return { id: `light-${next.key}`, kind: 'lighten', title: 'Alleggerisci la prossima seduta', reasons, date: next.date, ses: next.x, minutes }
}

export interface Summary { done: number; planned: number; km: number; kmPlan: number | null; minutes: number; fatica: number | null; faticaPlan: number | null; pain: { level: number; text: string } | null; strength: number; next: { slot: Slot; km: number | null; long: string | null } | null }
/** I numeri della settimana, per il riepilogo della domenica. */
export function weekSummary(t: Timeline, slot: Slot, acts: Activity[]): Summary {
  const plan = runs(slot), done = plan.map(x => acts.find(a => a.sessionKey === sessionKey(slot, x.day))), end = addDays(slot.monday, 7)
  const week = acts.filter(a => a.date >= slot.monday && a.date < end), run = week.filter(a => a.type === 'corsa')
  const fat = done.filter(a => a?.fatica != null).map(a => a!.fatica!), tgt = plan.map(x => upper(x.fatica)).filter((x): x is number => x != null)
  const avg = (l: number[]) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length * 10) / 10 : null
  const top = run.map(worst).filter(p => p && p.level > 0).sort((a, b) => b!.level - a!.level)[0]
  const nx = t.slots[t.slots.indexOf(slot) + 1], long = nx ? [...runs(nx)].sort((a, b) => (b.km ?? 0) - (a.km ?? 0))[0] : null
  return {
    done: done.filter(Boolean).length, planned: plan.length, km: Math.round(run.reduce((n, a) => n + (a.km ?? 0), 0) * 10) / 10, kmPlan: slot.total,
    minutes: Math.round(run.reduce((n, a) => n + (a.seconds ?? 0), 0) / 60), fatica: avg(fat), faticaPlan: avg(tgt),
    pain: top ? { level: top.level, text: painText(top) } : null, strength: week.filter(a => a.type === 'forza').length,
    next: nx ? { slot: nx, km: nx.total, long: long?.text ?? null } : null,
  }
}
