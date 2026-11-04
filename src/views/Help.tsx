import { useState } from 'preact/hooks'
import { GUIDE_DATE, HELP } from '../help'

export function Help() {
  const [q, setQ] = useState(''), low = q.trim().toLowerCase()
  const hit = (t: string) => t.toLowerCase().includes(low)
  const list = HELP.map(s => ({ ...s, items: s.items.filter(i => !low || hit(s.title) || hit(i.q) || i.a.some(hit)) })).filter(s => s.items.length)
  return <div class="stack form">
    <section class="head"><h1>Guida</h1><p>Tutto quello che puoi fare con BackToRun.</p><p class="sub">Aggiornata al {GUIDE_DATE}.</p></section>
    <input type="search" aria-label="Cerca nella guida" placeholder="Cerca, per esempio GPS" value={q} onInput={e => setQ(e.currentTarget.value)} />
    {list.map(s => <section key={s.id}><h2 class="phase">{s.title}</h2><div class="faq">{s.items.map(i => <details key={i.q} open={!!low}><summary>{i.q}</summary>{i.a.map(x => <p key={x}>{x}</p>)}{i.to && <a href={'#/' + i.to[0]}>{i.to[1]}</a>}</details>)}</div></section>)}
    {!list.length && <p class="sub pad">Nessun risultato. Prova con un'altra parola.</p>}
  </div>
}
