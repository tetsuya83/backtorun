import { boundsOf, hrMaxOf, observedMax, setBound, validBounds, validHr, validRest, zonesManual, zonesOf } from '../../shared/analysis'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { APP_VERSION } from '../changelog'
import { call, clearLocal, data, load, saveState, uid } from '../api'
import { Field, Note } from '../ui'
import { fmtDate, todayISO } from '../guide'
import { DEFAULT_LIMIT, shoeUse, type ShoeUse } from '../../shared/shoes'
import { WeatherSettings } from './Weather'
import { IntervalsSettings } from './Import'
import { RoutingSettings } from './Routes'
import { currentSub, disablePush, enablePush, pushSupported } from '../push'
import { type Activity, type Shoe } from '../../shared/engine'
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
const MODES = [['max', 'Da FC max'], ['riserva', 'Max e riposo'], ['mano', 'A mano']] as const
const ZNAME = ['Recupero', 'Facile', 'Medio', 'Forte', 'Massimo']
function Heart() {
  const d = data.value!, st = d.state, max = hrMaxOf(d), seen = observedMax(d.activities), hz = st.hrZones
  const [v, setV] = useState(max ? String(max) : ''), n = +v
  const [mode, setMode] = useState<'max' | 'riserva' | 'mano'>(hz?.mode ?? 'max'), [rest, setRest] = useState(hz?.rest ? String(hz.rest) : '')
  const cur = zonesOf(d), [b, setB] = useState<number[] | null>(() => validBounds(hz?.bounds) ? hz!.bounds! : cur ? boundsOf(cur) : null), [saved, setSaved] = useState(false)
  const put = (x: number | null) => { saveState({ ...st, hrMax: x }); setV(x ? String(x) : '') }
  const pick = (m: typeof mode) => { setMode(m); setSaved(false); if (m === 'max') saveState({ ...st, hrZones: hz ? { ...hz, mode: 'max' } : null }); if (m === 'mano' && !b && cur) setB(boundsOf(cur)) }
  const putRest = () => { const r = +rest; if (validRest(r)) saveState({ ...st, hrZones: { ...hz, mode: 'riserva', rest: r } }) }
  const edit = (i: number, x: string) => { const n = +x; if (b && Number.isFinite(n) && n >= 40 && n <= 240) { setB(setBound(b, i, n)); setSaved(false) } }
  const shown = mode === 'mano' && b ? zonesManual(b) : cur
  return <>
    <h2 class="phase">Frequenza cardiaca</h2>
    <Field label="FC massima"><input inputMode="numeric" value={v} placeholder="Per esempio 180" onInput={e => setV(e.currentTarget.value)} onChange={() => { if (validHr(n)) put(n); else if (!v) put(null) }} /></Field>
    {!!v && !validHr(n) && <p class="err">Scrivi un valore tra 120 e 230.</p>}
    {seen != null && (!max || seen > max) && <button type="button" class="btn ghost" onClick={() => put(seen)}>Usa la più alta registrata: {seen}</button>}
    <h2 class="phase">Zone cardio</h2>
    <div class="seg" role="group" aria-label="Come calcolare le zone">{MODES.map(([k, l]) => <button type="button" key={k} class={mode === k ? 'sel' : ''} aria-pressed={mode === k} onClick={() => pick(k)}>{l}</button>)}</div>
    {mode === 'riserva' && <>
      <Field label="FC a riposo, appena sveglio"><input inputMode="numeric" value={rest} placeholder="Per esempio 55" onInput={e => setRest(e.currentTarget.value)} onChange={putRest} /></Field>
      {!!rest && !validRest(+rest) && <p class="err">Scrivi un valore tra 30 e 100.</p>}
      {!max && <p class="sub pad">Serve anche la FC massima.</p>}
    </>}
    {mode === 'mano' && !b && <p class="sub pad">Scrivi prima la FC massima: le zone partono da lì e poi le cambi come vuoi.</p>}
    {shown && (mode === 'mano' ? <section class="panel zones-ed">
      <div class="zrow head"><span /><span /><span>da</span><span /><span>a</span></div>
      {shown.map((z, i) => <div class="zrow" key={z.id}><b class={'zdot z' + z.id}>{z.name}</b><span>{ZNAME[i]}</span>
        <input inputMode="numeric" aria-label={`${z.name} da`} value={z.lo} onChange={e => edit(i === 0 ? 0 : i - 1, i === 0 ? e.currentTarget.value : String(+e.currentTarget.value - 1))} /><span>–</span>
        <input inputMode="numeric" aria-label={`${z.name} a`} value={z.hi} onChange={e => edit(i + 1, e.currentTarget.value)} /></div>)}
    </section> : <table class="splits"><tbody>{shown.map((z, i) => <tr key={z.id}><td>{z.name} · {ZNAME[i].toLowerCase()}</td><td>{z.lo}-{z.hi} bpm</td></tr>)}</tbody></table>)}
    {mode === 'mano' && b && <>
      <p class="sub pad">Ogni zona inizia dove finisce la precedente: se ne cambi una, la vicina si adegua.</p>
      <button type="button" class="btn" onClick={() => { saveState({ ...st, hrZones: { ...hz, mode: 'mano', bounds: b } }); setSaved(true) }}>{saved ? 'Zone salvate' : 'Salva le zone'}</button>
    </>}
    {mode !== 'max' && <Note>Le sedute mandate all'orologio con Intervals.icu usano le zone impostate lì: inserisci gli stessi valori anche in Intervals.icu.</Note>}
    <p class="sub pad">{mode === 'riserva' ? 'Con la FC a riposo le zone tengono conto di quanto sei allenato: misurala a letto, appena sveglio, per qualche giorno.' : 'Il valore più affidabile viene da un test massimale o da una gara corta. Le formule per età possono sbagliare di parecchio.'}</p>
  </>
}
const Row = ({ href, label, value }: { href: string; label: string; value?: string | null }) => <a class="row-l" href={'#/' + href}><span>{label}</span>{value && <small>{value}</small>}<i aria-hidden="true" /></a>
const Group = ({ title, children }: { title: string; children: ComponentChildren }) => <section class="group"><h2 class="phase">{title}</h2><div class="rows">{children}</div></section>
/** Profilo: un elenco per argomenti, ogni voce apre la sua pagina. */
export function Settings({ onLogout }: { onLogout: () => void }) {
  const d = data.value!, st = d.state, max = hrMaxOf(d), me = d.me
  const zones = watchedZones(d).map(z => ZONES.find(x => x.id === z)?.label).filter(Boolean).join(', ')
  const name = me?.name ? me.name[0].toUpperCase() + me.name.slice(1) : 'Profilo'
  const su = shoeUse(st, d.activities).filter(u => !u.shoe.retired), worn = su.find(u => u.level !== 'ok'), def = su.find(u => u.shoe.id === st.defaultShoe)
  const shoeLine = worn ? `${worn.shoe.name}: ${worn.km} km, ${worn.level === 'cambia' ? 'da cambiare' : 'quasi da cambiare'}` : def ? `${def.shoe.name}: ${def.km} km` : su.length ? `${su.length} in uso` : 'Nessuna'
  return (
    <div class="stack">
      <section class="me"><span class="avatar" aria-hidden="true">{name[0]}</span><div><h1>{name}</h1>{me?.isAdmin && <small>Amministratore</small>}</div></section>
      <Group title="Corpo">
        <Row href="impostazioni/corpo" label="Battiti e zone" value={max ? `FC max ${max}` : 'Da impostare'} />
        <Row href="impostazioni/corpo" label="Zone da tenere d'occhio" value={zones || 'Nessuna'} />
        <Row href="impostazioni/scarpe" label="Scarpe" value={shoeLine} />
      </Group>
      <Group title="Collegamenti">
        <Row href="impostazioni/orologio" label="Orologio e importazione" value={[st.watch, me?.intervals ? 'Intervals.icu' : null].filter(Boolean).join(', ') || 'Nessuno'} />
        <Row href="impostazioni/percorsi" label="Percorsi su mappa" value={me?.routing ? 'Collegati' : 'Da collegare'} />
        <Row href="impostazioni/meteo" label="Meteo" value={st.weather?.city ?? (st.weather?.gps ? 'Posizione del telefono' : 'Da impostare')} />
      </Group>
      <Group title="Avvisi">
        <Row href="impostazioni/notifiche" label="Notifica della domenica" />
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
function Notifications() {
  const [on, setOn] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('')
  useEffect(() => { currentSub().then(s => setOn(!!s)).catch(() => setOn(false)) }, [])
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); setMsg(''); try { await f() } catch (e: any) { setErr(e.message ?? 'Operazione non riuscita.') } finally { setBusy(false) } }
  return <>
    <p class="sub pad">La domenica sera ricevi un avviso: aprendolo trovi il riepilogo della settimana e le eventuali proposte del piano. Vale per questo dispositivo: attivala su ognuno da cui vuoi riceverla.</p>
    {!pushSupported() ? <Note>Questo browser non riceve notifiche. Su Android installa l'app dal menu di Chrome e attivala da lì.</Note>
      : on ? <>
        <p class="sub pad">Attiva su questo dispositivo.</p>
        <div class="row"><button type="button" class="btn ghost" disabled={busy} onClick={() => run(async () => { await call('POST', '/api/push/test'); setMsg('Notifica di prova inviata: arriva entro qualche secondo.') })}>Prova la notifica</button><button type="button" class="btn ghost danger" disabled={busy} onClick={() => run(async () => { await disablePush(); setOn(false) })}>Disattiva</button></div>
      </> : on === false && <button type="button" class="btn" disabled={busy} onClick={() => run(async () => { await enablePush(); setOn(true) })}>Attiva la notifica</button>}
    {msg && <Note tone="go">{msg}</Note>}
    {err && <p class="err pad">{err}</p>}
  </>
}
function Shoes() {
  const d = data.value!, st = d.state, use = shoeUse(st, d.activities), today = todayISO()
  const blank = { id: '', name: '', startKm: '0', limitKm: String(DEFAULT_LIMIT), since: today }
  const [f, setF] = useState<typeof blank | null>(null), [err, setErr] = useState(''), [old, setOld] = useState(false)
  const save = () => {
    const startKm = +f!.startKm.replace(',', '.'), limitKm = +f!.limitKm
    if (!f!.name.trim()) return setErr('Dai un nome al paio.')
    if (!(startKm >= 0 && startKm < 5000)) return setErr('I km di partenza vanno da 0 a 5000.')
    if (!(limitKm >= 100 && limitKm <= 3000)) return setErr('Il limite va da 100 a 3000 km.')
    const id = f!.id || uid(), prev = (st.shoes ?? []).find(x => x.id === id)
    const shoe: Shoe = { ...prev, id, name: f!.name.trim().slice(0, 40), startKm, limitKm, since: f!.since || today }
    const shoes = prev ? (st.shoes ?? []).map(x => x.id === id ? shoe : x) : [...(st.shoes ?? []), shoe]
    saveState({ ...st, shoes, defaultShoe: st.defaultShoe && shoes.some(x => x.id === st.defaultShoe && !x.retired) ? st.defaultShoe : id }); setF(null); setErr('')
  }
  const retire = (id: string, retired: boolean) => saveState({ ...st, shoes: (st.shoes ?? []).map(x => x.id === id ? { ...x, retired } : x), defaultShoe: retired && st.defaultShoe === id ? null : st.defaultShoe })
  const active = use.filter(u => !u.shoe.retired), gone = use.filter(u => u.shoe.retired)
  const card = (u: ShoeUse) => <section class="panel shoe" key={u.shoe.id}>
    <div class="shoe-h"><h2>{u.shoe.name}</h2>{u.shoe.retired ? <span class="tag">Ritirata</span> : u.level !== 'ok' ? <span class="tag stop">{u.level === 'cambia' ? 'Da cambiare' : 'Quasi da cambiare'}</span> : st.defaultShoe === u.shoe.id ? <span class="tag go">Predefinita</span> : null}</div>
    <p class="big">{u.km} <small>km su {u.shoe.limitKm}</small></p>
    <div class={'bar ' + u.level} aria-hidden="true"><i style={{ width: `${Math.min(100, u.km / u.shoe.limitKm * 100)}%` }} /></div>
    <p class="sub">{u.level === 'ok' ? `Dal ${fmtDate(u.shoe.since, { day: 'numeric', month: 'long', year: 'numeric' })} · ${u.runs} ${u.runs === 1 ? 'corsa' : 'corse'}${u.shoe.startKm ? `, più ${Math.round(u.shoe.startKm)} km di partenza` : ''}` : 'Guarda la suola e come senti le gambe: i km sono solo un\'indicazione.'}</p>
    <div class="row">
      {!u.shoe.retired && st.defaultShoe !== u.shoe.id && <button type="button" class="link" onClick={() => saveState({ ...st, defaultShoe: u.shoe.id })}>Rendila predefinita</button>}
      <button type="button" class="link" onClick={() => { setF({ id: u.shoe.id, name: u.shoe.name, startKm: String(u.shoe.startKm), limitKm: String(u.shoe.limitKm), since: u.shoe.since }); setErr('') }}>Modifica</button>
      <button type="button" class="link" onClick={() => retire(u.shoe.id, !u.shoe.retired)}>{u.shoe.retired ? 'Rimettila in uso' : 'Ritirala'}</button>
    </div>
  </section>
  return <>
    <p class="sub pad">Ogni corsa salvata va sul paio predefinito; la cambi nel Diario, nella corsa. Le corse senza scarpe scelte, fatte prima dell'inizio di un paio, non contano.</p>
    {active.map(card)}
    {f ? <section class="panel stack form">
      <h2>{f.id ? 'Modifica il paio' : 'Nuovo paio'}</h2>
      <Field label="Nome"><input value={f.name} maxLength={40} placeholder="Marca e modello" onInput={e => setF({ ...f, name: e.currentTarget.value })} /></Field>
      <div class="grid2">
        <Field label="Km già fatti"><input inputMode="decimal" value={f.startKm} onInput={e => setF({ ...f, startKm: e.currentTarget.value })} /></Field>
        <Field label="Da cambiare a"><input inputMode="numeric" value={f.limitKm} onInput={e => setF({ ...f, limitKm: e.currentTarget.value })} /></Field>
      </div>
      <Field label="In uso dal"><input type="date" value={f.since} max={today} onInput={e => setF({ ...f, since: e.currentTarget.value })} /></Field>
      <p class="sub">Se le hai già usate, scrivi i km fatti finora: si parte da lì.</p>
      {err && <p class="err" role="alert">{err}</p>}
      <div class="row"><button type="button" class="btn" onClick={save}>Salva</button><button type="button" class="btn ghost" onClick={() => setF(null)}>Annulla</button></div>
    </section> : <button type="button" class="btn ghost" onClick={() => { setF(blank); setErr('') }}>Aggiungi un paio</button>}
    {gone.length > 0 && <button type="button" class="link" aria-expanded={old} onClick={() => setOld(!old)}>{old ? 'Nascondi' : 'Mostra'} le scarpe ritirate ({gone.length})</button>}
    {old && gone.map(card)}
  </>
}
const PAGES: Record<string, [string, () => ComponentChildren]> = {
  notifiche: ['Notifica della domenica', () => <Notifications />],
  corpo: ['Corpo', () => <><Heart /><Zones /></>],
  scarpe: ['Le tue scarpe', () => <Shoes />],
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
