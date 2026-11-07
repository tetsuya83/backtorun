import { signal } from '@preact/signals'
import { defaultState, normalizePlan, type Activity, type Plan, type Planned, type State, type Workout } from '../shared/engine'
import type { Remote } from '../shared/intervals'
import type { Route } from '../shared/route'
export interface TestRec { id: string; date: string; kind: string; data: any }
export interface Data { plan: Plan; custom?: Plan | null; state: State; activities: Activity[]; tests: TestRec[]; workouts?: Workout[]; routes?: Route[]; me?: { name: string; isAdmin: boolean; intervals?: boolean; routing?: boolean } }
export const data = signal<Data | null>(null)
export const pending = signal(0)
export const imports = signal<Remote[]>([])
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine)
type Op = { method: string; url: string; body?: unknown }
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* memoria piena o bloccata */ } },
}
export async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error ?? 'Richiesta non riuscita.'), { status: r.status })
  return j
}
let queue: Op[] = store.get('btr-queue', [])
pending.value = queue.length
let flushing = false
export async function flush() {
  if (flushing) return
  flushing = true
  try {
    while (queue.length) {
      const op = queue[0]
      try { await call(op.method, op.url, op.body) }
      catch (e: any) { if (!e.status || e.status === 401 || e.status >= 500) break }
      queue = queue.slice(1); store.set('btr-queue', queue); pending.value = queue.length
    }
  } finally { flushing = false }
}
const enqueue = (op: Op) => {
  // un nuovo salvataggio della stessa risorsa sostituisce quello in attesa
  queue = queue.filter(q => !(q.url === op.url && q.method === op.method)).concat(op)
  store.set('btr-queue', queue); pending.value = queue.length; void flush()
}
const commit = (d: Data) => { data.value = d; store.set('btr-data', d) }
/** Mostra subito i dati già salvati sul telefono, se ci sono: l'aggiornamento dal server arriva dopo. */
export function loadCached() {
  const cached = store.get<Data | null>('btr-data', null)
  if (cached) data.value = cached
  return !!cached
}
/** Aggiorna dal server in sottofondo: 401 vuol dire che serve un nuovo accesso. */
export async function refresh() {
  await flush()
  commit(await call<Data>('GET', '/api/bootstrap'))
}
export async function load() {
  const cached = store.get<Data | null>('btr-data', null)
  if (cached) data.value = cached
  await flush()
  try { commit(await call<Data>('GET', '/api/bootstrap')) }
  catch (e: any) { if (e.status === 401) throw e; if (!cached) throw e }
}
export function saveActivity(a: Activity) {
  const d = data.value!; a = { ...a, updatedAt: Date.now() }
  commit({ ...d, activities: [...d.activities.filter(x => x.id !== a.id), a].sort((x, y) => x.date.localeCompare(y.date)) })
  enqueue({ method: 'PUT', url: `/api/activities/${a.id}`, body: a })
}
export function deleteActivity(id: string) {
  const d = data.value!, ext = d.activities.find(x => x.id === id)?.externalId
  commit({ ...d, activities: d.activities.filter(x => x.id !== id) })
  enqueue({ method: 'DELETE', url: `/api/activities/${id}` })
  if (ext) skipImport(ext) // cancellato: non deve tornare come allenamento nuovo
}
let checked = 0
/** Cerca i nuovi allenamenti: all'apertura al massimo ogni 3 minuti, sempre quando lo chiede la persona. */
export async function checkImports(force = false) {
  if (!data.value?.me?.intervals || (!force && Date.now() - checked < 18e4)) return
  checked = Date.now()
  const r = await call<{ items: Remote[]; strava: number }>('GET', '/api/intervals/new')
  imports.value = r.items
  return r
}
export function skipImport(id: string) { imports.value = imports.value.filter(x => x.id !== id); enqueue({ method: 'POST', url: `/api/intervals/skip/${id}` }) }
export function setIntervalsLinked(on: boolean) { const d = data.value!; commit({ ...d, me: { ...d.me!, intervals: on } }); if (!on) imports.value = []; checked = 0 }
export function saveState(s: State) { commit({ ...data.value!, state: s }); enqueue({ method: 'PUT', url: '/api/state', body: s }) }
const core = ({ other, ...s }: State) => s
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
/** Passa da un piano all'altro: ognuno conserva il proprio calendario. */
export function switchPlan(mode: 'base' | 'custom') {
  const st = data.value!.state
  if (st.restart) { saveState({ ...defaultState, startDate: nextMonday(), hrMax: st.hrMax, watch: st.watch, zones: st.zones, weather: st.weather, round: st.round, baseDays: st.baseDays ?? st.other?.baseDays ?? null, mode }); return }
  if ((st.mode ?? 'base') === mode) { if (!st.mode) saveState({ ...st, mode }); return }
  saveState({ ...defaultState, startDate: nextMonday(), ...st.other, hrMax: st.hrMax, watch: st.watch, zones: st.zones, weather: st.weather, planned: st.planned, round: st.round, mode, other: core(st) })
}
/** Ferma il piano: allenamenti registrati e salvati restano, il calendario riparte da una nuova scelta. */
export function restartPlan() { const st = data.value!.state; saveState({ ...st, restart: true, round: (st.round ?? 0) + 1, planned: [] }) }
export function saveCustomPlan(p: Plan) {
  const plan = normalizePlan(p)
  commit({ ...data.value!, custom: plan })
  enqueue({ method: 'PUT', url: '/api/custom-plan', body: plan })
  return plan
}
/** Attiva un piano appena creato e ne fissa il calendario. */
export function startCustomPlan(p: Plan, s: Pick<State, 'startDate' | 'raceDate' | 'raceName'> & { weather?: State['weather'] }) {
  const st = data.value!.state, plan = saveCustomPlan(p)
  saveState({ ...s, startWeek: 1, skips: [], repeats: [], hrMax: st.hrMax, watch: st.watch, zones: st.zones, weather: s.weather !== undefined ? s.weather : st.weather, planned: st.planned, round: st.round, mode: 'custom', other: st.restart ? null : st.mode === 'custom' ? st.other : core(st) })
  return plan
}
export function saveWorkout(w: Workout) {
  const d = data.value!; w = { ...w, updatedAt: Date.now() }
  commit({ ...d, workouts: [w, ...(d.workouts ?? []).filter(x => x.id !== w.id)] })
  enqueue({ method: 'PUT', url: `/api/workouts/${w.id}`, body: w })
}
export function saveRoute(r: Route) {
  const d = data.value!; r = { ...r, updatedAt: Date.now() }
  commit({ ...d, routes: [r, ...(d.routes ?? []).filter(x => x.id !== r.id)] })
  enqueue({ method: 'PUT', url: `/api/routes/${r.id}`, body: r })
}
export function deleteRoute(id: string) {
  const d = data.value!
  commit({ ...d, routes: (d.routes ?? []).filter(x => x.id !== id) })
  enqueue({ method: 'DELETE', url: `/api/routes/${id}` })
}
export function setRoutingLinked(on: boolean) { const d = data.value!; commit({ ...d, me: { ...d.me!, routing: on } }) }
export function deleteWorkout(id: string) {
  const d = data.value!
  commit({ ...d, workouts: (d.workouts ?? []).filter(x => x.id !== id) })
  enqueue({ method: 'DELETE', url: `/api/workouts/${id}` })
}
/** Mette un allenamento in calendario: una sostituzione prende il posto di quella già presente quel giorno. */
export function addPlanned(p: Planned) {
  const st = data.value!.state, rest = (st.planned ?? []).filter(x => !(p.mode === 'replace' && x.mode === 'replace' && x.date === p.date))
  saveState({ ...st, planned: [...rest, p].sort((a, b) => a.date.localeCompare(b.date)) })
}
export function removePlanned(id: string) { const st = data.value!.state; saveState({ ...st, planned: (st.planned ?? []).filter(x => x.id !== id) }) }
export function saveTest(t: TestRec) {
  const d = data.value!
  commit({ ...d, tests: [...d.tests.filter(x => x.id !== t.id), t] })
  enqueue({ method: 'PUT', url: `/api/tests/${t.id}`, body: t })
}
export const clearLocal = () => { try { localStorage.removeItem('btr-data'); localStorage.removeItem('btr-queue'); localStorage.removeItem('btr-weather') } catch { /* niente da fare */ } queue = []; pending.value = 0; data.value = null; imports.value = []; checked = 0 }
export const uid = () => crypto.randomUUID()
