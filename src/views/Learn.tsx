import { useEffect, useState } from 'preact/hooks'
import { Illustration } from '../art'
import { articleById, ARTICLES, GROUPS, SECTIONS, type Article } from '../learn'
import { FuelTool, WearTool } from './Tools'

/** Nei testi delle schede **testo** è il concetto chiave e ==ritmo facile== prende il colore della zona. */
function Rich({ t }: { t: string }) {
  return <>{t.split(/(\*\*[^*]+\*\*|==[^=]+==)/).filter(Boolean).map((x, i) => x.startsWith('**') ? <strong key={i}>{x.slice(2, -2)}</strong> : x.startsWith('==') ? <mark key={i} class={/facile/.test(x) ? 'z-easy' : /forte/.test(x) ? 'z-hard' : 'z-mid'}>{x.slice(2, -2)}</mark> : x)}</>
}
const ICONS = { star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1L3.2 9.5l6.1-.9z', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', check: 'M5 12l5 5 9-10', warn: 'M12 4l9 16H3zM12 10v4M12 17v.01' }
const Ico = ({ d, c }: { d: string; c: string }) => <span class={'l-ic ' + c} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={d} /></svg></span>
const Why = ({ title, l }: { title: string; l: string[] }) => l.length ? <section class="panel l-sec"><h2><Ico d={ICONS.star} c="t-blue" />{title}</h2><ul class="dots">{l.map(x => <li key={x}><span><Rich t={x} /></span></li>)}</ul></section> : null
const How = ({ title, l }: { title: string; l: string[] }) => l.length ? <section class="panel l-sec"><h2><Ico d={ICONS.check} c="t-green" />{title}</h2><ol class="nums">{l.map(x => <li key={x}><span><Rich t={x} /></span></li>)}</ol></section> : null
const Errors = ({ l }: { l: string[] }) => l.length ? <section class="panel l-sec l-bad"><h2><Ico d={ICONS.warn} c="on-card" />Errori da evitare</h2><ul class="crosses">{l.map(x => <li key={x}><span><Rich t={x} /></span></li>)}</ul></section> : null
function Sheet({ a }: { a: Article }) {
  const life = !['base', 'corsa', 'forza', 'mobilita'].includes(a.group)
  return <div class="stack sheet">
    <section class="head"><p class="eyebrow"><a href="#/impara">{GROUPS.find(g => g[0] === a.group)?.[1] ?? 'Impara'}</a></p><h1>{a.title}</h1>{a.level && <p class={'level ' + (a.level.startsWith('Solo') ? 'ask' : 'ok')}>{a.level}</p>}<p class="lead"><Rich t={a.what} /></p></section>
    <div class="cols">
      <div class="col">
        {a.anim && <Illustration id={a.anim} />}
        {a.tool === 'wear' && <WearTool />}
        {a.tool === 'fuel' && <FuelTool />}
        <Why title={life ? 'Perché conta' : a.group === 'mobilita' || a.group === 'forza' ? 'A cosa serve' : 'Utilità e vantaggi'} l={a.why} />
        {a.when && <section class="l-when"><Ico d={ICONS.clock} c="on-card" /><div><h2>{life ? 'Quando serve' : 'Quando farlo'}</h2><p><Rich t={a.when} /></p></div></section>}
      </div>
      <div class="col">
        <How title={life ? 'Cosa fare' : 'Come si fa'} l={a.how} />
        <Errors l={a.errors} />
        {a.care && <div class="l-care"><Rich t={a.care} /></div>}
        {!!a.sources?.length && <section class="l-src"><h2>Fonti</h2><ul>{a.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener">{s.title}</a></li>)}</ul></section>}
        <a class="btn ghost" href="#/impara">Tutte le schede</a>
      </div>
    </div>
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
    <section class="head"><h1>Impara</h1><p>Allenamenti, esercizi e tutto quello che c'è intorno alla corsa.</p></section>
    <input type="search" aria-label="Cerca una scheda" placeholder="Cerca, per esempio scarpe" value={q} onInput={e => setQ(e.currentTarget.value)} />
    <div class="topics">{SECTIONS.map(sec => {
      const list = sec.groups.filter(g => ARTICLES.some(x => x.group === g && hit(x)))
      if (!list.length) return null
      return <section key={sec.title} class="topics"><h2 class="sect">{sec.title}</h2>{list.map(g => {
        const [, title, sub] = GROUPS.find(x => x[0] === g)!, l = ARTICLES.filter(x => x.group === g && hit(x)), shown = !!low || open.includes(g)
        return <section key={g} class={shown ? 'topic open' : 'topic'}>
          <button type="button" class="topic-head" aria-expanded={shown} aria-controls={`impara-${g}`} disabled={!!low} onClick={() => setOpen(o => o.includes(g) ? o.filter(x => x !== g) : [...o, g])}>
            <i class={`topic-bar tb-${sec.tone}`} aria-hidden="true" /><span><b>{title}</b><small>{sub}</small></span><em>{l.length}</em>
          </button>
          {shown && <ul class="cards" id={`impara-${g}`}>{l.map(x => <li key={x.id}><a href={`#/impara/${x.id}`}>{x.anim && <Illustration id={x.anim} thumb />}<span><b>{x.title}</b><small>{x.level ? `${x.level}. ${x.short}` : x.short}</small></span></a></li>)}</ul>}
        </section>
      })}</section>
    })}</div>
    {!ARTICLES.some(hit) && <p class="sub pad">Nessuna scheda trovata.</p>}
  </div>
}
