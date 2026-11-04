/* Animazioni nostre: una figura stilizzata calcolata da posizioni chiave, senza video né rete. */
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
type P = [number, number]
export interface Pose { hip: P; neck: P; fn: P; ff: P; hn: P; hf: P; head?: P; legs?: 1 | -1; armN?: 1 | -1; armF?: 1 | -1; toeN?: P; toeF?: P; curve?: number }
export interface Scene { label: string; poses?: Pose[]; at?: (u: number) => Pose; ms?: number; tilt?: number; props?: (p: Pose) => ComponentChildren; ground?: boolean }
const G = 132, THIGH = 34, SHIN = 34, UP = 25, FORE = 23, BODY = 46
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lp = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
const mix = (a: Pose, b: Pose, t: number): Pose => ({ ...a, hip: lp(a.hip, b.hip, t), neck: lp(a.neck, b.neck, t), fn: lp(a.fn, b.fn, t), ff: lp(a.ff, b.ff, t), hn: lp(a.hn, b.hn, t), hf: lp(a.hf, b.hf, t), toeN: lp(a.toeN ?? [13, 3], b.toeN ?? [13, 3], t), toeF: lp(a.toeF ?? [13, 3], b.toeF ?? [13, 3], t), head: a.head && b.head ? lp(a.head, b.head, t) : a.head, curve: lerp(a.curve ?? 0, b.curve ?? 0, t) })
/** Trova il gomito o il ginocchio dalle due estremità: piedi e mani restano dove devono stare. */
function joint(a: P, c: P, l1: number, l2: number, side: number): { j: P; end: P } {
  const dx = c[0] - a[0], dy = c[1] - a[1], dist = Math.hypot(dx, dy) || .01, d = Math.min(dist, l1 + l2 - .5)
  const end: P = [a[0] + dx / dist * d, a[1] + dy / dist * d]
  const ang = Math.atan2(dy, dx), off = Math.acos(Math.min(1, Math.max(-1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1))))
  return { j: [a[0] + Math.cos(ang + side * off) * l1, a[1] + Math.sin(ang + side * off) * l1], end }
}
const pose = (hip: P, neck: P, fn: P, ff: P, hn: P, hf: P, x: Partial<Pose> = {}): Pose => ({ hip, neck, fn, ff, hn, hf, ...x })
const box = (x: number, y: number, w: number, h: number, r = 3) => <rect x={x} y={y} width={w} height={h} rx={r} class="a-prop" />
const line = (a: P, b: P, c = 'a-prop-l') => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class={c} />
const wall = () => <>{box(176, 18, 8, 114, 2)}</>

/* Corsa: il piede segue un giro chiuso attorno all'anca. */
const ring = (l: P[], u: number): P => { const n = l.length, x = ((u % 1) + 1) % 1 * n, i = Math.floor(x), t = x - i, s = t * t * (3 - 2 * t); return lp(l[i], l[(i + 1) % n], s) }
function runner(opt: { stride: number; lift: number; lean: number; bounce: number; arm: number }): (u: number) => Pose {
  const s = opt.stride, foot: P[] = [[20 * s, 57], [3 * s, 58.5], [-20 * s, 56], [-30 * s, 42 - opt.lift], [-4 * s, 34 - opt.lift], [24 * s, 44]]
  const hand = (u: number, n: P): P => { const w = Math.cos(u * Math.PI * 2); return [n[0] + 7 + w * opt.arm, n[1] + 34 - Math.abs(w) * 6 - Math.max(0, w) * 9] }
  return u => {
    const y = 72 + Math.cos(u * Math.PI * 4) * opt.bounce, hip: P = [96, y], neck: P = [96 + opt.lean, y - BODY + 1]
    const a = ring(foot, u), b = ring(foot, u + .5)
    return pose(hip, neck, [hip[0] + a[0], Math.min(G - 3, y + a[1])], [hip[0] + b[0], Math.min(G - 3, y + b[1])], hand(u + .5, neck), hand(u, neck), { armN: -1, armF: -1 })
  }
}
const stand = (dy = 0): Pick<Pose, 'hip' | 'neck'> => ({ hip: [100, 66 + dy], neck: [100, 20 + dy] })
const barTop = (p: Pose) => <circle cx={p.neck[0]} cy={p.neck[1] + 1} r={6} class="a-prop" />
const dumb = (p: Pose) => <>{line([p.hn[0] - 13, p.hn[1]], [p.hn[0] + 13, p.hn[1]], 'a-bar')}<circle cx={p.hn[0]} cy={p.hn[1]} r={8} class="a-prop" /></>
const bench = (x: number, w: number, y: number) => <>{box(x, y, w, 7)}{line([x + 6, y + 7], [x + 6, G])}{line([x + w - 6, y + 7], [x + w - 6, G])}</>
const FEET = (x: number): Pick<Pose, 'fn' | 'ff'> => ({ fn: [x, G - 3], ff: [x, G - 3] })
const squat = (hi: P, nh: P, lo: P, nl: P, x = 100, hands?: P): Pose[] => [
  { ...FEET(x), hip: hi, neck: nh, hn: hands ?? [nh[0] + 2, nh[1] + 6], hf: hands ?? [nh[0] + 2, nh[1] + 6], armN: 1, armF: 1 },
  { ...FEET(x), hip: lo, neck: nl, hn: hands ?? [nl[0] + 2, nl[1] + 6], hf: hands ?? [nl[0] + 2, nl[1] + 6], armN: 1, armF: 1 },
]
const lunge = (back = false): Pose[] => [
  pose([96, 64], [98, 18], [106, G - 3], [92, G - 3], [92, 62], [94, 62]),
  pose([92, 92], [97, 46], [122, G - 3], [52, G - 5], [92, 90], [94, 90], { toeF: [12, 2] }),
  ...(back ? [] : []),
]
const hipUp = (sh: P, foot: P, low: P, high: P, nh: P): Pose[] => [
  pose(low, sh, foot, foot, [sh[0] + 26, low[1] - 2], [sh[0] + 26, low[1] - 2], { legs: -1, armN: 1, armF: 1, head: [nh[0], nh[1]] }),
  pose(high, sh, foot, foot, [sh[0] + 28, high[1] - 2], [sh[0] + 28, high[1] - 2], { legs: -1, armN: 1, armF: 1, head: [nh[0], nh[1]] }),
]
const flat = (x = 0): Pick<Pose, 'armN' | 'armF'> => ({ armN: x ? 1 : -1, armF: x ? 1 : -1 })

export const SCENES: Record<string, Scene> = {
  walk: { label: 'Camminata', ms: 1400, at: runner({ stride: .72, lift: -8, lean: 2, bounce: 1, arm: 9 }) },
  run: { label: 'Corsa facile', ms: 1000, at: runner({ stride: 1, lift: 0, lean: 6, bounce: 2.5, arm: 12 }) },
  stride: { label: 'Allungo', ms: 620, at: runner({ stride: 1.3, lift: 6, lean: 9, bounce: 3, arm: 17 }) },
  hill: { label: 'Corsa in salita', ms: 820, tilt: -12, at: runner({ stride: .95, lift: 4, lean: 15, bounce: 2.5, arm: 16 }) },
  legpress: { label: 'Leg press', ms: 3000, poses: [
    pose([62, 106], [30, 73], [136, 58], [136, 58], [50, 104], [50, 104], { legs: -1, armN: -1, armF: -1, toeN: [3, -13], toeF: [3, -13] }),
    pose([62, 106], [30, 73], [100, 58], [100, 58], [50, 104], [50, 104], { legs: -1, armN: -1, armF: -1, toeN: [3, -13], toeF: [3, -13] }),
  ], props: p => <>{line([20, 112], [52, 125], 'a-bar')}{line([48, 118], [80, 118], 'a-bar')}{line([12, 72], [46, 112], 'a-bar')}{box(p.fn[0] + 5, 34, 8, 44)}{line([p.fn[0] + 12, 56], [190, 40])}</> },
  squat: { label: 'Squat', ms: 3000, poses: squat([92, 66], [97, 20], [68, 98], [92, 58]), props: barTop },
  rdl: { label: 'Stacco rumeno', ms: 3200, poses: [
    { ...FEET(100), hip: [97, 67], neck: [100, 21], hn: [102, 70], hf: [102, 70], armN: 1, armF: 1 },
    { ...FEET(100), hip: [76, 72], neck: [116, 50], hn: [112, 100], hf: [112, 100], armN: 1, armF: 1 },
  ], props: p => <>{line([p.hn[0] - 16, p.hn[1]], [p.hn[0] + 16, p.hn[1]], 'a-bar')}<circle cx={p.hn[0]} cy={p.hn[1]} r={11} class="a-prop" /></> },
  lunge: { label: 'Affondi', ms: 3200, poses: lunge(), props: dumb },
  split: { label: 'Split squat', ms: 3000, poses: [
    pose([90, 72], [92, 26], [122, G - 3], [52, G - 5], [86, 72], [88, 72], { toeF: [12, 2] }),
    pose([90, 94], [93, 48], [122, G - 3], [52, G - 5], [86, 94], [88, 94], { toeF: [12, 2] }),
  ] },
  hipthrust: { label: 'Hip thrust', ms: 3000, poses: hipUp([42, 86], [138, G - 3], [90, 112], [94, 78], [28, 74]), props: () => bench(14, 40, 92) },
  calf: { label: 'Polpacci in piedi', ms: 2400, poses: [
    pose([100, 60], [100, 14], [100, 126], [100, 126], [98, 58], [98, 58], { toeN: [13, 3], toeF: [13, 3] }),
    pose([102, 48], [102, 2], [103, 114], [103, 114], [100, 46], [100, 46], { toeN: [10, 15], toeF: [10, 15] }),
  ] },
  calfseat: { label: 'Polpacci seduto', ms: 2400, poses: [
    pose([62, 86], [58, 40], [100, 126], [100, 126], [92, 72], [92, 72], { toeN: [13, 3], toeF: [13, 3] }),
    pose([62, 86], [58, 40], [101, 117], [101, 117], [92, 64], [92, 64], { toeN: [11, 12], toeF: [11, 12] }),
  ], props: p => <>{bench(36, 44, 94)}{box(82, p.hn[1] - 6, 34, 7)}</> },
  stepdown: { label: 'Discese da gradino', ms: 3400, poses: [
    pose([84, 44], [88, -1], [86, 95], [118, 96], [108, 34], [108, 34]),
    pose([70, 64], [84, 20], [86, 95], [122, G - 5], [106, 50], [106, 50]),
  ], props: () => box(64, 98, 44, 34) },
  plank: { label: 'Plank', ms: 3600, poses: [
    pose([116, 106], [68, 103], [183, 118], [183, 118], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [55, 100], toeN: [-3, 11], toeF: [-3, 11] }),
    pose([116, 105], [68, 101], [183, 118], [183, 118], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [55, 98], toeN: [-3, 11], toeF: [-3, 11] }),
  ] },
  side: { label: 'Side plank', ms: 3400, poses: [
    pose([112, 120], [68, 103], [178, G - 3], [178, G - 3], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [56, 97], toeN: [11, 0], toeF: [11, 0] }),
    pose([112, 108], [68, 103], [178, G - 3], [178, G - 3], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [56, 99], toeN: [11, 0], toeF: [11, 0] }),
  ] },
  chair: { label: 'Squat su sedia', ms: 3200, poses: squat([92, 66], [97, 20], [66, 96], [88, 56], 104, [120, 48]).map((p, i) => ({ ...p, hn: i ? [116, 58] as P : [124, 44] as P, hf: i ? [116, 58] as P : [124, 44] as P, armN: -1 as const, armF: -1 as const })), props: () => bench(40, 40, 100) },
  rdl1: { label: 'Stacco a una gamba', ms: 3400, poses: [
    pose([97, 66], [100, 20], [100, G - 3], [78, 120], [100, 68], [100, 68], { armN: 1, armF: 1 }),
    pose([86, 68], [126, 54], [100, G - 3], [26, 62], [128, 100], [128, 100], { armN: 1, armF: 1, toeF: [2, 13] }),
  ] },
  backlunge: { label: 'Affondi indietro', ms: 3200, poses: [
    pose([104, 64], [106, 18], [116, G - 3], [100, G - 3], [100, 62], [102, 62]),
    pose([98, 92], [103, 46], [124, G - 3], [56, G - 5], [98, 90], [100, 90], { toeF: [12, 2] }),
  ] },
  bridge: { label: 'Ponte', ms: 3000, poses: [
    pose([86, 122], [42, 120], [122, G - 3], [150, 92], [64, 127], [64, 127], { legs: -1, ...flat(1), head: [30, 118] }),
    pose([92, 90], [44, 116], [122, G - 3], [150, 58], [66, 127], [66, 127], { legs: -1, ...flat(1), head: [31, 118] }),
  ] },
  calfstep: { label: 'Polpacci su gradino', ms: 2800, poses: [
    pose([96, 54], [96, 8], [104, 112], [84, 92], [122, 34], [122, 34], { toeN: [11, -6], armN: -1, armF: -1 }),
    pose([98, 38], [98, -8], [104, 96], [84, 80], [122, 20], [122, 20], { toeN: [12, 8], armN: -1, armF: -1 }),
  ].map(p => ({ ...p, hip: [p.hip[0], p.hip[1] + 10] as P, neck: [p.neck[0], p.neck[1] + 10] as P, fn: [p.fn[0], p.fn[1] + 8] as P, ff: [p.ff[0], p.ff[1] + 8] as P })), props: () => <>{box(112, 112, 46, 20)}{line([134, 112], [134, 26])}</> },
  calfwall: { label: 'Polpaccio al muro', ms: 3200, poses: [
    pose([116, 64], [146, 26], [142, G - 3], [70, G - 3], [176, 34], [176, 34], { armN: -1, armF: -1 }),
    pose([126, 70], [152, 30], [142, G - 3], [70, G - 3], [176, 36], [176, 36], { armN: -1, armF: -1 }),
  ], props: wall },
  hamstring: { label: 'Flessori della coscia', ms: 3400, poses: [
    pose([84, 64], [92, 18], [90, G - 3], [148, 100], [114, 60], [116, 60], { armN: -1, armF: -1, toeF: [2, -13] }),
    pose([78, 66], [116, 36], [90, G - 3], [148, 100], [130, 74], [132, 74], { armN: -1, armF: -1, toeF: [2, -13] }),
  ], props: () => bench(132, 34, 106) },
  quad: { label: 'Quadricipite in piedi', ms: 3000, poses: [
    pose([100, 66], [100, 20], [100, G - 3], [62, 70], [84, 70], [150, 22], { legs: -1, armN: 1, armF: -1, toeF: [3, -13] }),
    pose([100, 66], [101, 20], [100, G - 3], [64, 66], [82, 66], [150, 22], { legs: -1, armN: 1, armF: -1, toeF: [3, -13] }),
  ], props: () => box(160, 18, 8, 114, 2) },
  hipflex: { label: "Flessori dell'anca", ms: 3200, poses: [
    pose([92, 96], [92, 50], [130, G - 3], [40, G - 4], [114, 96], [116, 96], { toeF: [-13, 1] }),
    pose([102, 102], [98, 56], [130, G - 3], [40, G - 4], [124, 96], [126, 96], { toeF: [-13, 1] }),
  ] },
  ankle: { label: 'Caviglia al muro', ms: 2600, poses: [
    pose([112, 80], [108, 34], [146, G - 3], [78, G - 4], [168, 60], [168, 60], { armN: -1, armF: -1 }),
    pose([124, 84], [120, 38], [146, G - 3], [78, G - 4], [172, 62], [172, 62], { armN: -1, armF: -1 }),
  ], props: wall },
  swing: { label: 'Slanci', ms: 1500, poses: [
    pose([96, 66], [94, 20], [96, G - 3], [136, 96], [152, 22], [126, 64], { armN: -1, armF: -1 }),
    pose([96, 66], [98, 20], [96, G - 3], [52, 106], [152, 22], [126, 64], { armN: -1, armF: -1 }),
  ], props: () => box(162, 18, 8, 114, 2) },
  glute: { label: 'Gluteo a terra', ms: 3200, poses: [
    pose([70, 122], [28, 120], [118, G - 3], [112, 88], [80, 96], [86, 90], { legs: -1, ...flat(1), head: [16, 118] }),
    pose([70, 122], [30, 118], [106, G - 3], [100, 86], [84, 90], [90, 84], { legs: -1, ...flat(1), head: [18, 116] }),
  ] },
  cat: { label: 'Gatto e cammello', ms: 3600, poses: [
    pose([122, 86], [66, 86], [152, G - 3], [152, G - 3], [62, G - 3], [62, G - 3], { legs: -1, armN: -1, armF: -1, head: [53, 84], toeN: [13, 1], toeF: [13, 1], curve: -13 }),
    pose([122, 86], [66, 86], [152, G - 3], [152, G - 3], [62, G - 3], [62, G - 3], { legs: -1, armN: -1, armF: -1, head: [53, 94], toeN: [13, 1], toeF: [13, 1], curve: 11 }),
  ] },
}
export const sceneForStep = (label: string): string | null => {
  const m: [RegExp, string][] = [[/polpaccio al muro/i, 'calfwall'], [/flessori della coscia/i, 'hamstring'], [/quadricipite/i, 'quad'], [/flessori dell/i, 'hipflex'], [/caviglia al muro/i, 'ankle'], [/slanci/i, 'swing'], [/gluteo a terra/i, 'glute'], [/gatto/i, 'cat'], [/ponte/i, 'bridge'], [/squat/i, 'squat'], [/affondi/i, 'backlunge'], [/polpacci/i, 'calf'], [/corsa|skip/i, 'run'], [/cammin/i, 'walk']]
  return m.find(x => x[0].test(label))?.[1] ?? null
}
function Figure({ p, tilt }: { p: Pose; tilt?: number }) {
  const legs = p.legs ?? -1, top = p.neck, sh = lp(p.neck, p.hip, .05)
  const dir: P = [(p.neck[0] - p.hip[0]) / (Math.hypot(p.neck[0] - p.hip[0], p.neck[1] - p.hip[1]) || 1), (p.neck[1] - p.hip[1]) / (Math.hypot(p.neck[0] - p.hip[0], p.neck[1] - p.hip[1]) || 1)]
  const head = p.head ?? [top[0] + dir[0] * 13, top[1] + dir[1] * 13] as P
  const limb = (a: P, c: P, l1: number, l2: number, side: number, cls: string, toe?: P) => {
    const { j, end } = joint(a, c, l1, l2, side)
    return <g class={cls}><polyline points={`${a[0]},${a[1]} ${j[0]},${j[1]} ${end[0]},${end[1]}${toe ? ` ${end[0] + toe[0]},${end[1] + toe[1]}` : ''}`} /></g>
  }
  void BODY; void tilt
  return <>
    {limb(sh, p.hf, UP, FORE, p.armF ?? 1, 'a-far')}
    {limb(p.hip, p.ff, THIGH, SHIN, legs, 'a-far', p.toeF ?? [13, 3])}
    <path d={`M${p.hip[0]} ${p.hip[1]} Q${(p.hip[0] + p.neck[0]) / 2} ${(p.hip[1] + p.neck[1]) / 2 + (p.curve ?? 0) * 2} ${p.neck[0]} ${p.neck[1]}`} class="a-body" />
    {limb(p.hip, p.fn, THIGH, SHIN, legs, 'a-near', p.toeN ?? [13, 3])}
    {limb(sh, p.hn, UP, FORE, p.armN ?? 1, 'a-near')}
    <circle cx={head[0]} cy={head[1]} r={10} class="a-head" />
  </>
}
export const poseAt = (s: Scene, u: number): Pose => {
  if (s.at) return s.at(u)
  const l = s.poses!, t = (1 - Math.cos(u * Math.PI * 2)) / 2
  return mix(l[0], l[l.length - 1], t)
}
const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
/** Disegna la scena e la anima solo mentre è visibile. Con il tocco si ferma. */
export function Anim({ id, small, frame }: { id: string; small?: boolean; frame?: number }) {
  const s = SCENES[id], ref = useRef<SVGSVGElement>(null), [u, setU] = useState(frame ?? (still() ? .5 : 0)), [on, setOn] = useState(frame == null && !still())
  useEffect(() => {
    if (!on || !s) return
    let raf = 0, seen = true, t0 = performance.now(), from = u
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(e => { seen = e[0].isIntersecting })
    if (ref.current) io?.observe(ref.current)
    const loop = (t: number) => { if (seen) setU((from + (t - t0) / (s.ms ?? 2500)) % 1); else { t0 = t; from = 0 } raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); io?.disconnect() }
  }, [on, id])
  if (!s) return null
  const p = poseAt(s, u)
  return <figure class={'anim' + (small ? ' small' : '')}>
    <svg ref={ref} viewBox="0 -24 200 164" role="img" aria-label={`Animazione: ${s.label}`} onClick={() => { if (frame == null) setOn(!on) }}>
      <g transform={s.tilt ? `rotate(${s.tilt} 100 132)` : undefined}>
        {line([-40, G], [240, G], 'a-ground')}
        {s.props?.(p)}
        <Figure p={p} tilt={s.tilt} />
      </g>
    </svg>
    {!small && frame == null && <figcaption>{on ? 'Tocca per fermare' : 'Tocca per avviare'}</figcaption>}
  </figure>
}
