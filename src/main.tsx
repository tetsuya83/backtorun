import '@fontsource-variable/inter/wght.css'
import './style.css'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { call, data, flush, load, online, pending, saveWorkout, uid } from './api'
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
import { Consult, Home } from './views/Home'
import { Learn } from './views/Learn'
import { Help } from './views/Help'
import { Workouts } from './views/Workouts'
import { FREE, GuideView } from './views/Guide'
import { Builder } from './views/Builder'
import { local } from './sound'
import { mustChoose } from '../shared/engine'

const TABS = [
  ['home', 'Home', 'M4 11l8-7 8 7v9h-5v-6H9v6H4z', ['home', 'aiuto']],
  ['oggi', 'Allenati', 'M4 13h6l2-7 4 13 2-6h2', ['oggi', 'guida', 'registra', 'forza', 'timer', 'routine', 'costruisci', 'allenamenti']],
  ['consulta', 'Consulta', 'M5 19v-6M12 19V6M19 19v-9', ['consulta', 'piano', 'andamento', 'test', 'corsa', 'mio-piano']],
  ['impara', 'Impara', 'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z', ['impara']],
  ['impostazioni', 'Profilo', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', ['impostazioni']],
] as const
function App() {
  const [route, setRoute] = useState(location.hash.slice(2) || 'home')
  const [auth, setAuth] = useState<'load' | 'login' | 'setup' | 'in' | 'error'>('load')
  useEffect(() => {
    const h = () => { setRoute(location.hash.slice(2) || 'home'); window.scrollTo(0, 0) }
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
      if (location.hash.startsWith('#/invito/')) location.hash = '#/home'
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
  const base = mustChoose(data.value) && !asked.startsWith('mio-piano') && asked !== 'aiuto' ? 'mio-piano' : asked
  return (
    <div class="app">
      <header class="top">
        <button class="brand" onClick={() => { location.hash = '#/home' }} aria-label="Vai alla Home"><Logo small /></button>
        <div class="top-right">
          {(!online.value || pending.value > 0) && <span class="sync">{online.value ? 'Sincronizzo' : 'Offline'}{pending.value ? `, ${pending.value} in attesa` : ''}</span>}
        </div>
      </header>
      <main>
        {base === 'home' && <Home />}
        {base === 'consulta' && <Consult />}
        {base === 'aiuto' && <Help />}
        {base.split('/')[0] === 'impara' && <Learn route={base} />}
        {base === 'guida' && <GuideView key={route} route={route} />}
        {base === 'costruisci' && <FreeBuilder />}
        {base.split('/')[0] === 'allenamenti' && <Workouts key={base} route={base} />}
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
        {TABS.map(([id, label, d, of]) => (
          <a key={id} href={'#/' + id} class={(of as readonly string[]).includes(base.split('/')[0]) ? 'active' : ''} aria-current={(of as readonly string[]).includes(base.split('/')[0]) ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d={d} /></svg>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
function FreeBuilder() {
  return <Builder title="Nuovo allenamento" pickSport named cta="Salva tra i miei allenamenti" second="Parti senza salvare" onCancel={() => { location.hash = '#/allenamenti' }} onDone={b => {
    if (b.save) { const id = uid(); saveWorkout({ id, name: b.name, sport: b.sport, text: b.text, km: b.km, blocks: b.blocks, fiato: b.fiato || null, fatica: b.fatica || null }); location.hash = '#/allenamenti/' + id; return }
    local.set(FREE, { blocks: b.blocks, text: b.text, sport: b.sport }); location.hash = '#/guida?free=1'
  }} />
}
export function Logo({ small }: { small?: boolean }) {
  return <span class={'logo' + (small ? ' sm' : '')}><i /><i /><i /><b>BackToRun</b></span>
}
render(<App />, document.getElementById('app')!)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js')
