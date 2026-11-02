import { useEffect, useRef, useState } from 'preact/hooks'
import { call, clearLocal, data, load, saveState } from '../api'
import { Field, Note } from '../ui'
import type { Activity } from '../../shared/engine'

const save = (name: string, text: string, type: string) => { const u = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
const CSV = ['date', 'type', 'source', 'km', 'seconds', 'hrAvg', 'hrMax', 'hrLast', 'splits', 'fiato', 'fatica', 'knee', 'swelling', 'locked', 'note', 'sessionKey'] as const
const csv = (l: Activity[]) => [CSV.join(';'), ...l.map(a => CSV.map(k => { const v = a[k]; return v == null ? '' : `"${String(v).replace(/"/g, '""')}"` }).join(';'))].join('\n')
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
    <h2 class="phase">Persone</h2>
    <p class="sub pad">{info.users.length} su {info.max}{info.openInvites ? `, ${info.openInvites} ${info.openInvites === 1 ? 'invito aperto' : 'inviti aperti'}` : ''}. Ognuno vede solo i propri dati.</p>
    <ul class="hist people">{info.users.map(p => <li key={p.id}><div><b>{p.name}</b><span>{p.isAdmin ? 'Amministratore' : `${p.activities} allenamenti`}</span></div>
      {!p.isAdmin && <div class="row"><button type="button" class="link" onClick={() => invite(p.id, `Nuova password per ${p.name}`)}>Nuova password</button><button type="button" class="link danger" onClick={() => remove(p)}>Elimina</button></div>}
    </li>)}</ul>
    <button class="btn ghost" type="button" onClick={() => invite()}>Crea invito</button>
    {link && <section class="panel go"><h2>{what}</h2><input readOnly value={link} aria-label="Link da inviare" onFocus={e => e.currentTarget.select()} /><button class="btn" type="button" onClick={share}>{copied ? 'Link copiato' : 'Invia il link'}</button></section>}
    {err && <p class="err" role="alert">{err}</p>}
  </>
}
export function Settings({ onLogout }: { onLogout: () => void }) {
  const d = data.value!, st = d.state
  const [msg, setMsg] = useState('')
  const f = useRef<HTMLInputElement>(null)
  const stamp = new Date().toISOString().slice(0, 10)
  const restore = async (file?: File | null) => {
    if (!file) return
    try { const j = JSON.parse(await file.text()); const r = await call('POST', '/api/import', j); await load(); setMsg(`Ripristinati ${r.imported} allenamenti.`) }
    catch (e: any) { setMsg(e.message ?? 'File di backup non valido.') }
  }
  return (
    <div class="stack form">
      <section class="head"><h1>Impostazioni</h1></section>
      <h2 class="phase">Calendario</h2>
      <Field label="Inizio del piano"><input type="date" value={st.startDate} onChange={e => saveState({ ...st, startDate: e.currentTarget.value })} /></Field>
      <Field label="Settimana di partenza"><input type="number" min={1} max={34} value={st.startWeek} onChange={e => saveState({ ...st, startWeek: Math.min(34, Math.max(1, +e.currentTarget.value || 1)) })} /></Field>
      <h2 class="phase">Gara</h2>
      <Field label="Data della maratona"><input type="date" value={st.raceDate ?? ''} onChange={e => saveState({ ...st, raceDate: e.currentTarget.value || null })} /></Field>
      <Field label="Nome della gara"><input value={st.raceName ?? ''} onChange={e => saveState({ ...st, raceName: e.currentTarget.value || null })} /></Field>
      <h2 class="phase">Backup</h2>
      <p class="sub pad">Scarica un backup ogni mese: il piano gratuito non è un archivio garantito.</p>
      <div class="row">
        <button class="btn ghost" type="button" onClick={() => save(`backtorun-${stamp}.json`, JSON.stringify({ state: d.state, activities: d.activities, tests: d.tests }), 'application/json')}>Scarica backup</button>
        <button class="btn ghost" type="button" onClick={() => save(`backtorun-${stamp}.csv`, '﻿' + csv(d.activities), 'text/csv')}>Scarica CSV</button>
      </div>
      <input ref={f} type="file" accept=".json" hidden onChange={e => restore(e.currentTarget.files?.[0])} />
      <button class="btn ghost" type="button" onClick={() => f.current?.click()}>Ripristina backup</button>
      {msg && <Note tone="go">{msg}</Note>}
      {d.me?.isAdmin && <People />}
      <h2 class="phase">Account</h2>
      {d.me && <p class="sub pad">Accesso come {d.me.name}.</p>}
      <button class="btn ghost danger" type="button" onClick={async () => { await call('POST', '/api/logout').catch(() => null); clearLocal(); onLogout() }}>Esci</button>
    </div>
  )
}
