import { useEffect, useState } from 'preact/hooks'
import { call } from '../api'
import { Logo } from '../main'
import { Field } from '../ui'
type Mode = 'login' | 'setup' | 'invite' | 'reset'
const inviteCode = () => location.hash.match(/^#\/invito\/([0-9a-f]+)/)?.[1] ?? null
export function Login({ setup, done }: { setup: boolean; done: () => void }) {
  const code0 = inviteCode()
  const [mode, setMode] = useState<Mode>(setup ? 'setup' : code0 ? 'invite' : 'login')
  const [code, setCode] = useState(''), [name, setName] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!code0) return
    call('GET', `/api/invite/${code0}`).then(r => setMode(r.reset ? 'reset' : 'invite')).catch(e => { setErr(e.message); setMode('login') })
  }, [])
  const go = async (e: Event) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (mode === 'setup') await call('POST', '/api/setup', { code, name, password: pw })
      else if (mode === 'login') await call('POST', '/api/login', { name, password: pw })
      else await call('POST', '/api/redeem', { code: code0, name, password: pw })
      if (code0) location.hash = '#/oggi'
      done()
    } catch (x: any) { setErr(x.message ?? 'Controlla la connessione e riprova.') } finally { setBusy(false) }
  }
  const title = { login: 'Bentornato', setup: 'Crea il tuo accesso', invite: 'Benvenuto in BackToRun', reset: 'Scegli una nuova password' }[mode]
  const cta = { login: 'Accedi', setup: 'Crea accesso', invite: 'Crea il mio profilo', reset: 'Salva password' }[mode]
  return (
    <form class="login" onSubmit={go}>
      <Logo />
      <h1>{title}</h1>
      {mode === 'setup' && <Field label="Codice di attivazione"><input value={code} onInput={e => setCode(e.currentTarget.value)} autocomplete="off" required /></Field>}
      {mode !== 'reset' && <Field label="Nome utente"><input value={name} onInput={e => setName(e.currentTarget.value)} autocomplete="username" autocapitalize="none" required /></Field>}
      <Field label={mode === 'login' ? 'Password' : 'Nuova password, almeno 10 caratteri'}><input type="password" value={pw} onInput={e => setPw(e.currentTarget.value)} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field>
      {mode === 'invite' && <p class="sub">Dopo l'accesso scegli il tuo percorso e il tuo obiettivo. Nessun piano sostituisce il parere del medico.</p>}
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn" disabled={busy}>{cta}</button>
    </form>
  )
}
