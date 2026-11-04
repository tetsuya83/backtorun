import { useState } from 'preact/hooks'
import { data } from '../api'
import { articleById } from '../learn'
import { fmtDate, todayISO } from '../guide'
import { Field, Note } from '../ui'
import { buildTimeline, planFor } from '../../shared/engine'
import { fuelPlan, type Climate } from '../../shared/fuel'
import { nextLong, sessionMin, tipsFor } from '../../shared/tips'
import { adviceTitle, advise, hourAt, kindOf, manualHour, type RunKind } from '../../shared/weather'
import { dayHour, outing } from './Weather'
import { forecast, prefsOf } from '../weather'

const KINDS: RunKind[] = ['cammino', 'facile', 'lungo', 'intenso']
const YesNo = ({ label, on, set }: { label: string; on: boolean; set: (x: boolean) => void }) => <Field label={label}><select value={on ? '1' : '0'} onChange={e => set(e.currentTarget.value === '1')}><option value="0">No</option><option value="1">Sì</option></select></Field>

export function WearTool() {
  const d = data.value!, today = todayISO(), p = prefsOf(d), f = forecast.value, h = f ? hourAt(f, today, dayHour(p, today, today)) : undefined, run = outing(d, today)
  const [feels, setFeels] = useState(String(Math.round(h?.feels ?? 8))), [kind, setKind] = useState<RunKind>(run ? kindOf(run) : 'facile')
  const [rain, setRain] = useState(!!h && (h.rainP >= 50 || h.rain >= .3)), [wind, setWind] = useState((h?.wind ?? 0) >= 25), [dark, setDark] = useState(h ? !h.day : false)
  const n = parseFloat(feels.replace(',', '.')), a = Number.isFinite(n) ? advise(manualHour({ feels: n, rain, wind, dark }), kind) : null
  return <section class="panel form">
    {h && f && <p class="sub">Precompilato con il meteo di {f.place}.</p>}
    <div class="row">
      <Field label="Percepiti, in °C"><input inputMode="decimal" value={feels} onInput={e => setFeels(e.currentTarget.value)} /></Field>
      <Field label="Seduta"><select value={kind} onChange={e => setKind(e.currentTarget.value as RunKind)}>{KINDS.map(k => <option key={k} value={k}>{adviceTitle(k)}</option>)}</select></Field>
    </div>
    <div class="row"><YesNo label="Pioggia" on={rain} set={setRain} /><YesNo label="Vento forte" on={wind} set={setWind} /><YesNo label="Buio" on={dark} set={setDark} /></div>
    {a ? <div class="wx-tip" role="status"><p><b>Come vestirti.</b> {a.wear}.</p>{a.tips.length > 0 && <ul>{a.tips.map(t => <li key={t}>{t}</li>)}</ul>}</div> : <p class="err" role="alert">Scrivi una temperatura.</p>}
  </section>
}

const span = (a: number, b: number, unit = '') => a === b ? `${a}${unit}` : `${a}-${b}${unit}`
const comma = (n: number) => String(n).replace('.', ',')
export function FuelTool() {
  const d = data.value!, today = todayISO(), long = nextLong(buildTimeline(planFor(d), d.state).slots, today)
  const [min, setMin] = useState(String(long ? sessionMin(long.ses) : 120)), [climate, setClimate] = useState<Climate>('fresco'), [gel, setGel] = useState('25')
  const r = fuelPlan(parseInt(min, 10), climate, parseInt(gel, 10))
  return <section class="panel form">
    {long && <p class="sub">Prossimo lungo: {fmtDate(long.date, { weekday: 'long', day: 'numeric', month: 'long' })}, stimato in circa {sessionMin(long.ses)} minuti.</p>}
    <div class="row">
      <Field label="Durata, in minuti"><input inputMode="numeric" value={min} onInput={e => setMin(e.currentTarget.value)} /></Field>
      <Field label="Clima"><select value={climate} onChange={e => setClimate(e.currentTarget.value as Climate)}><option value="fresco">Fresco</option><option value="mite">Mite</option><option value="caldo">Caldo</option></select></Field>
    </div>
    <Field label="Carboidrati per gel, in grammi"><input inputMode="numeric" value={gel} onInput={e => setGel(e.currentTarget.value)} /></Field>
    {!r ? <p class="err" role="alert">Controlla durata e grammi per gel.</p> : <div class="wx-tip" role="status">
      {r.carbs && r.gels && r.rate ? <>
        <p><b>Carboidrati.</b> {span(r.rate[0], r.rate[1], ' g l\'ora')}, cioè {span(r.carbs[0], r.carbs[1], ' g')} in tutto: {span(r.gels[0], r.gels[1])} gel.</p>
        <p><b>Quando.</b> Il primo dopo 30-45 minuti, poi circa ogni {r.everyMin} minuti partendo dalla quantità più bassa.</p>
      </> : <p><b>Carboidrati.</b> Sotto l'ora di solito non servono: basta il pasto normale.</p>}
      <p><b>Liquidi.</b> Come riferimento {r.water[0]}-{r.water[1]} ml l'ora, circa {comma(r.liters[0])}-{comma(r.liters[1])} litri in tutto. Bevi secondo la sete, senza forzarti.</p>
    </div>}
    <Note>Se la corsa è facile e sotto i 90 minuti, i carboidrati sono una scelta, non un obbligo. Sali solo se lo stomaco tollera bene.</Note>
  </section>
}

const KEY = 'btr-tips'
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
/** Un solo consiglio alla volta, nascosto per sempre su questo telefono quando lo chiudi. */
export function PlanTip() {
  const d = data.value!, [hid, setHid] = useState(seen), t = buildTimeline(planFor(d), d.state), today = todayISO(), p = prefsOf(d)
  const runKm = d.activities.reduce((a, x) => a + (x.type === 'corsa' ? x.km ?? 0 : 0), 0)
  const tip = tipsFor({ slots: t.slots, today, raceDate: d.state.raceDate, runKm, hour: p.hour ?? 6 }).find(x => !hid.includes(x.key))
  const a = tip && articleById(tip.to)
  if (!tip || !a) return null
  const hide = () => { const l = [...hid, tip.key]; setHid(l); try { localStorage.setItem(KEY, JSON.stringify(l)) } catch { /* resta nascosto fino alla prossima apertura */ } }
  return <section class="panel warn" aria-label="Consiglio del momento">
    <p class="eyebrow">Da sapere ora</p>
    <h2>{tip.title}</h2>
    <p>{tip.text}</p>
    <div class="row"><a class="btn ghost" href={`#/impara/${a.id}`}>Leggi</a><button type="button" class="btn ghost" onClick={hide}>Nascondi</button></div>
  </section>
}
