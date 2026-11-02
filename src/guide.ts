export const MONTHS = [
  ['Gennaio', '-1-6 °C', 'Mese più freddo: attenzione al ghiaccio sui sentieri.'],
  ['Febbraio', '1-9 °C', 'Freddo e buio alle 6: frontale e guanti.'],
  ['Marzo', '4-14 °C', 'Mattine fresche, ottime per correre.'],
  ['Aprile', '8-18 °C', 'Il buio delle 6 sta finendo.'],
  ['Maggio', '13-23 °C', 'Condizioni ottime.'],
  ['Giugno', '17-27 °C', 'Primi giorni afosi: dai 21 °C rallenta.'],
  ['Luglio', '19-29 °C', 'Mese più afoso: lungo alle 6 se puoi, porta acqua.'],
  ['Agosto', '18-28 °C', 'Lavori a sforzo, non a ritmo. Lungo alle 6 se puoi.'],
  ['Settembre', '15-24 °C', 'Il ritmo gara torna affidabile.'],
  ['Ottobre', '10-18 °C', 'Vicino alle condizioni ideali da maratona.'],
  ['Novembre', '4-11 °C', 'Buio e umido: strati, luce e riflettenti.'],
  ['Dicembre', '1-7 °C', 'Vicino a 0 alle 6: guanti doppi e cambio pronto.'],
]
export const STRENGTH: Record<string, string> = {
  '0': '3×8-12 con due ripetizioni in riserva',
  '1': '3×8-12 con due ripetizioni in riserva',
  '2': '3-4×6-8, più carico se il ginocchio resta asciutto',
  '3': '3-4×6-8, più carico se il ginocchio resta asciutto',
  '3.5': '3×6-8, senza cedimento',
  '4': '2-3×6-8, senza cedimento',
}
export const STRENGTH_LIST = 'Leg press o squat, stacco rumeno, affondi o split squat, hip thrust, polpacci in piedi e seduto, discese da gradino a una gamba, plank e side plank.'
export const BREATH = ['Respiro tranquillo, potresti cantare', 'Parli in frasi complete', 'Parli a frasi brevi', 'Fiatone, solo poche parole', 'Non riesci a parlare']
export const breathLevel = (s?: string | null) => {
  if (!s) return null
  if (/limite/i.test(s)) return 5
  if (/fiatone (ok|breve)/i.test(s)) return 4
  if (/brevi/i.test(s)) return 3
  return 2
}
export const WEEKDAY = { mar: 'Martedì', mer: 'Mercoledì', ven: 'Venerdì', dom: 'Domenica' } as const
export const fmtDate = (iso: string, opt: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...opt }).format(new Date(iso + 'T12:00:00Z'))
export const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
