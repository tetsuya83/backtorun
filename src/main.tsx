import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './style.css'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { call, data, flush, load, online, pending } from './api'
import { Login } from './views/Login'
import { Today } from './views/Today'
import { PlanView } from './views/Plan'
import { Log } from './views/Log'
import { Trends } from './views/Trends'
import { Tests } from './views/Tests'
import { Settings } from './views/Settings'
import { Strength } from './views/Strength'
import { RunView } from './views/Run'
import { RoutineView, TimerView } from './views/Timer'
import { BlankPlan, EditPlan, MyPlan, NewPlan } from './views/MyPlan'

const TABS = [
  ['oggi', 'Oggi', 'M4 13h6l2-7 4 13 2-6h2'],
  ['piano', 'Piano', 'M5 5h14v15H5zM5 10h14M10 5v15'],
  ['registra', 'Registra', 'M12 5v14M5 12h14'],
  ['andamento', 'Andamento', 'M5 19v-6M12 19V6M19 19v-9'],
  ['test', 'Test', 'M5 19h4v-4h4v-4h4V7h3'],
]
function App() {
  const [route, setRoute] = useState(location.hash.slice(2) || 'oggi')
  const [auth, setAuth] = useState<'load' | 'login' | 'setup' | 'in' | 'error'>('load')
  useEffect(() => {
    const h = () => { setRoute(location.hash.slice(2) || 'oggi'); window.scrollTo(0, 0) }
    addEventListener('hashchange', h)
    const on = () => { online.value = true; void flush() }, off = () => { online.value = false }
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('hashchange', h); removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  const start = async () => {
    try {
      let s: any
      try { s = await call('GET', '/api/status') }
      catch { await load(); setAuth('in'); return }
      if (!s.authed) { setAuth(s.needsSetup ? 'setup' : 'login'); return }
      if (location.hash.startsWith('#/invito/')) location.hash = '#/oggi'
      await load(); setAuth('in')
    } catch (e: any) { setAuth(e.status === 401 ? 'login' : 'error') }
  }
  useEffect(() => { void start() }, [])
  if (auth === 'load') return <div class="splash"><Logo /></div>
  if (auth === 'error') return <div class="splash"><Logo /><p>Serve la connessione per il primo avvio.</p><button class="btn" onClick={start}>Riprova</button></div>
  if (auth !== 'in') return <Login setup={auth === 'setup'} done={start} />
  if (!data.value) return null
  const asked = route.split('?')[0]
  // chi arriva su invito sceglie il piano al primo accesso
  const base = !data.value.state.mode && !data.value.me?.isAdmin && !asked.startsWith('mio-piano') ? 'mio-piano' : asked
  return (
    <div class="app">
      <header class="top">
        <button class="brand" onClick={() => { location.hash = '#/oggi' }} aria-label="Vai a Oggi"><Logo small /></button>
        <div class="top-right">
          {(!online.value || pending.value > 0) && <span class="sync">{online.value ? 'Sincronizzo' : 'Offline'}{pending.value ? `, ${pending.value} in attesa` : ''}</span>}
          <button class="icon" aria-label="Impostazioni" onClick={() => { location.hash = '#/impostazioni' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
          </button>
        </div>
      </header>
      <main>
        {base === 'oggi' && <Today />}
        {base === 'piano' && <PlanView />}
        {base.startsWith('registra') && <Log route={route} />}
        {base === 'andamento' && <Trends />}
        {base === 'test' && <Tests />}
        {base === 'corsa' && <RunView route={route} />}
        {base === 'forza' && <Strength key={route} route={route} />}
        {base === 'timer' && <TimerView key={route} route={route} />}
        {base === 'routine' && <RoutineView key={route} route={route} />}
        {base === 'mio-piano' && <MyPlan />}
        {base === 'mio-piano/nuovo' && <NewPlan />}
        {base === 'mio-piano/tabella' && <BlankPlan />}
        {base === 'mio-piano/modifica' && <EditPlan />}
        {base === 'impostazioni' && <Settings onLogout={() => setAuth('login')} />}
      </main>
      <nav class="tabs">
        {TABS.map(([id, label, d]) => (
          <a key={id} href={'#/' + id} class={base.startsWith(id) ? 'active' : ''} aria-current={base.startsWith(id) ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d={d} /></svg>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
export function Logo({ small }: { small?: boolean }) {
  return <span class={'logo' + (small ? ' sm' : '')}><i /><i /><i /><b>BackToRun</b></span>
}
render(<App />, document.getElementById('app')!)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js')
