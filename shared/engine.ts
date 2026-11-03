import type { ExerciseLog } from './training'
export type Day = 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'
export const DAYS: Day[] = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
export interface Session { day: Day; text: string; km: number | null; fiato?: string | null; fatica?: string | null; race?: boolean }
export interface Week { week: number | string; phase: number; scarico: boolean; skippable: boolean; total: number | null; sessions: Session[]; uid?: string }
export interface PlanMeta { phases: Record<string, string>; kind?: 'custom'; id?: string; name?: string; strengthDays?: Day[] }
export interface Plan { meta: PlanMeta; weeks: Week[]; maintenance: Week[] }
export interface State { startDate: string; startWeek: number; skips: number[]; repeats: number[]; raceDate: string | null; raceName?: string | null; mode?: 'base' | 'custom'; hrMax?: number | null; other?: Partial<State> | null }
export interface Activity {
  id: string; date: string; type: 'corsa' | 'forza' | 'nuoto' | 'bici' | 'altro'; sessionKey?: string | null; source: 'manuale' | 'fit'
  km?: number | null; seconds?: number | null; hrAvg?: number | null; hrMax?: number | null; hrLast?: number | null
  splits?: string | null; fiato?: number | null; fatica?: number | null; knee?: number | null; swelling?: boolean | null; locked?: boolean | null
  note?: string | null; trace?: [number, number | null, number | null, (number | null)?, (number | null)?][] | null; cadence?: number | null; ascent?: number | null; sets?: ExerciseLog[] | null; updatedAt?: number
}
export interface Slot extends Week { monday: string; key: string; maintenance?: boolean; occurrence: number }

export const defaultState: State = { startDate: '2026-11-09', startWeek: 1, skips: [], repeats: [], raceDate: null, raceName: null }
const DAY_OFFSET: Record<Day, number> = { lun: 0, mar: 1, mer: 2, gio: 3, ven: 4, sab: 5, dom: 6 }
export const SPECIFIC_WEEKS = 16

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export const mondayOf = (iso: string) => {
  const d = new Date(iso + 'T12:00:00Z'); return addDays(iso, -((d.getUTCDay() + 6) % 7))
}
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)
export const sessionDate = (s: Slot, day: Day) => addDays(s.monday, DAY_OFFSET[day])
export const sessionKey = (s: Slot, day: Day) => `${s.key}-${day}`

export const isCustom = (p: Plan) => p.meta.kind === 'custom'
export const strengthDays = (p: Plan): Day[] => p.meta.strengthDays ?? (isCustom(p) ? [] : ['lun', 'gio'])
/** Piano in uso: quello personale solo se attivo e presente. */
export const planFor = (d: { plan: Plan; custom?: Plan | null; state: State }) => d.state.mode === 'custom' && d.custom ? d.custom : d.plan

export interface Timeline { slots: Slot[]; raceTooClose: boolean; earliestRace: string; spareWeeks: number }

/** Calcola il calendario dal piano e dallo stato: salti e ripetizioni spostano tutto, la Fase 4 si aggancia alla gara. */
export function buildTimeline(plan: Plan, st: State): Timeline {
  const slots: Slot[] = []
  let monday = mondayOf(st.startDate)
  if (isCustom(plan)) {
    for (const w of plan.weeks) {
      const times = 1 + st.repeats.filter(r => r === w.week).length
      for (let i = 0; i < times; i++) { slots.push({ ...w, monday, key: `${w.uid ?? 'w' + w.week}.${i}`, occurrence: i }); monday = addDays(monday, 7) }
    }
    const last = slots.at(-1)!.monday
    return { slots, raceTooClose: !!st.raceDate && last > mondayOf(st.raceDate), earliestRace: addDays(last, 6), spareWeeks: 0 }
  }
  const push = (w: Week, key: string, occurrence: number, maintenance = false) => {
    slots.push({ ...w, monday, key, occurrence, maintenance }); monday = addDays(monday, 7)
  }
  const pre = plan.weeks.filter(w => (w.week as number) >= st.startWeek && (w.week as number) <= 34)
  for (const w of pre) {
    const n = w.week as number
    if (st.skips.includes(n)) continue
    const times = 1 + st.repeats.filter(r => r === n).length
    for (let i = 0; i < times; i++) push(w, `w${n}.${i}`, i)
  }
  const earliestStart = monday
  const earliestRace = addDays(earliestStart, 7 * SPECIFIC_WEEKS - 1)
  const specific = plan.weeks.filter(w => (w.week as number) >= 35)
  let raceTooClose = false, spareWeeks = 0
  const fill = (n: number) => { for (let i = 0; i < n; i++) push(plan.maintenance[i % 4], `m${i}`, 0, true) }
  if (st.raceDate) {
    const p4 = addDays(mondayOf(st.raceDate), -7 * (SPECIFIC_WEEKS - 1))
    spareWeeks = Math.round(diffDays(monday, p4) / 7)
    if (spareWeeks < 0) raceTooClose = true
    else fill(spareWeeks)
    specific.forEach(w => push(w, `w${w.week}.0`, 0))
  } else {
    fill(52)
  }
  return { slots, raceTooClose, earliestRace, spareWeeks }
}

/** Sposta la gara di un piano personale: la gara cambia giorno e il calendario la segue. */
export function moveRace(plan: Plan, st: State, raceDate: string | null): { plan: Plan; state: State } {
  if (!raceDate) return { plan, state: { ...st, raceDate: null } }
  const day = DAYS[diffDays(mondayOf(raceDate), raceDate)]
  const weeks = plan.weeks.map(w => {
    if (!w.sessions.some(s => s.race)) return w
    const rest = w.sessions.filter(s => s.race || s.day !== day)
    return { ...w, sessions: rest.map(s => s.race ? { ...s, day } : s).sort(byDay) }
  })
  const n = weeks.length + st.repeats.length
  return { plan: { ...plan, weeks }, state: { ...st, raceDate, startDate: addDays(mondayOf(raceDate), -7 * (n - 1)) } }
}
const byDay = (a: Session, b: Session) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)

/** Numera le settimane e ricalcola i totali di un piano personale. */
export function normalizePlan(plan: Plan): Plan {
  return { ...plan, weeks: plan.weeks.map((w, i) => {
    const sessions = [...w.sessions].sort(byDay), km = sessions.filter(s => s.km).map(s => s.km!)
    return { ...w, week: i + 1, sessions, skippable: false, total: km.length ? Math.round(km.reduce((a, b) => a + b, 0) * 10) / 10 : null }
  }) }
}
export const MAX_WEEKS = 80

/** Restituisce il problema del piano, oppure null se è valido. */
export function planError(p: any): string | null {
  if (p?.meta?.kind !== 'custom' || !p.meta.id || !p.meta.phases || !Array.isArray(p.weeks)) return 'Piano non valido.'
  if (!p.weeks.length) return 'Il piano deve avere almeno una settimana.'
  if (p.weeks.length > MAX_WEEKS) return `Il piano può avere al massimo ${MAX_WEEKS} settimane.`
  for (const [i, w] of p.weeks.entries()) {
    if (!Array.isArray(w.sessions)) return 'Piano non valido.'
    const seen = new Set<string>()
    for (const s of w.sessions) {
      if (!DAYS.includes(s.day)) return 'Piano non valido.'
      if (seen.has(s.day)) return `Settimana ${i + 1}: due sedute nello stesso giorno.`
      seen.add(s.day)
      if (!String(s.text ?? '').trim()) return `Settimana ${i + 1}: scrivi cosa prevede ogni seduta.`
      if (s.km != null && !(s.km >= 0 && s.km <= 200)) return `Settimana ${i + 1}: distanza non valida.`
    }
  }
  return null
}

export const slotForDate = (t: Timeline, date: string) => t.slots.find(s => date >= s.monday && date < addDays(s.monday, 7))

export const upper = (f?: string | null) => { if (!f) return null; const m = f.match(/(\d+)(?!.*\d)/); return m ? +m[1] : null }

export interface Review { week: Slot; next?: Slot; canSkip: boolean; reasons: { ok: boolean; text: string }[]; overload: boolean }

/** Valuta la settimana conclusa con le regole del piano. */
export function reviewWeek(t: Timeline, slot: Slot, acts: Activity[]): Review {
  const idx = t.slots.indexOf(slot), next = t.slots[idx + 1], prev = t.slots[idx - 1]
  const keys = slot.sessions.filter(s => s.km !== 0).map(s => sessionKey(slot, s.day))
  const done = keys.map(k => acts.find(a => a.sessionKey === k))
  const end = addDays(slot.monday, 7)
  const inWeek = acts.filter(a => a.date >= slot.monday && a.date < end)
  const allDone = done.every(Boolean)
  const easy = allDone && done.every(a => a!.fatica != null && a!.fatica <= 4)
  const forza = inWeek.filter(a => a.type === 'forza').length >= 2
  const knee = allDone && done.every(a => (a!.knee ?? 0) <= 2 && !a!.swelling && !a!.locked)
  const prevSkipped = !!prev && typeof prev.week === 'number' && typeof slot.week === 'number' && slot.week - prev.week > 1
  const eligible = !!next?.skippable && !next.maintenance
  const reasons = [
    { ok: easy, text: 'Tutte le corse fatte con fatica fino a 4' },
    { ok: forza, text: 'Due sedute di forza' },
    { ok: knee, text: 'Dolore fino a 2 e nessun gonfiore' },
    { ok: !prevSkipped, text: 'Nessun salto la settimana prima' },
  ]
  let overload = false
  const targets = slot.sessions.filter(s => s.km !== 0)
  for (let i = 1; i < done.length; i++) {
    const a = done[i - 1], b = done[i], ta = upper(targets[i - 1]?.fatica), tb = upper(targets[i]?.fatica)
    if (a?.fatica != null && b?.fatica != null && ta && tb && a.fatica >= ta + 2 && b.fatica >= tb + 2) overload = true
  }
  return { week: slot, next, canSkip: eligible && reasons.every(r => r.ok), reasons, overload }
}

/** Test della Scala */
export interface ScalaRound { finished: boolean | null; fiato: number | null; fatica: number | null; knee: number | null; hrEnd?: number | null; hr1?: number | null; quit?: number | null; quitMin?: number | null }
export const ROUNDS = [2, 3, 5, 7, 10]
const closed = (r: ScalaRound) => r.finished === true && r.fiato != null && r.fatica != null && r.knee != null && r.fiato <= 3 && r.fatica <= 6 && r.knee <= 2
export function scalaResult(rs: ScalaRound[], swollen = false, wedKnee: number | null = null) {
  let n = 0
  for (const r of rs) { if (closed(r)) n++; else break }
  const r5 = rs[4]
  const bonus = n === 5 && r5.fiato! <= 2 && r5.fatica! <= 4
  const base = bonus ? 7 : [1, 1, 2, 3, 5, 6][n]
  const week = swollen || (wedKnee ?? 0) > 2 ? Math.max(1, base - 2) : base
  return { closedRounds: n, bonus, base, week }
}
