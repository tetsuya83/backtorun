import { useEffect, useState } from 'preact/hooks'
import { call, checkImports, data, imports, setIntervalsLinked, skipImport } from '../api'
import { mergeTarget, pendingImports, type Remote } from '../../shared/intervals'
import { fmtDate } from '../guide'
import { paceOf, timeOf } from '../fit'
import { Field, nav, Note } from '../ui'

const SPORT = { corsa: 'Corsa', forza: 'Forza', nuoto: 'Nuoto', bici: 'Bici', altro: 'Altro' }
const link = (r: Remote) => {
  const m = mergeTarget(r, data.value!.activities)
  return `registra?intervals=${r.id}&date=${r.date}&type=${r.type}${m ? `&id=${m.id}` : ''}`
}
const facts = (r: Remote) => [SPORT[r.type], r.km ? `${r.km} km` : null, timeOf(r.seconds), paceOf(r.km, r.seconds)].filter(Boolean).join(' · ')

/** In Home: gli allenamenti nuovi arrivati dall'orologio, da confermare uno per uno. */
export function ImportCard() {
  const d = data.value!, on = !!d.me?.intervals
  useEffect(() => {
    if (!on) return
    void checkImports().catch(() => {})
    const wake = () => { if (document.visibilityState === 'visible') void checkImports().catch(() => {}) }
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [on])
  const list = on ? pendingImports(imports.value, d.activities) : []
  if (!list.length) return null
  return <section class="panel import">
    <h2>{list.length === 1 ? 'Nuovo allenamento dall\'orologio' : `${list.length} allenamenti dall'orologio`}</h2>
    {list.slice(0, 3).map(r => <div key={r.id} class="imp">
      <p><b>{fmtDate(r.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b><span>{facts(r)}</span></p>
      <div class="row"><button class="btn" onClick={() => nav(link(r))}>Importa</button><button class="btn ghost" onClick={() => skipImport(r.id)}>Ignora</button></div>
    </div>)}
    {list.length > 3 && <p class="sub">Gli altri compaiono man mano.</p>}
  </section>
}

/** In Profilo: la chiave resta sul server e non torna più sul telefono. */
export function IntervalsSettings() {
  const on = !!data.value!.me?.intervals
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('')
  const say = (r: any) => {
    const n = r.items?.length ?? 0
    setMsg(`${n === 1 ? 'Trovato 1 allenamento recente.' : n ? `Trovati ${n} allenamenti recenti.` : 'Nessun allenamento recente da importare.'}${r.strava ? ` Quelli arrivati da Strava (${r.strava}) non sono leggibili: collega l'orologio direttamente a Intervals.icu.` : ''}`)
  }
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); setMsg(''); try { await f() } catch (e: any) { setErr(e.message ?? 'Operazione non riuscita.') } finally { setBusy(false) } }
  const connect = (e: Event) => {
    e.preventDefault()
    void run(async () => { await call('PUT', '/api/intervals/key', { key }); setKey(''); setIntervalsLinked(true); say(await checkImports(true)) })
  }
  const check = () => run(async () => say(await checkImports(true)))
  const remove = () => { if (confirm('Scollegare Intervals.icu? La chiave viene cancellata, gli allenamenti già importati restano.')) void run(async () => { await call('DELETE', '/api/intervals/key'); setIntervalsLinked(false) }) }
  return <>
    <h2 class="phase">Importazione automatica</h2>
    {on ? <>
      <p class="sub pad">Collegato a Intervals.icu. Quando apri l'app, i nuovi allenamenti compaiono in Home e li confermi tu.</p>
      <div class="row"><button type="button" class="btn ghost" disabled={busy} onClick={check}>Controlla ora</button><button type="button" class="btn ghost danger" disabled={busy} onClick={remove}>Scollega</button></div>
    </> : <form class="stack" onSubmit={connect}>
      <p class="sub pad">Collega l'orologio a un account <a href="https://intervals.icu" target="_blank" rel="noopener">Intervals.icu</a> gratuito, poi copia qui la chiave API che trovi in fondo alle sue impostazioni. Trattala come una password.</p>
      <Field label="Chiave API di Intervals.icu"><input type="password" autocomplete="off" value={key} onInput={e => setKey(e.currentTarget.value)} required /></Field>
      <button class="btn ghost" disabled={busy || !key.trim()}>{busy ? 'Controllo la chiave…' : 'Collega'}</button>
    </form>}
    {msg && <Note tone="go">{msg}</Note>}
    {err && <p class="err pad">{err}</p>}
  </>
}
