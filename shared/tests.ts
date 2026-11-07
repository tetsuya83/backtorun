import { addDays, diffDays, mondayOf, type Activity, type Plan } from './engine'

/** I test di condizione. Le soglie per la tabella sono stime da allenatore, non validate. */
export type TestKind = 'scala' | 'cooper' | '5km' | 'cammino'
export interface TestInfo { kind: TestKind; name: string; short: string; who: string; minutes: number; maximal: boolean }
export const TESTS: TestInfo[] = [
  { kind: 'scala', name: 'La Scala', short: 'Cinque round di corsa facile, da 2 a 10 minuti', who: 'Per chi parte da zero o rientra da uno stop', minutes: 50, maximal: false },
  { kind: 'cammino', name: 'Test del cammino', short: '1,6 km a passo svelto, senza correre', who: 'Per chi oggi non può correre, o ha dolore', minutes: 25, maximal: false },
  { kind: 'cooper', name: 'Test di Cooper', short: '12 minuti alla massima distanza', who: 'Per chi corre già 15 minuti di fila senza dolore', minutes: 30, maximal: true },
  { kind: '5km', name: '5 km a tempo', short: '5 km al meglio, con riscaldamento', who: 'Per chi corre almeno 20 km a settimana', minutes: 50, maximal: true },
]
export const testInfo = (k: string) => TESTS.find(t => t.kind === k)

/** Cooper 1968: VO2max stimato in ml/kg/min dalla distanza in 12 minuti. */
export const cooperVo2 = (m: number) => Math.round((m - 504.9) / 44.73 * 10) / 10
/** Kline 1987 (Rockport): VO2max in ml/kg/min da 1 miglio di cammino, età 30-69. */
export function walkVo2(o: { kg: number; age: number; male: boolean; sec: number; hr: number }) {
  const l = 6.9652 + 0.0091 * (o.kg * 2.20462) - 0.0257 * o.age + 0.5955 * (o.male ? 1 : 0) - 0.2240 * (o.sec / 60) - 0.0115 * o.hr
  return Math.round(l * 1000 / o.kg * 10) / 10
}
/** Ritmo facile stimato, in secondi al km, come intervallo. */
export const easyFrom5k = (sec: number) => [Math.round(sec / 5 * 1.22), Math.round(sec / 5 * 1.32)] as const
export const easyFromCooper = (m: number) => { const p = 720 / (m / 1000); return [Math.round(p * 1.3), Math.round(p * 1.42)] as const }

/** Settimana della Maratona graduale suggerita dal solo risultato. */
export function weekFromTest(kind: TestKind, v: number): number | null {
  if (kind === 'cooper') return v < 1600 ? 8 : v < 2000 ? 9 : v < 2300 ? 13 : v < 2600 ? 17 : v < 2900 ? 19 : 27
  if (kind === '5km') return v > 2100 ? 9 : v > 1800 ? 13 : v > 1620 ? 17 : v > 1440 ? 19 : v > 1260 ? 23 : 27
  return null
}
/** Quanto hai corso nelle ultime 4 settimane: la settimana più carica, la corsa più lunga in km e in minuti. */
export function recentVolume(acts: Activity[], today: string) {
  const from = addDays(today, -28), runs = acts.filter(a => a.type === 'corsa' && a.date >= from && a.date <= today)
  const weeks = new Map<string, number>()
  for (const a of runs) weeks.set(mondayOf(a.date), (weeks.get(mondayOf(a.date)) ?? 0) + (a.km ?? 0))
  return { runs: runs.length, weekly: Math.max(0, ...weeks.values()), longest: Math.max(0, ...runs.map(a => a.km ?? 0)), longestSec: Math.max(0, ...runs.map(a => a.seconds ?? 0)) }
}
/**
 * Dove partire nella Maratona graduale: il risultato del test, ma mai oltre il volume che corri già.
 * Una settimana va bene se il suo totale non supera di oltre il 10% la tua settimana più carica e il suo lungo la tua corsa più lunga.
 */
export function placeBase(plan: Plan, byTest: number, vol: ReturnType<typeof recentVolume>) {
  if (byTest <= 8) return { week: byTest, capped: false, reason: '' }
  if (!vol.runs) { const w = Math.min(byTest, 13); return { week: w, capped: w < byTest, reason: 'Non hai corse registrate nelle ultime 4 settimane, quindi il consiglio resta prudente. Registrale per uno più preciso.' } }
  let cap = 9
  for (const w of plan.weeks) {
    const n = typeof w.week === 'number' ? w.week : 0
    if (n < 9 || n > 34 || w.total == null) continue
    const long = Math.max(0, ...w.sessions.map(s => s.km ?? 0))
    if (w.total <= Math.max(vol.weekly * 1.1, vol.weekly + 3) && long <= vol.longest * 1.1 + 1) cap = Math.max(cap, n)
  }
  const week = Math.min(byTest, cap)
  return { week, capped: week < byTest, reason: week < byTest ? `Il test vale la settimana ${byTest}, ma nelle ultime 4 settimane hai corso al massimo ${Math.round(vol.weekly)} km in una settimana: aumentare di colpo il volume espone a infortuni.` : '' }
}
/** Quale test consigliare oggi, e perché. */
export function suggestTest(acts: Activity[], today: string, baseWeek: number | null): { kind: TestKind; why: string } {
  const recent = acts.filter(a => a.type === 'corsa' && a.date >= addDays(today, -7))
  if (recent.some(a => a.locked || a.swelling || (a.knee ?? 0) > 2 || (a.pains ?? []).some(p => p.level > 2))) return { kind: 'cammino', why: 'Nell\'ultima settimana hai segnalato dolore o gonfiore: il cammino misura la condizione senza impatti.' }
  const vol = recentVolume(acts, today)
  if ((baseWeek != null && baseWeek <= 8) || vol.longestSec < 15 * 60) return { kind: 'scala', why: 'Non corri ancora 15 minuti di fila: la Scala ti misura senza sforzi massimali.' }
  if (vol.weekly < 20) return { kind: 'cooper', why: `Corri 15 minuti di fila ma meno di 20 km a settimana: 12 minuti bastano a misurarti.` }
  return { kind: '5km', why: 'Corri già almeno 20 km a settimana: i 5 km sono il test più ripetibile per chi corre con regolarità.' }
}

export const RETEST_DAYS = 56
/**
 * Promemoria facoltativo: solo per chi ha già fatto un test, dopo 8 settimane,
 * nella settimana di scarico (o dopo 10 settimane se lo scarico non arriva), mai con un test del piano vicino.
 */
export function testDue(o: { tests: { date: string; kind: string }[]; today: string; scarico: boolean; planTestSoon: boolean; off?: boolean; snooze?: string | null }) {
  if (o.off || !o.tests.length || o.planTestSoon) return null
  if (o.snooze && o.today < o.snooze) return null
  const last = [...o.tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!
  const days = diffDays(last.date, o.today)
  if (days < RETEST_DAYS || (!o.scarico && days < 70)) return null
  return { last, weeks: Math.floor(days / 7) }
}
