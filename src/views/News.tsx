import { CHANGELOG } from '../changelog'
import { fmtDate } from '../guide'

export function News() {
  return <div class="stack">
    <section class="head"><h1>Novità</h1><p>Le versioni di BackToRun e cosa è cambiato in ciascuna.</p></section>
    <div class="faq news">{CHANGELOG.map((r, i) => <details key={r.version} open={i === 0}>
      <summary><b>Versione {r.version}</b><small>{fmtDate(r.date, { day: 'numeric', month: 'long', year: 'numeric' })}</small></summary>
      {r.changes.map(c => <section key={c.kind}><h3>{c.kind}</h3><ul>{c.items.map(t => <li key={t}>{t}</li>)}</ul></section>)}
    </details>)}</div>
  </div>
}
