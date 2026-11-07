import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import planData from '../shared/plan.json'
import { defaultState, MAX_WORKOUTS, planError, workoutError } from '../shared/engine'
import { isStrava, remoteOf, watchEventError } from '../shared/intervals'
import { MAX_ROUTES, routeError, type Pt } from '../shared/route'

type Env = { Bindings: { DB: D1Database; SETUP_CODE?: string; INTERVALS_URL?: string; ORS_URL?: string }; Variables: { uid: number } }
const app = new Hono<Env>()
const COOKIE = 'btr_session'
const ITER = 10000 // basso di proposito: il piano gratuito concede 10 ms di CPU per richiesta
const YEAR = 60 * 60 * 24 * 365

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL, name TEXT, is_admin INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS state (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_plans (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activities (id TEXT NOT NULL, user_id INTEGER NOT NULL, date TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE INDEX IF NOT EXISTS idx_act_date ON activities (user_id, date)`,
  `CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS workouts (id TEXT NOT NULL, user_id INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE TABLE IF NOT EXISTS intervals (user_id INTEGER PRIMARY KEY, api_key TEXT NOT NULL, connected_at INTEGER NOT NULL, skipped TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS routing (user_id INTEGER PRIMARY KEY, api_key TEXT NOT NULL, connected_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL, json TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS routes (id TEXT NOT NULL, user_id INTEGER NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id))`,
  `CREATE TABLE IF NOT EXISTS tests (id TEXT NOT NULL, user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (user_id, id))`,
]
const MAX_USERS = 10
const INVITE_DAYS = 7
let ready = false
async function ensure(db: D1Database) {
  if (ready) return
  await db.batch(SCHEMA.map(s => db.prepare(s)))
  const cols = (await db.prepare('PRAGMA table_info(users)').all<{ name: string }>()).results.map(c => c.name)
  if (!cols.includes('name')) {
    // versione a utente singolo: il primo account diventa amministratore
    await db.batch([
      db.prepare('ALTER TABLE users ADD COLUMN name TEXT'),
      db.prepare('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'),
      db.prepare("UPDATE users SET name = 'roberto', is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)"),
    ])
  }
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_name ON users (name)').run()
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
const cleanName = (n?: string) => (n ?? '').trim().toLowerCase()
const validName = (n: string) => /^[a-zà-ÿ0-9._-]{2,24}$/.test(n)
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10) }
async function createUser(c: any, name: string, password: string, admin: number) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const r = await c.env.DB.prepare('INSERT INTO users (pass_hash, salt, created_at, name, is_admin) VALUES (?, ?, ?, ?, ?)').bind(await hashPass(password, salt), salt, Date.now(), name, admin).run()
  const uid = r.meta.last_row_id as number
  await c.env.DB.prepare('INSERT INTO state VALUES (?, ?)').bind(uid, JSON.stringify({ ...defaultState, startDate: nextMonday() })).run()
  return uid
}
app.post('/api/setup', async c => {
  const { code, name: raw, password } = await c.req.json<{ code: string; name: string; password: string }>()
  const name = cleanName(raw)
  const u = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>()
  if ((u?.n ?? 0) > 0) return c.json({ error: 'Account già creato. Accedi con la tua password.' }, 409)
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  if (!c.env.SETUP_CODE) return c.json({ error: 'Manca SETUP_CODE nelle impostazioni del Worker.' }, 500)
  if (!same(code ?? '', c.env.SETUP_CODE)) { await fail(c); return c.json({ error: 'Codice di attivazione errato.' }, 403) }
  if (!validName(name)) return c.json({ error: 'Il nome utente deve avere da 2 a 24 caratteri, senza spazi.' }, 400)
  if (!password || password.length < 10) return c.json({ error: 'Usa una password di almeno 10 caratteri.' }, 400)
  await openSession(c, await createUser(c, name, password, 1))
  return c.json({ ok: true })
})
app.get('/api/invite/:code', async c => {
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  const i = await c.env.DB.prepare('SELECT user_id FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?').bind(await sha(c.req.param('code')), Date.now()).first<{ user_id: number | null }>()
  if (!i) { await fail(c); return c.json({ error: 'Invito non valido o scaduto. Chiedine uno nuovo.' }, 404) }
  return c.json({ reset: i.user_id != null })
})
app.post('/api/redeem', async c => {
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  const { code, name: raw, password } = await c.req.json<{ code: string; name?: string; password: string }>()
  const hash = await sha(code ?? '')
  const i = await c.env.DB.prepare('SELECT user_id FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?').bind(hash, Date.now()).first<{ user_id: number | null }>()
  if (!i) { await fail(c); return c.json({ error: 'Invito non valido o scaduto. Chiedine uno nuovo.' }, 404) }
  if (!password || password.length < 10) return c.json({ error: 'Usa una password di almeno 10 caratteri.' }, 400)
  let uid = i.user_id
  if (uid != null) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPass(password, salt), salt, uid),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid),
    ])
  } else {
    const name = cleanName(raw)
    if (!validName(name)) return c.json({ error: 'Il nome utente deve avere da 2 a 24 caratteri, senza spazi.' }, 400)
    if (await c.env.DB.prepare('SELECT 1 FROM users WHERE name = ?').bind(name).first()) return c.json({ error: 'Questo nome utente è già usato.' }, 409)
    uid = await createUser(c, name, password, 0)
  }
  await c.env.DB.prepare('UPDATE invites SET used_at = ? WHERE code_hash = ?').bind(Date.now(), hash).run()
  await openSession(c, uid)
  return c.json({ ok: true })
})
app.post('/api/login', async c => {
  if (await tooMany(c)) return c.json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429)
  const { name, password } = await c.req.json<{ name: string; password: string }>()
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(cleanName(name)).first<{ id: number; pass_hash: string; salt: string }>()
  const salt = u?.salt ?? '00000000'
  const h = await hashPass(password ?? '', salt)
  if (!u || !same(h, u.pass_hash)) { await fail(c); return c.json({ error: 'Nome utente o password errati.' }, 401) }
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
for (const p of ['/api/bootstrap', '/api/state', '/api/custom-plan', '/api/activities/*', '/api/tests/*', '/api/workouts/*', '/api/routes/*', '/api/push/*', '/api/routing/*', '/api/import', '/api/intervals/*', '/api/admin/*']) app.use(p, auth)
app.use('/api/admin/*', async (c, next) => {
  const u = await c.env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(c.get('uid')).first<{ is_admin: number }>()
  if (!u?.is_admin) return c.json({ error: 'Riservato all\'amministratore.' }, 403)
  await next()
})
app.get('/api/admin/users', async c => {
  const now = Date.now()
  const u = await c.env.DB.prepare('SELECT u.id, u.name, u.is_admin isAdmin, u.created_at createdAt, (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id) activities FROM users u ORDER BY u.id').all()
  const i = await c.env.DB.prepare('SELECT COUNT(*) n FROM invites WHERE user_id IS NULL AND used_at IS NULL AND expires_at > ?').bind(now).first<{ n: number }>()
  return c.json({ users: u.results, openInvites: i?.n ?? 0, max: MAX_USERS })
})
app.post('/api/admin/invites', async c => {
  const { userId } = await c.req.json<{ userId?: number }>().catch(() => ({} as { userId?: number }))
  const now = Date.now()
  if (userId == null) {
    const n = await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM invites WHERE user_id IS NULL AND used_at IS NULL AND expires_at > ?) n').bind(now).first<{ n: number }>()
    if ((n?.n ?? 0) >= MAX_USERS) return c.json({ error: `Hai raggiunto il massimo di ${MAX_USERS} persone, inviti aperti compresi.` }, 409)
  } else if (!await c.env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(userId).first()) return c.json({ error: 'Persona non trovata.' }, 404)
  const code = hex(crypto.getRandomValues(new Uint8Array(12)))
  await c.env.DB.prepare('INSERT INTO invites VALUES (?, ?, ?, NULL)').bind(await sha(code), userId ?? null, now + INVITE_DAYS * 864e5).run()
  return c.json({ code, days: INVITE_DAYS })
})
app.delete('/api/admin/users/:id', async c => {
  const id = +c.req.param('id'), db = c.env.DB
  if (id === c.get('uid')) return c.json({ error: 'Non puoi eliminare il tuo account.' }, 400)
  await db.batch(['sessions', 'state', 'user_plans', 'activities', 'tests', 'workouts', 'invites', 'intervals', 'routing', 'routes', 'push_subs'].map(t => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)).concat(db.prepare('DELETE FROM users WHERE id = ?').bind(id)))
  return c.json({ ok: true })
})

const dump = async (db: D1Database, uid: number) => {
  const [p, s, a, t, u, x, w, k, r, o] = await db.batch<any>([
    db.prepare('SELECT json FROM plan WHERE id = 1'),
    db.prepare('SELECT json FROM state WHERE user_id = ?').bind(uid),
    db.prepare('SELECT json FROM activities WHERE user_id = ? ORDER BY date').bind(uid),
    db.prepare('SELECT json FROM tests WHERE user_id = ? ORDER BY date').bind(uid),
    db.prepare('SELECT name, is_admin FROM users WHERE id = ?').bind(uid),
    db.prepare('SELECT json FROM user_plans WHERE user_id = ?').bind(uid),
    db.prepare('SELECT json FROM workouts WHERE user_id = ? ORDER BY updated_at DESC').bind(uid),
    db.prepare('SELECT 1 ok FROM intervals WHERE user_id = ?').bind(uid),
    db.prepare('SELECT json FROM routes WHERE user_id = ? ORDER BY updated_at DESC').bind(uid),
    db.prepare('SELECT 1 ok FROM routing WHERE user_id = ?').bind(uid),
  ])
  return {
    plan: JSON.parse(p.results[0].json),
    custom: x.results[0] ? JSON.parse(x.results[0].json) : null,
    state: s.results[0] ? JSON.parse(s.results[0].json) : defaultState,
    activities: a.results.map((r: any) => JSON.parse(r.json)),
    tests: t.results.map((r: any) => JSON.parse(r.json)),
    workouts: w.results.map((r: any) => JSON.parse(r.json)),
    me: { name: u.results[0]?.name, isAdmin: !!u.results[0]?.is_admin, intervals: !!k.results[0], routing: !!o.results[0] },
    routes: r.results.map((x: any) => JSON.parse(x.json)),
  }
}
app.get('/api/bootstrap', async c => c.json(await dump(c.env.DB, c.get('uid'))))
const putState = (db: D1Database, uid: number, s: unknown) => db.prepare('INSERT INTO state VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json').bind(uid, JSON.stringify(s))
const putAct = (db: D1Database, uid: number, a: any) => db.prepare('INSERT INTO activities VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, json = excluded.json, updated_at = excluded.updated_at').bind(a.id, uid, a.date, JSON.stringify(a), Date.now())
const putTest = (db: D1Database, uid: number, t: any) => db.prepare('INSERT INTO tests VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, json = excluded.json').bind(t.id, uid, t.date, t.kind, JSON.stringify(t))
const putPlan = (db: D1Database, uid: number, p: unknown) => db.prepare('INSERT INTO user_plans VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').bind(uid, JSON.stringify(p), Date.now())
const putWorkout = (db: D1Database, uid: number, w: any) => db.prepare('INSERT INTO workouts VALUES (?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').bind(w.id, uid, JSON.stringify(w), Date.now())
app.put('/api/workouts/:id', async c => {
  const w = await c.req.json<any>(), db = c.env.DB, uid = c.get('uid'), e = w.id === c.req.param('id') ? workoutError(w) : 'Allenamento non valido.'
  if (e) return c.json({ error: e }, 400)
  const n = await db.prepare('SELECT COUNT(*) n, SUM(id = ?) me FROM workouts WHERE user_id = ?').bind(w.id, uid).first<{ n: number; me: number }>()
  if ((n?.n ?? 0) >= MAX_WORKOUTS && !n?.me) return c.json({ error: `Puoi salvare al massimo ${MAX_WORKOUTS} allenamenti.` }, 409)
  await putWorkout(db, uid, w).run(); return c.json({ ok: true })
})
app.delete('/api/workouts/:id', async c => { await c.env.DB.prepare('DELETE FROM workouts WHERE user_id = ? AND id = ?').bind(c.get('uid'), c.req.param('id')).run(); return c.json({ ok: true }) })
const putRoute = (db: D1Database, uid: number, r: any) => db.prepare('INSERT INTO routes VALUES (?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').bind(r.id, uid, JSON.stringify(r), r.updatedAt ?? Date.now())
app.put('/api/routes/:id', async c => {
  const r = await c.req.json<any>(), db = c.env.DB, uid = c.get('uid'), e = r.id === c.req.param('id') ? routeError(r) : 'Percorso non valido.'
  if (e) return c.json({ error: e }, 400)
  const n = await db.prepare('SELECT COUNT(*) n, SUM(id = ?) me FROM routes WHERE user_id = ?').bind(r.id, uid).first<{ n: number; me: number }>()
  if ((n?.n ?? 0) >= MAX_ROUTES && !n?.me) return c.json({ error: `Puoi salvare al massimo ${MAX_ROUTES} percorsi.` }, 409)
  await putRoute(db, uid, r).run(); return c.json({ ok: true })
})
app.delete('/api/routes/:id', async c => { await c.env.DB.prepare('DELETE FROM routes WHERE user_id = ? AND id = ?').bind(c.get('uid'), c.req.param('id')).run(); return c.json({ ok: true }) })
app.put('/api/custom-plan', async c => {
  const p = await c.req.json<any>(), e = planError(p)
  if (e) return c.json({ error: e }, 400)
  await putPlan(c.env.DB, c.get('uid'), p).run(); return c.json({ ok: true })
})
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
  if (d.custom && planError(d.custom)) return c.json({ error: 'File di backup non valido.' }, 400)
  if ((d.workouts ?? []).some((w: any) => workoutError(w)) || (d.routes ?? []).some((r: any) => routeError(r))) return c.json({ error: 'File di backup non valido.' }, 400)
  const stm = [putState(db, uid, d.state), ...(d.workouts ?? []).map((w: any) => putWorkout(db, uid, w)), ...(d.routes ?? []).map((r: any) => putRoute(db, uid, r)), ...(d.custom ? [putPlan(db, uid, d.custom)] : []), ...d.activities.map((a: any) => putAct(db, uid, a)), ...(d.tests ?? []).map((t: any) => putTest(db, uid, t))]
  for (let i = 0; i < stm.length; i += 50) await db.batch(stm.slice(i, i + 50))
  return c.json({ ok: true, imported: d.activities.length })
})
// Intervals.icu: la chiave sta solo qui e non viene mai restituita al telefono.
const DAY = 864e5
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const intervals = (c: any, key: string, path: string) => fetch(`${c.env.INTERVALS_URL ?? 'https://intervals.icu'}/api/v1${path}`, { headers: { authorization: 'Basic ' + btoa('API_KEY:' + key), 'user-agent': 'Mozilla/5.0 (compatible; BackToRun)' } })
const linkOf = (c: any) => c.env.DB.prepare('SELECT api_key key, connected_at at, skipped FROM intervals WHERE user_id = ?').bind(c.get('uid')).first() as Promise<{ key: string; at: number; skipped: string } | null>
async function remoteList(c: any, key: string, since: number) {
  let r: Response
  try { r = await intervals(c, key, `/athlete/0/activities?oldest=${isoDay(since)}&newest=${isoDay(Date.now() + DAY)}`) }
  catch { return { error: 'Intervals.icu non risponde. Riprova più tardi.', status: 502 as const } }
  if (r.status === 401 || r.status === 403) return { error: 'Intervals.icu non accetta questa chiave. Controllala nelle sue impostazioni.', status: 400 as const }
  const raw = r.ok ? await r.json().catch(() => null) : null
  if (!Array.isArray(raw)) return { error: 'Intervals.icu non risponde. Riprova più tardi.', status: 502 as const }
  return { items: raw.map(remoteOf).filter(x => x != null), strava: raw.filter(isStrava).length }
}
app.put('/api/intervals/key', async c => {
  const key = String((await c.req.json<any>()).key ?? '').trim()
  if (!/^[\w-]{8,120}$/.test(key)) return c.json({ error: 'Questa non sembra una chiave di Intervals.icu.' }, 400)
  const r = await remoteList(c, key, Date.now() - DAY)
  if ('error' in r) return c.json({ error: r.error }, r.status)
  await c.env.DB.prepare("INSERT INTO intervals VALUES (?, ?, ?, '[]') ON CONFLICT(user_id) DO UPDATE SET api_key = excluded.api_key, connected_at = excluded.connected_at, skipped = '[]'").bind(c.get('uid'), key, Date.now()).run()
  return c.json({ ok: true })
})
app.delete('/api/intervals/key', async c => { await c.env.DB.prepare('DELETE FROM intervals WHERE user_id = ?').bind(c.get('uid')).run(); return c.json({ ok: true }) })
app.get('/api/intervals/new', async c => {
  const l = await linkOf(c)
  if (!l) return c.json({ items: [], strava: 0 })
  // si guarda poco prima del collegamento e al massimo due settimane indietro, così lo storico non invade la Home
  const r = await remoteList(c, l.key, Math.max(l.at - 2 * DAY, Date.now() - 14 * DAY))
  if ('error' in r) return c.json({ error: r.error }, r.status)
  const skip = new Set<string>(JSON.parse(l.skipped))
  return c.json({ items: r.items.filter(x => !skip.has(x.id)), strava: r.strava })
})
app.get('/api/intervals/file/:id', async c => {
  const l = await linkOf(c), id = c.req.param('id')
  if (!l || !/^[\w-]{1,40}$/.test(id)) return c.json({ error: 'Allenamento non trovato.' }, 404)
  const r = await intervals(c, l.key, `/activity/${id}/file`).catch(() => null)
  if (!r?.ok || !r.body) return c.json({ error: 'File non disponibile.' }, 404)
  return new Response(r.body, { headers: { 'content-type': 'application/octet-stream' } })
})
// Le sedute dei prossimi giorni sul calendario di Intervals.icu, che le passa all'orologio. Si toccano solo quelle create da BackToRun.
const icu = (c: any, key: string, path: string, method: string, body?: unknown) => fetch(`${c.env.INTERVALS_URL ?? 'https://intervals.icu'}/api/v1${path}`, { method, headers: { authorization: 'Basic ' + btoa('API_KEY:' + key), 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; BackToRun)' }, body: body === undefined ? undefined : JSON.stringify(body) })
app.put('/api/intervals/plan', async c => {
  const l = await linkOf(c), { from, to, events } = await c.req.json<any>()
  if (!l) return c.json({ error: 'Collega Intervals.icu in Profilo.' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '') || !Array.isArray(events) || events.length > 21 || events.some(watchEventError)) return c.json({ error: 'Sedute non valide.' }, 400)
  const fail = (r: Response | null) => c.json({ error: r && (r.status === 401 || r.status === 403) ? 'Intervals.icu non accetta la chiave. Ricollegalo in Profilo.' : 'Intervals.icu non risponde. Riprova più tardi.' }, r && (r.status === 401 || r.status === 403) ? 400 : 502)
  const ext = (id: string) => 'btr-' + id
  if (events.length) {
    const r = await icu(c, l.key, '/athlete/0/events/bulk?upsert=true', 'POST', events.map((e: any) => ({ category: 'WORKOUT', type: 'Run', start_date_local: `${e.date}T00:00:00`, name: e.name, description: e.description, external_id: ext(e.id) }))).catch(() => null)
    if (!r?.ok) return fail(r)
  }
  const r = await icu(c, l.key, `/athlete/0/events?oldest=${from}&newest=${to}&category=WORKOUT`, 'GET').catch(() => null)
  const list = r?.ok ? await r.json<any[]>().catch(() => null) : null
  if (!Array.isArray(list)) return fail(r)
  const keep = new Set(events.map((e: any) => ext(e.id)))
  const old = list.filter(e => typeof e?.external_id === 'string' && e.external_id.startsWith('btr-') && !keep.has(e.external_id) && String(e.start_date_local ?? '').slice(0, 10) >= from)
  await Promise.all(old.map(e => icu(c, l.key, `/athlete/0/events/${encodeURIComponent(e.id)}`, 'DELETE').catch(() => null)))
  return c.json({ ok: true, sent: events.length, removed: old.length })
})
app.post('/api/intervals/skip/:id', async c => {
  const l = await linkOf(c)
  if (!l) return c.json({ ok: true })
  const list: string[] = JSON.parse(l.skipped), id = c.req.param('id')
  if (!list.includes(id)) await c.env.DB.prepare('UPDATE intervals SET skipped = ? WHERE user_id = ?').bind(JSON.stringify([...list, id].slice(-200)), c.get('uid')).run()
  return c.json({ ok: true })
})
// openrouteservice: come per Intervals.icu, la chiave di ognuno resta sul server e non torna mai al telefono.
const ors = (c: any, key: string, a: number[], b: number[] | null, loop?: { length: number; seed: number }) => fetch(`${c.env.ORS_URL ?? 'https://api.openrouteservice.org'}/v2/directions/foot-walking/geojson`, { method: 'POST', headers: { authorization: key, 'content-type': 'application/json', accept: 'application/geo+json' }, body: JSON.stringify(loop ? { coordinates: [a], elevation: true, options: { round_trip: { length: loop.length, points: 4, seed: loop.seed } } } : { coordinates: [a, b], elevation: true }) })
async function orsLeg(c: any, key: string, a: number[], b: number[] | null, loop?: { length: number; seed: number }) {
  let r: Response
  try { r = await ors(c, key, a, b, loop) } catch { return { error: 'openrouteservice non risponde. Riprova più tardi.', status: 502 as const } }
  const j: any = await r.json().catch(() => null)
  if (r.status === 401 || r.status === 403) return { error: 'openrouteservice non accetta questa chiave. Controllala nel tuo account.', status: 400 as const }
  if (r.status === 429) return { error: 'Hai raggiunto il limite di calcoli di openrouteservice. Riprova tra poco.', status: 429 as const }
  if (j?.error?.code === 2010 || j?.error?.code === 2009) return { error: 'Nessuna strada percorribile vicino a questo punto. Prova più vicino a una via o un sentiero.', status: 422 as const }
  const f = j?.features?.[0]
  if (!r.ok || !f?.geometry?.coordinates) return { error: 'openrouteservice non ha calcolato il tratto. Riprova.', status: 502 as const }
  const round = (x: number) => Math.round(x * 1e6) / 1e6
  return { c: f.geometry.coordinates.map((p: number[]): Pt => p[2] != null ? [round(p[0]), round(p[1]), Math.round(p[2] * 10) / 10] : [round(p[0]), round(p[1])]), m: Number(f.properties?.summary?.distance ?? 0) }
}
const lonlat = (p: any) => Array.isArray(p) && p.length === 2 && p.every((x: any) => typeof x === 'number' && isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
app.put('/api/routing/key', async c => {
  const key = String((await c.req.json<any>()).key ?? '').trim()
  if (!/^[\w=+/.-]{20,600}$/.test(key)) return c.json({ error: 'Questa non sembra una chiave di openrouteservice.' }, 400)
  const r = await orsLeg(c, key, [9.19, 45.464], [9.195, 45.466]) // prova su un breve tratto a Milano
  if ('error' in r) return c.json({ error: r.error }, r.status)
  await c.env.DB.prepare('INSERT INTO routing VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET api_key = excluded.api_key, connected_at = excluded.connected_at').bind(c.get('uid'), key, Date.now()).run()
  return c.json({ ok: true })
})
app.delete('/api/routing/key', async c => { await c.env.DB.prepare('DELETE FROM routing WHERE user_id = ?').bind(c.get('uid')).run(); return c.json({ ok: true }) })
app.post('/api/routing/loop', async c => {
  const { start, km, seed } = await c.req.json<any>(), l = await c.env.DB.prepare('SELECT api_key key FROM routing WHERE user_id = ?').bind(c.get('uid')).first<{ key: string }>()
  if (!l) return c.json({ error: 'Collega openrouteservice in Profilo.' }, 400)
  if (!lonlat(start) || !(km >= 1 && km <= 45) || !Number.isInteger(seed) || seed < 0 || seed > 999) return c.json({ error: 'Scegli una distanza tra 1 e 45 km.' }, 400)
  const r = await orsLeg(c, l.key, start, null, { length: Math.round(km * 1000), seed })
  return 'error' in r ? c.json({ error: r.error }, r.status) : c.json(r)
})
app.post('/api/routing/leg', async c => {
  const { a, b } = await c.req.json<any>(), l = await c.env.DB.prepare('SELECT api_key key FROM routing WHERE user_id = ?').bind(c.get('uid')).first<{ key: string }>()
  if (!l) return c.json({ error: 'Collega openrouteservice in Profilo.' }, 400)
  if (!lonlat(a) || !lonlat(b)) return c.json({ error: 'Punti non validi.' }, 400)
  const r = await orsLeg(c, l.key, a, b)
  return 'error' in r ? c.json({ error: r.error }, r.status) : c.json(r)
})
app.notFound(c => c.json({ error: 'Non trovato' }, 404))
app.onError((e, c) => { console.error(e); return c.json({ error: 'Errore del server. Riprova.' }, 500) })
// Notifica della domenica: un avviso senza contenuto, firmato con una chiave VAPID creata la prima volta e tenuta nel database.
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const utf = (s: string) => new TextEncoder().encode(s)
type Vapid = { pub: string; jwk: JsonWebKey; sub: string }
async function vapid(db: D1Database, origin?: string): Promise<Vapid | null> {
  const row = await db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first<{ value: string }>()
  if (row) return JSON.parse(row.value) as Vapid
  if (!origin) return null
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const v = { pub: b64u(await crypto.subtle.exportKey('raw', k.publicKey) as ArrayBuffer), jwk: await crypto.subtle.exportKey('jwk', k.privateKey) as JsonWebKey, sub: origin }
  await db.prepare("INSERT OR IGNORE INTO app_keys VALUES ('vapid', ?)").bind(JSON.stringify(v)).run()
  return (await vapid(db))!
}
async function pushTo(db: D1Database, v: { pub: string; jwk: JsonWebKey; sub: string }, endpoint: string) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64u(utf(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), body = b64u(utf(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.sub })))
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf(`${head}.${body}`)))
  const r = await fetch(endpoint, { method: 'POST', headers: { authorization: `vapid t=${head}.${body}.${sig}, k=${v.pub}`, ttl: '86400', urgency: 'normal', 'content-length': '0' } }).catch(() => null)
  if (r && (r.status === 404 || r.status === 410)) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run()
  return !!r?.ok
}
const pushOk = (s: any) => typeof s?.endpoint === 'string' && /^https:\/\/[^\s]{10,900}$/.test(s.endpoint)
app.get('/api/push/key', async c => c.json({ key: (await vapid(c.env.DB, new URL(c.req.url).origin))!.pub }))
app.put('/api/push/sub', async c => {
  const s = (await c.req.json<any>()).sub
  if (!pushOk(s)) return c.json({ error: 'Iscrizione non valida.' }, 400)
  const db = c.env.DB, n = await db.prepare('SELECT COUNT(*) n FROM push_subs WHERE user_id = ? AND endpoint != ?').bind(c.get('uid'), s.endpoint).first<{ n: number }>()
  if ((n?.n ?? 0) >= 5) return c.json({ error: 'Hai già attivato le notifiche su 5 dispositivi.' }, 409)
  await db.prepare('INSERT INTO push_subs VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, json = excluded.json').bind(s.endpoint, c.get('uid'), JSON.stringify({ endpoint: s.endpoint }), Date.now()).run()
  return c.json({ ok: true })
})
app.delete('/api/push/sub', async c => {
  const s = await c.req.json<any>()
  await c.env.DB.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').bind(c.get('uid'), String(s.endpoint ?? '')).run()
  return c.json({ ok: true })
})
app.post('/api/push/test', async c => {
  const db = c.env.DB, v = await vapid(db, new URL(c.req.url).origin), l = await db.prepare('SELECT endpoint FROM push_subs WHERE user_id = ?').bind(c.get('uid')).all<{ endpoint: string }>()
  const ok = await Promise.all(l.results.map(x => pushTo(db, v!, x.endpoint)))
  return ok.some(Boolean) ? c.json({ ok: true }) : c.json({ error: 'La notifica non è partita. Disattivala e riattivala.' }, 502)
})
async function weekly(env: { DB: D1Database }) {
  await ensure(env.DB)
  const v = await vapid(env.DB)
  if (!v) return
  const l = await env.DB.prepare('SELECT endpoint FROM push_subs').all<{ endpoint: string }>()
  await Promise.all(l.results.map(x => pushTo(env.DB, v, x.endpoint)))
}
export default { fetch: app.fetch, scheduled: (_e: ScheduledController, env: { DB: D1Database }, ctx: ExecutionContext) => ctx.waitUntil(weekly(env)) }
