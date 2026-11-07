import { useMemo, useState } from 'preact/hooks'
import { data } from '../api'
import { addDays, buildTimeline, mondayOf, planFor, sessionKey, type Activity } from '../../shared/engine'
import { fmtDate, todayISO } from '../guide'
import { painsOf } from '../../shared/pain'
import { timeOf } from '../fit'
import { Trends } from './Trends'

type Kind = 'tutti' | 'corsa' | 'forza' | 'altro'
const FILTERS: [Kind, string][] = [['tutti', 'Tutti'], ['corsa', 'Corsa'], ['forza', 'Forza'], ['altro', 'Nuoto e altro']]
const LABEL = { corsa: 'Corsa', forza: 'Forza', nuoto: 'Nuoto', bici: 'Bici', altro: 'Altro' }
const ICON: Record<Activity['type'], string> = {
  corsa: 'M13 5a2 2 0 1 0 0-.01M7 21l3-6 3 2v4M5 12l4-3 4 1 3 3h3M10 15l1-6',
  forza: 'M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10',
  nuoto: 'M3 17c2 0 2-1.5 4.5-1.5S9 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17M8 12l3-5 4 3 3-3',
  bici: 'M6 17a3 3 0 1 0 0-.01M18 17a3 3 0 1 0 0-.01M6 17l4-8h5l3 8M10 9l2 8',
  altro: 'M12 5v14M5 12h14',
}
const km = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const match = (a: Activity, k: Kind) => k === 'tutti' || (k === 'altro' ? a.type !== 'corsa' && a.type !== 'forza' : a.type === k)
const STEP = 40

/** Diario: tutti gli allenamenti, dal più recente, e la scheda Andamento. */
export function Diary({ route }: { route: string }) {
  const trends = route === 'diario/andamento'
  return <div class="stack">
    <div class="head-row"><h1>Diario</h1><a class="btn small" href="#/registra"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Aggiungi</a></div>
    <nav class="seg" aria-label="Vista">
      <a href="#/diario" class={trends ? '' : 'sel'} aria-current={trends ? undefined : 'page'}>Elenco</a>
      <a href="#/diario/andamento" class={trends ? 'sel' : ''} aria-current={trends ? 'page' : undefined}>Andamento</a>
    </nav>
    {trends ? <Trends embedded /> : <List />}
  </div>
}
function List() {
  const d = data.value!, [k, setK] = useState<Kind>('tutti'), [n, setN] = useState(STEP), today = todayISO()
  const t = useMemo(() => buildTimeline(planFor(d), d.state), [d.plan, d.custom, d.state])
  const texts = useMemo(() => new Map(t.slots.flatMap(s => s.sessions.map(x => [sessionKey(s, x.day), x.text] as const))), [t])
  const weekOf = (date: string) => t.slots.find(s => date >= s.monday && date < addDays(s.monday, 7))
  const all = [...d.activities].reverse(), list = all.filter(a => match(a, k)), shown = list.slice(0, n)
  const month = today.slice(0, 7), inMonth = d.activities.filter(a => a.date.startsWith(month))
  const monthKm = inMonth.filter(a => a.type === 'corsa').reduce((s, a) => s + (a.km ?? 0), 0)
  const topPain = Math.max(0, ...inMonth.flatMap(a => painsOf(a, 'ginocchio').map(p => p.level)))
  if (!d.activities.length) return <section class="panel"><h2>Ancora nessun allenamento</h2><p>Quando registri il primo, lo trovi qui insieme a tutti gli altri.</p><a class="btn" href="#/registra">Registra allenamento</a></section>
  const groups: { mon: string; items: Activity[] }[] = []
  for (const a of shown) { const mon = mondayOf(a.date), g = groups.at(-1); if (g?.mon === mon) g.items.push(a); else groups.push({ mon, items: [a] }) }
  return <>
    <div class="seg chips-row" role="group" aria-label="Filtra">{FILTERS.map(([id, l]) => <button type="button" key={id} class={k === id ? 'sel' : ''} aria-pressed={k === id} onClick={() => { setK(id); setN(STEP) }}>{l}</button>)}</div>
    <div class="stats mini">
      <div><b>{km(monthKm)}</b><span>km a {fmtDate(today, { month: 'long' })}</span></div>
      <div><b>{inMonth.length}</b><span>allenamenti</span></div>
      <div><b>{topPain}</b><span>dolore più alto</span></div>
    </div>
    {groups.map(g => {
      const s = weekOf(g.mon), runs = s?.sessions.filter(x => x.km !== 0) ?? [], did = runs.filter(x => d.activities.some(a => a.sessionKey === sessionKey(s!, x.day))).length
      return <section key={g.mon} class="stack tight">
        <h2 class="phase">{s && typeof s.week === 'number' ? `Settimana ${s.week}` : `Settimana del ${fmtDate(g.mon, { day: 'numeric', month: 'short' })}`}{runs.length ? ` · ${did} di ${runs.length} corse` : ''}</h2>
        <ul class="diary">{g.items.map(a => {
          const pain = Math.max(0, ...painsOf(a, 'ginocchio').map(p => p.level)), txt = a.sessionKey ? texts.get(a.sessionKey) : null
          const facts = [timeOf(a.seconds), a.fatica ? `fatica ${a.fatica}` : null, a.type === 'corsa' && (a.knee != null || a.pains?.length) ? `dolore ${pain}` : null].filter(Boolean).join(' · ')
          return <li key={a.id}><a href={a.trace?.length ? `#/corsa?id=${a.id}` : `#/registra?id=${a.id}`}>
            <span class={'d-ic ' + a.type}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICON[a.type]} /></svg></span>
            <span class="d-t"><b>{fmtDate(a.date, { weekday: 'long', day: 'numeric' }).replace(/^./, c => c.toUpperCase())} · {a.km ? `${km(a.km)} km` : LABEL[a.type]}</b><small>{[txt, facts].filter(Boolean).join(' · ') || LABEL[a.type]}</small></span>
          </a></li>
        })}</ul>
      </section>
    })}
    {!list.length && <p class="sub pad">Nessun allenamento di questo tipo.</p>}
    {list.length > n && <button type="button" class="btn ghost" onClick={() => setN(n + STEP)}>Mostra altri {Math.min(STEP, list.length - n)}</button>}
  </>
}
