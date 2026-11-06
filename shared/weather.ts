/* Meteo all'ora della corsa e consigli: regole fisse, così funzionano anche offline con l'ultima previsione. */
import { upper } from './engine'
import { blocksOf, blocksSec, type Block } from './blocks'

export interface WeatherPrefs { city?: string | null; lat?: number | null; lon?: number | null; gps?: boolean; hour?: number; sunday?: number; days?: Partial<Record<'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom', number>> }
export interface Hour { t: string; temp: number; feels: number; rainP: number; rain: number; wind: number; gust: number; code: number; day: boolean }
export interface Forecast { at: number; place: string; key: string; hours: Hour[] }
export type RunKind = 'cammino' | 'facile' | 'lungo' | 'intenso'
export interface Advice { wear: string; tips: string[]; stop?: string }

export const HOME_CITY: WeatherPrefs = { city: 'Cornaredo', lat: 45.5, lon: 9.03 }
export const placeKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`
const FIELDS = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'is_day']
/** La posizione si arrotonda a circa un chilometro: per il meteo non serve di più. */
export const forecastUrl = (lat: number, lon: number) => `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&hourly=${FIELDS.join(',')}&timezone=auto&forecast_days=3`
export const cityUrl = (q: string) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=it&format=json`

export function parseForecast(j: any, place: string, key: string, at: number): Forecast | null {
  const h = j?.hourly
  if (!Array.isArray(h?.time)) return null
  const n = (k: string, i: number) => h[k]?.[i] ?? 0
  const hours = h.time.map((t: string, i: number): Hour => ({ t, temp: n('temperature_2m', i), feels: n('apparent_temperature', i), rainP: n('precipitation_probability', i), rain: n('precipitation', i), wind: n('wind_speed_10m', i), gust: n('wind_gusts_10m', i), code: n('weather_code', i), day: n('is_day', i) === 1 }))
  return hours.length ? { at, place, key, hours } : null
}
export const hourAt = (f: Forecast, date: string, hour: number) => f.hours.find(h => h.t === `${date}T${String(hour).padStart(2, '0')}:00`)
export function dayRange(f: Forecast, date: string) {
  const l = f.hours.filter(h => h.t.startsWith(date)).map(h => h.temp)
  return l.length ? { min: Math.min(...l), max: Math.max(...l) } : null
}
/** Ora abituale della corsa: la domenica può essere diversa. */
const WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'] as const
/** Ora dell'uscita: quella del giorno, se l'hai scelta, altrimenti quella dei feriali o della domenica. */
export const runHour = (p: WeatherPrefs, date: string) => { const w = new Date(date + 'T12:00:00Z').getUTCDay(); return p.days?.[WD[w]] ?? (w === 0 ? p.sunday ?? 8 : p.hour ?? 6) }

export type Sky = 'sole' | 'nubi' | 'nebbia' | 'pioggia' | 'neve' | 'temporale'
export function skyOf(code: number): { sky: Sky; text: string } {
  if (code === 0) return { sky: 'sole', text: 'Sereno' }
  if (code === 1) return { sky: 'sole', text: 'Quasi sereno' }
  if (code === 2) return { sky: 'nubi', text: 'Poco nuvoloso' }
  if (code === 3) return { sky: 'nubi', text: 'Nuvoloso' }
  if (code === 45 || code === 48) return { sky: 'nebbia', text: 'Nebbia' }
  if (code === 56 || code === 57 || code === 66 || code === 67) return { sky: 'pioggia', text: 'Pioggia gelata' }
  if (code >= 51 && code <= 55) return { sky: 'pioggia', text: 'Pioviggine' }
  if (code >= 61 && code <= 65) return { sky: 'pioggia', text: 'Pioggia' }
  if (code >= 80 && code <= 82) return { sky: 'pioggia', text: 'Rovesci' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { sky: 'neve', text: 'Neve' }
  if (code >= 95) return { sky: 'temporale', text: 'Temporale' }
  return { sky: 'nubi', text: 'Variabile' }
}

/** Quanto scalda la seduta: cammino e lunghi lenti chiedono più strati, le ripetute meno. */
export function kindOf(s: { text: string; km?: number | null; fatica?: string | null; blocks?: Block[] | null; race?: boolean }): RunKind {
  const b = blocksOf(s) ?? []
  if (s.race || (upper(s.fatica) ?? 0) >= 7 || b.some(x => x.part.effort === 'hard' || x.part.effort === 'max')) return 'intenso'
  if ((s.km ?? 0) >= 15 || blocksSec(b) >= 80 * 60) return 'lungo'
  if (b.some(x => x.rest?.effort === 'walk')) return 'cammino'
  return 'facile'
}
const SHIFT: Record<RunKind, number> = { cammino: -3, facile: 0, lungo: -2, intenso: 3 }
const LAYERS: [number, string][] = [
  [20, 'Canotta o maglia leggera, pantaloncini'],
  [14, 'Maglia a maniche corte, pantaloncini'],
  [9, 'Maglia a maniche lunghe leggera, pantaloncini o calzamaglia leggera'],
  [4, 'Maglia a maniche lunghe, calzamaglia, guanti leggeri'],
  [-1, 'Maglia termica, antivento leggero, calzamaglia, guanti'],
  [-6, 'Maglia termica, antivento, calzamaglia pesante, guanti pesanti, fascia per le orecchie'],
]
const COLDEST = 'Maglia termica, antivento, calzamaglia pesante, guanti pesanti, berretto, scaldacollo'
const low = (s: string) => s[0].toLowerCase() + s.slice(1)

export function advise(h: Hour, kind: RunKind, km?: number | null): Advice {
  const sky = skyOf(h.code).sky, eff = h.feels + SHIFT[kind]
  const wet = sky === 'pioggia' || sky === 'temporale' || h.rain >= .3 || h.rainP >= 50
  const slippery = sky === 'neve' || [56, 57, 66, 67].includes(h.code) || (h.temp <= 1 && h.rain > 0)
  let wear = LAYERS.find(([t]) => eff >= t)?.[1] ?? COLDEST
  if (wet) wear = /antivento/.test(wear) ? wear.replace(/antivento( leggero)?/, 'giacca antipioggia leggera') : `${wear}, giacca antipioggia leggera`
  if (wet) wear += ', cappellino con visiera'
  else if (h.day && sky === 'sole' && h.temp >= 20) wear += ', cappellino e occhiali da sole'
  if (!h.day) wear += ', luce frontale e riflettenti'
  const tips: string[] = []
  if (slippery) tips.push('Fondo scivoloso: passo corto ed evita curve strette e sentieri.')
  if (h.temp >= 21) tips.push(`Corri a sforzo, non a ritmo${kind === 'lungo' ? ' e accorcia del 10-20%' : ''}.`)
  if (wet) tips.push('Tieni pronto un cambio asciutto per quando rientri.')
  if (sky === 'nebbia' && h.day) tips.push('Nebbia: colori chiari e luce accesa anche con il chiaro.')
  if (h.wind >= 25) tips.push('Vento teso: parti controvento, così torni con il vento alle spalle.')
  if (eff < 5 && kind === 'intenso') tips.push('Con il freddo allunga il riscaldamento di 5 minuti prima di spingere.')
  if (kind === 'lungo' || (km ?? 0) >= 15) tips.push(h.temp >= 15 ? "Porta 500-700 ml d'acqua l'ora o passa da una fontana." : "Porta qualcosa da bere: anche al fresco serve, nei lunghi.")
  if (eff <= 12 && eff >= -1 && !wet) tips.push('Parti leggermente infreddolito: dopo 10 minuti starai bene.')
  if (eff < 5 && !wet) tips.push('Appena finisci, togli subito i vestiti sudati.')
  const stop = sky === 'temporale' ? 'Temporale previsto: non correre all\'aperto, sposta la seduta.'
    : h.feels >= 32 ? 'Caldo intenso: sposta la seduta alle ore più fresche o accorciala.'
    : h.gust >= 70 ? 'Raffiche forti: evita viali alberati e zone esposte, o sposta la seduta.' : undefined
  return { wear, tips: tips.slice(0, 4), stop }
}
/** Il meteo scritto a mano in Cosa mi metto oggi, nella stessa forma delle previsioni. */
export const manualHour = ({ feels, rain, wind, dark }: { feels: number; rain: boolean; wind: boolean; dark: boolean }): Hour => ({ t: '', temp: feels, feels, rainP: rain ? 80 : 0, rain: rain ? 1 : 0, wind: wind ? 30 : 5, gust: wind ? 45 : 10, code: rain ? 61 : 3, day: !dark })
export const adviceTitle = (kind: RunKind) => ({ cammino: 'Corsa e cammino', facile: 'Corsa facile', lungo: 'Lungo lento', intenso: 'Seduta intensa' })[kind]
export { low as lowerFirst }
