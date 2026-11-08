import type { Activity } from './engine'

/* ---------- Forza ---------- */
export type Place = 'palestra' | 'casa'
export type Kind = 'load' | 'body' | 'time'
export interface Exercise { id: string; name: string; cue: string; kind: Kind; main?: boolean; perSide?: boolean; step?: number; plyo?: boolean; alt?: Omit<Exercise, 'alt'> }
export interface Scheme { sets: number; min: number; max: number; rest: number; unit: 'rip' | 'sec' }
export interface SetLog { kg?: number | null; reps: number }
export interface ExerciseLog { id: string; name: string; kind: Kind; min: number; max: number; sets: SetLog[] }

const STEP_DOWN: Exercise = { id: 'stepdown', name: 'Discese da gradino', cue: 'Scendi in 3 secondi, ginocchio in linea col piede. Gradino basso se senti dolore.', kind: 'body', perSide: true }
const PLANK: Exercise = { id: 'plank', name: 'Plank', cue: 'Bacino fermo, respira. Fermati quando la schiena cede.', kind: 'time' }
const SIDE: Exercise = { id: 'sideplank', name: 'Side plank', cue: 'Corpo in linea, anche alte. Si può fare con le ginocchia a terra.', kind: 'time', perSide: true }
export const WORKOUTS: Record<Place, Exercise[]> = {
  palestra: [
    { id: 'legpress', name: 'Leg press', cue: 'Scendi fin dove resti senza dolore, senza staccare il bacino.', kind: 'load', main: true, step: 5, alt: { id: 'squat', name: 'Squat', cue: 'Schiena neutra, ginocchia nella direzione dei piedi.', kind: 'load', main: true } },
    { id: 'rdl', name: 'Stacco rumeno', cue: 'Spingi indietro le anche, bilanciere vicino alle gambe.', kind: 'load', main: true },
    { id: 'lunge', name: 'Affondi', cue: 'Passo controllato, ginocchio davanti stabile.', kind: 'load', perSide: true, alt: { id: 'splitsquat', name: 'Split squat', cue: 'Piedi fermi, scendi dritto e risali spingendo col tallone.', kind: 'load', perSide: true } },
    { id: 'hipthrust', name: 'Hip thrust', cue: 'Stringi i glutei in alto, non inarcare la schiena.', kind: 'load', main: true },
    { id: 'calfstand', name: 'Polpacci in piedi', cue: 'Sali e scendi lentamente, pausa in alto.', kind: 'load' },
    { id: 'calfseat', name: 'Polpacci seduto', cue: 'Discesa lenta, tallone basso.', kind: 'load' },
    STEP_DOWN, PLANK, SIDE,
  ],
  casa: [
    { id: 'h-squat', name: 'Squat su sedia', cue: 'Scendi in 3 secondi, sfiora la sedia, risali. Zaino se è facile.', kind: 'body', main: true },
    { id: 'h-rdl', name: 'Stacco a una gamba', cue: 'Anche indietro, mano al muro se serve. Zaino se è facile.', kind: 'body', perSide: true, main: true },
    { id: 'h-lunge', name: 'Affondi indietro', cue: 'Passo indietro controllato, ginocchio davanti stabile.', kind: 'body', perSide: true },
    { id: 'h-bridge', name: 'Ponte a una gamba', cue: 'Bacino dritto, stringi il gluteo in alto.', kind: 'body', perSide: true, main: true },
    { id: 'h-calf', name: 'Polpacci su gradino', cue: 'Una gamba alla volta, tallone sotto il gradino.', kind: 'body', perSide: true },
    { id: 'h-calfbent', name: 'Polpacci a ginocchio piegato', cue: 'Ginocchio leggermente piegato, sali lentamente.', kind: 'body', perSide: true },
    STEP_DOWN, PLANK, SIDE,
  ],
}
const RANGE: Record<string, [number, number, number, number]> = { // serie principali, altre, min, max
  '0': [3, 3, 8, 12], '1': [3, 3, 8, 12], '2': [4, 3, 6, 8], '3': [4, 3, 6, 8], '3.5': [3, 3, 6, 8], '4': [3, 2, 6, 8],
}
/** Traduce in numeri lo schema di forza del piano: in scarico si toglie una serie. */
export function schemeFor(ex: Exercise, phase: number, scarico: boolean, place: Place): Scheme {
  const [main, other, lo, hi] = RANGE[String(phase)] ?? RANGE['1']
  const cut = (n: number) => Math.max(2, n - (scarico ? 1 : 0))
  if (ex.plyo) return { sets: cut(3), min: 10, max: 15, rest: 60, unit: 'rip' }
  if (ex.kind === 'time') return { sets: cut(3), min: phase < 2 ? 20 : 30, max: phase < 2 ? 40 : 60, rest: 45, unit: 'sec' }
  const home = place === 'casa' // a corpo libero il carico è basso: la difficoltà viene da più ripetizioni
  return { sets: cut(ex.main ? main : other), min: home ? 8 : lo, max: home ? 12 : hi, rest: ex.main && !home ? (lo < 8 ? 120 : 90) : 75, unit: 'rip' }
}
export const lastLog = (acts: Activity[], id: string) => {
  for (let i = acts.length - 1; i >= 0; i--) { const l = acts[i].sets?.find(x => x.id === id); if (l?.sets.length) return l }
  return null
}
export const topKg = (l: ExerciseLog) => Math.max(0, ...l.sets.map(s => s.kg ?? 0))
/** Vero se né l'ultima corsa né l'ultima forza segnalano dolore o gonfiore. */
export function jointOk(acts: Activity[]) {
  const last = (t: Activity['type']) => [...acts].reverse().find(a => a.type === t)
  const r = last('corsa'), f = last('forza')
  return !r?.locked && !r?.swelling && (r?.knee ?? 0) <= 2 && (f?.knee ?? 0) <= 2
}
export interface Suggestion { kg: number | null; text: string; up: boolean }
/** Doppia progressione: prima le ripetizioni, poi il carico, e solo se le articolazioni stanno bene. */
export function suggest(last: ExerciseLog | null, ex: Exercise, s: Scheme, ok: boolean): Suggestion {
  const unit = s.unit === 'sec' ? 'secondi' : 'ripetizioni'
  if (!last) return { kg: null, up: false, text: ex.kind === 'load' ? 'Prima volta: scegli un carico con cui ti restano 2 ripetizioni in riserva.' : `Prima volta: punta a ${s.min}-${s.max} ${unit}, restando in controllo.` }
  const kg = topKg(last) || null
  if (last.max !== s.max) return { kg, up: false, text: 'Schema nuovo: regola il carico per restare con 2 ripetizioni in riserva.' }
  const top = last.sets.length >= s.sets && last.sets.every(x => x.reps >= s.max)
  if (!top) return { kg, up: false, text: last.sets.some(x => x.reps < s.min) ? 'Resta su questo carico finché tutte le serie sono nello schema.' : `Stesso carico: cerca ${s.max} ${unit} in tutte le serie.` }
  if (!ok) return { kg, up: false, text: 'Serie complete, ma tieni questo livello finché dolore e gonfiore non passano.' }
  if (ex.plyo) return { kg: null, up: true, text: 'Serie complete: stessi salti, ma più rapidi e silenziosi.' }
  if (ex.kind === 'time') return { kg: null, up: true, text: 'Serie complete: aggiungi 5 secondi.' }
  if (ex.kind === 'body' && !kg) return { kg: null, up: true, text: 'Serie complete: rallenta la discesa o aggiungi uno zaino leggero.' }
  const inc = ex.step ?? 2.5
  return { kg: (kg ?? 0) + inc, up: true, text: `Serie complete: sali di ${inc} kg.` }
}

/* ---------- Timer ---------- */
export interface Step { label: string; seconds: number; tone: 'work' | 'rest' | 'move'; cue?: string }
export interface Intervals { reps: number; work: number; rest: number; workLabel: string; restLabel: string; detail?: string; partial: boolean }
const dur = (s: string) => { const m = s.match(/(?:(\d+)')?(?:(\d+)")?/)!; return +(m[1] ?? 0) * 60 + +(m[2] ?? 0) }
const DUR = `\\d+'(?:\\d+")?|\\d+"`
const RE = new RegExp(`(\\d+)\\s*×\\s*\\[?\\s*(${DUR})\\s+([^+\\]]+?)\\s*\\+\\s*(${DUR})\\s*([^\\]()]*)`)
/** Legge dal testo della seduta le ripetizioni a tempo; quelle a distanza restano al Suunto. */
export function parseIntervals(text: string): Intervals | null {
  const m = text.match(RE)
  if (!m) return null
  const a = m[3].trim(), b = m[5].trim()
  const walk = /corsa/i.test(a)
  return { reps: +m[1], work: dur(m[2]), rest: dur(m[4]), workLabel: walk ? 'Corri' : 'Forte', restLabel: /cammin/i.test(b) ? 'Cammina' : 'Recupera', detail: walk ? undefined : a, partial: /\(\d/.test(text) }
}
export function intervalSteps(v: Intervals): Step[] {
  return Array.from({ length: v.reps }, (_, i) => [
    { label: v.workLabel, seconds: v.work, tone: 'work' as const, cue: `Ripetizione ${i + 1} di ${v.reps}${v.detail ? `, ${v.detail}` : ''}` },
    { label: v.restLabel, seconds: v.rest, tone: 'rest' as const, cue: `Ripetizione ${i + 1} di ${v.reps}` },
  ]).flat()
}
export const totalOf = (s: Step[]) => s.reduce((a, x) => a + x.seconds, 0)
/** Dove siamo, dato il tempo trascorso: tutto deriva dall'orologio, così uno stop del telefono non sfasa il timer. */
export function stepAt(steps: Step[], t: number) {
  let end = 0
  for (let i = 0; i < steps.length; i++) { const start = end; end += steps[i].seconds; if (t < end) return { i, start, left: end - t, done: false } }
  return { i: steps.length - 1, start: end - (steps.at(-1)?.seconds ?? 0), left: 0, done: true }
}

/* ---------- Routine ---------- */
export interface Routine { id: string; name: string; when: string; steps: Step[] }
const mv = (label: string, seconds: number, cue?: string): Step => ({ label, seconds, tone: 'move', cue })
const both = (label: string, seconds: number, cue?: string) => [mv(`${label}, destra`, seconds, cue), mv(`${label}, sinistra`, seconds, cue)]
const WALK = mv('Camminata veloce', 120, 'Spalle sciolte, passo deciso.')
export const ROUTINES: Routine[] = [
  { id: 'warm-easy', name: 'Riscaldamento leggero', when: 'Prima di cammino-corsa, corse facili e lunghi', steps: [WALK, ...both('Cerchi con la caviglia', 20), ...both('Slanci avanti e indietro', 25, 'Gamba morbida, mano al muro. Niente strappi.'), mv('Mezzi squat lenti', 30), mv('Salite sui polpacci', 30)] },
  { id: 'warm-work', name: 'Riscaldamento per i lavori', when: 'Prima di ripetute, fondo medio, salite e allunghi', steps: [WALK, mv('Corsa lentissima', 300, 'Fiato tranquillo: parli in frasi complete.'), ...both('Slanci avanti e indietro', 25), ...both('Slanci laterali', 25), ...both('Affondi lenti', 30), mv('Skip basso', 30, 'Passi corti e leggeri.'), mv('Corsa calciata', 30, 'Tocchi leggeri, senza forzare il ginocchio.')] },
  { id: 'warm-gym', name: 'Riscaldamento per la forza', when: 'Prima della scheda di forza', steps: [mv('Cammino o bici leggera', 180), mv('Squat a corpo libero', 40, 'Lenti, senza dolore.'), mv('Ponte per i glutei', 40), ...both('Slanci avanti e indietro', 25)] },
  { id: 'cool-run', name: 'Defaticamento', when: 'Dopo le corse brevi', steps: [mv('Cammino lento', 120, 'Lascia scendere il fiato.'), ...both('Polpaccio al muro', 30), ...both('Flessori della coscia', 30), ...both('Quadricipite in piedi', 30, 'Tirando piano: stop se senti il ginocchio.')] },
  { id: 'cool-long', name: 'Mobilità dopo il lungo', when: 'Dopo lunghi e sedute dure', steps: [mv('Cammino lento', 180, 'Bevi qualcosa e lascia scendere il fiato.'), ...both('Polpaccio al muro', 40), ...both('Flessori della coscia', 40), ...both('Quadricipite in piedi', 30), ...both('Flessori dell\'anca', 40), ...both('Gluteo a terra', 40), mv('Schiena distesa', 40, 'Respira lentamente.')] },
  { id: 'mobility', name: 'Mobilità del giorno di riposo', when: 'Nei giorni senza corsa', steps: [mv('Cerchi con le anche', 40), ...both('Caviglia al muro', 30, 'Ginocchio verso il muro, tallone a terra.'), ...both('Flessori dell\'anca', 40), ...both('Gluteo a terra', 40), ...both('Rotazione del busto', 30), mv('Gatto e cammello', 40), mv('Schiena distesa', 40)] },
]
export const routineById = (id?: string | null) => ROUTINES.find(r => r.id === id)
const HARD = /^(Interval|Ripetute|Fartlek|Salite|Fondo medio|Medio|Gara|Obiettivo|Maratona)|allunghi|forti|massimali/i
export const warmupFor = (text: string) => routineById(HARD.test(text) ? 'warm-work' : 'warm-easy')!
export const cooldownFor = (text: string, km?: number | null) => routineById((km ?? 0) >= 14 || HARD.test(text) || /lung/i.test(text) ? 'cool-long' : 'cool-run')!
