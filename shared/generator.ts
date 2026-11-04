import { addDays, DAYS, diffDays, mondayOf, normalizePlan, type Day, type Plan, type Session, type Week } from './engine'

export type RaceType = 'forma' | '5k' | '10k' | '21k' | '42k' | 'trail' | 'altro'
export const RACES: { id: RaceType; label: string; km: number | null }[] = [
  { id: 'forma', label: 'Stare in forma', km: 10 }, { id: '5k', label: '5 km', km: 5 }, { id: '10k', label: '10 km', km: 10 }, { id: '21k', label: 'Mezza maratona', km: 21.097 },
  { id: '42k', label: 'Maratona', km: 42.195 }, { id: 'trail', label: 'Trail', km: null }, { id: 'altro', label: 'Altra distanza', km: null },
]
export const MIN_KM = 3, MAX_KM = 60
export interface GoalInput {
  id: string; race: RaceType; km: number; raceName?: string | null; raceDate?: string | null; ambition: 'finire' | 'migliorare'
  weeklyKm: number; longestKm: number; days: Day[]; longDay: Day; strengthDays: Day[]; startDate: string
}
export interface Generated {
  plan: Plan; startDate: string; weeks: number; idealWeeks: number; targetLong: number; reachedLong: number; peakWeek: number
  warnings: string[]; blocked: boolean; earliestRace: string | null
}

// Lungo massimo per distanza: fino a un'ora in meno rispetto alla gara su maratona, oltre la distanza sulle gare brevi.
const LONG_TABLE: [number, number, number][] = [[5, 6, 8], [10, 11, 14], [21.1, 18, 21], [42.2, 30, 32], [60, 34, 36]]
export function targetLong(km: number, ambition: GoalInput['ambition']) {
  const c = ambition === 'finire' ? 1 : 2
  if (km <= 5) return Math.max(4, Math.round(km * LONG_TABLE[0][c] / 5))
  for (let i = 1; i < LONG_TABLE.length; i++) {
    const a = LONG_TABLE[i - 1], b = LONG_TABLE[i]
    if (km <= b[0]) return Math.round(a[c] + (b[c] - a[c]) * (km - a[0]) / (b[0] - a[0]))
  }
  return LONG_TABLE.at(-1)![c]
}
const taperWeeks = (km: number) => km <= 12 ? 1 : km <= 25 ? 2 : 3
const minBuild = (km: number) => km <= 6 ? 5 : km <= 12 ? 7 : km <= 25 ? 8 : 11

const RW: [string, string, boolean?][] = [
  [`6×[1' corsa + 2' cammino]`, '2-3'], [`8×[1' corsa + 1'30" cammino]`, '2-3'], [`6×[2' corsa + 2' cammino]`, '2-3'],
  [`4×[2' corsa + 2' cammino]`, '2', true], [`5×[3' corsa + 2' cammino]`, '2-3'], [`4×[5' corsa + 2' cammino]`, '3'],
  [`3×[7' corsa + 2' cammino]`, '3'], [`2×[10' corsa + 2' cammino]`, '3-4'],
]
const rwStart = (longest: number) => longest >= 3 ? RW.length : longest >= 2 ? 5 : longest >= 1 ? 4 : 0

const EASY = 'Frasi complete', HARD = 'Fiatone ok nei tratti, calmo nei recuperi', STEADY = 'Frasi brevi, niente fiatone'
const half = (n: number) => Math.round(n)
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const gap = (a: Day, b: Day) => { const d = Math.abs(DAYS.indexOf(a) - DAYS.indexOf(b)); return Math.min(d, 7 - d) }

interface Ramp { long: number; cut: boolean }
/** Il lungo cresce al massimo del 10% o di 1 km, con una settimana di scarico ogni quattro. */
function ramp(start: number, peak: number, min: number, max: number) {
  const out: Ramp[] = []
  let l = Math.min(start, peak)
  while (out.length < max) {
    const cut = out.length % 4 === 3
    out.push({ long: l, cut })
    if (cut) continue
    if (l >= peak && out.length >= min) break
    l = Math.min(peak, l + Math.max(1, Math.floor(l * .1)))
  }
  if (out.at(-1)?.cut) { const prev = out.at(-2)!; out[out.length - 1] = { long: prev.long, cut: false } }
  return out
}

/** Il giorno di qualità è il più lontano dal lungo. */
const qualityDay = (days: Day[], long: Day) => [...days].filter(d => d !== long).sort((a, b) => gap(b, long) - gap(a, long) || DAYS.indexOf(a) - DAYS.indexOf(b))[0]
function spaced3(days: Day[], long: Day) {
  if (days.length <= 3) return days
  const a = qualityDay(days, long), rest = days.filter(d => d !== long && d !== a).sort((x, y) => Math.min(gap(y, long), gap(y, a)) - Math.min(gap(x, long), gap(x, a)))
  return [a, rest[0], long]
}
function quality(km: number, q: number, p: number, i: number, ambition: GoalInput['ambition'], trail: boolean, racePace: boolean): Pick<Session, 'text' | 'fiato' | 'fatica'> {
  const easyText = { text: `Facile ${q} km + 4 allunghi 15"`, fiato: EASY, fatica: '2-3' }
  if (p < (ambition === 'migliorare' ? .2 : .35)) return easyText
  const hills = { text: `Salite: ${clamp(Math.round(q), 6, 10)}×20" controllate + 2' rec (${q} km)`, fiato: 'Fiatone breve ok, parli prima di ripartire', fatica: '8' }
  const fartlek = { text: `Fartlek: ${clamp(Math.round(q * .9), 5, 10)}×[1' forte + 2' facile] (${q} km)`, fiato: HARD, fatica: '6-7' }
  if (p < .6 || q < 6) return trail || i % 2 ? hills : fartlek
  const m = Math.max(2, half(q - 3))
  const tempo = { text: `Fondo medio: 2 km facili + ${m} km a frasi brevi + 1 km facile`, fiato: STEADY, fatica: '5-6' }
  const reps = km <= 12 ? { text: `Ripetute: ${clamp(Math.round(q * 1.2), 6, ambition === 'finire' ? 8 : 12)}×[400 m forti + 90" facile] (${q} km)`, fiato: HARD, fatica: '7-8' }
    : { text: `Ripetute: ${clamp(Math.floor((q - 3) / 1.4), 3, 6)}×[1 km forte + 2' facile] (${q} km)`, fiato: HARD, fatica: '7-8' }
  if (trail) return i % 2 ? hills : tempo
  if (racePace && km > 12) return i % 2 ? reps : { text: `Medio: 3 km facili + ${m} km ritmo gara`, fiato: STEADY, fatica: '5-6' }
  return i % 2 ? reps : tempo
}
const longFatica = (l: number) => l < 16 ? '3-4' : l < 24 ? '4-5' : l < 30 ? '5-6' : '6'

export function generatePlan(g: GoalInput): Generated {
  const days = DAYS.filter(d => g.days.includes(d)), longDay = days.includes(g.longDay) ? g.longDay : days.at(-1)!
  const trail = g.race === 'trail', peak = targetLong(g.km, g.ambition), taper = taperWeeks(g.km)
  const rwFrom = rwStart(g.longestKm), rwWeeks = RW.slice(rwFrom)
  const fromZero = rwWeeks.length > 0
  const l0 = fromZero ? 4 : Math.max(4, Math.round(Math.min(g.longestKm, peak) * .9))
  const min = minBuild(g.km), ideal = ramp(l0, peak, min, 200)
  const idealWeeks = rwWeeks.length + ideal.length + taper
  const start0 = mondayOf(g.startDate)
  const available = g.raceDate ? Math.floor(diffDays(start0, mondayOf(g.raceDate)) / 7) + 1 : idealWeeks
  const weeksN = Math.min(available, idealWeeks)
  const buildN = Math.max(0, weeksN - rwWeeks.length - taper)
  const build = buildN >= ideal.length ? ideal : ramp(l0, peak, 0, buildN)
  const name = RACES.find(r => r.id === g.race)!.label
  const label = g.race === 'forma' ? name : g.raceName?.trim() || (g.race === 'trail' || g.race === 'altro' ? `${name} ${g.km} km` : name)

  const weeks: Week[] = []
  const add = (phase: number, sessions: Session[], scarico = false) => weeks.push({ week: weeks.length + 1, phase, scarico, skippable: false, total: null, sessions, uid: `${g.id}-${weeks.length + 1}` })
  const three = spaced3(days, longDay)
  rwWeeks.forEach(([text, fatica, down], i) => {
    const hard = text.startsWith("2×[10'")
    add(0, three.map(day => ({ day, text: hard && day === longDay ? `Prova: 20' continui facili` : text, km: null, fiato: hard ? EASY : 'Mai fiatone', fatica })), !!down)
  })
  const share = (n: number) => n <= 3 ? .6 : n === 4 ? .5 : .42
  const cap = g.km <= 12 ? (g.ambition === 'finire' ? 7 : 9) : g.km <= 25 ? (g.ambition === 'finire' ? 9 : 10) : g.ambition === 'finire' ? 10 : 12
  const stdLong = (l: number) => l >= 8 ? `Lungo ${l} km${trail ? ' su sterrato, salite camminate' : ''}` : `Lento ${l} km`
  build.forEach((b, i) => {
    const p = build.length > 1 ? i / (build.length - 1) : 1
    const use = fromZero && i < 8 ? three : fromZero && i < 12 ? DAYS.filter(d => three.includes(d) || d === days.find(x => !three.includes(x))) : days, others = use.filter(d => d !== longDay), q = qualityDay(use, longDay)
    const room = fromZero ? Infinity : (Math.max(g.weeklyKm, b.long + 6) * 1.08 ** i - b.long - 1) / (use.length - 1)
    const easy = clamp(half(Math.min(room, b.long * share(use.length))), 3, cap)
    const factor = b.cut ? .75 : 1, long = Math.max(3, Math.round(b.long * factor)), base = Math.max(3, half(easy * factor))
    const sessions: Session[] = others.map(day => {
      if (day === q && !b.cut) {
        const qk = base + 1
        return { day, km: qk, ...quality(g.km, qk, fromZero ? p - .15 : p, i, g.ambition, trail, g.ambition === 'migliorare') }
      }
      return { day, km: base, text: day === q ? `Facile ${base} km + 4 allunghi 15"` : `Facile ${base} km`, fiato: EASY, fatica: '2-3' }
    })
    sessions.push({ day: longDay, km: long, text: stdLong(long), fiato: EASY, fatica: b.cut ? '3' : longFatica(long) })
    add(p < .4 ? 1 : p < .75 ? 2 : 3, sessions, b.cut)
  })
  const reached = build.length ? Math.max(...build.map(b => b.long)) : fromZero ? 3 : l0
  const lastEasy = clamp(half(reached * share(days.length)), 3, cap)
  for (let t = taper - 1; t > 0; t--) {
    const f = taper === 3 ? (t === 2 ? .7 : .5) : .55, long = Math.max(3, Math.round(reached * f)), easy = Math.max(3, half(lastEasy * f))
    const q = qualityDay(days, longDay)
    add(4, [...days.filter(d => d !== longDay).map(day => ({ day, km: easy, text: day === q ? `Facile ${easy} km + 4 allunghi 15"` : `Facile ${easy} km`, fiato: EASY, fatica: '2-3' })),
      { day: longDay, km: long, text: `Lento ${long} km`, fiato: EASY, fatica: '3' }], true)
  }
  // settimana della gara
  const raceDay = g.raceDate ? DAYS[diffDays(mondayOf(g.raceDate), g.raceDate)] : longDay
  const ri = DAYS.indexOf(raceDay), easyRace = Math.max(3, half(lastEasy * .45))
  const before = days.filter(d => DAYS.indexOf(d) < ri - 1).slice(-2)
  add(4, [...before.map((day, i) => ({ day, km: easyRace, text: i === 0 && before.length > 1 ? `Facile ${easyRace} km + 4 allunghi 15"` : `Facile ${easyRace} km`, fiato: EASY, fatica: '2-3' })),
    { day: raceDay, km: g.km, text: g.race === 'forma' ? `Prova finale ${g.km} km` : g.raceDate ? `Gara: ${label}` : `Obiettivo: ${label}`, fiato: g.race === 'forma' ? 'Frasi complete' : 'Parti con calma', fatica: g.race === 'forma' ? '4-5' : 'fino a 10', race: true }])

  const plan = normalizePlan({
    meta: { kind: 'custom', id: g.id, name: g.race === 'forma' ? 'Stare in forma' : `Piano ${label}`, strengthDays: g.strengthDays.filter(d => !days.includes(d)), phases: { '0': 'Ritorno alla corsa', '1': 'Base', '2': 'Costruzione', '3': 'Specifico', '4': 'Rifinitura' } },
    weeks, maintenance: [],
  })
  const n = plan.weeks.length
  const startDate = g.raceDate ? addDays(mondayOf(g.raceDate), -7 * (n - 1)) : start0
  const safeLong = g.km >= 21 ? g.km * .6 : g.km * .75
  const blocked = !!g.raceDate && (available < rwWeeks.length + taper + 1 || reached < Math.min(safeLong, peak))
  const warnings: string[] = []
  const earliestRace = g.raceDate && available < idealWeeks ? addDays(addDays(start0, 7 * (idealWeeks - 1)), 6) : null
  if (blocked) warnings.push(`Con questa data arriveresti alla gara con un lungo di ${reached} km: troppo poco per correrla in sicurezza.`)
  else if (earliestRace && reached < peak) warnings.push(`Con questa data il lungo si ferma a ${reached} km invece di ${peak}: puoi arrivare al traguardo, ma con meno margine.`)
  if (startDate > start0) warnings.push(`Hai più tempo del necessario: il piano parte più tardi. Fino ad allora mantieniti con ${fromZero ? 'camminate veloci e forza' : 'corse facili, senza aumentare'}.`)
  if (fromZero && g.km >= 21) warnings.push('Parti da zero verso una distanza lunga: se in Ritorno alla corsa la fatica supera le attese, ripeti la settimana invece di forzare.')
  if (days.length === 3 && g.km >= 42) warnings.push('Con 3 uscite a settimana la maratona è fattibile, ma una quarta nella fase Specifico aiuta molto.')
  const peakWeek = Math.max(...plan.weeks.map(w => w.total ?? 0))
  return { plan, startDate, weeks: n, idealWeeks, targetLong: peak, reachedLong: reached, peakWeek, warnings, blocked, earliestRace }
}

/** Tabella vuota da compilare a mano. */
export function blankPlan(id: string, name: string, n: number): Plan {
  const weeks = Array.from({ length: n }, (_, i): Week => ({ week: i + 1, phase: 1, scarico: false, skippable: false, total: null, sessions: [], uid: `${id}-${i + 1}` }))
  return { meta: { kind: 'custom', id, name, strengthDays: [], phases: { '1': 'La mia tabella' } }, weeks, maintenance: [] }
}
