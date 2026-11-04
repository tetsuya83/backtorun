import { useState } from 'preact/hooks'
import { blocksError, blocksKm, blocksSec, blocksText, blockText, EFFORTS, expected, KINDS, newBlock, TEMPLATES, type Block, type BlockKind, type Effort, type Part } from '../../shared/blocks'
import { BlockList, Field, Note } from '../ui'

export interface Built { blocks: Block[]; text: string; km: number | null; fiato: string; fatica: string }
const FIATI = ['Mai fiatone', 'Frasi complete', 'Frasi brevi, niente fiatone', 'Fiatone ok nei tratti, calmo nei recuperi']
const parseTime = (s: string) => { const m = s.trim().match(/^(\d+)(?:[:'.,](\d{1,2}))?"?$/); return m ? +m[1] * 60 + +(m[2]?.padEnd(2, '0') ?? 0) : null }
const showTime = (s?: number | null) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''
const showKm = (m?: number | null) => m ? String(m / 1000).replace('.', ',') : ''

/** Un tratto: a tempo o a distanza, con la sua intensità. */
function PartForm({ title, p, up, efforts, shortSec }: { title: string; p: Part; up: (x: Part) => void; efforts: Effort[]; shortSec?: boolean }) {
  const dist = !!p.m
  const [txt, setTxt] = useState(dist ? showKm(p.m) : showTime(p.sec))
  const set = (v: string) => { setTxt(v); if (dist) { const n = +v.replace(',', '.'); up({ effort: p.effort, m: n > 0 ? Math.round(n * 1000) : null }) } else up({ effort: p.effort, sec: parseTime(v) }) }
  const mode = (d: boolean) => { if (d === dist) return; const np: Part = d ? { effort: p.effort, m: 1000 } : { effort: p.effort, sec: shortSec ? 30 : 300 }; up(np); setTxt(d ? '1' : showTime(np.sec)) }
  return <fieldset class="scale part"><legend>{title}</legend>
    <div class="seg"><button type="button" class={!dist ? 'sel' : ''} aria-pressed={!dist} onClick={() => mode(false)}>A tempo</button><button type="button" class={dist ? 'sel' : ''} aria-pressed={dist} onClick={() => mode(true)}>A distanza</button></div>
    <Field label={dist ? 'Chilometri, per esempio 0,4 per 400 m' : 'Minuti e secondi, per esempio 1:30'}><input inputMode="decimal" value={txt} onInput={e => set(e.currentTarget.value)} /></Field>
    <div class="seg tri" role="group" aria-label="Intensità">{efforts.map(e => <button type="button" key={e} class={p.effort === e ? 'sel' : ''} aria-pressed={p.effort === e} onClick={() => up({ ...p, effort: e })}>{EFFORTS[e].label}</button>)}</div>
    <p class="sub">{EFFORTS[p.effort].feel}</p>
  </fieldset>
}
const ALL: Effort[] = ['walk', 'easy', 'steady', 'race', 'hard', 'max'], REST: Effort[] = ['walk', 'easy']
/** Il passo guidato di un singolo blocco. */
function BlockForm({ value, done, cancel }: { value: Block; done: (b: Block) => void; cancel: () => void }) {
  const [b, setB] = useState(value), many = b.reps != null, err = blocksError([b])
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Blocco</p><h1>{KINDS[b.kind].label}</h1><p>{KINDS[b.kind].hint}.</p></section>
    {many && <fieldset class="scale"><legend>Quante volte</legend><div class="stepper"><button type="button" aria-label="Una in meno" onClick={() => setB({ ...b, reps: Math.max(1, b.reps! - 1) })}>−</button><b>{b.reps}</b><button type="button" aria-label="Una in più" onClick={() => setB({ ...b, reps: Math.min(50, b.reps! + 1) })}>+</button></div></fieldset>}
    <PartForm key="w" title={many ? 'Lavoro' : 'Durata'} p={b.part} up={p => setB({ ...b, part: p })} efforts={ALL} shortSec={many} />
    {many && <PartForm key="r" title="Recupero" p={b.rest!} up={p => setB({ ...b, rest: p })} efforts={REST} shortSec />}
    {!err && <p class="sub pad">Anteprima: {blockText(b)}</p>}
    {err && <p class="err" role="alert">{err}</p>}
    <div class="row savebar"><button type="button" class="btn ghost" onClick={cancel}>Annulla</button><button type="button" class="btn" disabled={!!err} onClick={() => done(b)}>Conferma</button></div>
  </div>
}
/** Procedura guidata: modello, blocchi, sensazioni attese. */
export function Builder({ initial, fiato, fatica, title = 'Costruisci la seduta', cta = 'Salva la seduta', onDone, onCancel }: { initial?: Block[] | null; fiato?: string | null; fatica?: string | null; title?: string; cta?: string; onDone: (b: Built) => void; onCancel: () => void }) {
  const [step, setStep] = useState(initial?.length ? 1 : 0), [blocks, setBlocks] = useState<Block[]>(initial ?? [])
  const [edit, setEdit] = useState<{ i: number; b: Block } | null>(null), [adding, setAdding] = useState(false)
  const [fi, setFi] = useState(fiato ?? ''), [fa, setFa] = useState(fatica ?? '')
  const pick = (l: Block[], f: string, g: string) => { setBlocks(l); setFi(f); setFa(g); setStep(1) }
  if (edit) return <BlockForm value={edit.b} cancel={() => setEdit(null)} done={b => { setBlocks(l => edit.i < 0 ? [...l, b] : l.map((x, j) => j === edit.i ? b : x)); setEdit(null) }} />
  const move = (i: number, d: number) => setBlocks(l => { const n = [...l], [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n })
  const err = blocksError(blocks), mins = Math.round(blocksSec(blocks) / 60), km = blocksKm(blocks)
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Passo {step + 1} di 3</p><h1>{['Che seduta vuoi fare?', 'I blocchi', 'Come dovresti sentirti'][step]}</h1>{step === 0 && <p>{title}: scegli un modello e poi adattalo.</p>}</section>
    {step === 0 && <><ul class="cards">{TEMPLATES.map(t => <li key={t.id}><button type="button" onClick={() => pick(t.blocks(), t.fiato, t.fatica)}><span><b>{t.label}</b><small>{t.hint}</small></span></button></li>)}
      <li><button type="button" onClick={() => pick([], '', '')}><span><b>Parti da zero</b><small>Aggiungi tu ogni blocco</small></span></button></li></ul>
      <button type="button" class="btn ghost" onClick={onCancel}>Annulla</button></>}
    {step === 1 && <>
      {!blocks.length && <Note>Nessun blocco. Aggiungi il primo.</Note>}
      {!!blocks.length && <BlockList blocks={blocks} />}
      <ul class="blocks">{blocks.map((b, i) => <li key={i}><div><b>{KINDS[b.kind].label}</b><span>{blockText(b)}</span></div><div class="b-act">
        <button type="button" class="link" onClick={() => setEdit({ i, b })}>Modifica</button>
        <button type="button" class="link" onClick={() => setBlocks(l => [...l.slice(0, i + 1), { ...b }, ...l.slice(i + 1)])}>Duplica</button>
        {i > 0 && <button type="button" class="link" aria-label={`Sposta su ${KINDS[b.kind].label}`} onClick={() => move(i, -1)}>Su</button>}
        {i < blocks.length - 1 && <button type="button" class="link" aria-label={`Sposta giù ${KINDS[b.kind].label}`} onClick={() => move(i, 1)}>Giù</button>}
        <button type="button" class="link danger" onClick={() => setBlocks(l => l.filter((_, j) => j !== i))}>Togli</button>
      </div></li>)}</ul>
      {adding ? <section class="panel"><h2>Quale blocco?</h2><ul class="cards">{(Object.keys(KINDS) as BlockKind[]).map(k => <li key={k}><button type="button" onClick={() => { setAdding(false); setEdit({ i: -1, b: newBlock(k) }) }}><span><b>{KINDS[k].label}</b><small>{KINDS[k].hint}</small></span></button></li>)}</ul></section> : <button type="button" class="btn ghost" onClick={() => setAdding(true)}>Aggiungi blocco</button>}
      {!!blocks.length && <p class="sub pad">Circa {mins} minuti{km ? `, ${String(km).replace('.', ',')} km` : ''}.</p>}
      <div class="row savebar"><button type="button" class="btn ghost" onClick={() => initial?.length ? onCancel() : setStep(0)}>{initial?.length ? 'Annulla' : 'Indietro'}</button><button type="button" class="btn" disabled={!!err} onClick={() => { const e = expected(blocks); setFi(f => f || e.fiato); setFa(f => f || e.fatica); setStep(2) }}>Avanti</button></div>
    </>}
    {step === 2 && <>
      <BlockList blocks={blocks} />
      <p class="pad">{blocksText(blocks)}</p>
      <Field label="Fiato atteso"><select value={fi} onChange={e => setFi(e.currentTarget.value)}>{[...new Set([...FIATI, fi].filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
      <Field label="Fatica attesa, da 1 a 10"><input value={fa} placeholder="3-4" onInput={e => setFa(e.currentTarget.value)} /></Field>
      <div class="row savebar"><button type="button" class="btn ghost" onClick={() => setStep(1)}>Indietro</button><button type="button" class="btn" onClick={() => onDone({ blocks, text: blocksText(blocks), km: blocksKm(blocks), fiato: fi, fatica: fa })}>{cta}</button></div>
    </>}
  </div>
}

