import { data, saveActivity, saveState } from '../api'
import { addDays, buildTimeline, DAYS, isCustom, planFor, reviewWeek, sessionDate, sessionKey, slotForDate, strengthDays, type Activity, type Plan, type Slot } from '../../shared/engine'
import { fmtDate, MONTHS, painWords, STRENGTH, STRENGTH_LIST, todayISO } from '../guide'
import { Gauge, Note } from '../ui'
import { paceOf, timeOf } from '../fit'

export const phaseName = (plan: Plan, p: number) => plan.meta.phases[String(p)] ?? 'Piano'
export const weekLabel = (s: Slot) => s.maintenance ? 'Mantenimento' : `Settimana ${s.week}`

function SessionHero({ s, date, done, label }: { s: Slot; date: string; done?: Activity; label: string }) {
  const ses = s.sessions.find(x => sessionDate(s, x.day) === date)!
  return (
    <section class="hero">
      <p class="eyebrow">{label}</p>
      <h1>{ses.text}</h1>
      {ses.km ? <p class="bigkm"><b>{Math.round(ses.km * 10) / 10}</b> km</p> : null}
      <Gauge fiato={ses.fiato} fatica={ses.fatica} />
      {done
        ? <div class="done"><strong>Registrato</strong><span>{[done.km ? done.km + ' km' : null, timeOf(done.seconds), paceOf(done.km, done.seconds), done.fatica ? `fatica ${done.fatica}` : null].filter(Boolean).join(', ')}</span><a href={`#/registra?id=${done.id}`}>Modifica</a></div>
        : <a class="btn" href={`#/registra?key=${sessionKey(s, ses.day)}&date=${date}`}>Registra allenamento</a>}
    </section>
  )
}

export function Today() {
  const d = data.value!, plan = planFor(d), custom = isCustom(plan), words = painWords(custom), t = buildTimeline(plan, d.state), today = todayISO()
  const first = t.slots[0], slot = slotForDate(t, today)
  const started = today >= first.monday
  const [mn, temp, tip] = MONTHS[+today.slice(5, 7) - 1]
  const ses = slot?.sessions.find(x => sessionDate(slot, x.day) === today)
  const done = slot && ses ? d.activities.find(a => a.sessionKey === sessionKey(slot, ses.day)) : undefined
  // ginocchio del mattino dopo
  const yest = addDays(today, -1)
  const check = d.activities.find(a => a.type === 'corsa' && a.date === yest && a.swelling == null)
  const lastKnee = [...d.activities].reverse().find(a => a.type === 'corsa')
  const stop = lastKnee && (lastKnee.locked)
  const swollen = lastKnee && !lastKnee.locked && (lastKnee.swelling || (lastKnee.knee ?? 0) > 2)
  // revisione settimana precedente
  const idx = slot ? t.slots.indexOf(slot) : -1
  const prev = idx > 0 ? t.slots[idx - 1] : undefined
  const wd = new Date(today + 'T12:00:00Z').getUTCDay()
  const rv = slot && wd === 0 ? reviewWeek(t, slot, d.activities) : prev ? reviewWeek(t, prev, d.activities) : null
  const nextDate = t.slots.flatMap(s => s.sessions.map(x => sessionDate(s, x.day))).filter(x => x > today).sort()[0] ?? null
  const nextSlot = nextDate ? slotForDate(t, nextDate) : null
  const isStrength = strengthDays(plan).includes(DAYS[(wd + 6) % 7])
  return (
    <div class="stack">
      {!started && <section class="hero">
        <p class="eyebrow">Mancano {Math.ceil((Date.parse(first.monday) - Date.parse(today)) / 864e5)} giorni</p>
        <h1>Si parte il {fmtDate(first.monday, { day: 'numeric', month: 'long' })}, dalla settimana {first.week}</h1>
        {custom ? <a class="btn" href="#/piano">Guarda il piano</a> : <a class="btn" href="#/test">Fai il test della Scala</a>}
      </section>}
      {stop && <Note tone="stop"><strong>{words.stop}</strong> {words.stopText}</Note>}
      {swollen && <Note tone="stop"><strong>{words.warn}</strong> {words.warnText}</Note>}
      {check && <section class="panel">
        <h2>{words.askTitle}</h2>
        <p>{words.ask}</p>
        <div class="row">
          <button class="btn ghost" onClick={() => saveActivity({ ...check, swelling: false })}>No</button>
          <button class="btn ghost danger" onClick={() => saveActivity({ ...check, swelling: true })}>{words.yes}</button>
        </div>
      </section>}
      {started && slot && ses && <SessionHero s={slot} date={today} done={done} label={`${weekLabel(slot)}, ${phaseName(plan, slot.phase)}${slot.scarico ? ', scarico' : ''}`} />}
      {started && slot && !ses && <section class="hero rest">
        <p class="eyebrow">{weekLabel(slot)}, {phaseName(plan, slot.phase)}</p>
        <h1>{isStrength ? 'Oggi forza' : 'Oggi niente corsa'}</h1>
        <p>{isStrength ? `${STRENGTH[String(slot.phase)] ?? STRENGTH['1']}. ${STRENGTH_LIST}` : wd === 6 ? 'Nuoto o bici facili, se ti va.' : 'Riposo o nuoto facile.'}</p>
        {isStrength && <a class="btn" href={`#/registra?type=forza&date=${today}`}>Registra forza</a>}
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
      {nextDate && nextSlot && <section class="panel">
        <h2>Prossima corsa: {fmtDate(nextDate, { weekday: 'long', day: 'numeric' })}</h2>
        <p>{nextSlot.sessions.find(x => sessionDate(nextSlot, x.day) === nextDate)?.text}</p>
      </section>}
      <section class="panel quiet">
        <h2>{mn} in zona Milano: {temp}</h2>
        <p>{tip} Valori medi di Milano.</p>
      </section>
    </div>
  )
}
