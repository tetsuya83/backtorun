import { DAYS, strengthDays, type Day, type Plan, type Slot, type Timeline } from './engine'
import { schemeFor, WORKOUTS, type Exercise, type Place, type Scheme } from './training'

/* Schede di forza fisse: due per fase (A e B, una per giorno di forza), in palestra o a corpo libero.
   Gli id degli esercizi restano quelli di sempre, così lo storico e i suggerimenti di carico continuano. */

export type Stage = 'ritorno' | 'base' | 'costruzione' | 'specifico' | 'rifinitura' | 'gara'
export type Letter = 'A' | 'B' | 'R'
export interface Sheet { id: string; letter: Letter; stage: Stage; name: string; focus: string; items: Record<Place, Exercise[]> }

const pick = (place: Place, id: string): Exercise => {
  const ex = WORKOUTS[place].find(e => e.id === id) ?? WORKOUTS[place].flatMap(e => e.alt ? [e.alt] : []).find(e => e.id === id)
  if (!ex) throw new Error('Esercizio sconosciuto: ' + id)
  return ex
}
const BALANCE: Exercise = { id: 'balance', name: 'Equilibrio su una gamba', cue: 'Ginocchio morbido, sguardo avanti. Quando è facile, chiudi gli occhi o stai su un cuscino.', kind: 'time', perSide: true }
const POGO: Exercise = { id: 'pogo', name: 'Saltelli a caviglie rigide', cue: 'Salti bassi e rapidi sull\'avampiede, ginocchia quasi tese, atterraggio silenzioso. Stop se senti tendini o ginocchio.', kind: 'body', plyo: true }
const extra: Record<string, Exercise> = { balance: BALANCE, pogo: POGO }
const ex = (place: Place, id: string) => extra[id] ?? pick(place, id)
const both = (gym: string[], home: string[]): Record<Place, Exercise[]> => ({ palestra: gym.map(i => ex('palestra', i)), casa: home.map(i => ex('casa', i)) })

export const SHEETS: Sheet[] = [
  { id: 'ritorno-a', letter: 'A', stage: 'ritorno', name: 'Gambe e polpacci', focus: 'Riprendere confidenza con i movimenti, carichi leggeri',
    items: both(['legpress', 'calfstand', 'stepdown', 'plank'], ['h-squat', 'h-calf', 'stepdown', 'plank']) },
  { id: 'ritorno-b', letter: 'B', stage: 'ritorno', name: 'Glutei ed equilibrio', focus: 'Anche e caviglie stabili prima di aumentare la corsa',
    items: both(['hipthrust', 'rdl', 'calfseat', 'balance', 'sideplank'], ['h-bridge', 'h-rdl', 'h-calfbent', 'balance', 'sideplank']) },
  { id: 'base-a', letter: 'A', stage: 'base', name: 'Gambe e polpacci', focus: 'Forza generale per cosce, polpacci e ginocchio',
    items: both(['legpress', 'lunge', 'calfstand', 'stepdown', 'plank'], ['h-squat', 'h-lunge', 'h-calf', 'stepdown', 'plank']) },
  { id: 'base-b', letter: 'B', stage: 'base', name: 'Glutei e stabilità', focus: 'Catena posteriore, polpacci e tronco',
    items: both(['rdl', 'hipthrust', 'calfseat', 'balance', 'sideplank'], ['h-rdl', 'h-bridge', 'h-calfbent', 'balance', 'sideplank']) },
  { id: 'costruzione-a', letter: 'A', stage: 'costruzione', name: 'Forza ed elasticità', focus: 'Più carico e i primi saltelli, solo senza dolore',
    items: both(['legpress', 'splitsquat', 'pogo', 'calfstand', 'plank'], ['h-squat', 'h-lunge', 'pogo', 'h-calf', 'plank']) },
  { id: 'costruzione-b', letter: 'B', stage: 'costruzione', name: 'Glutei e controllo', focus: 'Catena posteriore pesante e controllo del ginocchio',
    items: both(['rdl', 'hipthrust', 'stepdown', 'calfseat', 'sideplank'], ['h-rdl', 'h-bridge', 'stepdown', 'h-calfbent', 'sideplank']) },
  { id: 'specifico-a', letter: 'A', stage: 'specifico', name: 'Mantenimento ed esplosività', focus: 'Pochi esercizi, nessun cedimento: le gambe servono per correre',
    items: both(['legpress', 'pogo', 'calfstand', 'plank'], ['h-squat', 'pogo', 'h-calf', 'plank']) },
  { id: 'specifico-b', letter: 'B', stage: 'specifico', name: 'Mantenimento e stabilità', focus: 'Tenere la forza costruita con poco volume',
    items: both(['rdl', 'lunge', 'hipthrust', 'sideplank'], ['h-rdl', 'h-lunge', 'h-bridge', 'sideplank']) },
  { id: 'rifinitura', letter: 'R', stage: 'rifinitura', name: 'Attivazione', focus: 'Una seduta corta e leggera a settimana, per arrivare fresco alla gara',
    items: both(['legpress', 'hipthrust', 'calfstand', 'plank'], ['h-squat', 'h-bridge', 'h-calf', 'plank']) },
]
export const sheetById = (id?: string | null) => SHEETS.find(s => s.id === id)

export const STAGE_NAME: Record<Stage, string> = { ritorno: 'Ritorno', base: 'Base', costruzione: 'Costruzione', specifico: 'Specifico', rifinitura: 'Rifinitura', gara: 'Settimana della gara' }
const byPhase = (phase: number): Stage => phase < 1 ? 'ritorno' : phase < 2 ? 'base' : phase < 3 ? 'costruzione' : 'specifico'

/** In che fase della forza è la settimana. Le due settimane prima della gara sono di rifinitura, quella della gara è senza forza. */
export function stageOf(t: Timeline, slot: Slot): Stage {
  const plan = t.slots.filter(s => !s.maintenance), last = plan.at(-1)
  if (!slot.maintenance && last && last.phase >= 4 && slot.phase >= 4) {
    const i = plan.findIndex(s => s.key === slot.key), from = plan.length - 1 - i
    if (from === 0) return 'gara'
    if (from <= 2) return 'rifinitura'
  }
  return byPhase(slot.phase)
}

export interface Today { stage: Stage; sheet: Sheet | null; other: Sheet | null; why?: string }
const dayOf = (date: string): Day => DAYS[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7]

/** La scheda di un giorno: il primo giorno di forza della settimana la A, il secondo la B (poi di nuovo A).
 *  Fuori dai giorni di forza, quella diversa dall'ultima fatta. */
export function sheetFor(plan: Plan, t: Timeline, slot: Slot | null | undefined, date: string, lastSheet?: string | null): Today {
  const stage = slot ? stageOf(t, slot) : 'base'
  if (stage === 'gara') return { stage, sheet: null, other: null, why: 'Settimana della gara: niente forza, solo un po\' di mobilità.' }
  const days = [...strengthDays(plan)].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)), at = days.indexOf(dayOf(date))
  if (stage === 'rifinitura') {
    const r = sheetById('rifinitura')!
    return at > 0 ? { stage, sheet: null, other: r, why: 'In rifinitura basta una seduta corta a settimana: oggi mobilità.' } : { stage, sheet: r, other: null }
  }
  const a = SHEETS.find(s => s.stage === stage && s.letter === 'A')!, b = SHEETS.find(s => s.stage === stage && s.letter === 'B')!
  const isB = at >= 0 ? at % 2 === 1 : sheetById(lastSheet)?.letter === 'A'
  return isB ? { stage, sheet: b, other: a } : { stage, sheet: a, other: b }
}

/** Esercizi e numeri della scheda: i saltelli spariscono se ci sono dolore o gonfiore; in rifinitura due serie leggere. */
export function itemsOf(sheet: Sheet, place: Place, phase: number, scarico: boolean, ok: boolean): { ex: Exercise; s: Scheme }[] {
  return sheet.items[place].filter(e => ok || !e.plyo).map(e => {
    const s = schemeFor(e, phase, scarico || sheet.stage === 'rifinitura', place)
    return { ex: e, s: sheet.stage === 'rifinitura' ? { ...s, sets: 2, rest: Math.min(s.rest, 75) } : s }
  })
}

/** Durata stimata: 40 secondi di lavoro per serie (il doppio se per lato), recuperi e 5 minuti di riscaldamento. */
export const minutesOf = (items: { ex: Exercise; s: Scheme }[]) =>
  Math.round((300 + items.reduce((a, { ex, s }) => a + s.sets * ((s.unit === 'sec' ? s.max : 40) * (ex.perSide ? 2 : 1) + s.rest), 0)) / 300) * 5

export const listOf = (sheet: Sheet, place: Place) => sheet.items[place].map((e, i) => {
  const n = e.alt ? `${e.name} o ${e.alt.name.toLowerCase()}` : e.name
  return i ? n.toLowerCase() : n
}).join(', ')
