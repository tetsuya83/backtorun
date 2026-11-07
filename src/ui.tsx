import type { ComponentChildren } from 'preact'
import { BREATH, breathLevel } from './guide'
import { upper } from '../shared/engine'
import { blockSec, blockText, EFFORTS, effortInfo, kindLabel, type Block, type Sport } from '../shared/blocks'
export const nav = (p: string) => { location.hash = '#/' + p }
/** Quante pagine dell'app ci sono alle spalle: con zero, Indietro porta alla scheda invece di uscire. */
export const navDepth = { n: 0 }
export function goBack(fallback: string) { if (navDepth.n > 0) history.back(); else location.hash = '#/' + fallback }
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
/** Lo schema della seduta: l'altezza è l'intensità, la larghezza la durata stimata. */
export function BlockList({ blocks, compact, sport }: { blocks: Block[]; compact?: boolean; sport?: Sport }) {
  const segs = blocks.flatMap(b => { const n = Math.min(b.reps ?? 1, 12), one: Block = { ...b, reps: 1, rest: undefined }, each = blockSec(b, sport) / (b.reps ?? 1); return Array.from({ length: n }, () => b.rest ? [{ e: b.part.effort, w: blockSec(one, sport) }, { e: b.rest.effort, w: blockSec({ ...one, part: b.rest }, sport) }] : [{ e: b.part.effort, w: each }]).flat() })
  const tot = segs.reduce((a, x) => a + x.w, 0) || 1, top = Math.max(...segs.map(x => EFFORTS[x.e].level)), kinds = [...new Set(segs.map(x => x.e))].sort((a, b) => EFFORTS[b].level - EFFORTS[a].level)
  return <div class="schema">
    <div class={compact ? 'profile' : 'profile big'} role="img" aria-label={blocks.map(b => blockText(b, sport)).join(', ')}>{segs.map((x, i) => <i key={i} data-level={EFFORTS[x.e].level} style={{ flexGrow: Math.max(x.w / tot * 100, 1.6), height: `${EFFORTS[x.e].level * 100 / top}%` }} />)}</div>
    {!compact && <div class="legend" aria-hidden="true">{kinds.map(e => <span key={e}><i data-level={EFFORTS[e].level} />{effortInfo(e, sport).label}</span>)}</div>}
    {!compact && <ol>{blocks.map((b, i) => <li key={i}><span>{kindLabel(b.kind, sport)}</span><b>{blockText(b, sport)}</b></li>)}</ol>}
  </div>
}
