import { addDays, buildTimeline, DAYS, diffDays, mondayOf, normalizePlan, planError, type Day, type Plan, type Session, type State, type Week } from './engine'

export type RaceType = 'forma' | '5k' | '10k' | '21k' | '42k' | 'trail' | 'altro'
export const RACES: { id: RaceType; label: string; km: number | null }[] = [
  { id: 'forma', label: 'Stare in forma', km: 10 }, { id: '5k', label: '5 km', km: 5 }, { id: '10k', label: '10 km', km: 10 }, { id: '21k', label: 'Mezza maratona', km: 21.097 },
  { id: '42k', label: 'Maratona', km: 42.195 }, { id: 'trail', label: 'Trail', km: null }, { id: 'altro', label: 'Altra distanza', km: null },
]
export const MIN_KM = 3, MAX_KM = 60
export type Progression = 'prudente' | 'normale'
export interface GoalInput {
  id: string; race: RaceType; km: number; raceName?: string | null; raceDate?: string | null; ambition: 'finire' | 'migliorare'
  weeklyKm: number; longestKm: number; days: Day[]; longDay: Day; strengthDays: Day[]; startDate: string
  /** Uscite a settimana a regime; senza valore, una per ogni giorno scelto. */
  sessions?: number
  /** Si parte con meno uscite e si aggiunge una alla volta. Senza valore: sì per chi parte da zero. */
  gradual?: boolean
  /** Sedute impegnative a settimana, da 0 a 2, e il giorno della prima. */
  quality?: number; qualityDay?: Day | null
  /** Minuti al massimo per giorno: le sedute più lunghe vengono accorciate. */
  maxMin?: Partial<Record<Day, number>>
  /** Ritmo facile, in secondi al km: serve a trasformare i minuti in km. */
  easyPace?: number
  /** Ora abituale dell'uscita per giorno. */
  hours?: Partial<Record<Day, number>>
  /** Una settimana di scarico ogni 3 o 4. */
  cutEvery?: 3 | 4
  progression?: Progression
  /** Lunedì delle settimane senza allenamento, per vacanze o impegni. */
  pauses?: string[]
  /** Accetto di allenarmi meno del minimo consigliato. */
  risk?: boolean
  /** Ripresa da metà piano: punto di partenza e calendario da riempire fino alla gara. */
  resume?: { rw: number | null; long: number; weekly: number } | null
}
export interface Generated {
  plan: Plan; startDate: string; weeks: number; idealWeeks: number; targetLong: number; reachedLong: number; peakWeek: number
  warnings: string[]; blocked: boolean; earliestRace: string | null
  /** Le uscite scelte sono sotto il minimo consigliato per questa distanza. */
  belowMin: boolean; minSessions: number; suggestedSessions: number; timeCapped: Day[]
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
/** Sotto queste uscite serve accettare il rischio: 3 dalla mezza in su, 2 per le distanze brevi. */
export const minSessions = (km: number) => km >= 21 ? 3 : 2
/** Uscite consigliate: quelle che molti allenatori indicano per arrivare bene alla distanza. */
export const suggestedSessions = (km: number, ambition: GoalInput['ambition']) => km >= 30 ? (ambition === 'migliorare' ? 5 : 4) : km >= 15 ? (ambition === 'migliorare' ? 4 : 3) : 3
export const DEFAULT_PACE: Record<'zero' | 'ritorno' | 'corro' | 'migliora', number> = { zero: 480, ritorno: 450, corro: 400, migliora: 350 }

const RW: [string, string, boolean?][] = [
  [`6×[1' corsa + 2' cammino]`, '2-3'], [`8×[1' corsa + 1'30" cammino]`, '2-3'], [`6×[2' corsa + 2' cammino]`, '2-3'],
  [`4×[2' corsa + 2' cammino]`, '2', true], [`5×[3' corsa + 2' cammino]`, '2-3'], [`4×[5' corsa + 2' cammino]`, '3'],
  [`3×[7' corsa + 2' cammino]`, '3'], [`2×[10' corsa + 2' cammino]`, '3-4'],
]
/** Minuti di una seduta di cammino-corsa, riscaldamento compreso. */
export const RW_MINUTES = 30
const rwStart = (longest: number) => longest >= 3 ? RW.length : longest >= 2 ? 5 : longest >= 1 ? 4 : 0

const EASY = 'Frasi complete', HARD = 'Fiatone ok nei tratti, calmo nei recuperi', STEADY = 'Frasi brevi, niente fiatone'
const half = (n: number) => Math.round(n)
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const gap = (a: Day, b: Day) => { const d = Math.abs(DAYS.indexOf(a) - DAYS.indexOf(b)); return Math.min(d, 7 - d) }

interface Ramp { long: number; cut: boolean }
/** Il lungo cresce al massimo del 10% o di 1 km (prudente: 1 km, poi 6%), con una settimana di scarico ogni 3 o 4. */
function ramp(start: number, peak: number, min: number, max: number, every: number, prog: Progression) {
  const out: Ramp[] = []
  let l = Math.min(start, peak)
  while (out.length < max) {
    const cut = out.length % every === every - 1
    out.push({ long: l, cut })
    if (cut) continue
    if (l >= peak && out.length >= min) break
    l = Math.min(peak, l + Math.max(1, Math.floor(l * (prog === 'prudente' ? (l < 10 ? 0 : .06) : .1))))
  }
  if (out.at(-1)?.cut) { const prev = out.at(-2)!; out[out.length - 1] = { long: prev.long, cut: false } }
  return out
}

/** Il giorno di qualità è il più lontano dal lungo. */
const qualityDay = (days: Day[], long: Day) => [...days].filter(d => d !== long).sort((a, b) => gap(b, long) - gap(a, long) || DAYS.indexOf(a) - DAYS.indexOf(b))[0]
/** Sceglie n giorni ben distanziati: il lungo sempre, poi quelli più lontani da quelli già presi. */
export function pickDays(days: Day[], long: Day, n: number, first?: Day | null) {
  if (days.length <= n) return DAYS.filter(d => days.includes(d))
  const out: Day[] = [long]
  if (n > 1) out.push(first && days.includes(first) && first !== long ? first : qualityDay(days, long))
  while (out.length < n) {
    const rest = days.filter(d => !out.includes(d)).sort((x, y) => Math.min(...out.map(o => gap(y, o))) - Math.min(...out.map(o => gap(x, o))) || DAYS.indexOf(x) - DAYS.indexOf(y))
    out.push(rest[0])
  }
  return DAYS.filter(d => out.includes(d))
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
const share = (n: number) => n <= 3 ? .6 : n === 4 ? .5 : n === 5 ? .42 : .36

/** Uscite effettive, sedute impegnative e altre scelte, con i valori di sempre quando mancano. */
export function settings(g: GoalInput) {
  const days = DAYS.filter(d => g.days.includes(d))
  const sessions = clamp(Math.round(g.sessions ?? days.length), 1, Math.max(1, days.length))
  const fromZero = g.resume ? g.resume.rw != null : rwStart(g.longestKm) < RW.length
  return {
    days, sessions, fromZero, gradual: g.gradual ?? fromZero, quality: clamp(g.quality ?? 1, 0, sessions >= 4 ? 2 : sessions >= 2 ? 1 : 0),
    cutEvery: g.cutEvery ?? 4, progression: g.progression ?? 'normale', pace: g.easyPace ?? 420,
  }
}

export function generatePlan(g: GoalInput): Generated {
  const cfg = settings(g), days = cfg.days, longDay = days.includes(g.longDay) ? g.longDay : days.at(-1)!
  const trail = g.race === 'trail', peak = targetLong(g.km, g.ambition), taper = taperWeeks(g.km)
  const rwFrom = g.resume ? g.resume.rw ?? RW.length : rwStart(g.longestKm), rwWeeks = RW.slice(rwFrom)
  const fromZero = cfg.fromZero, weekly0 = g.resume?.weekly ?? g.weeklyKm
  const l0 = g.resume && g.resume.rw == null ? Math.max(4, Math.min(g.resume.long, peak)) : fromZero ? 4 : Math.max(4, Math.round(Math.min(g.longestKm, peak) * .9))
  const min = minBuild(g.km), ideal = ramp(l0, peak, min, 200, cfg.cutEvery, cfg.progression)
  const idealWeeks = rwWeeks.length + ideal.length + taper
  const start0 = mondayOf(g.startDate), pauses = new Set((g.pauses ?? []).map(mondayOf))
  const raceMon = g.raceDate ? mondayOf(g.raceDate) : null
  let available = idealWeeks
  if (raceMon) { available = 0; for (let m = start0; m <= raceMon; m = addDays(m, 7)) if (!pauses.has(m)) available++ }
  const weeksN = g.resume && raceMon ? available : Math.min(available, idealWeeks)
  const buildN = Math.max(0, weeksN - rwWeeks.length - taper)
  const build = buildN === ideal.length ? ideal : buildN > ideal.length ? ramp(l0, peak, buildN, buildN, cfg.cutEvery, cfg.progression) : ramp(l0, peak, 0, buildN, cfg.cutEvery, cfg.progression)
  const name = RACES.find(r => r.id === g.race)!.label
  const label = g.race === 'forma' ? name : g.raceName?.trim() || (g.race === 'trail' || g.race === 'altro' ? `${name} ${g.km} km` : name)

  // minuti disponibili trasformati in km al ritmo facile
  const capped = new Set<Day>()
  const capKm = (day: Day) => { const m = g.maxMin?.[day]; return m ? Math.max(2, Math.floor(m * 60 / cfg.pace)) : Infinity }
  const fit = (day: Day, km: number) => { const c = capKm(day); if (km > c) { capped.add(day); return c } return km }

  const weeks: Week[] = []
  const tag = g.resume ? `${g.id}r${Date.now().toString(36).slice(-4)}` : g.id
  const add = (phase: number, sessions: Session[], scarico = false) => weeks.push({ week: weeks.length + 1, phase, scarico, skippable: false, total: null, sessions, uid: `${tag}-${weeks.length + 1}` })
  const target = cfg.sessions, startN = fromZero ? Math.min(3, target) : Math.max(Math.min(2, target), target - 1)
  const countAt = (i: number) => !cfg.gradual ? target : i < 8 ? startN : i < 12 ? Math.min(target, startN + 1) : target
  const rwDays = pickDays(days, longDay, Math.min(3, target), g.qualityDay)
  rwWeeks.forEach(([text, fatica, down], i) => {
    const hard = text.startsWith("2×[10'")
    add(0, rwDays.map(day => ({ day, text: hard && day === longDay ? `Prova: 20' continui facili` : text, km: null, fiato: hard ? EASY : 'Mai fiatone', fatica })), !!down)
  })
  const cap = g.km <= 12 ? (g.ambition === 'finire' ? 7 : 9) : g.km <= 25 ? (g.ambition === 'finire' ? 9 : 10) : g.ambition === 'finire' ? 10 : 12
  const stdLong = (l: number) => l >= 8 ? `Lungo ${l} km${trail ? ' su sterrato, salite camminate' : ''}` : `Lento ${l} km`
  let reached = 0
  build.forEach((b, i) => {
    const p = build.length > 1 ? i / (build.length - 1) : 1
    const use = pickDays(days, longDay, countAt(i), g.qualityDay), others = use.filter(d => d !== longDay)
    const qs = cfg.quality === 0 || !others.length ? [] : [pickDays(use, longDay, 2, g.qualityDay).find(d => d !== longDay)!]
    if (cfg.quality === 2 && others.length >= 3 && p >= .35) qs.push([...others].filter(d => !qs.includes(d)).sort((a, c) => Math.min(gap(c, longDay), gap(c, qs[0])) - Math.min(gap(a, longDay), gap(a, qs[0])) || DAYS.indexOf(a) - DAYS.indexOf(c))[0])
    const room = fromZero && !g.resume ? Infinity : (Math.max(weekly0, b.long + 6) * 1.08 ** i - b.long - 1) / Math.max(1, use.length - 1)
    const easy = clamp(half(Math.min(room, b.long * share(use.length))), 3, cap)
    const factor = b.cut ? .75 : 1, long = fit(longDay, Math.max(3, Math.round(b.long * factor))), base = Math.max(3, half(easy * factor))
    reached = Math.max(reached, long)
    const sessions: Session[] = others.map(day => {
      const k = qs.indexOf(day)
      if (k >= 0 && !b.cut) {
        const qk = fit(day, base + 1)
        return { day, km: qk, ...quality(g.km, qk, fromZero ? p - .15 : p, i + k, g.ambition, trail, g.ambition === 'migliorare') }
      }
      const e = fit(day, base)
      return { day, km: e, text: qs[0] === day ? `Facile ${e} km + 4 allunghi 15"` : `Facile ${e} km`, fiato: EASY, fatica: '2-3' }
    })
    sessions.push({ day: longDay, km: long, text: stdLong(long), fiato: EASY, fatica: b.cut ? '3' : longFatica(long) })
    add(p < .4 ? 1 : p < .75 ? 2 : 3, sessions, b.cut)
  })
  if (!build.length) reached = fromZero ? 3 : fit(longDay, l0)
  const final = pickDays(days, longDay, target, g.qualityDay)
  const lastEasy = clamp(half(reached * share(final.length)), 3, cap)
  for (let t = taper - 1; t > 0; t--) {
    const f = taper === 3 ? (t === 2 ? .7 : .5) : .55, long = fit(longDay, Math.max(3, Math.round(reached * f))), easy = Math.max(3, half(lastEasy * f))
    const q = qualityDay(final, longDay)
    add(4, [...final.filter(d => d !== longDay).map(day => { const e = fit(day, easy); return { day, km: e, text: day === q ? `Facile ${e} km + 4 allunghi 15"` : `Facile ${e} km`, fiato: EASY, fatica: '2-3' } }),
      { day: longDay, km: long, text: `Lento ${long} km`, fiato: EASY, fatica: '3' }], true)
  }
  // settimana della gara
  const raceDay = g.raceDate ? DAYS[diffDays(mondayOf(g.raceDate), g.raceDate)] : longDay
  const ri = DAYS.indexOf(raceDay), easyRace = Math.max(3, half(lastEasy * .45))
  const before = final.filter(d => DAYS.indexOf(d) < ri - 1).slice(-2)
  add(4, [...before.map((day, i) => ({ day, km: easyRace, text: i === 0 && before.length > 1 ? `Facile ${easyRace} km + 4 allunghi 15"` : `Facile ${easyRace} km`, fiato: EASY, fatica: '2-3' })),
    { day: raceDay, km: g.km, text: g.race === 'forma' ? `Prova finale ${g.km} km` : g.raceDate ? `Gara: ${label}` : `Obiettivo: ${label}`, fiato: g.race === 'forma' ? 'Frasi complete' : 'Parti con calma', fatica: g.race === 'forma' ? '4-5' : 'fino a 10', race: true }])

  // il calendario: dalla gara all'indietro, oppure dall'inizio in avanti, saltando le settimane di pausa
  const content = weeks.length
  let startDate = start0
  if (raceMon) { let m = raceMon, left = content; while (true) { if (!pauses.has(m)) left--; if (left <= 0) break; m = addDays(m, -7) } startDate = m }
  const all: Week[] = []
  for (let m = startDate, i = 0; i < content; m = addDays(m, 7)) {
    if (pauses.has(m)) { all.push({ week: 0, phase: weeks[Math.max(0, i - 1)].phase, scarico: true, skippable: false, total: null, pause: true, uid: `${tag}-p${m}`, sessions: [{ day: longDay, km: null, text: "Settimana di pausa: se puoi, 20-30' facili", fiato: EASY, fatica: '2' }] }); continue }
    all.push(weeks[i++])
  }
  const { resume: _r, id: _i, ...goal } = g
  const strength = g.strengthDays.filter(d => !final.includes(d) && !rwDays.includes(d)).slice(0, 3)
  const plan = normalizePlan({
    meta: { kind: 'custom', id: g.id, name: g.race === 'forma' ? 'Stare in forma' : `Piano ${label}`, strengthDays: strength, goal, phases: { '0': 'Ritorno alla corsa', '1': 'Base', '2': 'Costruzione', '3': 'Specifico', '4': 'Rifinitura' } },
    weeks: all, maintenance: [],
  })
  const n = plan.weeks.length
  const safeLong = g.km >= 21 ? g.km * .6 : g.km * .75
  const belowMin = target < minSessions(g.km)
  const tooShort = !!raceMon && (available < rwWeeks.length + taper + 1 || reached < Math.min(safeLong, peak))
  const blocked = tooShort || (belowMin && !g.risk)
  const warnings: string[] = []
  const earliestRace = raceMon && available < idealWeeks ? addDays(addDays(start0, 7 * (idealWeeks - 1 + [...pauses].filter(p => p >= start0).length)), 6) : null
  const timeShort = capped.has(longDay) && reached < Math.min(safeLong, peak)
  if (tooShort && timeShort) warnings.push(`Con il tempo che hai il ${WEEKDAY_NAME[longDay]} il lungo si ferma a ${reached} km: troppo poco per questa distanza. Allunga il tempo del giorno del lungo o scegli un altro giorno.`)
  else if (tooShort) warnings.push(`Con questa data arriveresti alla gara con un lungo di ${reached} km: troppo poco per correrla in sicurezza.`)
  else if (earliestRace && reached < peak) warnings.push(`Con questa data il lungo si ferma a ${reached} km invece di ${peak}: puoi arrivare al traguardo, ma con meno margine.`)
  if (!tooShort && capped.has(longDay) && reached < peak) warnings.push(`Il tempo che hai il ${WEEKDAY_NAME[longDay]} limita il lungo a ${reached} km invece di ${peak}.`)
  if ([...capped].some(d => d !== longDay)) warnings.push(`Alcune sedute sono accorciate per stare nei minuti che hai: ${[...capped].filter(d => d !== longDay).map(d => WEEKDAY_NAME[d]).join(', ')}.`)
  if (fromZero && rwWeeks.length && Object.entries(g.maxMin ?? {}).some(([d, m]) => rwDays.includes(d as Day) && m! < RW_MINUTES)) warnings.push(`Le prime settimane di cammino-corsa durano circa ${RW_MINUTES} minuti, riscaldamento compreso.`)
  if (startDate > start0 && !g.resume) warnings.push(`Hai più tempo del necessario: il piano parte più tardi. Fino ad allora mantieniti con ${fromZero ? 'camminate veloci e forza' : 'corse facili, senza aumentare'}.`)
  if (fromZero && g.km >= 21 && !g.resume) warnings.push('Parti da zero verso una distanza lunga: se in Ritorno alla corsa la fatica supera le attese, ripeti la settimana invece di forzare.')
  if (belowMin && g.risk) warnings.push(`Hai scelto ${target} ${target === 1 ? 'uscita' : 'uscite'} a settimana, sotto il minimo di ${minSessions(g.km)} per questa distanza: il piano lo rispetta, ma il rischio è tuo. Tieni il lungo facile e affianca nuoto, bici o forza.`)
  else if (!belowMin && target < suggestedSessions(g.km, g.ambition) && g.km >= 21) warnings.push(`Con ${target} uscite a settimana la distanza è fattibile, ma ${suggestedSessions(g.km, g.ambition)} aiutano molto nelle ultime fasi. Nuoto e bici nei giorni liberi compensano in parte.`)
  const peakWeek = Math.max(...plan.weeks.map(w => w.total ?? 0))
  return { plan, startDate, weeks: n, idealWeeks, targetLong: peak, reachedLong: reached, peakWeek, warnings, blocked, earliestRace,
    belowMin, minSessions: minSessions(g.km), suggestedSessions: suggestedSessions(g.km, g.ambition), timeCapped: [...capped] }
}
const WEEKDAY_NAME: Record<Day, string> = { lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica' }

export interface Regenerated { plan: Plan; result: Generated; kept: number; edited: number; keptEdited: number; state: State; full: boolean }
/**
 * Ricalcola il piano con nuove impostazioni: le settimane fino a quella in corso restano come sono,
 * le successive ripartono da dove sei arrivato. Le settimane future modificate a mano si possono tenere.
 */
export function regenerate(plan: Plan, st: State, goal: GoalInput, today: string, keepEdited: boolean): Regenerated {
  const t = buildTimeline(plan, st), now = t.slots.findIndex(s => s.monday <= today && today < addDays(s.monday, 7))
  const old = plan.meta.goal, id = plan.meta.id ?? goal.id
  if (now < 0) {
    const nextMon = addDays(mondayOf(today), 7), startDate = goal.startDate < nextMon && today >= t.slots[0].monday ? nextMon : goal.startDate
    const result = generatePlan({ ...goal, id, startDate, resume: null })
    return { plan: result.plan, result, kept: 0, edited: 0, keptEdited: 0, full: true, state: { ...st, startDate: result.startDate, raceDate: goal.raceDate ?? null, raceName: goal.raceName ?? null, repeats: [] } }
  }
  const slot = t.slots[now], keep = plan.weeks.filter(w => (w.week as number) <= (slot.week as number)), done = keep.filter(w => !w.pause)
  const rwDone = done.filter(w => w.phase === 0).length, inRw = done.at(-1)?.phase === 0
  const rw0 = rwStart(old?.longestKm ?? goal.longestKm), rw = inRw && rw0 + rwDone < RW.length ? rw0 + rwDone : null
  const recent = done.slice(-4), longOf = (w: Week) => Math.max(0, ...w.sessions.filter(s => !s.race).map(s => s.km ?? 0))
  const long = rw != null ? 0 : Math.max(3, ...recent.filter(w => !w.scarico).map(longOf), ...recent.map(longOf))
  const weekly = Math.max(0, ...recent.map(w => w.total ?? 0))
  const result = generatePlan({ ...goal, id, startDate: addDays(slot.monday, 7), resume: { rw, long, weekly } })
  const merged = [...keep, ...result.plan.weeks], future = plan.weeks.slice(keep.length)
  let keptEdited = 0
  if (keepEdited) future.forEach((w, j) => {
    const at = keep.length + j
    if (w.edited && at < merged.length - 1 && !merged[at].pause) { merged[at] = w; keptEdited++ }
  })
  const next = normalizePlan({ ...result.plan, meta: { ...result.plan.meta, id, name: result.plan.meta.name }, weeks: merged })
  if (planError(next)) throw new Error(planError(next)!)
  return {
    plan: next, result, kept: keep.length, edited: future.filter(w => w.edited).length, keptEdited, full: false,
    state: { ...st, raceDate: goal.raceDate ?? null, raceName: goal.raceName ?? null, repeats: st.repeats.filter(r => r <= (slot.week as number)) },
  }
}

/** Tabella vuota da compilare a mano. */
export function blankPlan(id: string, name: string, n: number): Plan {
  const weeks = Array.from({ length: n }, (_, i): Week => ({ week: i + 1, phase: 1, scarico: false, skippable: false, total: null, sessions: [], uid: `${id}-${i + 1}` }))
  return { meta: { kind: 'custom', id, name, strengthDays: [], phases: { '1': 'La mia tabella' } }, weeks, maintenance: [] }
}
