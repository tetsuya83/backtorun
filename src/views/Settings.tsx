import { hrMaxOf, observedMax, validHr, zonesFrom } from '../../shared/analysis'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { APP_VERSION } from '../changelog'
import { call, clearLocal, data, load, saveState } from '../api'
import { Field, Note } from '../ui'
import { WeatherSettings } from './Weather'
import { IntervalsSettings } from './Import'
import { RoutingSettings } from './Routes'
import { type Activity } from '../../shared/engine'
import { painText, watchedZones, ZONES } from '../../shared/pain'

const save = (name: string, text: string, type: string) => { const u = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
const CSV = ['date', 'type', 'source', 'km', 'seconds', 'hrAvg', 'hrMax', 'hrLast', 'splits', 'fiato', 'fatica', 'knee', 'pains', 'swelling', 'locked', 'note', 'sessionKey', 'cadence', 'ascent'] as const
const scheda = (a: Activity) => (a.sets ?? []).map(x => `${x.name}: ${x.sets.map(s => (s.kg ? `${s.kg}kg×` : '') + s.reps).join(' ')}`).join(' | ')
const csv = (l: Activity[]) => [[...CSV, 'scheda'].join(';'), ...l.map(a => [...CSV.map(k => k === 'pains' ? (a.pains ?? []).map(p => `${painText(p)} ${p.level}`).join(' | ') || null : a[k]), scheda(a) || null].map(v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n')
interface Person { id: number; name: string; isAdmin: number; activities: number }
function People() {
  const [info, setInfo] = useState<{ users: Person[]; openInvites: number; max: number } | null>(null)
  const [link, setLink] = useState(''), [err, setErr] = useState(''), [copied, setCopied] = useState(false), [what, setWhat] = useState('')
  const refresh = () => call('GET', '/api/admin/users').then(setInfo).catch(e => setErr(e.message))
  useEffect(() => { void refresh() }, [])
  const invite = async (userId?: number, label = 'Invito') => {
    setErr(''); setCopied(false)
    try { const r = await call('POST', '/api/admin/invites', { userId }); setLink(`${location.origin}/#/invito/${r.code}`); setWhat(`${label}: vale ${r.days} giorni e una sola volta.`); void refresh() }
    catch (e: any) { setErr(e.message) }
  }
  const remove = async (p: Person) => {
    if (!confirm(`Eliminare ${p.name} e tutti i suoi allenamenti?`)) return
    try { await call('DELETE', `/api/admin/users/${p.id}`); void refresh() } catch (e: any) { setErr(e.message) }
  }
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'BackToRun', text: 'Il tuo invito a BackToRun', url: link })
      else { await navigator.clipboard.writeText(link); setCopied(true) }
    } catch { /* condivisione annullata */ }
  }
  if (!info) return err ? <p class="err">{err}</p> : <p class="sub pad">Serve la connessione per vedere le persone.</p>
  return <>
    <p class="sub pad">{info.users.length} su {info.max}{info.openInvites ? `, ${info.openInvites} ${info.openInvites === 1 ? 'invito aperto' : 'inviti aperti'}` : ''}. Ognuno vede solo i propri dati.</p>
    <ul class="hist people">{info.users.map(p => <li key={p.id}><div><b>{p.name}</b><span>{p.isAdmin ? 'Amministratore' : `${p.activities} allenamenti`}</span></div>
      {!p.isAdmin && <div class="row"><button type="button" class="link" onClick={() => invite(p.id, `Nuova password per ${p.name}`)}>Nuova password</button><button type="button" class="link danger" onClick={() => remove(p)}>Elimina</button></div>}
    </li>)}</ul>
    <button class="btn ghost" type="button" onClick={() => invite()}>Crea invito</button>
    {link && <section class="panel go"><h2>{what}</h2><input readOnly value={link} aria-label="Link da inviare" onFocus={e => e.currentTarget.select()} /><button class="btn" type="button" onClick={share}>{copied ? 'Link copiato' : 'Invia il link'}</button></section>}
    {err && <p class="err" role="alert">{err}</p>}
  </>
}
function Heart() {
  const d = data.value!, st = d.state, max = hrMaxOf(d), seen = observedMax(d.activities)
  const [v, setV] = useState(max ? String(max) : ''), n = +v
  const put = (x: number | null) => { saveState({ ...st, hrMax: x }); setV(x ? String(x) : '') }
  return <>
    <h2 class="phase">Frequenza cardiaca</h2>
    <Field label="FC massima"><input inputMode="numeric" value={v} placeholder="Per esempio 180" onInput={e => setV(e.currentTarget.value)} onChange={() => { if (validHr(n)) put(n); else if (!v) put(null) }} /></Field>
    {!!v && !validHr(n) && <p class="err">Scrivi un valore tra 120 e 230.</p>}
    {seen != null && (!max || seen > max) && <button type="button" class="btn ghost" onClick={() => put(seen)}>Usa la più alta registrata: {seen}</button>}
    {max ? <table class="splits"><tbody>{zonesFrom(max).map(z => <tr key={z.id}><td>{z.name}</td><td>{z.lo}-{z.hi} bpm</td></tr>)}</tbody></table> : null}
    <p class="sub pad">Il valore più affidabile viene da un test massimale o da una gara corta. Le formule per età possono sbagliare di parecchio.</p>
  </>
}
const Row = ({ href, label, value }: { href: string; label: string; value?: string | null }) => <a class="row-l" href={'#/' + href}><span>{label}</span>{value && <small>{value}</small>}<i aria-hidden="true" /></a>
const Group = ({ title, children }: { title: string; children: ComponentChildren }) => <section class="group"><h2 class="phase">{title}</h2><div class="rows">{children}</div></section>
/** Profilo: un elenco per argomenti, ogni voce apre la sua pagina. */
export function Settings({ onLogout }: { onLogout: () => void }) {
  const d = data.value!, st = d.state, max = hrMaxOf(d), me = d.me
  const zones = watchedZones(d).map(z => ZONES.find(x => x.id === z)?.label).filter(Boolean).join(', ')
  const name = me?.name ? me.name[0].toUpperCase() + me.name.slice(1) : 'Profilo'
  return (
    <div class="stack">
      <section class="me"><span class="avatar" aria-hidden="true">{name[0]}</span><div><h1>{name}</h1>{me?.isAdmin && <small>Amministratore</small>}</div></section>
      <Group title="Corpo">
        <Row href="impostazioni/corpo" label="Battiti e zone" value={max ? `FC max ${max}` : 'Da impostare'} />
        <Row href="impostazioni/corpo" label="Zone da tenere d'occhio" value={zones || 'Nessuna'} />
      </Group>
      <Group title="Collegamenti">
        <Row href="impostazioni/orologio" label="Orologio e importazione" value={[st.watch, me?.intervals ? 'Intervals.icu' : null].filter(Boolean).join(', ') || 'Nessuno'} />
        <Row href="impostazioni/percorsi" label="Percorsi su mappa" value={me?.routing ? 'Collegati' : 'Da collegare'} />
        <Row href="impostazioni/meteo" label="Meteo" value={st.weather?.city ?? (st.weather?.gps ? 'Posizione del telefono' : 'Da impostare')} />
      </Group>
      <Group title="Dati e persone">
        <Row href="impostazioni/dati" label="Backup ed esportazione" />
        {me?.isAdmin && <Row href="impostazioni/persone" label="Persone e inviti" />}
      </Group>
      <Group title="Aiuto">
        <Row href="aiuto" label="Manuale dell'app" />
        <Row href="novita" label="Novità" value={APP_VERSION} />
      </Group>
      {me && <p class="sub pad">Accesso come {me.name}.</p>}
      <button class="btn ghost danger" type="button" onClick={async () => { await call('POST', '/api/logout').catch(() => null); clearLocal(); onLogout() }}>Esci</button>
    </div>
  )
}
function Backup() {
  const d = data.value!, [msg, setMsg] = useState(''), f = useRef<HTMLInputElement>(null), stamp = new Date().toISOString().slice(0, 10)
  const restore = async (file?: File | null) => {
    if (!file) return
    try { const j = JSON.parse(await file.text()); const r = await call('POST', '/api/import', j); await load(); setMsg(`Ripristinati ${r.imported} allenamenti.`) }
    catch (e: any) { setMsg(e.message ?? 'File di backup non valido.') }
  }
  return <>
    <p class="sub pad">Scarica un backup ogni mese: il piano gratuito non è un archivio garantito.</p>
    <div class="row">
      <button class="btn ghost" type="button" onClick={() => save(`backtorun-${stamp}.json`, JSON.stringify({ state: d.state, custom: d.custom ?? null, activities: d.activities, tests: d.tests, workouts: d.workouts ?? [] }), 'application/json')}>Scarica backup</button>
      <button class="btn ghost" type="button" onClick={() => save(`backtorun-${stamp}.csv`, '\ufeff' + csv(d.activities), 'text/csv')}>Scarica CSV</button>
    </div>
    <input ref={f} type="file" accept=".json" hidden onChange={e => restore(e.currentTarget.files?.[0])} />
    <button class="btn ghost" type="button" onClick={() => f.current?.click()}>Ripristina backup</button>
    {msg && <Note tone="go">{msg}</Note>}
  </>
}
function Zones() {
  const d = data.value!, st = d.state
  return <>
    <h2 class="phase">Zone da tenere d'occhio</h2>
    <p class="sub pad">Compaiono sempre quando registri una corsa, così non devi aggiungerle ogni volta.</p>
    <div class="chips">{ZONES.map(z => { const on = watchedZones(d).includes(z.id); return <button type="button" key={z.id} class={on ? 'sel' : ''} aria-pressed={on} onClick={() => saveState({ ...st, zones: on ? watchedZones(d).filter(x => x !== z.id) : [...watchedZones(d), z.id] })}>{z.label}</button> })}</div>
  </>
}
function Watch() {
  const st = data.value!.state
  return <>
    <Field label="Il tuo orologio"><select value={st.watch ?? ''} onChange={e => saveState({ ...st, watch: e.currentTarget.value || null })}><option value="">Nessuno: uso il GPS del telefono</option>{['Suunto', 'Garmin', 'Coros', 'Polar', 'Apple Watch', 'Altro'].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
    <p class="sub pad">Serve a scegliere come misurare la distanza negli allenamenti guidati. I dati si importano da file FIT, GPX o TCX, di qualsiasi marca.</p>
  </>
}
const PAGES: Record<string, [string, () => ComponentChildren]> = {
  corpo: ['Corpo', () => <><Heart /><Zones /></>],
  orologio: ['Orologio e importazione', () => <><Watch /><IntervalsSettings /></>],
  percorsi: ['Percorsi su mappa', () => <RoutingSettings />],
  meteo: ['Meteo', () => <WeatherSettings />],
  dati: ['Backup ed esportazione', () => <Backup />],
  persone: ['Persone e inviti', () => data.value!.me?.isAdmin ? <People /> : <p class="sub pad">Solo chi amministra l'app gestisce le persone.</p>],
}
/** Una pagina del Profilo, con il suo argomento. */
export function SettingsPage({ page }: { page: string }) {
  const p = PAGES[page]
  if (!p) return <div class="stack"><section class="head"><h1>Pagina non trovata</h1></section><a class="btn ghost" href="#/impostazioni">Torna al Profilo</a></div>
  return <div class="stack form"><section class="head"><h1>{p[0]}</h1></section>{p[1]()}</div>
}
