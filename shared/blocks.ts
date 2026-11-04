/* Una seduta è una sequenza di blocchi. Il testo resta per chi legge e i blocchi guidano l'allenamento. */
export type Effort = 'walk' | 'easy' | 'steady' | 'race' | 'hard' | 'max'
export type BlockKind = 'warm' | 'run' | 'reps' | 'hills' | 'strides' | 'cool'
export interface Part { sec?: number | null; m?: number | null; effort: Effort }
export interface Block { kind: BlockKind; part: Part; reps?: number; rest?: Part }

export const EFFORTS: Record<Effort, { label: string; word: string; many: string; go: string; feel: string; zone: string | null; level: number }> = {
  walk: { label: 'Cammino', word: 'cammino', many: 'cammino', go: 'Cammina', feel: 'Respiro tranquillo', zone: null, level: 1 },
  easy: { label: 'Facile', word: 'facile', many: 'facili', go: 'Corri facile', feel: 'Parli in frasi complete', zone: 'Z2', level: 2 },
  steady: { label: 'Medio', word: 'Z3', many: 'Z3', go: 'Ritmo medio', feel: 'Parli a frasi brevi', zone: 'Z3', level: 3 },
  race: { label: 'Ritmo gara', word: 'ritmo gara', many: 'ritmo gara', go: 'Ritmo gara', feel: 'Frasi brevi, sotto controllo', zone: null, level: 3 },
  hard: { label: 'Forte', word: 'Z4', many: 'Z4', go: 'Forte', feel: 'Fiatone, solo poche parole', zone: 'Z4', level: 4 },
  max: { label: 'Massimo', word: 'massimali', many: 'massimali', go: 'Al massimo', feel: 'Non riesci a parlare', zone: 'Z5', level: 5 },
}
export const KINDS: Record<BlockKind, { label: string; hint: string }> = {
  warm: { label: 'Riscaldamento', hint: 'Si parte piano per preparare gambe e fiato' },
  run: { label: 'Corsa continua', hint: 'Un tratto unico, a tempo o a distanza' },
  reps: { label: 'Ripetute', hint: 'Lavoro e recupero ripetuti più volte' },
  hills: { label: 'Salite', hint: 'Tratti brevi in salita, recupero scendendo' },
  strides: { label: 'Allunghi', hint: 'Accelerazioni brevi e sciolte' },
  cool: { label: 'Defaticamento', hint: 'Si chiude piano per far scendere il fiato' },
}

/* ---------- Stime ---------- */
// Ritmi prudenti usati solo per dividere la seduta in blocchi: non sono obiettivi.
const PACE: Record<Effort, number> = { walk: 600, easy: 400, steady: 340, race: 340, hard: 310, max: 290 }
const partKm = (p: Part) => p.m ? p.m / 1000 : (p.sec ?? 0) / PACE[p.effort]
const partSec = (p: Part) => p.sec && !p.m ? p.sec : (p.m ?? 0) / 1000 * PACE[p.effort]
const times = (b: Block) => b.reps ?? 1
export const blockKm = (b: Block) => times(b) * (partKm(b.part) + (b.rest ? partKm(b.rest) : 0))
export const blockSec = (b: Block) => times(b) * (partSec(b.part) + (b.rest ? partSec(b.rest) : 0))
const half = (n: number) => Math.round(n * 2) / 2
/** Km della seduta, stimati se ci sono tratti a tempo. Una seduta solo a tempo non ha km. */
export const blocksKm = (l: Block[]) => l.some(b => b.part.m || b.rest?.m) ? Math.round(l.reduce((a, b) => a + blockKm(b), 0) * 10) / 10 : null
export const blocksSec = (l: Block[]) => Math.round(l.reduce((a, b) => a + blockSec(b), 0))

/* ---------- Testo ---------- */
const dist = (m: number) => m >= 1000 ? `${String(Math.round(m / 10) / 100).replace('.', ',')} km` : `${m} m`
export const clockText = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60)
  return h ? `${h}h${m ? String(m).padStart(2, '0') + "'" : ''}` : `${m ? m + "'" : ''}${x ? String(x).padStart(2, '0').replace(/^0(?=\d)/, m ? '0' : '') + '"' : ''}` || `0'`
}
export const amountText = (p: Part) => [p.m ? dist(p.m) : null, p.sec ? clockText(p.sec) : null].filter(Boolean).join(' o ')
const walkRun = (b: Block) => b.kind === 'reps' && b.part.effort === 'easy' && b.rest?.effort === 'walk'
/** Riga leggibile di un blocco. */
export function blockText(b: Block) {
  const e = EFFORTS[b.part.effort], a = amountText(b.part)
  if (b.kind === 'hills') return `${b.reps}×${a} in salita + ${amountText(b.rest!)} rec`
  if (b.kind === 'strides') return `${b.reps} allunghi ${a}`
  if (b.kind === 'reps') return walkRun(b) ? `${b.reps}×[${a} corsa + ${amountText(b.rest!)} cammino]` : `${b.reps}×[${a} ${e.word} + ${amountText(b.rest!)} ${EFFORTS[b.rest!.effort].word}]`
  return `${a} ${b.part.m === 1000 ? e.word === 'Z3' ? e.many : e.word : e.many}`
}
export function blocksTitle(l: Block[]) {
  if (l.some(b => b.kind === 'hills')) return 'Salite'
  if (l.some(walkRun)) return null
  if (l.some(b => b.kind === 'reps')) return 'Ripetute'
  if (l.some(b => b.kind !== 'strides' && b.part.effort === 'race')) return 'Medio'
  if (l.some(b => b.part.effort === 'steady' || b.part.effort === 'hard' || b.part.effort === 'max')) return 'Fondo medio'
  return null
}
/** Il testo di una seduta costruita a blocchi. */
export function blocksText(l: Block[]) {
  const runs = l.filter(b => b.kind !== 'strides'), only = runs.length === 1 && runs[0].kind === 'run' && runs[0].part.effort === 'easy' ? runs[0] : null
  const strides = l.find(b => b.kind === 'strides')
  if (only) {
    const a = amountText(only.part), name = (only.part.m ?? 0) >= 14000 ? 'Lungo' : 'Facile'
    return `${name} ${a}${strides ? ` + ${blockText(strides)}` : ''}`
  }
  const t = blocksTitle(l), body = l.map(blockText).join(' + ')
  return t ? `${t}: ${body}` : body
}

/* ---------- Lettura del testo ---------- */
const N = (s: string) => +s.replace(',', '.')
function amount(s: string): { sec?: number; m?: number; rest: string } | null {
  let x = s.trim().match(/^(\d+(?:[.,]\d+)?)\s*km\b\s*(.*)$/i)
  if (x) return { m: Math.round(N(x[1]) * 1000), rest: x[2] }
  x = s.trim().match(/^(\d+)\s*m\b\s*(.*)$/i)
  if (x) return { m: +x[1], rest: x[2] }
  x = s.trim().match(/^(?:(\d+)')?(?:(\d+)")?\s*(.*)$/)
  if (x && (x[1] || x[2])) return { sec: +(x[1] ?? 0) * 60 + +(x[2] ?? 0), rest: x[3] }
  return null
}
function effortOf(w: string): Effort {
  if (/cammin/i.test(w)) return 'walk'
  if (/massimal/i.test(w)) return 'max'
  if (/forti|forte|Z4|Z5|controllat/i.test(w)) return 'hard'
  if (/ritmo gara/i.test(w)) return 'race'
  if (/Z3|frasi brevi/i.test(w)) return 'steady'
  return 'easy'
}
const rep = (kind: BlockKind, reps: number, part: Part, rest: Part): Block => ({ kind, reps, part, rest })
/** Aggiunge riscaldamento e defaticamento quando il testo indica i km totali della seduta. */
function wrap(main: Block, total: number | null): Block[] {
  if (!total) return [main]
  const left = total - blockKm(main)
  if (left < 1) return [main]
  const warm = Math.max(1, half(left * .6)), cool = half(left - warm)
  return [{ kind: 'warm', part: { m: warm * 1000, effort: 'easy' } }, main, ...(cool > 0 ? [{ kind: 'cool' as const, part: { m: cool * 1000, effort: 'easy' as const } }] : [])]
}
/** Converte in blocchi il testo delle sedute. Restituisce null se non si capisce come guidarla. */
export function parseBlocks(text: string, km?: number | null): Block[] | null {
  const t = text.trim()
  const total = t.match(/\((\d+(?:[.,]\d+)?)\s*km\)\s*$/), tot = total ? N(total[1]) : null
  const sq = t.match(/(\d+)\s*×\s*\[\s*(.+?)\s*\+\s*(.+?)\s*\]/)
  if (sq) {
    const a = amount(sq[2]), b = amount(sq[3])
    if (a && b) {
      const walk = /corsa/i.test(a.rest)
      const main = rep('reps', +sq[1], { sec: a.sec, m: a.m, effort: walk ? 'easy' : effortOf(a.rest) }, { sec: b.sec, m: b.m, effort: effortOf(b.rest) })
      return wrap(main, tot)
    }
  }
  const hill = t.match(/(\d+)\s*×\s*(\d+)"\s*(?:controllate|in salita)\s*\+\s*(\d+)'/i)
  if (hill) return wrap(rep('hills', +hill[1], { sec: +hill[2], effort: 'hard' }, { sec: +hill[3] * 60, effort: 'easy' }), tot)
  const run = t.match(/^(Facile|Lento|Lungo|Lunghissimo)\s+(\d+(?:[.,]\d+)?)\s*km/i)
  if (run) {
    const m = Math.round(N(run[2]) * 1000)
    const last = t.match(/ultimi\s+(\d+)\s+a ritmo gara/i)
    if (last) return [{ kind: 'run', part: { m: m - +last[1] * 1000, effort: 'easy' } }, { kind: 'run', part: { m: +last[1] * 1000, effort: 'race' } }]
    const cap = t.match(/\bo\s+(\d+)h(\d+)?'?/i)
    const out: Block[] = [{ kind: 'run', part: { m, sec: cap ? +cap[1] * 3600 + +(cap[2] ?? 0) * 60 : undefined, effort: 'easy' } }]
    const st = t.match(/\+\s*(\d+)\s+allunghi(?:\s+(\d+)")?/i)
    if (st) out.push(rep('strides', +st[1], { sec: +(st[2] ?? 15), effort: 'hard' }, { sec: 45, effort: 'easy' }))
    return out
  }
  const seq = t.match(/^(?:[^:]+:\s*)?(.+)$/)
  if (seq && /^\d/.test(seq[1])) {
    const pieces = seq[1].split(/\s*\+\s*/).map(p => { const a = amount(p); return a ? { a, effort: effortOf(a.rest) } : null })
    if (pieces.every(Boolean)) {
      const list = pieces.map(x => x!), hardAt = list.findIndex(x => x.effort !== 'easy')
      return list.map((x, i): Block => ({ kind: hardAt > 0 && i < hardAt ? 'warm' : hardAt >= 0 && i > hardAt && x.effort === 'easy' ? 'cool' : 'run', part: { sec: x.a.sec, m: x.a.m, effort: x.effort } }))
    }
  }
  const free = t.match(/(\d+)'\s*facili/i)
  if (free) return [{ kind: 'run', part: { sec: +free[1] * 60, effort: 'easy' } }]
  if (km) return [{ kind: 'run', part: { m: Math.round(km * 1000), effort: /^(Gara|Obiettivo|Maratona)/i.test(t) ? 'race' : 'easy' } }]
  return null
}
/** I blocchi della seduta: quelli salvati oppure quelli letti dal testo. */
export const blocksOf = (s: { text: string; km?: number | null; blocks?: Block[] | null }) => s.blocks?.length ? s.blocks : parseBlocks(s.text, s.km)

const okPart = (p: any, minSec: number) => !!p && p.effort in EFFORTS && (p.sec != null || p.m != null) && (p.sec == null || (p.sec >= minSec && p.sec <= 21600)) && (p.m == null || (p.m >= 10 && p.m <= 200000))
/** Restituisce il problema dei blocchi, oppure null se vanno bene. */
export function blocksError(l: any): string | null {
  if (!Array.isArray(l) || !l.length) return 'Aggiungi almeno un blocco.'
  if (l.length > 20) return 'Una seduta può avere al massimo 20 blocchi.'
  for (const b of l) {
    if (!b || !(b.kind in KINDS)) return 'Blocco non valido.'
    if (!okPart(b.part, 5)) return `${KINDS[b.kind as BlockKind].label}: scrivi quanto dura.`
    const many = b.kind === 'reps' || b.kind === 'hills' || b.kind === 'strides'
    if (many && !(b.reps >= 1 && b.reps <= 50)) return `${KINDS[b.kind as BlockKind].label}: le ripetizioni vanno da 1 a 50.`
    if (many && !okPart(b.rest, 0)) return `${KINDS[b.kind as BlockKind].label}: scrivi quanto dura il recupero.`
  }
  return null
}

/* ---------- Modelli del wizard ---------- */
const km = (n: number, effort: Effort = 'easy'): Part => ({ m: n * 1000, effort })
const min = (n: number, effort: Effort = 'easy'): Part => ({ sec: Math.round(n * 60), effort })
export interface Template { id: string; label: string; hint: string; fiato: string; fatica: string; learn: string; blocks: () => Block[] }
export const TEMPLATES: Template[] = [
  { id: 'facile', label: 'Corsa facile', hint: 'Il lavoro di base, a fiato tranquillo', fiato: 'Frasi complete', fatica: '2-3', learn: 'facile', blocks: () => [{ kind: 'run', part: km(5) }] },
  { id: 'lungo', label: 'Lungo', hint: 'La corsa più lunga della settimana', fiato: 'Frasi complete', fatica: '3-4', learn: 'lungo', blocks: () => [{ kind: 'run', part: km(12) }] },
  { id: 'cammino', label: 'Cammino-corsa', hint: 'Per ripartire: corsa e cammino alternati', fiato: 'Mai fiatone', fatica: '2-3', learn: 'cammino-corsa', blocks: () => [rep('reps', 6, min(1), min(2, 'walk'))] },
  { id: 'ripetute', label: 'Ripetute', hint: 'Tratti forti con recupero', fiato: 'Fiatone ok nei tratti, calmo nei recuperi', fatica: '7-8', learn: 'ripetute', blocks: () => [{ kind: 'warm', part: km(2) }, rep('reps', 5, min(3, 'hard'), min(2)), { kind: 'cool', part: km(1) }] },
  { id: 'fondo', label: 'Fondo medio', hint: 'Un tratto lungo a ritmo sostenuto', fiato: 'Frasi brevi, niente fiatone', fatica: '5-6', learn: 'fondo-medio', blocks: () => [{ kind: 'warm', part: km(2) }, { kind: 'run', part: km(5, 'steady') }, { kind: 'cool', part: km(1) }] },
  { id: 'fartlek', label: 'Fartlek', hint: 'Cambi di ritmo liberi', fiato: 'Fiatone ok nei tratti, calmo nei recuperi', fatica: '6-7', learn: 'fartlek', blocks: () => [{ kind: 'warm', part: km(2) }, rep('reps', 6, min(1, 'hard'), min(2)), { kind: 'cool', part: km(1) }] },
  { id: 'salite', label: 'Salite', hint: 'Tratti brevi in salita', fiato: 'Fiatone breve ok, parli prima di ripartire', fatica: '8', learn: 'salite', blocks: () => [{ kind: 'warm', part: km(3) }, rep('hills', 6, { sec: 20, effort: 'hard' }, min(2)), { kind: 'cool', part: km(1) }] },
  { id: 'allunghi', label: 'Facile con allunghi', hint: 'Corsa facile e qualche accelerazione', fiato: 'Frasi complete', fatica: '2-3', learn: 'allunghi', blocks: () => [{ kind: 'run', part: km(5) }, rep('strides', 4, { sec: 15, effort: 'hard' }, { sec: 45, effort: 'easy' })] },
]
export const newBlock = (kind: BlockKind): Block => {
  if (kind === 'reps') return rep('reps', 5, min(3, 'hard'), min(2))
  if (kind === 'hills') return rep('hills', 6, { sec: 20, effort: 'hard' }, min(2))
  if (kind === 'strides') return rep('strides', 4, { sec: 15, effort: 'hard' }, { sec: 45, effort: 'easy' })
  return { kind, part: kind === 'run' ? km(5) : min(10) }
}
/** Fatica e fiato attesi suggeriti dal blocco più impegnativo. */
export function expected(l: Block[]) {
  const top = Math.max(...l.map(b => EFFORTS[b.part.effort].level))
  return top >= 4 ? { fiato: 'Fiatone ok nei tratti, calmo nei recuperi', fatica: '7-8' } : top === 3 ? { fiato: 'Frasi brevi, niente fiatone', fatica: '5-6' } : l.some(b => b.rest?.effort === 'walk') ? { fiato: 'Mai fiatone', fatica: '2-3' } : { fiato: 'Frasi complete', fatica: '2-3' }
}

/* ---------- Guida ---------- */
export interface GStep { label: string; cue?: string; tone: 'work' | 'rest' | 'move'; sec?: number | null; m?: number | null; effort: Effort }
export function guideSteps(l: Block[]): GStep[] {
  const out: GStep[] = []
  for (const b of l) {
    const p = b.part
    if (!b.reps) { out.push({ label: b.kind === 'warm' ? 'Riscaldamento' : b.kind === 'cool' ? 'Defaticamento' : EFFORTS[p.effort].go, cue: EFFORTS[p.effort].feel, tone: b.kind === 'run' ? 'work' : 'move', sec: p.sec, m: p.m, effort: p.effort }); continue }
    const walk = walkRun(b), name = b.kind === 'hills' ? 'Salita' : b.kind === 'strides' ? 'Allungo' : walk ? 'Corri' : EFFORTS[p.effort].go
    for (let i = 1; i <= b.reps; i++) {
      const cue = `${i} di ${b.reps}`
      out.push({ label: name, cue: `${cue}. ${EFFORTS[p.effort].feel}`, tone: 'work', sec: p.sec, m: p.m, effort: p.effort })
      if (b.rest) out.push({ label: b.kind === 'hills' ? 'Scendi piano' : b.rest.effort === 'walk' ? 'Cammina' : 'Recupera', cue, tone: 'rest', sec: b.rest.sec, m: b.rest.m, effort: b.rest.effort })
    }
  }
  return out
}
export interface Lap { label: string; sec: number; m: number; effort: Effort }
export interface GuideState { i: number; t: number; m: number; total: number; dist: number; laps: Lap[]; done: boolean }
export const startGuide = (): GuideState => ({ i: 0, t: 0, m: 0, total: 0, dist: 0, laps: [], done: false })
const closeStep = (steps: GStep[], s: GuideState): GuideState => {
  const c = steps[s.i], laps = [...s.laps, { label: c.label, sec: Math.round(s.t), m: Math.round(s.m), effort: c.effort }], i = s.i + 1
  return i >= steps.length ? { ...s, laps, done: true } : { ...s, i, t: 0, m: 0, laps }
}
/** Fa avanzare la seduta: tutto dipende da tempo e metri ricevuti, così uno stop del telefono non la sfasa. */
export function advance(steps: GStep[], from: GuideState, dt: number, dm: number): GuideState {
  let s = from
  for (let guard = 0; guard < 2000 && !s.done; guard++) {
    const c = steps[s.i]
    const bySec = c.sec ? c.sec - s.t : Infinity, byM = c.m ? c.m - s.m : Infinity
    const fS = dt > 0 ? bySec / dt : Infinity, fM = dm > 0 ? byM / dm : Infinity, f = Math.min(fS, fM)
    if (f > 1) return { ...s, t: s.t + dt, m: s.m + dm, total: s.total + dt, dist: s.dist + dm }
    const ut = dt * f, um = dm * f
    s = closeStep(steps, { ...s, t: s.t + ut, m: s.m + um, total: s.total + ut, dist: s.dist + um })
    dt -= ut; dm -= um
    if (dt <= 0 && dm <= 0) return s
  }
  return s
}
/** Chiude il tratto in corso: serve per "Fatto" con l'orologio e per "Salta". */
export const finishStep = closeStep
export const stepLeft = (c: GStep, s: GuideState) => ({ sec: c.sec ? Math.max(0, c.sec - s.t) : null, m: c.m ? Math.max(0, c.m - s.m) : null })
/** Secondi all'avanti fino al prossimo tratto che dipende dalla distanza: lì non si può sapere quando finirà. */
export function timedAhead(steps: GStep[], s: GuideState) {
  const out: { at: number; next: GStep | null }[] = []
  let at = 0
  for (let i = s.i; i < steps.length; i++) {
    const c = steps[i]
    if (c.m || !c.sec) break
    at += i === s.i ? c.sec - s.t : c.sec
    out.push({ at, next: steps[i + 1] ?? null })
  }
  return out
}
export const guideProgress = (steps: GStep[], s: GuideState) => {
  if (s.done) return 1
  const w = (c: GStep) => c.sec && !c.m ? c.sec : (c.m ?? 0) / 1000 * PACE[c.effort]
  const all = steps.reduce((a, c) => a + w(c), 0), c = steps[s.i], before = steps.slice(0, s.i).reduce((a, x) => a + w(x), 0)
  const part = c.m ? s.m / c.m : c.sec ? s.t / c.sec : 0
  return all ? Math.min(1, (before + w(c) * Math.min(1, part)) / all) : 0
}
