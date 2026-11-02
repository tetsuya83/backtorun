import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import planData from '../shared/plan.json'
import { defaultState } from '../shared/engine'

type Env = { Bindings: { DB: D1Database; SETUP_CODE?: string }; Variables: { uid: number } }
const app = new Hono<Env>()
const COOKIE = 'btr_session'
const ITER = 10000 // basso di proposito: il piano gratuito concede 10 ms di CPU per richiesta
const YEAR = 60 * 60 * 24 * 365

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS state (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activities (id TEXT NOT NULL, user_id INTEGER NOT NULL, date TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE INDEX IF NOT EXISTS idx_act_date ON activities (user_id, date)`,
  `CREATE TABLE IF NOT EXISTS tests (id TEXT NOT NULL, user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (user_id, id))`,
]
let ready = false
async function ensure(db: D1Database) {
  if (ready) return
  await db.batch(SCHEMA.map(s => db.prepare(s)))
  await db.prepare('INSERT OR IGNORE INTO plan (id, json) VALUES (1, ?)').bind(JSON.stringify(planData)).run()
  ready = true
}
app.use('/api/*', async (c, next) => { await ensure(c.env.DB); await next() })

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map(x => x.toString(16).padStart(2, '0')).join('')
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
async function hashPass(pw: string, salt: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITER }, k, 256))
}
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 }
async function openSession(c: any, uid: number) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  await c.env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?)').bind(await sha(token), uid, Date.now() + YEAR * 1000).run()
  setCookie(c, COOKIE, token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: YEAR })
}
const ipOf = (c: any) => c.req.header('cf-connecting-ip') ?? 'local'
const tooMany = async (c: any) => {
  const since = Date.now() - 15 * 60 * 1000
  const r = await c.env.DB.prepare('SELECT COUNT(*) n FROM login_attempts WHERE ip = ? AND ts > ?').bind(ipOf(c), since).first()
  return (r?.n ?? 0) >= 5
}
const fail = (c: any) => c.env.DB.prepare('INSERT INTO login_attempts VALUES (?, ?)').bind(ipOf(c), Date.now()).run()

app.get('/api/status', async c => {
  const u = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>()
  const t = getCookie(c, COOKIE)
  let authed = false
  if (t) authed = !!(await c.env.DB.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha(t), Date.now()).first())
  return c.json({ needsSetup: (u?.n ?? 0) === 0, authed })
})
app.post('/api/setup', async c => {
  const { code, password } = await c.req.json<{ code: string; password: string }>()
  const u = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>()
  if ((u?.n ?? 0) > 0) return c.json({ error: 'Account già creato. Accedi con la tua password.' }, 409)
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  if (!c.env.SETUP_CODE) return c.json({ error: 'Manca SETUP_CODE nelle impostazioni del Worker.' }, 500)
  if (!same(code ?? '', c.env.SETUP_CODE)) { await fail(c); return c.json({ error: 'Codice di attivazione errato.' }, 403) }
  if (!password || password.length < 10) return c.json({ error: 'Usa una password di almeno 10 caratteri.' }, 400)
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const r = await c.env.DB.prepare('INSERT INTO users (pass_hash, salt, created_at) VALUES (?, ?, ?)').bind(await hashPass(password, salt), salt, Date.now()).run()
  const uid = r.meta.last_row_id as number
  await c.env.DB.prepare('INSERT INTO state VALUES (?, ?)').bind(uid, JSON.stringify(defaultState)).run()
  await openSession(c, uid)
  return c.json({ ok: true })
})
app.post('/api/login', async c => {
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  const { password } = await c.req.json<{ password: string }>()
  const u = await c.env.DB.prepare('SELECT * FROM users LIMIT 1').first<{ id: number; pass_hash: string; salt: string }>()
  if (!u || !same(await hashPass(password ?? '', u.salt), u.pass_hash)) { await fail(c); return c.json({ error: 'Password errata.' }, 401) }
  await openSession(c, u.id)
  return c.json({ ok: true })
})
app.post('/api/logout', async c => {
  const t = getCookie(c, COOKIE)
  if (t) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha(t)).run()
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

const auth = async (c: any, next: any) => {
  const t = getCookie(c, COOKIE)
  const s = t && await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha(t), Date.now()).first()
  if (!s) return c.json({ error: 'Sessione scaduta. Accedi di nuovo.' }, 401)
  c.set('uid', s.user_id); await next()
}
for (const p of ['/api/bootstrap', '/api/state', '/api/activities/*', '/api/tests/*', '/api/import']) app.use(p, auth)

const dump = async (db: D1Database, uid: number) => {
  const [p, s, a, t] = await db.batch<any>([
    db.prepare('SELECT json FROM plan WHERE id = 1'),
    db.prepare('SELECT json FROM state WHERE user_id = ?').bind(uid),
    db.prepare('SELECT json FROM activities WHERE user_id = ? ORDER BY date').bind(uid),
    db.prepare('SELECT json FROM tests WHERE user_id = ? ORDER BY date').bind(uid),
  ])
  return {
    plan: JSON.parse(p.results[0].json),
    state: s.results[0] ? JSON.parse(s.results[0].json) : defaultState,
    activities: a.results.map((r: any) => JSON.parse(r.json)),
    tests: t.results.map((r: any) => JSON.parse(r.json)),
  }
}
app.get('/api/bootstrap', async c => c.json(await dump(c.env.DB, c.get('uid'))))
const putState = (db: D1Database, uid: number, s: unknown) => db.prepare('INSERT INTO state VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json').bind(uid, JSON.stringify(s))
const putAct = (db: D1Database, uid: number, a: any) => db.prepare('INSERT INTO activities VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, json = excluded.json, updated_at = excluded.updated_at').bind(a.id, uid, a.date, JSON.stringify(a), Date.now())
const putTest = (db: D1Database, uid: number, t: any) => db.prepare('INSERT INTO tests VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, json = excluded.json').bind(t.id, uid, t.date, t.kind, JSON.stringify(t))
app.put('/api/state', async c => { await putState(c.env.DB, c.get('uid'), await c.req.json()).run(); return c.json({ ok: true }) })
app.put('/api/activities/:id', async c => {
  const a = await c.req.json<any>()
  if (a.id !== c.req.param('id') || !/^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '')) return c.json({ error: 'Attività non valida.' }, 400)
  await putAct(c.env.DB, c.get('uid'), a).run(); return c.json({ ok: true })
})
app.delete('/api/activities/:id', async c => { await c.env.DB.prepare('DELETE FROM activities WHERE user_id = ? AND id = ?').bind(c.get('uid'), c.req.param('id')).run(); return c.json({ ok: true }) })
app.put('/api/tests/:id', async c => { await putTest(c.env.DB, c.get('uid'), await c.req.json()).run(); return c.json({ ok: true }) })
app.post('/api/import', async c => {
  const d = await c.req.json<any>(), db = c.env.DB, uid = c.get('uid')
  if (!Array.isArray(d.activities) || !d.state) return c.json({ error: 'File di backup non valido.' }, 400)
  const stm = [putState(db, uid, d.state), ...d.activities.map((a: any) => putAct(db, uid, a)), ...(d.tests ?? []).map((t: any) => putTest(db, uid, t))]
  for (let i = 0; i < stm.length; i += 50) await db.batch(stm.slice(i, i + 50))
  return c.json({ ok: true, imported: d.activities.length })
})
app.notFound(c => c.json({ error: 'Non trovato' }, 404))
app.onError((e, c) => { console.error(e); return c.json({ error: 'Errore del server. Riprova.' }, 500) })
export default app
