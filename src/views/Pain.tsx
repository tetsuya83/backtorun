import { useState } from 'preact/hooks'
import { WHEN, ZONES, painText, type Pain, type Side } from '../../shared/pain'
import { Scale } from '../ui'

const SIDES: [Side, string][] = [['sx', 'Sinistra'], ['dx', 'Destra'], ['both', 'Entrambe']]
/** Scelta di una o più zone, ognuna con il proprio blocco di lato, intensità e momento. */
export function PainPicker({ value, onChange, required }: { value: Pain[]; onChange: (l: Pain[]) => void; required?: string }) {
  const [more, setMore] = useState(false)
  const up = (i: number, p: Partial<Pain>) => onChange(value.map((x, j) => j === i ? { ...x, ...p } : x))
  const toggle = (id: string) => onChange(value.some(p => p.zone === id) ? value.filter(p => p.zone !== id) : [...value, { zone: id, level: 1 }])
  const free = ZONES.filter(z => z.id !== required)
  return <section class="pain">
    <div class="pain-h"><b>Dolori</b><button type="button" class="link" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Chiudi' : 'Aggiungi una zona'}</button></div>
    {!value.length && !more && <p class="sub">Nessun dolore segnalato.</p>}
    {more && <div class="chips">{free.map(z => <button type="button" key={z.id} class={value.some(p => p.zone === z.id) ? 'sel' : ''} aria-pressed={value.some(p => p.zone === z.id)} onClick={() => toggle(z.id)}>{z.label}</button>)}</div>}
    {value.map((p, i) => { const z = ZONES.find(x => x.id === p.zone); return <div class="pain-b" key={p.zone}>
      <Scale label={`${painText(p)}, da 0 a 10`} min={0} max={10} value={p.level} onChange={v => up(i, { level: v })} />
      {z?.paired && <div class="seg" role="group" aria-label={`Lato, ${z.label}`}>{SIDES.map(([s, l]) => <button type="button" key={s} class={p.side === s ? 'sel' : ''} aria-pressed={p.side === s} onClick={() => up(i, { side: p.side === s ? null : s })}>{l}</button>)}</div>}
      {p.level > 0 && <label class="mini"><span>Quando</span><select value={p.when ?? ''} onChange={e => up(i, { when: (e.currentTarget.value || null) as Pain['when'] })}><option value="">Non indicato</option>{WHEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select></label>}
      {p.zone !== required && <button type="button" class="link danger" onClick={() => toggle(p.zone)}>Togli {z?.label.toLowerCase() ?? 'zona'}</button>}
    </div> })}
  </section>
}
