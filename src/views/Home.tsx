import { addPlanned, data, saveActivity, saveState, uid } from '../api'
import { nextAdvice, weekAdvice, weekSummary, type Advice } from '../../shared/adapt'
import { addDays, buildTimeline, isCustom, planFor, reviewWeek, sessionDate, sessionKey, slotForDate, DAYS, strengthDays, type Plan, type Slot } from '../../shared/engine'
import { blocksOf, sessionTone } from '../../shared/blocks'
import { painsOf, painText } from '../../shared/pain'
import { fmtDate, MONTHS, PAIN as words, todayISO } from '../guide'
import { itemsOf, listOf, minutesOf, sheetFor } from '../../shared/strength'
import { jointOk } from '../../shared/training'
import { BlockList, nav, Note } from '../ui'
import { PlannedToday } from './Workouts'
import { ImportCard } from './Import'
import { WeatherCard } from './Weather'
import { PlanTip } from './Tools'
import { learnFor } from '../learn'
import { sessionMin } from '../../shared/tips'
import { cooldownFor, routineById, totalOf, warmupFor, type Routine } from '../../shared/training'
import { paceOf, timeOf } from '../fit'
import { StopCard } from './Stop'
import { local, unlockSound } from '../sound'
import { useEffect } from 'preact/hooks'
import { syncWatch } from '../watchSync'
import { WhatsNew } from './WhatsNew'
import { RouteReminder } from './Routes'
import { suggestTest, testDue, testInfo } from '../../shared/tests'

export const phaseName = (plan: Plan, p: number) => plan.meta.phases[String(p)] ?? 'Piano'
export const weekLabel = (s: Slot) => s.maintenance ? 'Mantenimento' : `Settimana ${s.week}`

/** Avvisi sul corpo: stanno in cima a Oggi perché non devono sfuggire. */
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
  play: 'M7 4.5v15l13-7.5z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  route: 'M6 19a2 2 0 1 0 0-.01M18 5a2 2 0 1 0 0-.01M6 17V9a3 3 0 0 1 6 0v6a3 3 0 0 0 6 0V7',
  plus: 'M12 5v14M5 12h14',
  chev: 'M9 6l6 6-6 6',
}
const Ic = ({ d, size = 20 }: { d: string; size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
const mins = (r: Routine) => Math.round(totalOf(r.steps) / 60)
const LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'], WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
/** La settimana: il colore è lo sforzo, viola la forza; pieno con la spunta quando è fatto. Tocca per aprire il piano. */
function WeekStrip() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO(), slot = slotForDate(t, today) ?? (today < t.slots[0].monday ? t.slots[0] : undefined)
  if (!slot) return null
  const days = DAYS.map(day => {
    const ses = slot.sessions.find(x => x.day === day), tone = ses ? sessionTone(ses) : null, date = sessionDate(slot, day)
    const gym = strengthDays(plan).includes(day) && !ses
    const kind = tone?.key ?? (gym ? 'gym' : '')
    const done = ses ? d.activities.some(a => a.sessionKey === sessionKey(slot, day)) : gym && d.activities.some(a => a.type === 'forza' && a.date === date)
    return { kind, done, on: date === today, word: (gym ? 'forza' : tone?.label.toLowerCase() ?? 'libero') + (done ? ', fatto' : '') }
  })
  return <a class="week" href="#/piano" aria-label={`La tua settimana: ${days.map((x, i) => `${WEEKDAYS[i]} ${x.word}`).join(', ')}. Apri il piano`}>{days.map((x, i) => <span key={i} class={x.on ? 'on' : ''}>{LETTERS[i]}<i class={x.kind + (x.done ? ' ok' : '')} /></span>)}</a>
}
const name = (s?: string) => s ? s[0].toUpperCase() + s.slice(1) : ''
/** Parti: il cronometro si apre e comincia da solo, senza la pagina di preparazione. */
const go = (url: string) => { unlockSound(); nav(url) }
function TodayCard() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO(), first = t.slots[0]
  const slot = slotForDate(t, today), ses = slot?.sessions.find(x => sessionDate(slot, x.day) === today)
  const key = slot && ses ? sessionKey(slot, ses.day) : ''
  const done = key ? d.activities.find(a => a.sessionKey === key) : undefined
  const wd = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7, force = strengthDays(plan).includes(DAYS[wd]) && !ses
  const gym = d.activities.find(a => a.type === 'forza' && a.date === today)
  const started = today >= first.monday
  if (!started) return <section class="panel today-c">
    <p class="eyebrow">Mancano {Math.ceil((Date.parse(first.monday) - Date.parse(today)) / 864e5)} giorni</p>
    <h2>Si parte il {fmtDate(first.monday, { day: 'numeric', month: 'long' })}, dalla settimana {first.week}</h2>
    <a class="btn ghost" href="#/piano">Guarda il piano</a>
  </section>
  if (!slot) return <section class="panel today-c"><p class="eyebrow">Piano concluso</p><h2>Bel lavoro</h2><a class="btn" href="#/mio-piano">Scegli il prossimo obiettivo</a></section>
  const label = `Oggi · ${weekLabel(slot)} · ${phaseName(plan, slot.phase)}${slot.scarico ? ', scarico' : ''}`
  const sh = force ? sheetFor(plan, t, slot, today) : null, sheet = sh?.sheet
  const place = local.get<'palestra' | 'casa'>('btr-forza-luogo') ?? 'palestra'
  if (!ses) return <section class="panel today-c">
    <p class="eyebrow">{label}</p>
    <h2>{sheet ? `Oggi forza: ${sheet.letter === 'R' ? 'scheda' : 'scheda ' + sheet.letter}` : force ? 'Oggi niente forza' : 'Oggi niente corsa'}</h2>
    <p>{sheet ? <><b>{sheet.name}</b>, circa {minutesOf(itemsOf(sheet, place, slot.phase, slot.scarico, jointOk(d.activities)))} minuti {place === 'casa' ? 'a corpo libero' : 'in palestra'}. {listOf(sheet, place)}.</> : sh?.why ?? (wd === 5 ? 'Nuoto o bici facili, se ti va.' : 'Recupera: il corpo migliora anche a riposo.')}</p>
    {sheet ? gym ? <div class="done"><strong>Registrato</strong><span>{gym.sets?.length ? `${gym.sets.length} esercizi` : 'Forza'}{gym.fatica ? `, fatica ${gym.fatica}` : ''}</span><a href={`#/registra?id=${gym.id}`}>Modifica</a></div>
      : <><button type="button" class="btn" onClick={() => nav(`forza?date=${today}`)}>Inizia la forza</button><a class="ses-l" href={`#/registra?type=forza&date=${today}`}>Registra senza scheda</a></>
      : <a class="btn ghost" href="#/routine?id=mobility">Mobilità, {mins(routineById('mobility')!)} min</a>}
  </section>
  const run = ses.km !== 0, blocks = run ? blocksOf(ses) : null, tone = sessionTone(ses), art = learnFor(ses.text), warm = warmupFor(ses.text), cool = cooldownFor(ses.text, ses.km)
  const route = d.routes?.find(x => x.session?.key === key)
  const facts = [run ? `${sessionMin(ses)} min` : null, ses.fiato ? `fiato: ${ses.fiato.toLowerCase()}` : null, ses.fatica ? `fatica ${ses.fatica}${/^\d/.test(ses.fatica) ? ' su 10' : ''}` : null].filter(Boolean).join(' · ')
  return <section class="panel today-c">
    <div class="pill-row"><p class="eyebrow">{label}</p>{tone && <span class={'pill ' + tone.key}>{tone.label}</span>}</div>
    <h2>{ses.text}</h2>
    {blocks && <BlockList blocks={blocks} compact />}
    {facts && <p class="facts-l">{facts}</p>}
    {done ? <>
      <div class="done"><strong>Registrato</strong><span>{[done.km ? done.km + ' km' : null, timeOf(done.seconds), paceOf(done.km, done.seconds), done.fatica ? `fatica ${done.fatica}` : null].filter(Boolean).join(', ') || 'Bel lavoro'}</span><a href={`#/registra?id=${done.id}`}>Modifica</a></div>
      <div class="quick">
        <a href={`#/routine?id=${cool.id}`}><Ic d={ICON.clock} />{cool.name}</a>
        {done.trace?.length ? <a href={`#/corsa?id=${done.id}`}><Ic d={ICON.route} />Dettaglio corsa</a> : null}
      </div>
    </> : <>
      {blocks ? <button type="button" class="btn go" onClick={() => go(`guida?key=${key}&date=${today}&go=1`)}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d={ICON.play} /></svg>Parti</button>
        : <a class="btn" href={`#/registra?key=${key}&date=${today}`}>Registra</a>}
      {run && <div class="quick">
        <a href={`#/routine?id=${warm.id}`}><Ic d={ICON.clock} />Riscaldamento {mins(warm)}'</a>
        <a href={route ? `#/percorsi/${route.id}` : `#/percorsi/nuovo?key=${encodeURIComponent(key)}&date=${today}&km=${ses.km ?? 0}&label=${encodeURIComponent(ses.text)}`}><Ic d={ICON.route} />{route ? 'Il percorso' : 'Percorso'}</a>
        <a href={`#/registra?key=${key}&date=${today}`}><Ic d={ICON.plus} />Registra a mano</a>
      </div>}
    </>}
    {art && <a class="ses-l" href={`#/impara/${art.id}`}>Cos'è e a cosa serve: {art.title.toLowerCase()}</a>}
    {run && sessionMin(ses) >= 60 && <a class="ses-l" href="#/impara/calcolatore-lungo">Cosa portare da mangiare e bere</a>}
  </section>
}
/** Il piano che si adatta: propone, e cambia solo se confermi. */
function adviceNow() {
  const d = data.value!, t = buildTimeline(planFor(d), d.state), today = todayISO(), slot = slotForDate(t, today), seen = d.state.adaptSeen ?? []
  if (!slot || today < t.slots[0].monday) return { t, slot, week: null, next: null }
  const idx = t.slots.indexOf(slot), prev = idx > 0 ? t.slots[idx - 1] : undefined, wd = new Date(today + 'T12:00:00Z').getUTCDay()
  const pendingToday = slot.sessions.some(x => x.km !== 0 && sessionDate(slot, x.day) === today && !d.activities.some(a => a.sessionKey === sessionKey(slot, x.day)))
  const startedNow = d.activities.some(a => a.date >= slot.monday && a.date <= today && a.type === 'corsa')
  const ended = wd === 0 && !pendingToday ? slot : wd === 1 && prev && !startedNow ? prev : null
  const week = ended ? weekAdvice(t, ended, d.activities) : null, next = nextAdvice(t, d.activities, today)
  return { t, slot, week: week && !seen.includes(week.id) ? week : null, next: next && !seen.includes(next.id) ? next : null }
}
function Advise({ a, yes, label }: { a: Advice; yes: () => void; label: string }) {
  const d = data.value!, no = () => saveState({ ...d.state, adaptSeen: [...(d.state.adaptSeen ?? []), a.id].slice(-60) })
  return <section class="panel warn adapt" aria-label="Proposta del piano">
    <p class="eyebrow">Proposta del piano</p>
    <h2>{a.title}</h2>
    <ul class="dots">{a.reasons.map(r => <li key={r}><span>{r}</span></li>)}</ul>
    <p>{a.kind === 'repeat' ? 'Ripetere una settimana costa poco e dà tempo al corpo di adattarsi. Il calendario slitta di una settimana.' : `${fmtDate(a.date!, { weekday: 'long', day: 'numeric' })}: corsa facile di ${a.minutes} minuti al posto di ${a.ses!.text.toLowerCase()}. La seduta del piano torna se annulli la sostituzione.`}</p>
    <div class="row"><button type="button" class="btn" onClick={yes}>{label}</button><button type="button" class="btn ghost" onClick={no}>Prosegui come previsto</button></div>
  </section>
}
function Review() {
  const d = data.value!, today = todayISO(), { t, slot, week, next } = adviceNow()
  if (!slot) return null
  const seen = d.state.adaptSeen ?? [], idx = t.slots.indexOf(slot), prev = idx > 0 ? t.slots[idx - 1] : undefined, sunday = new Date(today + 'T12:00:00Z').getUTCDay() === 0
  const rv = sunday ? reviewWeek(t, slot, d.activities) : prev ? reviewWeek(t, prev, d.activities) : null
  return <>
    {week && <Advise a={week} label={`Ripeti la settimana ${week.week}`} yes={() => saveState({ ...d.state, repeats: [...d.state.repeats, week.week!], adaptSeen: [...seen, week.id].slice(-60) })} />}
    {!week && next && <Advise a={next} label="Alleggerisci" yes={() => { addPlanned({ id: uid(), name: 'Seduta alleggerita', sport: 'corsa', text: `Corsa facile ${next.minutes}' (alleggerita)`, km: null, blocks: [{ kind: 'run', part: { sec: next.minutes! * 60, effort: 'easy' } }], fiato: 'Frasi complete', fatica: '3', date: next.date!, mode: 'replace' }); saveState({ ...data.value!.state, adaptSeen: [...seen, next.id].slice(-60) }) }} />}
    {!week && rv?.canSkip && rv.next && <section class="panel go">
      <h2>Puoi saltare la settimana {rv.next.week}</h2>
      <p>Hai rispettato tutte le condizioni. Se la salti, il calendario si aggiorna da solo.</p>
      <button class="btn" onClick={() => saveState({ ...d.state, skips: [...d.state.skips, rv.next!.week as number] })}>Salta la settimana {rv.next.week}</button>
    </section>}
  </>
}
function Reminder() {
  const d = data.value!, t = buildTimeline(planFor(d), d.state), today = todayISO(), end = addDays(today, 2)
  const sessions = t.slots.flatMap(s => s.sessions.filter(x => x.km !== 0).map(x => ({ key: sessionKey(s, x.day), date: sessionDate(s, x.day) }))).filter(x => x.date >= today && x.date < end)
  return <RouteReminder sessions={sessions} today={today} />
}
/** Riepilogo della domenica, visibile anche il lunedì. */
function WeekSummary() {
  const d = data.value!, t = buildTimeline(planFor(d), d.state), today = todayISO(), cur = slotForDate(t, today), wd = new Date(today + 'T12:00:00Z').getUTCDay()
  if (!cur || today < t.slots[0].monday) return null
  const slot = wd === 0 ? cur : wd === 1 ? t.slots[t.slots.indexOf(cur) - 1] : null, id = slot ? `sum-${slot.key}` : ''
  if (!slot || (d.state.adaptSeen ?? []).includes(id)) return null
  const s = weekSummary(t, slot, d.activities), h = Math.floor(s.minutes / 60), m = s.minutes % 60
  const rows: [string, string][] = [
    ['Corse', `${s.done} su ${s.planned}`],
    ['Chilometri', `${String(s.km).replace('.', ',')}${s.kmPlan ? ` su ${s.kmPlan}` : ''}`],
    ['Tempo di corsa', h ? `${h} h ${m} min` : `${m} min`],
    ...(s.fatica != null ? [['Fatica media', `${String(s.fatica).replace('.', ',')}${s.faticaPlan ? `, attesa ${String(s.faticaPlan).replace('.', ',')}` : ''}`] as [string, string]] : []),
    ['Forza', s.strength === 1 ? '1 seduta' : `${s.strength} sedute`],
    ...(s.pain ? [['Dolore più alto', `${s.pain.level}, ${s.pain.text.toLowerCase()}`] as [string, string]] : []),
  ]
  return <section class="panel sum-w" aria-label="Riepilogo della settimana">
    <p class="eyebrow">Riepilogo · {weekLabel(slot)}</p>
    <h2>{s.done >= s.planned ? 'Settimana completa' : s.done ? 'Settimana in parte' : 'Settimana saltata'}</h2>
    <dl class="sum-g">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {s.next && wd === 0 && <p class="sub">Prossima: {weekLabel(s.next.slot).toLowerCase()}{s.next.km ? `, ${s.next.km} km` : ''}{s.next.long ? `, il più lungo è ${s.next.long.toLowerCase()}` : ''}.</p>}
    <button type="button" class="link" onClick={() => saveState({ ...d.state, adaptSeen: [...(d.state.adaptSeen ?? []), id].slice(-60) })}>Chiudi il riepilogo</button>
  </section>
}
/** Test di controllo: facoltativo, ogni 8 settimane, solo se ne hai già fatto uno. */
function TestReminder() {
  const d = data.value!, plan = planFor(d), t = buildTimeline(plan, d.state), today = todayISO(), slot = slotForDate(t, today)
  if (!slot || today < t.slots[0].monday) return null
  const soon = t.slots.some(s => s.sessions.some(x => /\btest\b/i.test(x.text) && sessionDate(s, x.day) >= today && sessionDate(s, x.day) <= addDays(today, 14)))
  const due = testDue({ tests: d.tests, today, scarico: !!slot.scarico, planTestSoon: soon, off: d.state.testRemind === false, snooze: d.state.testSnooze })
  if (!due) return null
  const sug = suggestTest(d.activities, today, isCustom(plan) || typeof slot.week !== 'number' ? null : slot.week)
  return <section class="panel warn" aria-label="Test di controllo">
    <p class="eyebrow">Test di controllo, facoltativo</p>
    <h2>{due.weeks} settimane dall'ultimo test</h2>
    <p>{slot.scarico ? 'Questa è una settimana di scarico: il momento giusto per misurarti.' : 'Fallo quando vuoi, dopo un giorno facile.'} Ti consiglio {testInfo(sug.kind)!.name.replace(/^La /, 'la ')}.</p>
    <div class="row"><a class="btn ghost" href={`#/test?k=${sug.kind}`}>Apri il test</a><button type="button" class="btn ghost" onClick={() => saveState({ ...d.state, testSnooze: addDays(today, 28) })}>Tra 4 settimane</button></div>
    <button type="button" class="link" onClick={() => saveState({ ...d.state, testRemind: false })}>Non propormelo più</button>
  </section>
}
function NextRun() {
  const d = data.value!, t = buildTimeline(planFor(d), d.state), today = todayISO()
  const next = t.slots.flatMap(s => s.sessions.filter(x => x.km !== 0).map(x => ({ date: sessionDate(s, x.day), x }))).filter(x => x.date > today).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!next) return null
  return <a class="card-l" href="#/piano"><span><small>Prossima corsa · {fmtDate(next.date, { weekday: 'long', day: 'numeric' })}</small><b>{next.x.text}</b></span><Ic d={ICON.chev} size={16} /></a>
}
export function Home() {
  useEffect(() => { void syncWatch() }, [data.value?.state, data.value?.me?.intervals])
  const d = data.value!, today = todayISO(), [mn, , tip] = MONTHS[+today.slice(5, 7) - 1]
  return <div class="stack">
    <WhatsNew />
    <section class="home-h"><p>{fmtDate(today)}</p><h1>{d.me?.name ? `Ciao ${name(d.me.name)}` : 'Ciao'}</h1></section>
    <div class="cols"><div class="col">
    <BodyAlerts />
    <ImportCard />
    <WeekStrip />
    <TodayCard />
    <Reminder />
    <StopCard />
    <Review />
    <WeekSummary />
    <TestReminder />
    <PlannedToday />
    <NextRun />
    </div><div class="col">
    <WeatherCard />
    <PlanTip />
    <section>
      <h2 class="phase">Altri allenamenti</h2>
      <ul class="cards">
        <li><a href="#/allenamenti"><span><b>I miei allenamenti</b><small>Corsa e nuoto salvati, da avviare o mettere nel piano</small></span></a></li>
        <li><a href="#/costruisci"><span><b>Costruisci un allenamento</b><small>Scegli un modello, adatta i blocchi e parti</small></span></a></li>
        <li><a href={`#/forza?date=${today}`}><span><b>Forza</b><small>Schede A e B per fase, in palestra o a corpo libero</small></span></a></li>
        <li><a href="#/routine"><span><b>Routine e timer libero</b><small>Riscaldamento, mobilità, defaticamento</small></span></a></li>
        <li><a href="#/percorsi"><span><b>Percorsi</b><small>Disegnali sulla mappa e mandali all'orologio</small></span></a></li>
      </ul>
    </section>
    <section class="panel quiet"><h2>Consiglio di {mn.toLowerCase()}</h2><p>{tip}</p></section>
    </div></div>
  </div>
}
