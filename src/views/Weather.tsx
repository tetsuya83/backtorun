import { useEffect, useState } from 'preact/hooks'
import { data, saveState, type Data } from '../api'
import { Field, Note } from '../ui'
import { fmtDate, todayISO } from '../guide'
import { addDays, buildTimeline, plannedOn, planFor, sessionDate, slotForDate } from '../../shared/engine'
import { adviceTitle, advise, dayRange, hourAt, kindOf, runHour, skyOf, type Forecast, type Sky, type WeatherPrefs } from '../../shared/weather'
import { findCity, forecast, forget, hasPlace, loadingWx, locate, note, prefsOf, refreshWeather, type City } from '../weather'

const SKY: Record<Sky, string> = {
  sole: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  nubi: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z',
  nebbia: 'M4 9h16M6 13h12M4 17h16',
  pioggia: 'M7 14h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14zM9 17l-1 3M13 17l-1 3M17 17l-1 3',
  neve: 'M7 14h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14zM9 18h.01M13 18h.01M17 18h.01M11 21h.01M15 21h.01',
  temporale: 'M7 13h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 6 3.5 3.5 0 0 0 7 13zM13 15l-3 4h3l-2 3',
}
const Sk = ({ s }: { s: Sky }) => <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={SKY[s]} /></svg>
const deg = (n: number) => `${Math.round(n) + 0}\u00a0°C`
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Cosa c'è da fare all'aperto quel giorno: nuoto e forza non chiedono consigli sull'abbigliamento. */
export function outing(d: Data, date: string) {
  const st = d.state, slot = slotForDate(buildTimeline(planFor(d), st), date), ses = slot?.sessions.find(x => sessionDate(slot, x.day) === date)
  const swap = (st.planned ?? []).find(p => p.date === date && p.mode === 'replace')
  if (ses && ses.km !== 0 && swap?.sport !== 'nuoto') return ses
  return plannedOn(st, date).find(p => p.sport === 'corsa') ?? null
}
/** Oggi conta l'ora abituale finché non è passata, poi l'ora attuale. */
export function dayHour(p: WeatherPrefs, date: string, today: string) {
  const usual = runHour(p, date), now = new Date().getHours()
  return date === today && now > usual ? now : usual
}
function firstDay(d: Data, today: string) {
  const ran = d.activities.some(a => a.date === today && a.type === 'corsa'), tomorrow = addDays(today, 1)
  if (outing(d, today) && !ran) return today
  return outing(d, tomorrow) || new Date().getHours() >= 18 ? tomorrow : today
}
function Advice({ d, f, date, today, p }: { d: Data; f: Forecast; date: string; today: string; p: WeatherPrefs }) {
  const h = hourAt(f, date, dayHour(p, date, today)), run = outing(d, date), name = date === today ? 'Oggi' : 'Domani'
  if (!h) return null
  if (!run) return <p class="sub">{name} niente corsa all'aperto.</p>
  const kind = kindOf(run), a = advise(h, kind, run.km)
  return <div class="wx-tip">
    <h3>{name} alle {clock(dayHour(p, date, today))}: {adviceTitle(kind).toLowerCase()}</h3>
    {a.stop && <Note tone="stop"><strong>{a.stop}</strong></Note>}
    <p><b>Come vestirti.</b> {a.wear}.</p>
    {a.tips.length > 0 && <ul>{a.tips.map(t => <li key={t}>{t}</li>)}</ul>}
  </div>
}
function Tile({ f, date, label, p, on, today, pick }: { f: Forecast; date: string; label: string; p: WeatherPrefs; on: boolean; today: string; pick: () => void }) {
  const hour = dayHour(p, date, today), h = hourAt(f, date, hour), r = dayRange(f, date)
  if (!h) return null
  const sky = skyOf(h.code)
  return <button type="button" class={on ? 'on' : ''} aria-pressed={on} onClick={pick}>
    <span class="wx-day">{label}, ore {clock(hour)}</span>
    <span class="wx-now"><Sk s={sky.sky} /><b>{deg(h.temp)}</b></span>
    <small>{sky.text}, percepiti {deg(h.feels)}</small>
    <small>Vento {Math.round(h.wind)} km/h, pioggia {h.rainP}%{h.day ? '' : ', buio'}</small>
    {r && <small>Giornata: {Math.round(r.min) + 0}-{deg(r.max)}</small>}
  </button>
}
export function WeatherCard() {
  const d = data.value!, p = prefsOf(d), today = todayISO(), tomorrow = addDays(today, 1), key = `${p.gps}|${p.lat}|${p.lon}`
  const [day, setDay] = useState<string | null>(null), f = forecast.value
  useEffect(() => { void refreshWeather() }, [key])
  if (!hasPlace(p)) return <section class="panel wx"><p class="eyebrow">Meteo</p><h2>Scegli dove corri</h2><p class="sub">Vedrai il meteo all'ora della corsa e come vestirti.</p><a class="btn ghost" href="#/impostazioni">Imposta la località</a></section>
  const usable = f && hourAt(f, today, dayHour(p, today, today)) ? f : null
  if (!usable) return <section class="panel wx"><p class="eyebrow">Meteo</p><p class="sub" role="status">{loadingWx.value ? 'Carico le previsioni…' : note.value || 'Meteo non disponibile in questo momento.'}</p>{!loadingWx.value && <button type="button" class="btn ghost" onClick={() => refreshWeather(true)}>Riprova</button>}</section>
  const sel = day ?? firstDay(d, today)
  return <section class="panel wx" aria-label="Meteo e consigli">
    <p class="eyebrow">Meteo, {usable.place}</p>
    <div class="wx-days">
      <Tile f={usable} date={today} label="Oggi" p={p} on={sel === today} today={today} pick={() => setDay(today)} />
      <Tile f={usable} date={tomorrow} label="Domani" p={p} on={sel === tomorrow} today={today} pick={() => setDay(tomorrow)} />
    </div>
    <Advice d={d} f={usable} date={sel} today={today} p={p} />
    {note.value && <p class="sub" role="status">{note.value}</p>}
    <small class="wx-src">Aggiornato {fmtDate(new Date(usable.at - new Date(usable.at).getTimezoneOffset() * 6e4).toISOString().slice(0, 10), { day: 'numeric', month: 'short' })} alle {new Date(usable.at).toTimeString().slice(0, 5)}. Dati <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></small>
  </section>
}
export function WeatherSettings() {
  const d = data.value!, st = d.state, p = prefsOf(d)
  const [q, setQ] = useState(''), [list, setList] = useState<City[] | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const put = (x: WeatherPrefs) => { saveState({ ...st, weather: { ...p, ...x } }); if ('lat' in x || 'gps' in x) forget() }
  const search = async (e: Event) => {
    e.preventDefault(); setErr(''); setList(null)
    if (q.trim().length < 2) return
    setBusy(true)
    try { const r = await findCity(q); setList(r); if (!r.length) setErr('Nessuna località trovata.') }
    catch { setErr('Serve la connessione per cercare una località.') } finally { setBusy(false) }
  }
  const gps = async () => {
    setErr('')
    if (p.gps) { put({ gps: false }); return }
    setBusy(true)
    try { await locate(); put({ gps: true }) }
    catch { setErr('Il telefono non ha dato la posizione: controlla il permesso per questa app.') } finally { setBusy(false) }
  }
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return <>
    <h2 class="phase">Meteo</h2>
    <p class="sub pad">{p.city ? `Località: ${p.city}.` : 'Nessuna località scelta.'} La posizione del telefono resta sul telefono: viene inviata, arrotondata, solo al servizio meteo.</p>
    <button type="button" class="btn ghost" disabled={busy} aria-pressed={!!p.gps} onClick={gps}>{p.gps ? 'Usa la posizione del telefono: attivo' : 'Usa la posizione del telefono'}</button>
    <form class="row wx-find" onSubmit={search}>
      <Field label="Cerca una località"><input value={q} onInput={e => setQ(e.currentTarget.value)} placeholder="Per esempio Cornaredo" /></Field>
      <button class="btn ghost" disabled={busy}>Cerca</button>
    </form>
    {list && list.length > 0 && <ul class="cards">{list.map(c => <li key={c.label}><button type="button" onClick={() => { put({ city: c.name, lat: c.lat, lon: c.lon }); setList(null); setQ('') }}><span><b>{c.name}</b><small>{c.label}</small></span></button></li>)}</ul>}
    {err && <p class="err" role="alert">{err}</p>}
    <div class="row">
      <Field label="Ora della corsa"><select value={p.hour ?? 6} onChange={e => put({ hour: +e.currentTarget.value })}>{hours.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></Field>
      <Field label="Ora la domenica"><select value={p.sunday ?? 8} onChange={e => put({ sunday: +e.currentTarget.value })}>{hours.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></Field>
    </div>
  </>
}
