/* Ripresa dopo uno stop: regole prudenti, proposte e confermate da chi corre. */
import { addDays, buildTimeline, diffDays, mondayOf, sessionDate, slotForDate, type Activity, type Plan, type Planned, type Resume, type State, type Timeline } from './engine'
import { painsOf } from './pain'

export type Reason = Resume['reason']
export interface ResumePlan { days: number; back: number; week: number | null; from: number | string | null; trial: boolean; note: string | null }
/** Meno di 7 giorni: si riprende dov'eri. Poi si torna indietro di 1, 2 o 3 settimane. Dopo un dolore o più di 2 settimane, prima due uscite di prova. */
export function resumeFor(t: Timeline, from: string, to: string, reason: Reason): ResumePlan {
  const days = diffDays(from, to) + 1, back = days < 7 ? 0 : days < 14 ? 1 : days < 28 ? 2 : 3, trial = reason === 'dolore' || days > 14
  const at = slotForDate(t, from) ?? t.slots.find(s => s.monday > from) ?? null, first = t.slots.find(s => typeof s.week === 'number')
  if (!at) return { days, back: 0, week: null, from: null, trial, note: null }
  if (at.maintenance || (typeof at.week === 'number' && at.week >= 35 && !t.slots.some(s => s.uid))) return { days, back: 0, week: null, from: at.week, trial, note: 'Sei nella parte del piano legata alla data della gara: non si torna indietro, ma riparti con prudenza.' }
  if (!back || typeof at.week !== 'number') return { days, back: 0, week: null, from: at.week, trial, note: null }
  const min = typeof first?.week === 'number' ? first.week : 1
  return { days, back, week: Math.max(min, at.week - back), from: at.week, trial, note: null }
}
const trialPlan = (date: string, id: string): Planned => ({ id, name: 'Uscita di prova', sport: 'corsa', text: "Uscita di prova: corsa facile 20'", km: null, blocks: [{ kind: 'run', part: { sec: 1200, effort: 'easy' } }], fiato: 'Frasi complete', fatica: '2-3', date, mode: 'replace' })
/** Lo stato dopo la conferma: ripresa da questa settimana e, se servono, due uscite di prova sulle prime corse da oggi. */
export function applyResume(plan: Plan, st: State, from: string, to: string, reason: Reason, today: string, uid: () => string): State {
  const p = resumeFor(buildTimeline(plan, st), from, to, reason)
  const next: State = { ...st, resumes: [...(st.resumes ?? []), { monday: mondayOf(today), week: p.week, from, to, reason }] }
  if (!p.trial) return next
  const t = buildTimeline(plan, next), dates = t.slots.flatMap(s => s.sessions.filter(x => x.km !== 0 && !x.race).map(x => sessionDate(s, x.day))).filter(d => d >= today).sort().slice(0, 2)
  const r = next.resumes!, last = { ...r[r.length - 1], trials: dates }
  return { ...next, resumes: [...r.slice(0, -1), last], planned: [...(st.planned ?? []).filter(x => !(x.mode === 'replace' && dates.includes(x.date))), ...dates.map(d => trialPlan(d, uid()))] }
}
/** Nessuna corsa da almeno 8 giorni, mentre il piano ne prevedeva: forse è uno stop. */
export function stopGuess(t: Timeline, acts: Activity[], st: State, today: string): { from: string; id: string } | null {
  const runs = acts.filter(a => a.type === 'corsa' && a.date <= today).map(a => a.date).sort(), last = runs[runs.length - 1] ?? null
  const start = t.slots[0]?.monday, from = last ? addDays(last, 1) : start
  if (!from || from > today || diffDays(from, today) < 8) return null
  if ((st.resumes ?? []).some(r => r.to >= addDays(today, -7))) return null
  const planned = t.slots.some(s => s.sessions.some(x => x.km !== 0 && sessionDate(s, x.day) >= from && sessionDate(s, x.day) < today))
  return planned ? { from, id: `stop-${from}` } : null
}
/** Un dolore sopra 2 in un'uscita di prova: meglio farsi vedere prima di riprendere. */
export function trialPain(st: State, acts: Activity[], kneeZone = 'ginocchio') {
  const r = (st.resumes ?? []).at(-1)
  if (!r?.trials?.length) return null
  const a = acts.filter(x => x.type === 'corsa' && r.trials!.includes(x.date)).map(x => ({ x, p: [...painsOf(x, kneeZone)].sort((a, b) => b.level - a.level)[0] })).find(v => v.p && v.p.level > 2)
  return a ? { level: a.p!.level, date: a.x.date, id: `trial-${a.x.id}` } : null
}
/** Toglie l'ultima ripresa e le sue uscite di prova ancora nel piano. */
export function undoResume(st: State): State {
  const r = (st.resumes ?? []).at(-1)
  if (!r) return st
  const trials = r.trials ?? []
  return { ...st, resumes: (st.resumes ?? []).slice(0, -1), planned: (st.planned ?? []).filter(x => !(x.name === 'Uscita di prova' && trials.includes(x.date))) }
}
