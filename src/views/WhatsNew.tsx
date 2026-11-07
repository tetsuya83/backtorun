/* Banner delle novità: dopo un aggiornamento, i punti in breve delle versioni non ancora viste. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { data, saveState } from '../api'
import { APP_VERSION, unseen } from '../changelog'

let closed = false // la X lo nasconde fino alla prossima apertura dell'app
export function WhatsNew() {
  const d = data.value!, list = unseen(d.state.newsSeen), [open, setOpen] = useState(false), [hide, setHide] = useState(closed), box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) box.current?.focus() }, [open])
  if (!list.length || hide) return null
  const never = () => { setOpen(false); saveState({ ...d.state, newsSeen: APP_VERSION }) }
  const later = () => { closed = true; setOpen(false); setHide(true) }
  return <>
    <div class="news-b" role="status">
      <button type="button" class="news-o" onClick={() => setOpen(true)}><b>Novità della versione {APP_VERSION}</b><span>Scopri cosa c'è</span></button>
      <button type="button" class="news-x" aria-label="Chiudi per ora" onClick={later}>×</button>
    </div>
    {open && <div class="news-v" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <div class="news-p" role="dialog" aria-modal="true" aria-labelledby="news-t" tabIndex={-1} ref={box}>
        <h2 id="news-t">Cosa c'è di nuovo</h2>
        {list.map(r => <section key={r.version}>{list.length > 1 && <h3>Versione {r.version}</h3>}<ul class="dots">{r.brief.map(t => <li key={t}><span>{t}</span></li>)}</ul></section>)}
        <a class="link" href="#/novita" onClick={() => setOpen(false)}>Tutti i dettagli</a>
        <div class="row"><button type="button" class="btn" onClick={never}>Ho capito</button><button type="button" class="btn ghost" onClick={() => setOpen(false)}>Più tardi</button></div>
        <p class="sub">Con Ho capito non lo vedi più fino al prossimo aggiornamento.</p>
      </div>
    </div>}
  </>
}
