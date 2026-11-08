import { useMemo, useState } from 'preact/hooks'
import { data, saveState, uid } from '../api'
import { addDays, buildTimeline, planFor } from '../../shared/engine'
import { applyResume, resumeFor, stopGuess, trialPain, undoResume, type Reason } from '../../shared/resume'
import { fmtDate, todayISO } from '../guide'
import { Field, nav, Note } from '../ui'

const REASONS: [Reason, string][] = [['malattia', 'Malattia'], ['dolore', 'Dolore'], ['altro', 'Altro']]
const day = (d: string) => fmtDate(d, { day: 'numeric', month: 'long' })

/** Card in Oggi: nessuna corsa da 8 giorni mentre il piano ne prevedeva. Propone, non cambia nulla da sola. */
export function StopCard() {
  const d = data.value!, today = todayISO(), t = buildTimeline(planFor(d), d.state), seen = d.state.adaptSeen ?? []
  const pain = trialPain(d.state, d.activities)
  const hide = (id: string) => saveState({ ...d.state, adaptSeen: [...seen, id].slice(-60) })
  if (pain && !seen.includes(pain.id)) return <section class="panel warn adapt" aria-label="Uscita di prova">
    <p class="eyebrow">Uscita di prova del {day(pain.date)}</p>
    <h2>Dolore {pain.level} su 10</h2>
    <p>Sopra 2 è meglio non riprendere il piano da soli: fermati ancora qualche giorno e, se non passa, fatti vedere da un medico o da un fisioterapista.</p>
    <div class="row"><a class="btn" href={`#/stop?from=${pain.date}`}>Segna un nuovo stop</a><button type="button" class="btn ghost" onClick={() => hide(pain.id)}>Ho capito</button></div>
  </section>
  const g = stopGuess(t, d.activities, d.state, today)
  if (!g || seen.includes(g.id)) return null
  return <section class="panel warn adapt" aria-label="Ti sei fermato?">
    <p class="eyebrow">Nessuna corsa dal {day(addDays(g.from, -1))}</p>
    <h2>Ti sei fermato?</h2>
    <p>Dimmelo e ti propongo da dove ripartire. Il piano cambia solo se confermi.</p>
    <div class="row"><a class="btn" href={`#/stop?from=${g.from}`}>Sì, segna lo stop</a><button type="button" class="btn ghost" onClick={() => hide(g.id)}>No, era previsto</button></div>
  </section>
}

export function StopView({ route }: { route: string }) {
  const d = data.value!, plan = planFor(d), today = todayISO(), q = new URLSearchParams(route.split('?')[1] ?? '')
  const [from, setFrom] = useState(q.get('from') ?? addDays(today, -7)), [to, setTo] = useState(addDays(today, -1)), [reason, setReason] = useState<Reason>('malattia')
  const t = useMemo(() => buildTimeline(plan, d.state), [plan, d.state])
  const bad = !from || !to ? 'Indica le due date.' : from > to ? 'La fine viene prima dell\'inizio.' : to > today ? 'Segna lo stop quando sei pronto a ripartire: la fine non può essere nel futuro.' : ''
  const p = bad ? null : resumeFor(t, from, to, reason)
  const last = (d.state.resumes ?? []).at(-1)
  const confirm = () => { saveState(applyResume(plan, d.state, from, to, reason, today, uid)); nav('home') }
  return <div class="stack form">
    <section class="head"><h1>Segna uno stop</h1><p>Malattia, dolore o impegni: dimmi quanto sei rimasto fermo e ti propongo da dove ripartire.</p></section>
    <div class="grid2">
      <Field label="Dal"><input type="date" value={from} max={today} onInput={e => setFrom(e.currentTarget.value)} /></Field>
      <Field label="Al"><input type="date" value={to} max={today} onInput={e => setTo(e.currentTarget.value)} /></Field>
    </div>
    <div class="seg" role="group" aria-label="Motivo">{REASONS.map(([k, l]) => <button type="button" key={k} class={reason === k ? 'sel' : ''} aria-pressed={reason === k} onClick={() => setReason(k)}>{l}</button>)}</div>
    {bad && <p class="err" role="alert">{bad}</p>}
    {p && <section class="panel">
      <p class="eyebrow">Proposta: {p.days} {p.days === 1 ? 'giorno' : 'giorni'} di stop</p>
      <h2>{p.week ? `Torna alla settimana ${p.week}` : 'Riprendi da dove eri'}</h2>
      <ol class="steps">
        {p.trial && <li><span><b>Due uscite di prova</b>: corsa facile di 20 minuti, al posto delle prossime due corse del piano.</span></li>}
        {p.week ? <li><span>{p.trial ? 'Se il dolore resta entro 2, ' : ''}da questa settimana fai la <b>settimana {p.week}</b> invece della {p.from}. Il calendario slitta di conseguenza.</span></li>
          : <li><span>{p.days < 7 ? 'Meno di una settimana: non serve tornare indietro.' : p.note ?? 'Il piano resta com\'è.'}</span></li>}
        {reason === 'malattia' && <li><span>Dopo febbre o influenza aspetta almeno un giorno senza sintomi prima di correre.</span></li>}
        {reason === 'dolore' && <li><span>Se durante le prove il dolore supera 2 su 10, fermati e fatti vedere.</span></li>}
      </ol>
      <button type="button" class="btn" onClick={confirm}>Conferma la ripresa</button>
    </section>}
    {last && <Note>Ultima ripresa segnata: stop dal {day(last.from)} al {day(last.to)}{last.week ? `, ripartito dalla settimana ${last.week}` : ''}. <button type="button" class="link" onClick={() => saveState(undoResume(d.state))}>Annullala</button></Note>}
  </div>
}
