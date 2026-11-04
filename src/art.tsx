/* Illustrazioni vettoriali in stile flat: posizione iniziale e finale, senza video né rete. */
import type { ComponentChildren } from 'preact'
type P = [number, number]
export interface Pose { hip: P; neck: P; fn: P; ff: P; hn: P; hf: P; head?: P; legs?: 1 | -1; armN?: 1 | -1; armF?: 1 | -1; toeN?: P; toeF?: P; curve?: number }
export interface Scene { label: string; poses: Pose[]; tilt?: number; props?: (p: Pose) => ComponentChildren }
const G = 132, THIGH = 34, SHIN = 34, UP = 25, FORE = 23
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lp = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
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

const bench = (x: number, w: number, y: number) => <>{box(x, y, w, 7)}{line([x + 6, y + 7], [x + 6, G])}{line([x + w - 6, y + 7], [x + w - 6, G])}</>
const FEET = (x: number): Pick<Pose, 'fn' | 'ff'> => ({ fn: [x, G - 3], ff: [x, G - 3] })
const squat = (hi: P, nh: P, lo: P, nl: P, x = 100, hands?: P): Pose[] => [
  { ...FEET(x), hip: hi, neck: nh, hn: hands ?? [nh[0] + 45, nh[1] + 8], hf: hands ?? [nh[0] + 45, nh[1] + 8], armN: 1, armF: 1 },
  { ...FEET(x), hip: lo, neck: nl, hn: hands ?? [nl[0] + 45, nl[1] + 8], hf: hands ?? [nl[0] + 45, nl[1] + 8], armN: 1, armF: 1 },
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
  walk: { label: 'Camminata', poses: [pose([98, 66], [101, 20], [118, G - 3], [80, G - 5], [90, 62], [114, 60], { armN: 1, armF: -1, toeF: [12, 3] })] },
  run: { label: 'Corsa facile', poses: [pose([96, 70], [103, 25], [118, 124], [62, 104], [86, 62], [126, 46], { armN: 1, armF: -1, toeF: [6, 11] })] },
  stride: { label: 'Allungo', poses: [pose([94, 64], [107, 20], [132, 96], [44, 92], [80, 48], [136, 34], { armN: 1, armF: -1, toeN: [13, 1], toeF: [4, 12] })] },
  hill: { label: 'Corsa in salita', tilt: -12, poses: [pose([92, 70], [110, 27], [124, 96], [62, G - 8], [88, 62], [134, 44], { armN: 1, armF: -1, toeF: [10, 7] })] },
  legpress: { label: 'Leg press', poses: [
    pose([62, 106], [30, 73], [136, 58], [136, 58], [50, 104], [50, 104], { legs: -1, armN: -1, armF: -1, toeN: [3, -13], toeF: [3, -13] }),
    pose([62, 106], [30, 73], [100, 58], [100, 58], [50, 104], [50, 104], { legs: -1, armN: -1, armF: -1, toeN: [3, -13], toeF: [3, -13] }),
  ], props: p => <>{line([20, 112], [52, 125], 'a-bar')}{line([48, 118], [80, 118], 'a-bar')}{line([12, 72], [46, 112], 'a-bar')}{box(p.fn[0] + 5, 34, 8, 44)}{line([p.fn[0] + 12, 56], [190, 40])}</> },
  squat: { label: 'Squat', poses: squat([92, 66], [97, 20], [68, 98], [92, 58]) },
  rdl: { label: 'Stacco rumeno', poses: [
    { ...FEET(100), hip: [97, 67], neck: [100, 21], hn: [102, 70], hf: [102, 70], armN: 1, armF: 1 },
    { ...FEET(100), hip: [76, 72], neck: [116, 50], hn: [112, 100], hf: [112, 100], armN: 1, armF: 1 },
  ], props: p => <>{line([p.hn[0] - 16, p.hn[1]], [p.hn[0] + 16, p.hn[1]], 'a-bar')}<circle cx={p.hn[0]} cy={p.hn[1]} r={11} class="a-prop" /></> },
  lunge: { label: 'Affondi', poses: lunge() },
  split: { label: 'Split squat', poses: [
    pose([90, 72], [92, 26], [122, G - 3], [52, G - 5], [86, 72], [88, 72], { toeF: [12, 2] }),
    pose([90, 94], [93, 48], [122, G - 3], [52, G - 5], [86, 94], [88, 94], { toeF: [12, 2] }),
  ] },
  hipthrust: { label: 'Hip thrust', poses: hipUp([42, 86], [138, G - 3], [90, 112], [94, 78], [28, 74]), props: () => bench(14, 40, 92) },
  calf: { label: 'Polpacci in piedi', poses: [
    pose([100, 60], [100, 14], [100, 126], [100, 126], [98, 58], [98, 58], { toeN: [13, 3], toeF: [13, 3] }),
    pose([102, 48], [102, 2], [103, 114], [103, 114], [100, 46], [100, 46], { toeN: [10, 15], toeF: [10, 15] }),
  ] },
  calfseat: { label: 'Polpacci seduto', poses: [
    pose([62, 86], [58, 40], [100, 126], [100, 126], [92, 72], [92, 72], { toeN: [13, 3], toeF: [13, 3] }),
    pose([62, 86], [58, 40], [101, 117], [101, 117], [92, 64], [92, 64], { toeN: [11, 12], toeF: [11, 12] }),
  ], props: p => <>{bench(36, 44, 94)}{box(82, p.hn[1] - 6, 34, 7)}</> },
  stepdown: { label: 'Discese da gradino', poses: [
    pose([84, 44], [88, -1], [86, 109], [112, 106], [132, 6], [132, 6], { armN: 1, armF: 1 }),
    pose([68, 72], [84, 28], [86, 109], [124, G - 5], [128, 36], [128, 36], { armN: 1, armF: 1 }),
  ], props: () => box(62, 112, 46, 20) },
  plank: { label: 'Plank', poses: [
    pose([116, 106], [68, 103], [183, 118], [183, 118], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [55, 100], toeN: [-3, 11], toeF: [-3, 11] }),
    pose([116, 105], [68, 101], [183, 118], [183, 118], [90, G - 3], [90, G - 3], { armN: 1, armF: 1, head: [55, 98], toeN: [-3, 11], toeF: [-3, 11] }),
  ] },
  side: { label: 'Side plank', poses: [
    pose([112, 122], [68, 103], [178, G - 3], [178, G - 3], [90, G - 3], [100, 112], { armN: 1, armF: -1, head: [56, 97], toeN: [11, 0], toeF: [11, 0] }),
    pose([112, 104], [68, 103], [178, G - 3], [178, G - 3], [90, G - 3], [72, 54], { armN: 1, armF: -1, head: [56, 99], toeN: [11, 0], toeF: [11, 0] }),
  ] },
  chair: { label: 'Squat su sedia', poses: squat([92, 66], [97, 20], [66, 96], [88, 56], 104), props: () => bench(40, 40, 100) },
  rdl1: { label: 'Stacco a una gamba', poses: [
    pose([97, 66], [100, 20], [100, G - 3], [78, 120], [100, 68], [100, 68], { armN: 1, armF: 1 }),
    pose([86, 68], [126, 54], [100, G - 3], [26, 62], [128, 100], [128, 100], { armN: 1, armF: 1, toeF: [2, 13] }),
  ] },
  backlunge: { label: 'Affondi indietro', poses: [
    pose([104, 64], [106, 18], [116, G - 3], [100, G - 3], [100, 62], [102, 62]),
    pose([98, 92], [103, 46], [124, G - 3], [56, G - 5], [98, 90], [100, 90], { toeF: [12, 2] }),
  ] },
  bridge: { label: 'Ponte', poses: [
    pose([86, 122], [42, 120], [122, G - 3], [150, 92], [76, 128], [76, 128], { legs: -1, ...flat(1), head: [30, 118] }),
    pose([92, 90], [44, 116], [122, G - 3], [150, 58], [76, 128], [76, 128], { legs: -1, ...flat(1), head: [31, 118] }),
  ] },
  calfstep: { label: 'Polpacci su gradino', poses: [
    pose([96, 54], [96, 8], [104, 112], [84, 92], [122, 34], [122, 34], { toeN: [11, -6], armN: -1, armF: -1 }),
    pose([98, 38], [98, -8], [104, 96], [84, 80], [122, 20], [122, 20], { toeN: [12, 8], armN: -1, armF: -1 }),
  ].map(p => ({ ...p, hip: [p.hip[0], p.hip[1] + 10] as P, neck: [p.neck[0], p.neck[1] + 10] as P, fn: [p.fn[0], p.fn[1] + 8] as P, ff: [p.ff[0], p.ff[1] + 8] as P })), props: () => <>{box(112, 112, 46, 20)}{line([134, 112], [134, 26])}</> },
  calfwall: { label: 'Polpaccio al muro', poses: [
    pose([116, 64], [146, 26], [142, G - 3], [70, G - 3], [176, 34], [176, 34], { armN: -1, armF: -1 }),
    pose([126, 70], [152, 30], [142, G - 3], [70, G - 3], [176, 36], [176, 36], { armN: -1, armF: -1 }),
  ], props: wall },
  hamstring: { label: 'Flessori della coscia', poses: [
    pose([84, 64], [92, 18], [90, G - 3], [142, 100], [114, 60], [116, 60], { armN: -1, armF: -1, toeF: [2, -13] }),
    pose([78, 66], [116, 36], [90, G - 3], [142, 100], [130, 74], [132, 74], { armN: -1, armF: -1, toeF: [2, -13] }),
  ], props: () => bench(132, 34, 106) },
  quad: { label: 'Quadricipite in piedi', poses: [
    pose([100, 66], [100, 20], [100, G - 3], [62, 70], [84, 70], [150, 22], { legs: -1, armN: 1, armF: -1, toeF: [3, -13] }),
    pose([100, 66], [101, 20], [100, G - 3], [64, 66], [82, 66], [150, 22], { legs: -1, armN: 1, armF: -1, toeF: [3, -13] }),
  ], props: () => box(160, 18, 8, 114, 2) },
  hipflex: { label: "Flessori dell'anca", poses: [
    pose([92, 96], [92, 50], [130, G - 3], [40, G - 4], [114, 96], [116, 96], { toeF: [-13, 1] }),
    pose([102, 102], [98, 56], [130, G - 3], [40, G - 4], [124, 96], [126, 96], { toeF: [-13, 1] }),
  ] },
  ankle: { label: 'Caviglia al muro', poses: [
    pose([112, 80], [108, 34], [146, G - 3], [78, G - 4], [168, 60], [168, 60], { armN: -1, armF: -1 }),
    pose([124, 84], [120, 38], [146, G - 3], [78, G - 4], [172, 62], [172, 62], { armN: -1, armF: -1 }),
  ], props: wall },
  swing: { label: 'Slanci', poses: [
    pose([96, 66], [94, 20], [96, G - 3], [136, 96], [152, 22], [126, 64], { armN: -1, armF: -1 }),
    pose([96, 66], [98, 20], [96, G - 3], [52, 106], [152, 22], [126, 64], { armN: -1, armF: -1 }),
  ], props: () => box(162, 18, 8, 114, 2) },
  glute: { label: 'Gluteo a terra', poses: [
    pose([70, 122], [28, 120], [118, G - 3], [112, 88], [80, 96], [86, 90], { legs: -1, ...flat(1), head: [16, 118] }),
    pose([70, 122], [30, 118], [106, G - 3], [100, 86], [84, 90], [90, 84], { legs: -1, ...flat(1), head: [18, 116] }),
  ] },
  cat: { label: 'Gatto e cammello', poses: [
    pose([122, 84], [66, 82], [152, G - 3], [152, G - 3], [62, G - 3], [62, G - 3], { legs: -1, armN: -1, armF: -1, head: [52, 80], toeN: [13, 1], toeF: [13, 1], curve: -13 }),
    pose([122, 84], [66, 82], [152, G - 3], [152, G - 3], [62, G - 3], [62, G - 3], { legs: -1, armN: -1, armF: -1, head: [52, 90], toeN: [13, 1], toeF: [13, 1], curve: 11 }),
  ] },
}
export const sceneForStep = (label: string): string | null => {
  const m: [RegExp, string][] = [[/polpaccio al muro/i, 'calfwall'], [/flessori della coscia/i, 'hamstring'], [/quadricipite/i, 'quad'], [/flessori dell/i, 'hipflex'], [/caviglia al muro/i, 'ankle'], [/slanci/i, 'swing'], [/gluteo a terra/i, 'glute'], [/gatto/i, 'cat'], [/ponte/i, 'bridge'], [/squat/i, 'squat'], [/affondi/i, 'backlunge'], [/polpacci/i, 'calf'], [/corsa|skip/i, 'run'], [/cammin/i, 'walk']]
  return m.find(x => x[0].test(label))?.[1] ?? null
}

const C = { skin: '#f0b48a', skinD: '#d9966c', shirt: '#2f7fd6', shirtD: '#2467b3', short: '#27364a', shortD: '#1c2838', shoe: '#ff6b4a', shoeD: '#d9502f', hair: '#3a2a22', sock: '#ffffff' }
/** Un arto rastremato: un trapezio con le due estremità arrotondate. */
function Taper({ a, b, r1, r2, fill }: { a: P; b: P; r1: number; r2: number; fill: string }) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || .01, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d
  return <><circle cx={a[0]} cy={a[1]} r={r1} fill={fill} /><circle cx={b[0]} cy={b[1]} r={r2} fill={fill} /><polygon fill={fill} points={`${a[0] + nx * r1},${a[1] + ny * r1} ${b[0] + nx * r2},${b[1] + ny * r2} ${b[0] - nx * r2},${b[1] - ny * r2} ${a[0] - nx * r1},${a[1] - ny * r1}`} /></>
}
function Leg({ p, foot, toe, far, side }: { p: Pose; foot: P; toe: P; far?: boolean; side: number }) {
  const { j, end } = joint(p.hip, foot, THIGH, SHIN, side), skin = far ? C.skinD : C.skin, shoe = far ? C.shoeD : C.shoe
  const mid = lp(p.hip, j, .62), tip: P = [end[0] + toe[0], end[1] + toe[1]], cuff = lp(j, end, .86)
  return <>
    <Taper a={p.hip} b={j} r1={8.5} r2={6} fill={skin} />
    <Taper a={j} b={end} r1={6} r2={3.8} fill={skin} />
    <Taper a={p.hip} b={mid} r1={9} r2={7.6} fill={far ? C.shortD : C.short} />
    <Taper a={cuff} b={end} r1={4.2} r2={4} fill={C.sock} />
    <Taper a={end} b={tip} r1={4.8} r2={3.6} fill={shoe} />
  </>
}
function Arm({ p, s, hand, far, side }: { p: Pose; s: P; hand: P; far?: boolean; side: number }) {
  const { j, end } = joint(s, hand, UP, FORE, side), skin = far ? C.skinD : C.skin
  return <>
    <Taper a={j} b={end} r1={4.4} r2={3.4} fill={skin} />
    <Taper a={s} b={j} r1={5.6} r2={4.4} fill={skin} />
    <Taper a={s} b={lp(s, j, .55)} r1={6.2} r2={5.4} fill={far ? C.shirtD : C.shirt} />
    <circle cx={end[0]} cy={end[1]} r={3.9} fill={skin} />
  </>
}
function Figure({ p }: { p: Pose }) {
  const len = Math.hypot(p.neck[0] - p.hip[0], p.neck[1] - p.hip[1]) || 1, dir: P = [(p.neck[0] - p.hip[0]) / len, (p.neck[1] - p.hip[1]) / len]
  const head: P = p.head ?? [p.neck[0] + dir[0] * 14, p.neck[1] + dir[1] * 14], sh = lp(p.neck, p.hip, .06), legs = p.legs ?? -1
  const up = Math.atan2(p.neck[1] + dir[1] * 14 - p.neck[1], p.neck[0] + dir[0] * 14 - p.neck[0]) * 180 / Math.PI + 90
  const mid = lp(p.hip, p.neck, .5), bend: P = [mid[0] - dir[1] * (p.curve ?? 0) * -1, mid[1] + dir[0] * (p.curve ?? 0) * -1]
  return <>
    <Arm p={p} s={sh} hand={p.hf} far side={p.armF ?? 1} />
    <Leg p={p} foot={p.ff} toe={p.toeF ?? [13, 3]} far side={legs} />
    <Taper a={p.neck} b={head} r1={4} r2={4} fill={C.skin} />
    <Taper a={lp(p.hip, p.neck, .1)} b={bend} r1={8.5} r2={11} fill={C.shirt} />
    <Taper a={bend} b={p.neck} r1={11} r2={10.5} fill={C.shirt} />
    <Leg p={p} foot={p.fn} toe={p.toeN ?? [13, 3]} side={legs} />
    <Arm p={p} s={sh} hand={p.hn} side={p.armN ?? 1} />
    <g transform={`rotate(${up} ${head[0]} ${head[1]})`}>
      <circle cx={head[0]} cy={head[1]} r={9.6} fill={C.skin} />
      <path d={`M${head[0] - 9.9} ${head[1] + 1}A9.9 9.9 0 0 1 ${head[0] + 9.9} ${head[1] - 2}Q${head[0] + 2} ${head[1] - 5} ${head[0] - 9.9} ${head[1] + 1}Z`} fill={C.hair} />
    </g>
  </>
}
function Frame({ s, p, x, n, id }: { s: Scene; p: Pose; x: number; n?: number; id: string }) {
  return <g transform={`translate(${x} 0)`}>
    <clipPath id={id}><rect width="200" height="168" rx="12" /></clipPath>
    <g clip-path={`url(#${id})`}>
      <rect width="200" height="168" fill="#dcebf7" />
      <g transform={`translate(0 24)${s.tilt ? ` rotate(${s.tilt} 100 132)` : ''}`}>
        <rect x="-60" y={G} width="320" height="90" fill="#a9c6df" />
        <rect x="-60" y={G} width="320" height="3" fill="#8fb1cf" />
        {s.props?.(p)}
        <Figure p={p} />
      </g>
      {n != null && <><circle cx="17" cy="17" r="10" fill="#27364a" /><text x="17" y="21" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="inherit">{n}</text></>}
    </g>
  </g>
}
let uid = 0
/** L'illustrazione: due posizioni affiancate per gli esercizi, una sola per i tipi di corsa o quando si chiede la miniatura. */
export function Illustration({ id, thumb }: { id: string; thumb?: boolean }) {
  const s = SCENES[id]
  if (!s) return null
  const key = `art${++uid}`, l = s.poses, two = l.length > 1 && !thumb
  return <figure class={'art' + (thumb ? ' thumb' : '')}>
    <svg viewBox={two ? '0 0 412 168' : '0 0 200 168'} role="img" aria-label={`Illustrazione: ${s.label}${two ? ', posizione iniziale e finale' : ''}`}>
      {two ? <><Frame s={s} p={l[0]} x={0} n={1} id={key + 'a'} /><Frame s={s} p={l[l.length - 1]} x={212} n={2} id={key + 'b'} /></> : <Frame s={s} p={l[l.length - 1]} x={0} id={key} />}
    </svg>
  </figure>
}
