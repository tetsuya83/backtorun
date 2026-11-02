import { useState } from 'preact/hooks'
import { call } from '../api'
import { Logo } from '../main'
import { Field } from '../ui'
export function Login({ setup, done }: { setup: boolean; done: () => void }) {
  const [code, setCode] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async (e: Event) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await call('POST', setup ? '/api/setup' : '/api/login', setup ? { code, password: pw } : { password: pw }); done() }
    catch (x: any) { setErr(x.message ?? 'Controlla la connessione e riprova.') } finally { setBusy(false) }
  }
  return (
    <form class="login" onSubmit={go}>
      <Logo />
      <h1>{setup ? 'Crea il tuo accesso' : 'Bentornato, Roberto'}</h1>
      {setup && <Field label="Codice di attivazione"><input value={code} onInput={e => setCode(e.currentTarget.value)} autocomplete="off" required /></Field>}
      <Field label={setup ? 'Nuova password, almeno 10 caratteri' : 'Password'}><input type="password" value={pw} onInput={e => setPw(e.currentTarget.value)} autocomplete={setup ? 'new-password' : 'current-password'} required /></Field>
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn" disabled={busy}>{setup ? 'Crea accesso' : 'Accedi'}</button>
    </form>
  )
}
