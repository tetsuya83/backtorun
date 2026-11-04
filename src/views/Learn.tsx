import { useEffect, useState } from 'preact/hooks'
import { Illustration } from '../art'
import { articleById, ARTICLES, GROUPS, type Article } from '../learn'
import { Note } from '../ui'

const Bullets = ({ title, l }: { title: string; l: string[] }) => l.length ? <section class="panel"><h2>{title}</h2><ul class="plain">{l.map(x => <li key={x}>{x}</li>)}</ul></section> : null
function Sheet({ a }: { a: Article }) {
  return <div class="stack">
    <section class="head"><p class="eyebrow"><a href="#/impara">Impara</a></p><h1>{a.title}</h1><p>{a.what}</p></section>
    {a.anim && <Illustration id={a.anim} />}
    <Bullets title={a.group === 'mobilita' || a.group === 'forza' ? 'A cosa serve' : 'Utilità e vantaggi'} l={a.why} />
    <section class="panel"><h2>Quando farlo</h2><p>{a.when}</p></section>
    <Bullets title="Come si fa" l={a.how} />
    <Bullets title="Errori da evitare" l={a.errors} />
    {a.care && <Note>{a.care}</Note>}
    {!!a.sources?.length && <section class="panel quiet"><h2>Fonti</h2><ul class="plain src">{a.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener">{s.title}</a></li>)}</ul></section>}
    <a class="btn ghost" href="#/impara">Tutte le schede</a>
  </div>
}
export function Learn({ route }: { route: string }) {
  const id = route.split('?')[0].split('/')[1], a = articleById(id)
  const [q, setQ] = useState(''), [open, setOpen] = useState<Article['group'][]>([]), group = a?.group
  // Chi arriva a una scheda da fuori, tornando all'elenco, ritrova aperta la sua categoria.
  useEffect(() => { if (group) setOpen(o => o.includes(group) ? o : [...o, group]) }, [group])
  if (a) return <Sheet key={a.id} a={a} />
  const low = q.trim().toLowerCase(), hit = (x: Article) => !low || `${x.title} ${x.short}`.toLowerCase().includes(low)
  return <div class="stack form">
    <section class="head"><h1>Impara</h1><p>Cosa sono gli allenamenti, a cosa servono e come si eseguono.</p></section>
    <input type="search" aria-label="Cerca una scheda" placeholder="Cerca, per esempio polpacci" value={q} onInput={e => setQ(e.currentTarget.value)} />
    <div class="topics">{GROUPS.map(([g, title, sub]) => {
      const l = ARTICLES.filter(x => x.group === g && hit(x)), shown = !!low || open.includes(g)
      if (!l.length) return null
      return <section key={g} class={shown ? 'topic open' : 'topic'}>
        <button type="button" class="topic-head" aria-expanded={shown} aria-controls={`impara-${g}`} disabled={!!low} onClick={() => setOpen(o => o.includes(g) ? o.filter(x => x !== g) : [...o, g])}>
          <span><b>{title}</b><small>{sub}</small></span><em>{l.length}</em>
        </button>
        {shown && <ul class="cards" id={`impara-${g}`}>{l.map(x => <li key={x.id}><a href={`#/impara/${x.id}`}>{x.anim && <Illustration id={x.anim} thumb />}<span><b>{x.title}</b><small>{x.short}</small></span></a></li>)}</ul>}
      </section>
    })}</div>
    {!ARTICLES.some(hit) && <p class="sub pad">Nessuna scheda trovata.</p>}
  </div>
}
