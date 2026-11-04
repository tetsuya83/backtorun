import { data, saveState } from '../api'
import { buildTimeline, DAYS, isCustom, planFor, reviewWeek, sessionDate, sessionKey, slotForDate, strengthDays, type Activity, type Plan, type Slot } from '../../shared/engine'
import { fmtDate, MONTHS, STRENGTH, STRENGTH_LIST, todayISO } from '../guide'
import { BlockList, Gauge, Note } from '../ui'
import { blocksOf } from '../../shared/blocks'
import { learnFor } from '../learn'
import { BodyAlerts } from './Home'
import { PlannedToday } from './Workouts'
import { paceOf, timeOf } from '../fit'
import { hrMaxOf, zoneHint, zonesFrom } from '../../shared/analysis'
import { cooldownFor, routineById, totalOf, warmupFor, type Routine } from '../../shared/training'

export const phaseName = (plan: Plan, p: number) => plan.meta.phases[String(p)] ?? 'Piano'
export const weekLabel = (s: Slot) => s.maintenance ? 'Mantenimento' : `Settimana ${s.week}`

const mins = (r: Routine) => `${Math.round(totalOf(r.steps) / 60)} min`
function SessionHero({ s, date, done, label }: { s: Slot; date: string; done?: Activity; label: string }) {
  const max = hrMaxOf(data.value!)
  const ses = s.sessions.find(x => sessionDate(s, x.day) === date)!
  const hint = zoneHint(`${ses.text} ${ses.fiato ?? ''}`, max ? zonesFrom(max) : null)
  const blocks = blocksOf(ses), art = learnFor(ses.text), warm = warmupFor(ses.text), cool = cooldownFor(ses.text, ses.km), run = ses.km !== 0
  return (
    <section class="hero">
      <p class="eyebrow">{label}</p>
      <h1>{ses.text}</h1>
      {ses.km ? <p class="bigkm"><b>{Math.round(ses.km * 10) / 10}</b> km</p> : null}
      {blocks && blocks.length > 1 && run && <BlockList blocks={blocks} />}
      <Gauge fiato={ses.fiato} fatica={ses.fatica} />
      {hint && <p class="zonehint">{hint}</p>}
      {done
        ? <div class="done"><strong>Registrato</strong><span>{[done.km ? done.km + ' km' : null, timeOf(done.seconds), paceOf(done.km, done.seconds), done.fatica ? `fatica ${done.fatica}` : null].filter(Boolean).join(', ')}</span><a href={`#/registra?id=${done.id}`}>Modifica</a></div>
        : <>
          {run && <a class="btn ghost" href={`#/routine?id=${warm.id}`}>{warm.name}, {mins(warm)}</a>}
          {blocks && run && <a class="btn" href={`#/guida?key=${sessionKey(s, ses.day)}&date=${date}`}>Avvia allenamento guidato</a>}
          <a class={'btn' + (blocks && run ? ' ghost' : '')} href={`#/registra?key=${sessionKey(s, ses.day)}&date=${date}`}>Registra allenamento</a>
        </>}
      {done?.trace?.length ? <a class="btn ghost" href={`#/corsa?id=${done.id}`}>Dettaglio corsa</a> : null}
      {done && <a class="btn ghost" href={`#/routine?id=${cool.id}`}>{cool.name}, {mins(cool)}</a>}
      {art && <a href={`#/impara/${art.id}`}>Cos'è e a cosa serve: {art.title.toLowerCase()}</a>}
    </section>
  )
}

export function Today() {
  const d = data.value!, plan = planFor(d), custom = isCustom(plan), t = buildTimeline(plan, d.state), today = todayISO()
  const first = t.slots[0], slot = slotForDate(t, today)
  const started = today >= first.monday
  const [mn, temp, tip] = MONTHS[+today.slice(5, 7) - 1]
  const ses = slot?.sessions.find(x => sessionDate(slot, x.day) === today)
  const done = slot && ses ? d.activities.find(a => a.sessionKey === sessionKey(slot, ses.day)) : undefined
  // revisione settimana precedente
  const idx = slot ? t.slots.indexOf(slot) : -1
  const prev = idx > 0 ? t.slots[idx - 1] : undefined
  const wd = new Date(today + 'T12:00:00Z').getUTCDay()
  const rv = slot && wd === 0 ? reviewWeek(t, slot, d.activities) : prev ? reviewWeek(t, prev, d.activities) : null
  const nextDate = t.slots.flatMap(s => s.sessions.map(x => sessionDate(s, x.day))).filter(x => x > today).sort()[0] ?? null
  const nextSlot = nextDate ? slotForDate(t, nextDate) : null
  const isStrength = strengthDays(plan).includes(DAYS[(wd + 6) % 7])
  const gymDone = d.activities.find(a => a.type === 'forza' && a.date === today)
  return (
    <div class="stack">
      {!started && <section class="hero">
        <p class="eyebrow">Mancano {Math.ceil((Date.parse(first.monday) - Date.parse(today)) / 864e5)} giorni</p>
        <h1>Si parte il {fmtDate(first.monday, { day: 'numeric', month: 'long' })}, dalla settimana {first.week}</h1>
        {custom ? <a class="btn" href="#/piano">Guarda il piano</a> : <a class="btn" href="#/test">Fai il test della Scala</a>}
      </section>}
      <BodyAlerts />
      {started && slot && ses && <SessionHero s={slot} date={today} done={done} label={`${weekLabel(slot)}, ${phaseName(plan, slot.phase)}${slot.scarico ? ', scarico' : ''}`} />}
      {started && slot && !ses && <section class="hero rest">
        <p class="eyebrow">{weekLabel(slot)}, {phaseName(plan, slot.phase)}</p>
        <h1>{isStrength ? 'Oggi forza' : 'Oggi niente corsa'}</h1>
        <p>{isStrength ? `${STRENGTH[String(slot.phase)] ?? STRENGTH['1']}. ${STRENGTH_LIST}` : wd === 6 ? 'Nuoto o bici facili, se ti va.' : 'Riposo o nuoto facile.'}</p>
        {isStrength && (gymDone ? <div class="done"><strong>Registrato</strong><span>{gymDone.sets?.length ? `${gymDone.sets.length} esercizi` : 'Forza'}{gymDone.fatica ? `, fatica ${gymDone.fatica}` : ''}</span></div> : <>
          <a class="btn" href={`#/forza?date=${today}`}>Inizia la forza</a>
          <a class="btn ghost" href={`#/registra?type=forza&date=${today}`}>Registra senza scheda</a>
        </>)}
        {!isStrength && <a class="btn ghost" href="#/routine?id=mobility">Mobilità, {mins(routineById('mobility')!)}</a>}
      </section>}
      {started && !slot && <section class="hero rest">
        <p class="eyebrow">Piano concluso</p>
        <h1>Bel lavoro</h1>
        <a class="btn" href="#/mio-piano">Scegli il prossimo obiettivo</a>
      </section>}
      {started && rv?.overload && <Note><strong>Fatica sopra le attese per due sedute di fila.</strong> Ripeti questa settimana invece di proseguire.</Note>}
      {started && rv?.canSkip && rv.next && <section class="panel go">
        <h2>Puoi saltare la settimana {rv.next.week}</h2>
        <p>Hai rispettato tutte le condizioni. Se la salti, il calendario si aggiorna da solo.</p>
        <button class="btn" onClick={() => saveState({ ...d.state, skips: [...d.state.skips, rv.next!.week as number] })}>Salta la settimana {rv.next.week}</button>
      </section>}
      <PlannedToday />
      {nextDate && nextSlot && <section class="panel">
        <h2>Prossima corsa: {fmtDate(nextDate, { weekday: 'long', day: 'numeric' })}</h2>
        <p>{nextSlot.sessions.find(x => sessionDate(nextSlot, x.day) === nextDate)?.text}</p>
      </section>}
      <h2 class="phase">Altro</h2>
      <ul class="cards">
        <li><a href="#/allenamenti"><span><b>I miei allenamenti</b><small>Corsa e nuoto salvati, da avviare o mettere nel piano</small></span></a></li>
        <li><a href="#/costruisci"><span><b>Costruisci un allenamento</b><small>Scegli un modello, adatta i blocchi e parti</small></span></a></li>
        <li><a href={`#/forza?date=${today}`}><span><b>Forza</b><small>Scheda guidata, in palestra o a casa</small></span></a></li>
        <li><a href="#/routine"><span><b>Routine e timer libero</b><small>Riscaldamento, mobilità, defaticamento</small></span></a></li>
        <li><a href="#/registra"><span><b>Registra un allenamento</b><small>A mano o da file FIT, GPX, TCX</small></span></a></li>
      </ul>
      <section class="panel quiet">
        <h2>{mn} in zona Milano: {temp}</h2>
        <p>{tip} Valori medi di Milano.</p>
      </section>
    </div>
  )
}
