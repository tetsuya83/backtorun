import { useState } from 'preact/hooks'
import { data, saveCustomPlan, saveState } from '../api'
import { isCustom, moveRace, planFor, type State } from '../../shared/engine'
import { Field, nav, Note } from '../ui'

/** Gara e calendario, nel Piano: si salvano solo con il pulsante, per non cambiare nulla per sbaglio. */
export function RaceSettings() {
  const d = data.value!, st = d.state, custom = isCustom(planFor(d))
  const [race, setRace] = useState(st.raceDate ?? ''), [name, setName] = useState(st.raceName ?? '')
  const [start, setStart] = useState(st.startDate), [week, setWeek] = useState(String(st.startWeek))
  const [ok, setOk] = useState(false)
  const changed = race !== (st.raceDate ?? '') || name !== (st.raceName ?? '') || start !== st.startDate || (!custom && +week !== st.startWeek)
  const save = (e: Event) => {
    e.preventDefault()
    let next: State = { ...st, startDate: start || st.startDate, raceName: name.trim() || null }
    if (!custom) next = { ...next, raceDate: race || null, startWeek: Math.min(34, Math.max(1, +week || 1)) }
    else if (race !== (st.raceDate ?? '')) { const m = moveRace(d.custom!, next, race || null); saveCustomPlan(m.plan); next = m.state }
    saveState(next); setOk(true); setTimeout(() => nav('piano'), 600)
  }
  return (
    <form class="stack form" onSubmit={save}>
      <section class="head"><h1>Gara e calendario</h1></section>
      <h2 class="phase">Gara</h2>
      <Field label="Data della gara"><input type="date" value={race} onInput={e => { setRace(e.currentTarget.value); setOk(false) }} /></Field>
      <Field label="Nome della gara"><input value={name} maxLength={60} placeholder="Per esempio Maratona di Milano" onInput={e => { setName(e.currentTarget.value); setOk(false) }} /></Field>
      {custom && <p class="sub pad">Se cambi la data, tutto il calendario si sposta con la gara.</p>}
      <h2 class="phase">Calendario</h2>
      <Field label="Inizio del piano"><input type="date" value={start} onInput={e => { setStart(e.currentTarget.value); setOk(false) }} /></Field>
      {!custom && <Field label="Settimana di partenza"><input inputMode="numeric" value={week} onInput={e => { setWeek(e.currentTarget.value); setOk(false) }} /></Field>}
      {!custom && <p class="sub pad">Il test della Scala la imposta da solo. Cambiandola, il calendario riparte da quella settimana.</p>}
      {ok && <Note tone="go">Salvato.</Note>}
      <button class="btn" disabled={!changed || ok}>{ok ? 'Salvato' : 'Salva'}</button>
    </form>
  )
}
