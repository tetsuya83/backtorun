import '@fontsource-variable/inter/wght.css'
import './style.css'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { call, data, flush, load, loadCached, online, pending, refresh, saveWorkout, uid } from './api'
import { Login } from './views/Login'
import { PlanView } from './views/Plan'
import { Log } from './views/Log'
import { Tests } from './views/Tests'
import { Settings, SettingsPage } from './views/Settings'
import { Strength } from './views/Strength'
import { RunView } from './views/Run'
import { RoutineView, TimerView } from './views/Timer'
import { BlankPlan, EditPlan, MyPlan } from './views/MyPlan'
import { BaseDaysView, NewPlan, PlanSettings } from './views/PlanSetup'
import { Home } from './views/Home'
import { Diary } from './views/Diary'
import { RaceSettings } from './views/Race'
import { Learn } from './views/Learn'
import { Help } from './views/Help'
import { News } from './views/News'
import { Workouts } from './views/Workouts'
import { FREE, GuideView } from './views/Guide'
import { Builder } from './views/Builder'
import { Routes } from './views/Routes'
import { local } from './sound'
import { goBack, navDepth } from './ui'
import { mustChoose } from '../shared/engine'

const TABS = [
  ['home', 'Oggi', 'M4 13h6l2-7 4 13 2-6h2', ['home', 'oggi', 'guida', 'registra', 'forza', 'timer', 'routine', 'costruisci', 'allenamenti', 'percorsi']],
  ['piano', 'Piano', 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', ['piano', 'mio-piano', 'test', 'gara']],
  ['diario', 'Diario', 'M5 19v-6M12 19V6M19 19v-9', ['diario', 'andamento', 'corsa', 'consulta']],
  ['impara', 'Impara', 'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z', ['impara']],
  ['impostazioni', 'Profilo', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', ['impostazioni', 'aiuto', 'novita']],
] as const
const ROOTS = ['home', 'piano', 'diario', 'impara', 'impostazioni']
const tabOf = (base: string) => TABS.find(t => (t[3] as readonly string[]).includes(base.split('/')[0]))?.[0] ?? 'home'
// posizione di ogni pagina, ritrovata quando si torna indietro
const scrolls = new Map<string, number>()
let back = false
const keyOf = (url: string) => url.split('#')[1] ?? ''
function App() {
  const [route, setRoute] = useState(location.hash.slice(2) || 'home')
  const [auth, setAuth] = useState<'load' | 'login' | 'setup' | 'in' | 'error'>('load')
  useEffect(() => {
    const pop = () => { back = true }
    const h = (e: HashChangeEvent) => {
      scrolls.set(keyOf(e.oldURL), scrollY)
      const was = back; back = false
      navDepth.n = was ? Math.max(0, navDepth.n - 1) : navDepth.n + 1
      setRoute(location.hash.slice(2) || 'home')
      const y = was ? scrolls.get(keyOf(e.newURL)) ?? 0 : 0
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
    addEventListener('popstate', pop); addEventListener('hashchange', h)
    const on = () => { online.value = true; void flush() }, off = () => { online.value = false }
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('popstate', pop); removeEventListener('hashchange', h); removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  const start = async () => {
    // con i dati sul telefono l'app parte subito e si aggiorna in sottofondo
    if (!location.hash.startsWith('#/invito/') && loadCached()) {
      setAuth('in')
      refresh().catch((e: any) => { if (e.status === 401) setAuth('login') })
      return
    }
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
  const top = base.split('/')[0], tab = tabOf(base), root = ROOTS.includes(base)
  return (
    <div class="app">
      <header class="top">
        {root ? <button class="brand" onClick={() => { location.hash = '#/home' }} aria-label="Vai a Oggi"><Logo small /></button>
          : <button class="back" onClick={() => goBack(tabOf(base))}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Indietro</button>}
        <div class="top-right">
          {(!online.value || pending.value > 0) && <span class="sync">{online.value ? 'Sincronizzo' : 'Offline'}{pending.value ? `, ${pending.value} in attesa` : ''}</span>}
        </div>
      </header>
      <main class={'pg-' + top}>
        {(base === 'home' || base === 'oggi') && <Home />}
        {(top === 'diario' || base === 'consulta' || base === 'andamento') && <Diary route={base === 'andamento' ? 'diario/andamento' : base} />}
        {base === 'aiuto' && <Help />}
        {base === 'novita' && <News />}
        {top === 'impara' && <Learn route={base} />}
        {base === 'guida' && <GuideView key={route} route={route} />}
        {base === 'costruisci' && <FreeBuilder />}
        {top === 'allenamenti' && <Workouts key={base} route={base} />}
        {top === 'percorsi' && <Routes key={route} route={route} />}
        {base === 'piano' && <PlanView />}
        {base === 'gara' && <RaceSettings />}
        {base.startsWith('registra') && <Log route={route} />}
        {base === 'test' && <Tests key={route} route={route} />}
        {base === 'corsa' && <RunView route={route} />}
        {base === 'forza' && <Strength key={route} route={route} />}
        {base === 'timer' && <TimerView key={route} route={route} />}
        {base === 'routine' && <RoutineView key={route} route={route} />}
        {base === 'mio-piano' && <MyPlan />}
        {base === 'mio-piano/nuovo' && <NewPlan />}
        {base === 'mio-piano/tabella' && <BlankPlan />}
        {base === 'mio-piano/modifica' && <EditPlan />}
        {base === 'mio-piano/impostazioni' && <PlanSettings />}
        {base === 'mio-piano/giorni' && <BaseDaysView />}
        {base === 'impostazioni' && <Settings onLogout={() => setAuth('login')} />}
        {top === 'impostazioni' && base !== 'impostazioni' && <SettingsPage key={base} page={base.split('/')[1]} />}
      </main>
      <nav class="tabs">
        <a class="tabs-logo" href="#/home" aria-label="Vai a Oggi"><Logo small /></a>
        {TABS.map(([id, label, d]) => (
          <a key={id} href={'#/' + id} class={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined}>
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
