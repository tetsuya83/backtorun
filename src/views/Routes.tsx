import { useEffect, useRef, useState } from 'preact/hooks'
import { call, data, deleteRoute, online, saveRoute, setRoutingLinked, uid } from '../api'
import { buildGpx, buildRoute, fitOf, gainOf, isRouteGpx, legsOf, MAX_ROUTES, mirror, splitLoop, parseRouteGpx, type Leg, type LngLat, type Pt, type Route, type RouteSession } from '../../shared/route'
import { Field, Note } from '../ui'
import { fmtDate, todayISO } from '../guide'

const SHARED = 'btr-route-gpx'
const CORNAREDO: LngLat = [9.024, 45.499]
const km = (n: number) => n.toFixed(2).replace('.', ',')
const fileName = (r: Route) => `${r.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'percorso'}.gpx`
const gpxFile = (r: Route) => new File([buildGpx(r)], fileName(r), { type: 'application/gpx+xml' })
/** Porta un GPX senza orari nell'editor, da qualsiasi punto arrivi. */
export function openRouteGpx(xml: string) { try { sessionStorage.setItem(SHARED, xml) } catch { /* file troppo grande */ } location.hash = '#/percorsi/nuovo?gpx=1' }
export const looksLikeRoute = isRouteGpx
function Thumb({ track, big }: { track: Pt[]; big?: boolean }) {
  if (track.length < 2) return <span class="rt-thumb" />
  const xs = track.map(p => p[0]), ys = track.map(p => p[1]), x0 = Math.min(...xs), y1 = Math.max(...ys), k = Math.cos(y1 * Math.PI / 180), w = (Math.max(...xs) - x0) * k || 1e-4, h = y1 - Math.min(...ys) || 1e-4, s = 56 / Math.max(w, h)
  const step = Math.max(1, Math.ceil(track.length / 120)), pts = track.filter((_, i) => !(i % step)).map(p => `${(6 + (p[0] - x0) * k * s + (56 - w * s) / 2).toFixed(1)},${(6 + (y1 - p[1]) * s + (56 - h * s) / 2).toFixed(1)}`).join(' ')
  return <svg class={'rt-thumb' + (big ? ' big' : '')} viewBox="0 0 68 68" aria-hidden="true"><polyline points={pts} fill="none" stroke="#0b66c3" stroke-width={big ? 1.6 : 3} stroke-linejoin="round" stroke-linecap="round" /></svg>
}
/** La mappa arriva a parte: fuori rete resta la sagoma del percorso. */
function LazyMap(p: { track: Pt[]; way: LngLat[]; center: LngLat; fit?: number; edit?: boolean; onTap?: (p: LngLat) => void; onMove?: (i: number, p: LngLat) => void }) {
  const [M, setM] = useState<any>(null), [fail, setFail] = useState(false)
  useEffect(() => { import('./RouteMap').then(x => setM(() => x.RouteMap)).catch(() => setFail(true)) }, [])
  if (fail || !online.value) return <div class="rt-map rt-off"><Thumb track={p.track} big /></div>
  return M ? <M {...p} /> : <div class="rt-map rt-off"><p>Apro la mappa…</p></div>
}
const meta = (r: Route) => `${km(r.km)} km${r.ascent != null ? ` · ${r.ascent} m` : ''}${r.source === 'gpx' ? ' · da GPX' : ''}`
const Row = ({ r }: { r: Route }) => <li><a href={`#/percorsi/${r.id}`}><Thumb track={r.track} /><span><b>{r.name}</b><small>{meta(r)}</small>{r.session && r.session.date >= todayISO() && <small class="rt-link">{fmtDate(r.session.date, { weekday: 'long', day: 'numeric' })}: {r.session.label}</small>}</span></a></li>
function List() {
  const l = data.value!.routes ?? [], today = todayISO(), file = useRef<HTMLInputElement>(null), [err, setErr] = useState('')
  const next = l.filter(r => r.session && r.session.date >= today).sort((a, b) => a.session!.date.localeCompare(b.session!.date)), rest = l.filter(r => !next.includes(r))
  const pick = async () => {
    const f = file.current?.files?.[0]
    if (!f) return
    try { const t = await f.text(); parseRouteGpx(t); openRouteGpx(t) } catch (e: any) { setErr(e.message) }
    if (file.current) file.current.value = ''
  }
  return <div class="stack">
    <section class="head"><h1>Percorsi</h1><p>Disegnali sulla mappa o importali, poi mandali all'orologio.</p></section>
    <div class="row"><a class="btn" href="#/percorsi/nuovo">Nuovo percorso</a><button type="button" class="btn ghost" onClick={() => file.current?.click()}>Importa un GPX</button></div>
    <input ref={file} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={pick} />
    {err && <p class="err pad">{err}</p>}
    {next.length > 0 && <section class="stack"><h2 class="sect">Per le prossime sedute</h2><ul class="cards rt-list">{next.map(r => <Row key={r.id} r={r} />)}</ul></section>}
    {rest.length > 0 && <section class="stack"><h2 class="sect">{next.length ? 'Altri percorsi' : 'I tuoi percorsi'}</h2><ul class="cards rt-list">{rest.map(r => <Row key={r.id} r={r} />)}</ul></section>}
    {!l.length && <p class="sub pad">Non hai ancora percorsi.</p>}
  </div>
}
function Detail({ r }: { r: Route }) {
  const [can] = useState(() => { try { return !!navigator.canShare?.({ files: [gpxFile(r)] }) } catch { return false } })
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(gpxFile(r)); a.download = fileName(r); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3e4) }
  const share = () => navigator.share({ files: [gpxFile(r)], title: r.name }).catch(() => undefined)
  const remove = () => { if (confirm(`Eliminare ${r.name}?`)) { deleteRoute(r.id); location.hash = '#/percorsi' } }
  return <div class="stack">
    <section class="head"><p class="eyebrow"><a href="#/percorsi">Percorsi</a></p><h1>{r.name}</h1><p>{meta(r)}</p>{r.session && <p class="rt-link">{fmtDate(r.session.date, { weekday: 'long', day: 'numeric', month: 'long' })}: {r.session.label}</p>}</section>
    <div class="cols"><div class="col">
      <LazyMap track={r.track} way={r.way} center={r.way[0] ?? CORNAREDO} />
    </div><div class="col">
      <button type="button" class="btn" onClick={download}>Scarica il file GPX</button>
      {can && <button type="button" class="btn ghost" onClick={share}>Condividi</button>}
      <section class="panel l-sec"><h2>Poi, nell'app Suunto</h2><ol class="nums">
        <li><span>Apri la <b>mappa</b> e tocca <b>+</b></span></li>
        <li><span>Scegli <b>Importa percorso</b> e il file scaricato</span></li>
        <li><span><b>Salva</b> e sincronizza l'orologio</span></li>
      </ol><p class="sub">Con Garmin: su Garmin Connect dal computer importa il file come percorso, poi invialo all'orologio.</p></section>
      <div class="row"><a class="btn ghost" href={`#/percorsi/${r.id}/modifica`}>Modifica</a><button type="button" class="btn ghost danger" onClick={remove}>Elimina</button></div>
    </div></div>
  </div>
}
function Editor({ edit, query }: { edit?: Route; query: URLSearchParams }) {
  const d = data.value!, st = d.state, w = st.weather
  const [start] = useState(() => {
    if (edit) return { name: edit.name, way: edit.way, legs: legsOf(edit), source: edit.source, session: edit.session ?? null, err: '' }
    const s: RouteSession | null = query.get('key') ? { key: query.get('key')!, date: query.get('date') ?? todayISO(), label: query.get('label') ?? 'Seduta', km: +(query.get('km') ?? 0) || null } : null
    const xml = query.get('gpx') ? (() => { try { return sessionStorage.getItem(SHARED) } catch { return null } })() : null
    if (xml) { try { const g = parseRouteGpx(xml); return { name: g.name, way: g.way, legs: [g.leg], source: 'gpx' as const, session: s, err: '' } } catch (e: any) { return { name: '', way: [] as LngLat[], legs: [] as Leg[], source: 'editor' as const, session: s, err: e.message as string } } }
    return { name: s ? s.label : '', way: [] as LngLat[], legs: [] as Leg[], source: 'editor' as const, session: s, err: '' }
  })
  const [name, setName] = useState(start.name), [way, setWay] = useState<LngLat[]>(start.way), [legs, setLegs] = useState<Leg[]>(start.legs), [busy, setBusy] = useState(false), [err, setErr] = useState(start.err)
  const linked = !!d.me?.routing, keep = useRef({ way, legs, busy }); keep.current = { way, legs, busy }
  const center: LngLat = way[0] ?? (w?.lat != null && w?.lon != null ? [w.lon, w.lat] : CORNAREDO)
  const track = legs.flatMap((l, i) => i ? l.c.slice(1) : l.c), total = legs.reduce((n, l) => n + l.m, 0) / 1000, gain = gainOf(track), fit = fitOf(total, start.session?.km)
  const full = !edit && (d.routes ?? []).length >= MAX_ROUTES
  const leg = (a: LngLat, b: LngLat) => call<Leg>('POST', '/api/routing/leg', { a, b })
  const guard = async (f: () => Promise<void>) => { if (keep.current.busy) return; setBusy(true); setErr(''); try { await f() } catch (e: any) { setErr(e.status ? e.message : 'Serve la connessione per calcolare il percorso.') } finally { setBusy(false) } }
  const add = (p: LngLat) => {
    if (!linked) return
    const { way: v } = keep.current
    void guard(async () => { if (!v.length) { setWay([p]); return } const l = await leg(v[v.length - 1], p); setLegs(x => [...x, l]); setWay(x => [...x, p]) })
  }
  const move = (i: number, p: LngLat) => {
    const { way: v, legs: l } = keep.current
    void guard(async () => {
      const a = i > 0 ? await leg(v[i - 1], p) : null, b = i < v.length - 1 ? await leg(p, v[i + 1]) : null
      setLegs(l.flatMap((x, k) => k === i - 1 ? [a!] : k === i ? [b!] : [x])); setWay(v.map((q, k) => k === i ? p : q))
    })
    setWay([...v]) // se il calcolo fallisce il punto torna al suo posto
  }
  const [frame, setFrame] = useState(0), [want, setWant] = useState(() => String(start.session?.km || 8)), [ideas, setIdeas] = useState<Leg[] | null>(null), [pick, setPick] = useState(-1)
  const propose = () => {
    const k = parseFloat(want.replace(',', '.')), from = way[0] ?? center, base = Math.floor(Math.random() * 900)
    if (!(k >= 1 && k <= 45)) { setErr('Scegli una distanza tra 1 e 45 km.'); return }
    void guard(async () => {
      const got = await Promise.allSettled([0, 1, 2].map(i => call<Leg>('POST', '/api/routing/loop', { start: from, km: k, seed: base + i * 31 })))
      const ok = got.flatMap(g => g.status === 'fulfilled' ? [g.value] : [])
      if (!ok.length) { const e = got.find(g => g.status === 'rejected') as PromiseRejectedResult; throw e.reason }
      setIdeas(ok); use(ok[0], 0)
    })
  }
  const use = (l: Leg, i: number) => { const s = splitLoop(l.c, 4, l.m); setWay(s.way); setLegs(s.legs); setPick(i); setFrame(f => f + 1) }
  const undo = () => { setErr(''); setWay(w => w.slice(0, -1)); setLegs(l => l.slice(0, -1)) }
  const ring = () => { if (way.length > 1) add(way[0]) }
  const back = () => { if (legs.length) { setLegs(l => [...l, ...mirror(l)]); setWay(v => [...v, ...[...v].reverse().slice(1)]) } }
  const save = () => {
    const id = edit?.id ?? uid(), n = name.trim() || (start.session?.label ?? 'Nuovo percorso')
    saveRoute({ ...buildRoute(id, n, way, legs, start.source, start.session) })
    location.hash = '#/percorsi/' + id
  }
  return <div class="rt-ed">
    <section class="rt-side">
      <section class="head"><p class="eyebrow"><a href="#/percorsi">Percorsi</a></p><h1>{edit ? 'Modifica percorso' : 'Nuovo percorso'}</h1></section>
      <Field label="Nome"><input value={name} maxLength={60} onInput={e => setName(e.currentTarget.value)} placeholder="Per esempio Lungo del Naviglio" /></Field>
      <section class="panel rt-sum">
        {start.session && <p class="eyebrow">{fmtDate(start.session.date, { weekday: 'long', day: 'numeric' })}: {start.session.label}</p>}
        <p class="bigkm"><b>{km(total)}</b> km</p>
        {fit && <><div class="rt-bar"><i class={fit.ok ? 'ok' : ''} style={{ width: `${fit.ratio * 100}%` }} /></div><p class={fit.ok ? 'rt-ok' : 'sub'}>{fit.text}</p></>}
        <p class="sub">{gain != null ? `Dislivello ${gain} m` : 'Dislivello non disponibile'}</p>
      </section>
      {!linked && <Note>Per seguire strade e sentieri collega <a href="#/impostazioni/percorsi">openrouteservice in Profilo</a>. La <a href="#/aiuto">Guida</a> spiega come fare.</Note>}
      {linked && !online.value && <Note>Serve la connessione per disegnare.</Note>}
      {busy && <p class="sub pad">Calcolo il tratto…</p>}
      {err && <p class="err pad">{err}</p>}
      {full && <p class="err pad">Puoi salvare al massimo {MAX_ROUTES} percorsi. Eliminane uno.</p>}
      {linked && (way.length < 2 || ideas) && <section class="panel rt-loop">
        <h2>Proponi un anello</h2>
        <p class="sub">{ideas ? 'Tocca un anello per vederlo sulla mappa, o chiedine altri tre dallo stesso punto.' : way.length ? 'Parte dal punto che hai messo.' : 'Parte da casa, o tocca prima la mappa per scegliere la partenza.'}</p>
        <div class="row"><Field label="Distanza in km"><input inputMode="decimal" value={want} onInput={e => setWant(e.currentTarget.value)} /></Field><button type="button" class="btn ghost" disabled={busy || !online.value} onClick={propose}>{ideas ? 'Altre tre' : 'Proponi tre anelli'}</button></div>
        {ideas && <ul class="rt-ideas" role="list">{ideas.map((l, i) => <li key={i}><button type="button" class={i === pick ? 'sel' : ''} aria-pressed={i === pick} onClick={() => use(l, i)}><Thumb track={l.c} /><span><b>Anello {i + 1}</b><small>{km(l.m / 1000)} km{gainOf(l.c) != null ? ` · ${gainOf(l.c)} m` : ''}</small></span></button></li>)}</ul>}
        {ideas && <p class="sub">Controlla il giro sulla mappa: la proposta può passare su strade poco adatte. Puoi spostare i punti.</p>}
      </section>}
      <div class="row"><button type="button" class="btn ghost" disabled={way.length < 2 || busy || !linked} onClick={ring}>Chiudi anello</button><button type="button" class="btn ghost" disabled={!legs.length || busy} onClick={back}>Andata e ritorno</button></div>
      <div class="row"><button type="button" class="btn ghost" disabled={!way.length || busy} onClick={undo}>Annulla punto</button><button type="button" class="btn ghost" disabled={!way.length || busy} onClick={() => { setWay([]); setLegs([]); setErr(''); setIdeas(null) }}>Ricomincia</button></div>
      <button type="button" class="btn" disabled={!legs.length || busy || full} onClick={save}>{start.session ? 'Salva e collega alla seduta' : 'Salva'}</button>
    </section>
    <div class="rt-canvas"><p class="rt-tip">Tocca la mappa per aggiungere un punto. Trascinalo per spostarlo.</p><LazyMap track={track} way={way} center={center} fit={frame} edit onTap={add} onMove={move} /></div>
  </div>
}
export function Routes({ route }: { route: string }) {
  const [path, q] = route.split('?'), [, id, sub] = path.split('/'), query = new URLSearchParams(q ?? '')
  if (!id) return <List />
  if (id === 'nuovo') return <Editor query={query} />
  const r = data.value!.routes?.find(x => x.id === id)
  if (!r) return <div class="stack"><section class="head"><h1>Percorso non trovato</h1></section><a class="btn ghost" href="#/percorsi">Torna ai percorsi</a></div>
  return sub === 'modifica' ? <Editor edit={r} query={query} /> : <Detail r={r} />
}
/** Nella seduta del piano: il percorso collegato, o il modo per crearne uno della distanza giusta. */
export function SessionRoute({ skey, date, label, km: dist }: { skey: string; date: string; label: string; km?: number | null }) {
  const r = data.value!.routes?.find(x => x.session?.key === skey)
  return r ? <a class="btn ghost" href={`#/percorsi/${r.id}`}>Percorso: {r.name}, {km(r.km)} km</a> : <a class="btn ghost" href={`#/percorsi/nuovo?key=${encodeURIComponent(skey)}&date=${date}&km=${dist ?? 0}&label=${encodeURIComponent(label)}`}>Crea un percorso per questa seduta</a>
}
export function RoutingSettings() {
  const on = !!data.value!.me?.routing, [key, setKey] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f() } catch (e: any) { setErr(e.message ?? 'Operazione non riuscita.') } finally { setBusy(false) } }
  const connect = (e: Event) => { e.preventDefault(); void run(async () => { await call('PUT', '/api/routing/key', { key }); setKey(''); setRoutingLinked(true) }) }
  const remove = () => { if (confirm('Scollegare openrouteservice? La chiave viene cancellata, i percorsi salvati restano.')) void run(async () => { await call('DELETE', '/api/routing/key'); setRoutingLinked(false) }) }
  return <>
    {on ? <>
      <p class="sub pad">Collegato a openrouteservice: i percorsi seguono strade e sentieri.</p>
      <button type="button" class="btn ghost danger" disabled={busy} onClick={remove}>Scollega</button>
    </> : <form class="stack" onSubmit={connect}>
      <p class="sub pad">Crea un account gratuito su <a href="https://account.heigit.org/signup" target="_blank" rel="noopener">HeiGIT</a> e copia qui la chiave di openrouteservice. Trattala come una password. La <a href="#/aiuto">Guida</a> spiega i passaggi.</p>
      <Field label="Chiave di openrouteservice"><input type="password" autocomplete="off" value={key} onInput={e => setKey(e.currentTarget.value)} required /></Field>
      <button class="btn ghost" disabled={busy || !key.trim()}>{busy ? 'Controllo la chiave…' : 'Collega'}</button>
    </form>}
    {err && <p class="err pad">{err}</p>}
  </>
}
