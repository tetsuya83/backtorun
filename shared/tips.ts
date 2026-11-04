/* Consigli al momento giusto: guardano il piano dei prossimi giorni e propongono una scheda di Impara. */
import { addDays, diffDays, sessionDate, type Session, type Slot } from './engine'
import { blocksOf, blocksSec } from './blocks'

export interface Tip { key: string; title: string; text: string; to: string }
export interface TipInput { slots: Slot[]; today: string; raceDate?: string | null; runKm: number; hour: number }

/** Durata stimata: i blocchi se ci sono, altrimenti 7 minuti al km. */
export const sessionMin = (s: Session) => {
  const b = blocksOf(s), sec = b ? blocksSec(b) : 0
  return Math.round(sec ? sec / 60 : (s.km ?? 0) * 7)
}
const dated = (slots: Slot[]) => slots.flatMap(s => s.sessions.map(x => ({ date: sessionDate(s, x.day), ses: x })))
export const raceDay = (slots: Slot[], raceDate?: string | null) => raceDate ?? dated(slots).find(x => x.ses.race || /^maratona$/i.test(x.ses.text.trim()))?.date ?? null
/** Il primo lungo in arrivo da almeno un'ora, per precompilare il calcolatore. */
export const nextLong = (slots: Slot[], today: string) => dated(slots).filter(x => x.date >= today && sessionMin(x.ses) >= 60 && !x.ses.race).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null

export function tipsFor({ slots, today, raceDate, runKm, hour }: TipInput): Tip[] {
  const out: Tip[] = [], end = addDays(today, 7), week = dated(slots).filter(x => x.date >= today && x.date < end)
  const race = raceDay(slots, raceDate), left = race ? diffDays(today, race) : -1, month = +today.slice(5, 7)
  const add = (key: string, title: string, text: string, to: string) => { out.push({ key, title, text, to }) }
  if (left >= 0 && left <= 2) add(`colazione-${race}`, 'La gara è vicina', 'Prova a mente la colazione e l\'orario: niente novità proprio adesso.', 'colazione-gara')
  else if (left >= 3 && left <= 4) add(`carico-${race}`, 'Iniziano i giorni del carico', 'Più carboidrati, meno fibre e nessun alimento nuovo.', 'carico-carboidrati')
  else if (left >= 5 && left <= 21) add(`rifinitura-${race}`, 'Sei in rifinitura', 'Meno km, stessa qualità: il lavoro ormai è fatto.', 'rifinitura-gara')
  const long = Math.max(0, ...week.filter(x => !x.ses.race).map(x => sessionMin(x.ses)))
  if (long >= 150) add('lungo-150', 'Questa settimana c\'è un lungo oltre le 2 ore e mezza', 'Usalo come prova generale di scarpe, abiti e rifornimenti.', 'prova-generale')
  else if (long >= 90) add('lungo-90', 'Il lungo si avvicina ai 90 minuti', 'È il momento di provare cosa mangiare e bere mentre corri.', 'calcolatore-lungo')
  if (week.reduce((a, x) => a + (x.ses.km ?? 0), 0) >= 40) add('km-40', 'I km stanno crescendo', 'Controlla che i pasti stiano al passo con il carico.', 'mangiare-carico')
  if (runKm >= 500) add(`scarpe-${Math.floor(runKm / 500)}`, `Hai superato i ${Math.floor(runKm / 500) * 500} km`, 'Dai un\'occhiata alle scarpe.', 'scarpe')
  if ((month >= 10 || month <= 3) && (hour < 8 || hour >= 17)) add(`buio-${today.slice(0, 4)}`, 'Corri con poca luce', 'Riflettenti su caviglie e ginocchia ti rendono più riconoscibile.', 'visibilita-buio')
  if (month >= 11 || month <= 2) add(`freddo-${today.slice(0, 4)}`, 'Fa freddo', 'Vestiti a strati e parti leggermente infreddolito.', 'strati-freddo')
  return out
}
