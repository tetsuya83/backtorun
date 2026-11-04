import { signal } from '@preact/signals'
import { data, type Data } from './api'
import { HOME_CITY, cityUrl, forecastUrl, parseForecast, placeKey, type Forecast, type WeatherPrefs } from '../shared/weather'

const KEY = 'btr-weather', FRESH = 60 * 60 * 1000
const read = (): Forecast | null => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null } catch { return null } }
const write = (f: Forecast) => { try { localStorage.setItem(KEY, JSON.stringify(f)) } catch { /* memoria piena o bloccata */ } }
export const forget = () => { try { localStorage.removeItem(KEY) } catch { /* niente da fare */ } forecast.value = null; note.value = '' }
export const forecast = signal<Forecast | null>(read())
export const note = signal('')
export const loadingWx = signal(false)

/** L'account amministratore parte da Cornaredo; gli altri scelgono la propria località. */
export const prefsOf = (d: Data): WeatherPrefs => ({ ...(d.me?.isAdmin ? HOME_CITY : {}), ...d.state.weather })
export const hasPlace = (p: WeatherPrefs) => !!p.gps || (p.lat != null && p.lon != null)

export const locate = () => new Promise<{ lat: number; lon: number }>((ok, no) => {
  if (!navigator.geolocation) { no(new Error('none')); return }
  navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), no, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 60 * 1000 })
})
async function get(lat: number, lon: number, place: string) {
  const r = await fetch(forecastUrl(lat, lon))
  if (!r.ok) throw new Error('forecast')
  const f = parseForecast(await r.json(), place, placeKey(lat, lon), Date.now())
  if (!f) throw new Error('forecast')
  forecast.value = f; write(f); note.value = ''
}
export async function refreshWeather(force = false) {
  const d = data.value
  if (!d || loadingWx.value) return
  const p = prefsOf(d), home = p.lat != null && p.lon != null
  if (!hasPlace(p)) return
  const now = forecast.value, fixed = home && !p.gps ? placeKey(p.lat!, p.lon!) : null
  if (!force && now && Date.now() - now.at < FRESH && (fixed ? now.key === fixed : p.gps)) return
  loadingWx.value = true
  try {
    if (p.gps) {
      try { const c = await locate(); await get(c.lat, c.lon, 'posizione attuale'); return }
      catch (e: any) { if (e?.message === 'forecast') throw e; if (!home) { note.value = 'Posizione non disponibile: controlla il permesso o scegli una località in Profilo.'; return } note.value = `Posizione non disponibile: uso ${p.city}.` }
    }
    const msg = note.value
    await get(p.lat!, p.lon!, p.city ?? 'Località scelta')
    note.value = msg
  } catch { note.value = forecast.value ? 'Non riesco ad aggiornare: mostro l\'ultima previsione.' : 'Meteo non disponibile in questo momento.' }
  finally { loadingWx.value = false }
}
export interface City { name: string; label: string; lat: number; lon: number }
export async function findCity(q: string): Promise<City[]> {
  const r = await fetch(cityUrl(q))
  if (!r.ok) throw new Error('city')
  const j: any = await r.json()
  return (j.results ?? []).map((c: any) => ({ name: c.name, label: [c.name, c.admin2 ?? c.admin1, c.country].filter(Boolean).join(', '), lat: c.latitude, lon: c.longitude }))
}
