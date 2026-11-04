import { data, saveActivity } from '../api'
import { addDays, buildTimeline, isCustom, planFor, sessionDate, sessionKey, slotForDate, DAYS, strengthDays } from '../../shared/engine'
import { blocksOf, sessionTone } from '../../shared/blocks'
import { painsOf, painText } from '../../shared/pain'
import { fmtDate, PAIN as words, STRENGTH, todayISO } from '../guide'
import { BlockList, Note } from '../ui'
import { History } from './Log'
import { PlannedToday } from './Workouts'
import { WeatherCard } from './Weather'
import { PlanTip } from './Tools'
import { weekLabel } from './Today'
import { APP_VERSION } from '../changelog'

/** Avvisi sul corpo: stanno in Home e in Allenati perché non devono sfuggire. */
export function BodyAlerts() {
  const d = data.value!, custom = isCustom(planFor(d)), today = todayISO(), yest = addDays(today, -1)
  const lastRun = [...d.activities].reverse().find(a => a.type === 'corsa')
  const worst = lastRun ? [...painsOf(lastRun, custom ? 'altro' : 'ginocchio')].sort((a, b) => b.level - a.level)[0] : undefined
  const other = !!worst && worst.level > 0 && worst.zone !== 'ginocchio' && worst.zone !== 'altro'
  const who = other ? `${painText(worst!)}. ` : ''
  const check = d.activities.find(a => a.type === 'corsa' && a.date === yest && a.swelling == null)
  const stop = lastRun?.locked, swollen = lastRun && !lastRun.locked && (lastRun.swelling || (lastRun.knee ?? 0) > 2)
  return <>
    {stop && <Note tone="stop"><strong>{who}{words.stop}</strong> {words.stopText}</Note>}
    {swollen && <Note tone="stop"><strong>{who}{words.warn}</strong> {words.warnText}</Note>}
    {check && <section class="panel">
      <h2>{words.askTitle}</h2>
      <p>{other ? `Dopo la corsa di ieri hai gonfiore? Avevi segnalato: ${painText(worst!).toLowerCase()}.` : words.ask}</p>
      <div class="row">
        <button class="btn ghost" onClick={() => saveActivity({ ...check, swelling: false })}>No</button>
        <button class="btn ghost danger" onClick={() => saveActivity({ ...check, swelling: true })}>{other ? 'Sì, ho gonfiore' : words.yes}</button>
      </div>
    </section>}
  </>
}
const ICON = {
  run: 'M13 5a2 2 0 1 0 0-.01M7 21l3-6 3 2v4M5 12l4-3 4 1 3 3h3M10 15l1-6',
  book: 'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z',
  chart: 'M5 19v-6M12 19V6M19 19v-9',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
}
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
const LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'], WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
/** La settimana a colpo d'occhio: il colore del pallino è lo sforzo, viola la forza. */
function WeekStrip() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO(), slot = slotForDate(t, today) ?? (today < t.slots[0].monday ? t.slots[0] : undefined)
  if (!slot) return null
  const days = DAYS.map(day => {
    const ses = slot.sessions.find(x => x.day === day), tone = ses ? sessionTone(ses) : null
    const kind = tone?.key ?? (strengthDays(plan).includes(day) && !ses ? 'gym' : '')
    return { kind, on: sessionDate(slot, day) === today, word: kind === 'gym' ? 'forza' : tone?.label.toLowerCase() ?? 'libero' }
  })
  return <div class="week" role="img" aria-label={`La tua settimana: ${days.map((x, i) => `${WEEKDAYS[i]} ${x.word}`).join(', ')}`}>{days.map((x, i) => <span key={i} class={x.on ? 'on' : ''}>{LETTERS[i]}<i class={x.kind} /></span>)}</div>
}
const name = (s?: string) => s ? s[0].toUpperCase() + s.slice(1) : ''
export function Home() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO(), first = t.slots[0]
  const slot = slotForDate(t, today), ses = slot?.sessions.find(x => sessionDate(slot, x.day) === today)
  const done = slot && ses ? d.activities.find(a => a.sessionKey === sessionKey(slot, ses.day)) : undefined
  const wd = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7, force = strengthDays(plan).includes(DAYS[wd]) && !ses
  const gym = d.activities.find(a => a.type === 'forza' && a.date === today)
  const blocks = ses && ses.km !== 0 ? blocksOf(ses) : null, key = slot && ses ? sessionKey(slot, ses.day) : ''
  const started = today >= first.monday, tone = started && ses ? sessionTone(ses) : null
  return <div class="stack">
    <section class="home-h"><p>{fmtDate(today)}</p><h1>{d.me?.name ? `Ciao ${name(d.me.name)}` : 'Ciao'}</h1><p>Cosa vuoi fare oggi?</p></section>
    <BodyAlerts />
    <WeekStrip />
    <section class="panel today-c">
      <div class="pill-row"><p class="eyebrow">{started && slot ? `Oggi · ${weekLabel(slot)}` : 'Oggi'}</p>{tone && <span class={'pill ' + tone.key}>{tone.label}</span>}</div>
      {!started && <><h2>Si parte il {fmtDate(first.monday, { day: 'numeric', month: 'long' })}</h2><a class="btn ghost" href="#/piano">Guarda il piano</a></>}
      {started && ses && <><h2>{ses.text}</h2>{blocks && <BlockList blocks={blocks} compact />}
        {done ? <div class="done"><strong>Registrato</strong><span>Bel lavoro</span></div> : blocks ? <a class="btn" href={`#/guida?key=${key}&date=${today}`}>Inizia l'allenamento</a> : <a class="btn ghost" href="#/oggi">Apri la seduta</a>}</>}
      {started && slot && !ses && <><h2>{force ? 'Oggi forza' : 'Oggi niente corsa'}</h2><p>{force ? STRENGTH[String(slot.phase)] ?? STRENGTH['1'] : 'Recupera: il corpo migliora anche a riposo.'}</p>
        {force ? gym ? <div class="done"><strong>Registrato</strong><span>Bel lavoro</span></div> : <a class="btn" href={`#/forza?date=${today}`}>Inizia la forza</a> : <a class="btn ghost" href="#/routine?id=mobility">Mobilità del giorno di riposo</a>}</>}
      {started && !slot && <><h2>Piano concluso</h2><a class="btn" href="#/mio-piano">Scegli il prossimo obiettivo</a></>}
    </section>
    <PlannedToday />
    <WeatherCard />
    <PlanTip />
    <nav class="tiles" aria-label="Sezioni">
      <a href="#/oggi"><span class="tile-i t-blue"><Ic d={ICON.run} /></span><b>Allenati</b></a>
      <a href="#/consulta"><span class="tile-i t-green"><Ic d={ICON.chart} /></span><b>Consulta</b></a>
      <a href="#/impara"><span class="tile-i t-violet"><Ic d={ICON.book} /></span><b>Impara</b></a>
      <a href="#/impostazioni"><span class="tile-i t-grey"><Ic d={ICON.user} /></span><b>Profilo</b></a>
    </nav>
    <a class="btn ghost" href="#/aiuto">Guida</a>
    <a class="version" href="#/novita" aria-label={`Versione ${APP_VERSION}: guarda le novità`}>Versione {APP_VERSION} · Novità</a>
  </div>
}
export function Consult() {
  const items = [['piano', 'Il piano', 'Tutte le settimane e le sedute'], ['andamento', 'Andamento', 'Km, fatica, dolori ed efficienza'], ['test', 'Test della Scala', 'Misura il punto di partenza'], ['mio-piano', 'Il mio piano', 'Cambia piano o creane uno nuovo']]
  return <div class="stack"><section class="head"><h1>Consulta</h1><p>Il tuo percorso, i tuoi numeri.</p></section>
    <ul class="cards">{items.map(([id, t, s]) => <li key={id}><a href={'#/' + id}><span><b>{t}</b><small>{s}</small></span></a></li>)}</ul>
    <History /></div>
}
