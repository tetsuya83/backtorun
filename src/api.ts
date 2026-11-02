import { signal } from '@preact/signals'
import type { Activity, Plan, State } from '../shared/engine'
export interface TestRec { id: string; date: string; kind: string; data: any }
export interface Data { plan: Plan; state: State; activities: Activity[]; tests: TestRec[] }
export const data = signal<Data | null>(null)
export const pending = signal(0)
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
  const d = data.value!
  commit({ ...d, activities: d.activities.filter(x => x.id !== id) })
  enqueue({ method: 'DELETE', url: `/api/activities/${id}` })
}
export function saveState(s: State) { commit({ ...data.value!, state: s }); enqueue({ method: 'PUT', url: '/api/state', body: s }) }
export function saveTest(t: TestRec) {
  const d = data.value!
  commit({ ...d, tests: [...d.tests.filter(x => x.id !== t.id), t] })
  enqueue({ method: 'PUT', url: `/api/tests/${t.id}`, body: t })
}
export const clearLocal = () => { try { localStorage.removeItem('btr-data'); localStorage.removeItem('btr-queue') } catch { /* niente da fare */ } queue = []; pending.value = 0; data.value = null }
export const uid = () => crypto.randomUUID()
