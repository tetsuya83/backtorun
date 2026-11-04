import { useState } from 'preact/hooks'
import { blocksError, blocksKm, blocksSec, blocksText, blockText, effortInfo, expected, kindLabel, KINDS, newBlock, SWIM_KINDS, SWIM_TEMPLATES, TEMPLATES, type Block, type BlockKind, type Effort, type Part, type Sport } from '../../shared/blocks'
import { BlockList, Field, Note } from '../ui'

export interface Built { blocks: Block[]; text: string; km: number | null; fiato: string; fatica: string; name: string; sport: Sport; save: boolean }
const SWIM_FIATI = ['Respiro regolare', 'Ritmo sostenuto', 'Impegnato nei tratti, calmo nelle pause']
const FIATI = ['Mai fiatone', 'Frasi complete', 'Frasi brevi, niente fiatone', 'Fiatone ok nei tratti, calmo nei recuperi']
const parseTime = (s: string) => { const m = s.trim().match(/^(\d+)(?:[:'.,](\d{1,2}))?"?$/); return m ? +m[1] * 60 + +(m[2]?.padEnd(2, '0') ?? 0) : null }
const showTime = (s?: number | null) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''
const showKm = (m?: number | null) => m ? String(m / 1000).replace('.', ',') : ''

/** Un tratto: a tempo o a distanza, con la sua intensità. */
function PartForm({ title, p, up, efforts, shortSec, sport }: { title: string; p: Part; up: (x: Part) => void; efforts: Effort[]; shortSec?: boolean; sport: Sport }) {
  const dist = !!p.m, swim = sport === 'nuoto'
  const [txt, setTxt] = useState(dist ? swim ? String(p.m) : showKm(p.m) : showTime(p.sec))
  const set = (v: string) => { setTxt(v); if (dist) { const n = +v.replace(',', '.'); up({ effort: p.effort, m: n > 0 ? Math.round(swim ? n : n * 1000) : null }) } else up({ effort: p.effort, sec: parseTime(v) }) }
  const mode = (d: boolean) => { if (d === dist) return; const np: Part = d ? { effort: p.effort, m: swim ? 100 : 1000 } : { effort: p.effort, sec: shortSec ? 30 : 300 }; up(np); setTxt(d ? swim ? '100' : '1' : showTime(np.sec)) }
  return <fieldset class="scale part"><legend>{title}</legend>
    <div class="seg"><button type="button" class={!dist ? 'sel' : ''} aria-pressed={!dist} onClick={() => mode(false)}>A tempo</button><button type="button" class={dist ? 'sel' : ''} aria-pressed={dist} onClick={() => mode(true)}>A distanza</button></div>
    <Field label={dist ? swim ? 'Metri, per esempio 50' : 'Chilometri, per esempio 0,4 per 400 m' : 'Minuti e secondi, per esempio 1:30'}><input inputMode="decimal" value={txt} onInput={e => set(e.currentTarget.value)} /></Field>
    <div class="seg tri" role="group" aria-label="Intensità">{efforts.map(e => <button type="button" key={e} class={p.effort === e ? 'sel' : ''} aria-pressed={p.effort === e} onClick={() => up({ ...p, effort: e })}>{effortInfo(e, sport).label}</button>)}</div>
    <p class="sub">{effortInfo(p.effort, sport).feel}</p>
  </fieldset>
}
const ALL: Effort[] = ['walk', 'easy', 'steady', 'race', 'hard', 'max'], REST: Effort[] = ['walk', 'easy'], SWIM_ALL: Effort[] = ['easy', 'steady', 'hard', 'max']
/** Il passo guidato di un singolo blocco. */
function BlockForm({ value, done, cancel, sport }: { value: Block; done: (b: Block) => void; cancel: () => void; sport: Sport }) {
  const [b, setB] = useState(value), many = b.reps != null, err = blocksError([b])
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Blocco</p><h1>{kindLabel(b.kind, sport)}</h1><p>{KINDS[b.kind].hint}.</p></section>
    {many && <fieldset class="scale"><legend>Quante volte</legend><div class="stepper"><button type="button" aria-label="Una in meno" onClick={() => setB({ ...b, reps: Math.max(1, b.reps! - 1) })}>−</button><b>{b.reps}</b><button type="button" aria-label="Una in più" onClick={() => setB({ ...b, reps: Math.min(50, b.reps! + 1) })}>+</button></div></fieldset>}
    <PartForm key="w" title={many ? 'Lavoro' : 'Durata'} p={b.part} up={p => setB({ ...b, part: p })} efforts={sport === 'nuoto' ? SWIM_ALL : ALL} shortSec={many} sport={sport} />
    {many && <PartForm key="r" title="Recupero" p={b.rest!} up={p => setB({ ...b, rest: p })} efforts={REST} shortSec sport={sport} />}
    {!err && <p class="sub pad">Anteprima: {blockText(b, sport)}</p>}
    {err && <p class="err" role="alert">{err}</p>}
    <div class="row savebar"><button type="button" class="btn ghost" onClick={cancel}>Annulla</button><button type="button" class="btn" disabled={!!err} onClick={() => done(b)}>Conferma</button></div>
  </div>
}
/** Procedura guidata: modello, blocchi, sensazioni attese. */
export function Builder({ initial, fiato, fatica, title = 'Costruisci la seduta', cta = 'Salva la seduta', second, sport: start = 'corsa', pickSport, named, name: nm, onDone, onCancel }: { initial?: Block[] | null; fiato?: string | null; fatica?: string | null; title?: string; cta?: string; second?: string; sport?: Sport; pickSport?: boolean; named?: boolean; name?: string; onDone: (b: Built) => void; onCancel: () => void }) {
  const [step, setStep] = useState(initial?.length ? 1 : 0), [blocks, setBlocks] = useState<Block[]>(initial ?? []), [sport, setSport] = useState<Sport>(start)
  const [edit, setEdit] = useState<{ i: number; b: Block } | null>(null), [adding, setAdding] = useState(false)
  const [fi, setFi] = useState(fiato ?? ''), [fa, setFa] = useState(fatica ?? ''), [name, setName] = useState(nm ?? ''), [tpl, setTpl] = useState('')
  const pick = (l: Block[], f: string, g: string, n: string) => { setBlocks(l); setFi(f); setFa(g); setTpl(n); setStep(1) }
  if (edit) return <BlockForm sport={sport} value={edit.b} cancel={() => setEdit(null)} done={b => { setBlocks(l => edit.i < 0 ? [...l, b] : l.map((x, j) => j === edit.i ? b : x)); setEdit(null) }} />
  const move = (i: number, d: number) => setBlocks(l => { const n = [...l], [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n })
  const err = blocksError(blocks), mins = Math.round(blocksSec(blocks, sport) / 60), km = blocksKm(blocks, sport), kinds = sport === 'nuoto' ? SWIM_KINDS : Object.keys(KINDS) as BlockKind[]
  const finish = (save: boolean) => onDone({ blocks, text: blocksText(blocks, sport), km, fiato: fi, fatica: fa, name: name.trim() || blocksText(blocks, sport).slice(0, 60), sport, save })
  return <div class="stack form">
    <section class="head"><p class="eyebrow">Passo {step + 1} di 3</p><h1>{['Che seduta vuoi fare?', 'I blocchi', 'Come dovresti sentirti'][step]}</h1>{step === 0 && <p>{title}: scegli un modello e poi adattalo.</p>}</section>
    {step === 0 && <>
      {pickSport && <div class="seg" role="group" aria-label="Sport">{(['corsa', 'nuoto'] as Sport[]).map(x => <button type="button" key={x} class={sport === x ? 'sel' : ''} aria-pressed={sport === x} onClick={() => setSport(x)}>{x === 'corsa' ? 'Corsa' : 'Nuoto'}</button>)}</div>}
      <ul class="cards">{(sport === 'nuoto' ? SWIM_TEMPLATES : TEMPLATES).map(t => <li key={t.id}><button type="button" onClick={() => pick(t.blocks(), t.fiato, t.fatica, t.label)}><span><b>{t.label}</b><small>{t.hint}</small></span></button></li>)}
      <li><button type="button" onClick={() => pick([], '', '', '')}><span><b>Parti da zero</b><small>Aggiungi tu ogni blocco</small></span></button></li></ul>
      <button type="button" class="btn ghost" onClick={onCancel}>Annulla</button></>}
    {step === 1 && <>
      {!blocks.length && <Note>Nessun blocco. Aggiungi il primo.</Note>}
      {!!blocks.length && <BlockList blocks={blocks} sport={sport} />}
      <ul class="blocks">{blocks.map((b, i) => <li key={i}><div><b>{kindLabel(b.kind, sport)}</b><span>{blockText(b, sport)}</span></div><div class="b-act">
        <button type="button" class="link" onClick={() => setEdit({ i, b })}>Modifica</button>
        <button type="button" class="link" onClick={() => setBlocks(l => [...l.slice(0, i + 1), { ...b }, ...l.slice(i + 1)])}>Duplica</button>
        {i > 0 && <button type="button" class="link" aria-label={`Sposta su ${kindLabel(b.kind, sport)}`} onClick={() => move(i, -1)}>Su</button>}
        {i < blocks.length - 1 && <button type="button" class="link" aria-label={`Sposta giù ${kindLabel(b.kind, sport)}`} onClick={() => move(i, 1)}>Giù</button>}
        <button type="button" class="link danger" onClick={() => setBlocks(l => l.filter((_, j) => j !== i))}>Togli</button>
      </div></li>)}</ul>
      {adding ? <section class="panel"><h2>Quale blocco?</h2><ul class="cards">{kinds.map(k => <li key={k}><button type="button" onClick={() => { setAdding(false); setEdit({ i: -1, b: newBlock(k, sport) }) }}><span><b>{kindLabel(k, sport)}</b><small>{KINDS[k].hint}</small></span></button></li>)}</ul></section> : <button type="button" class="btn ghost" onClick={() => setAdding(true)}>Aggiungi blocco</button>}
      {!!blocks.length && <p class="sub pad">Circa {mins} minuti{km ? sport === 'nuoto' ? `, ${Math.round(km * 1000)} m` : `, ${String(km).replace('.', ',')} km` : ''}.</p>}
      <div class="row savebar"><button type="button" class="btn ghost" onClick={() => initial?.length ? onCancel() : setStep(0)}>{initial?.length ? 'Annulla' : 'Indietro'}</button><button type="button" class="btn" disabled={!!err} onClick={() => { const e = expected(blocks, sport); setFi(f => f || e.fiato); setFa(f => f || e.fatica); setStep(2) }}>Avanti</button></div>
    </>}
    {step === 2 && <>
      <BlockList blocks={blocks} sport={sport} />
      <p class="pad">{blocksText(blocks, sport)}</p>
      {named && <Field label="Nome dell'allenamento"><input value={name} maxLength={60} placeholder={tpl || 'Per esempio Ripetute del martedì'} onInput={e => setName(e.currentTarget.value)} /></Field>}
      <Field label={sport === 'nuoto' ? 'Sensazione attesa' : 'Fiato atteso'}><select value={fi} onChange={e => setFi(e.currentTarget.value)}>{[...new Set([...(sport === 'nuoto' ? SWIM_FIATI : FIATI), fi].filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>
      <Field label="Fatica attesa, da 1 a 10"><input value={fa} placeholder="3-4" onInput={e => setFa(e.currentTarget.value)} /></Field>
      <button type="button" class="btn" onClick={() => finish(true)}>{cta}</button>
      {second && <button type="button" class="btn ghost" onClick={() => finish(false)}>{second}</button>}
      <button type="button" class="btn ghost" onClick={() => setStep(1)}>Indietro</button>
    </>}
  </div>
}
