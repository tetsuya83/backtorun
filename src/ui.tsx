import type { ComponentChildren } from 'preact'
import { BREATH, breathLevel } from './guide'
import { upper } from '../shared/engine'
export const nav = (p: string) => { location.hash = '#/' + p }
export function Gauge({ fiato, fatica }: { fiato?: string | null; fatica?: string | null }) {
  const b = breathLevel(fiato)
  const hi = upper(fatica); const lo = fatica ? +(fatica.match(/\d+/)?.[0] ?? 0) : 0
  return (
    <div class="gauges">
      {b && <div class="gauge">
        <div class="gauge-row"><span>Fiato</span><strong>{fiato}</strong></div>
        <div class="stripes" role="img" aria-label={`Fiato previsto ${b} su 5`}>{[1, 2, 3, 4, 5].map(i => <i key={i} class={i <= b ? 'on' : ''} />)}</div>
      </div>}
      {hi && <div class="gauge">
        <div class="gauge-row"><span>Fatica attesa</span><strong>{fatica}</strong></div>
        <div class="stripes ten" role="img" aria-label={`Fatica attesa ${fatica} su 10`}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <i key={i} class={i >= lo && i <= hi ? 'on' : i < lo ? 'mid' : ''} />)}</div>
      </div>}
    </div>
  )
}
export function Scale({ label, max, min = 1, value, onChange, hint }: { label: string; max: number; min?: number; value: number | null | undefined; onChange: (v: number) => void; hint?: string }) {
  const r: number[] = []; for (let i = min; i <= max; i++) r.push(i)
  return (
    <fieldset class="scale">
      <legend>{label}</legend>
      <div class="scale-row" style={{ gridTemplateColumns: `repeat(${r.length},1fr)` }}>
        {r.map(i => <button type="button" key={i} class={value === i ? 'sel' : ''} aria-pressed={value === i} onClick={() => onChange(i)}>{i}</button>)}
      </div>
      {hint && <small>{hint}</small>}
    </fieldset>
  )
}
export const Note = ({ tone, children }: { tone?: 'stop' | 'go'; children: ComponentChildren }) => <div class={'note ' + (tone ?? '')}>{children}</div>
export function Field({ label, children }: { label: string; children: ComponentChildren }) { return <label class="field"><span>{label}</span>{children}</label> }
export const breathHint = (v?: number | null) => v ? BREATH[v - 1] : undefined
