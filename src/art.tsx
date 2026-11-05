/* Illustrazioni vettoriali in stile flat: posizione iniziale e finale, senza video né rete.
   Le figure si costruiscono da poche misure fisse, così le proporzioni restano vere in ogni posa. */
import type { ComponentChildren } from 'preact'
type P = [number, number]
/** Punti chiave della posa. tn e tf inclinano le scarpe in gradi: 0 è piatta, positivo punta a terra. look è l'inclinazione della testa. */
export interface Pose { hip: P; neck: P; fn: P; ff: P; hn: P; hf: P; legs?: 1 | -1; legF?: 1 | -1; armN?: 1 | -1; armF?: 1 | -1; tn?: number; tf?: number; look?: number; curve?: number }
export interface Scene { label: string; poses: Pose[]; slope?: number; zoom?: number; far?: P; props?: (p: Pose) => ComponentChildren }
const G = 132, A = G - 10, THIGH = 34, SHIN = 34, UP = 25, FORE = 23, TORSO = 43
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const lp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const n1 = (x: number) => Math.round(x * 100) / 100
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
const wall = () => <>{box(176, 14, 8, 118, 2)}</>
const bench = (x: number, w: number, y: number) => <>{box(x, y, w, 7)}{line([x + 6, y + 7], [x + 6, G])}{line([x + w - 6, y + 7], [x + w - 6, G])}</>
/** In piedi e di profilo, con le braccia lungo i fianchi. */
const stand = (x: number, more: Partial<Pose> = {}): Pose => pose([x - 2, 53], [x - 1, 7], [x + 2, A], [x, A], [x + 1, 60], [x + 3, 60], more)
const squat = (x: number, lo: P, nl: P): Pose[] => [
  pose([x - 3, 53], [x - 2, 7], [x, A], [x, A], [x + 48, 17], [x + 48, 17]),
  pose(lo, nl, [x, A], [x, A], [nl[0] + 44, nl[1] + 6], [nl[0] + 44, nl[1] + 6], { look: 0 }),
]
const onHips = (h: P): Pick<Pose, 'hn' | 'hf'> => ({ hn: [h[0] + 8, h[1] - 3], hf: [h[0] + 9, h[1] - 3] })
const REAR: Partial<Pose> = { tf: 50 }
const lunge = (x: number): Pose[] => [
  stand(x, onHips([x, 53])),
  pose([x - 5, 84], [x - 2, 38], [x + 30, A], [x - 44, 115], onHips([x - 5, 84]).hn, onHips([x - 5, 84]).hf, REAR),
]
const FLOOR: P = [1, -2]
export const SCENES: Record<string, Scene> = {
  walk: { label: 'Camminata', poses: [pose([98, 55], [102, 10], [122, 119], [76, 117], [83, 60], [122, 54], { tn: -14, tf: 26 })] },
  run: { label: 'Corsa facile', poses: [pose([96, 60], [102, 15], [60, 116], [93, 111], [133, 35], [100, 53], { tn: 30, tf: 22 })] },
  stride: { label: 'Allungo', poses: [pose([92, 60], [105, 16], [126, 98], [38, 92], [78, 46], [130, 28], { tn: 8, tf: 62 })] },
  hill: { label: 'Corsa in salita', slope: -12, poses: [pose([90, 58], [106, 16], [120, 109], [62, 118], [78, 46], [128, 30], { tn: -12, tf: 34 })] },
  legpress: { label: 'Leg press', far: FLOOR, poses: [
    pose([62, 106], [30, 75], [100, 60], [100, 60], [52, 104], [52, 104], { tn: -72, tf: -72, look: 30, armN: -1, armF: -1 }),
    pose([62, 106], [30, 75], [122, 56], [122, 56], [52, 104], [52, 104], { tn: -72, tf: -72, look: 30, armN: -1, armF: -1 }),
  ], props: p => <>{line([20, 114], [54, 124], 'a-bar')}{line([48, 118], [80, 118], 'a-bar')}{line([12, 72], [46, 114], 'a-bar')}{box(p.fn[0] + 10, 32, 8, 46)}{line([p.fn[0] + 17, 56], [196, 40])}</> },
  squat: { label: 'Squat', poses: squat(100, [84, 100], [111, 63]) },
  rdl: { label: 'Stacco rumeno', poses: [
    stand(100, { hn: [101, 62], hf: [101, 62] }),
    pose([78, 62], [118, 40], [100, A], [100, A], [114, 92], [114, 92], { look: 40 }),
  ], props: p => <>{line([p.hn[0] - 18, p.hn[1]], [p.hn[0] + 18, p.hn[1]], 'a-bar')}<circle cx={p.hn[0]} cy={p.hn[1]} r={11} class="a-prop" /></> },
  lunge: { label: 'Affondi', poses: lunge(96) },
  split: { label: 'Split squat', poses: [
    pose([90, 62], [93, 16], [122, A], [52, 115], [98, 59], [99, 59], REAR),
    pose([90, 88], [93, 42], [122, A], [52, 115], [98, 85], [99, 85], REAR),
  ] },
  hipthrust: { label: 'Hip thrust', far: FLOOR, poses: [
    pose([92, 112], [50, 92], [128, A], [128, A], [84, 104], [84, 104], { look: -70 }),
    pose([96, 84], [52, 84], [128, A], [128, A], [90, 78], [90, 78], { look: -80 }),
  ], props: () => bench(18, 40, 96) },
  calf: { label: 'Polpacci in piedi', zoom: .88, poses: [
    stand(100),
    pose([100, 45], [101, -1], [104, 113], [102, 113], [101, 52], [103, 52], { tn: 40, tf: 40 }),
  ] },
  calfseat: { label: 'Polpacci seduto', poses: [
    pose([62, 84], [60, 38], [104, A], [104, A], [96, 72], [96, 72]),
    pose([62, 84], [60, 38], [105, 113], [105, 113], [96, 66], [96, 66], { tn: 38, tf: 38 }),
  ], props: p => <>{bench(36, 44, 96)}{box(84, p.hn[1] - 2, 30, 7)}</> },
  stepdown: { label: 'Discese da gradino', zoom: .9, poses: [
    pose([82, 40], [85, -5], [84, 108], [104, 106], [132, 8], [132, 8], { tf: 10 }),
    pose([66, 62], [88, 22], [84, 108], [112, A], [134, 30], [134, 30], { look: 12 }),
  ], props: () => box(60, 118, 48, 14) },
  plank: { label: 'Plank', far: FLOOR, poses: [
    pose([84, 105], [130, 100], [17, 111], [17, 111], [148, 127], [148, 127], { tn: 78, tf: 78, look: 72 }),
  ] },
  side: { label: 'Side plank', far: FLOOR, poses: [
    pose([78, 117], [126, 96], [14, A], [14, A], [142, 127], [90, 100], { look: 66 }),
    pose([78, 106], [126, 92], [14, A], [14, A], [142, 127], [128, 44], { look: 66, armF: -1 }),
  ] },
  chair: { label: 'Squat su sedia', poses: squat(104, [88, 100], [114, 62]), props: () => bench(46, 46, 110) },
  rdl1: { label: 'Stacco a una gamba', poses: [
    pose([97, 53], [99, 7], [100, A], [84, 106], [102, 62], [102, 62], { tf: 12 }),
    pose([88, 58], [134, 46], [98, A], [28, 54], [126, 98], [126, 98], { tf: 80, look: 50 }),
  ] },
  backlunge: { label: 'Affondi indietro', poses: lunge(100) },
  bridge: { label: 'Ponte', far: FLOOR, poses: [
    pose([96, 120], [50, 120], [130, A], [146, 88], [98, 127], [98, 127], { look: -84, tf: -30 }),
    pose([96, 90], [52, 112], [130, A], [156, 62], [98, 127], [98, 127], { look: -84, tf: -30 }),
  ] },
  calfstep: { label: 'Polpacci su gradino', zoom: .84, poses: [
    pose([98, 47], [99, 1], [100, 116], [74, 85], [132, 33], [132, 33], { tn: -18, tf: 40 }),
    pose([100, 32], [101, -14], [100, 102], [76, 70], [132, 18], [132, 18], { tn: 30, tf: 40 }),
  ], props: () => <>{box(112, 118, 46, 14)}{line([134, 118], [134, 0])}</> },
  calfwall: { label: 'Polpaccio al muro', poses: [
    pose([110, 62], [142, 31], [140, A], [84, A], [174, 62], [174, 62], { look: 24 }),
    pose([120, 66], [152, 36], [140, A], [84, A], [174, 66], [174, 66], { look: 24 }),
  ], props: wall },
  hamstring: { label: 'Flessori della coscia', poses: [
    pose([84, 54], [90, 8], [88, A], [138, 96], [112, 62], [112, 62], { tf: -58 }),
    pose([80, 56], [118, 34], [88, A], [138, 96], [128, 76], [128, 76], { tf: -58, look: 34 }),
  ], props: () => bench(128, 38, 106) },
  quad: { label: 'Quadricipite in piedi', poses: [
    pose([100, 53], [101, 7], [72, 64], [100, A], [76, 68], [156, 24], { tn: 160 }),
    pose([100, 53], [102, 7], [70, 58], [100, A], [74, 62], [156, 24], { tn: 165 }),
  ], props: () => box(164, 14, 8, 118, 2) },
  hipflex: { label: "Flessori dell'anca", poses: [
    pose([98, 90], [98, 44], [130, A], [46, 116], [122, 84], [122, 84], { tf: 70 }),
    pose([108, 94], [105, 48], [130, A], [56, 116], [126, 88], [126, 88], { tf: 70 }),
  ] },
  ankle: { label: 'Caviglia al muro', poses: [
    pose([112, 82], [116, 38], [146, A], [76, 116], [172, 60], [172, 60], { tf: 70 }),
    pose([122, 86], [127, 42], [146, A], [86, 116], [174, 62], [174, 62], { tf: 70 }),
  ], props: wall },
  swing: { label: 'Slanci', poses: [
    pose([96, 53], [97, 7], [96, A], [138, 98], [156, 22], [106, 50], { tf: -6 }),
    pose([96, 53], [98, 7], [96, A], [56, 106], [156, 22], [106, 50], { tf: 24 }),
  ], props: () => box(164, 14, 8, 118, 2) },
  glute: { label: 'Gluteo a terra', far: FLOOR, poses: [
    pose([82, 121], [36, 120], [128, A], [122, 90], [100, 96], [104, 92], { look: -84, tf: -60 }),
    pose([82, 121], [37, 118], [116, 112], [112, 82], [98, 86], [102, 82], { look: -74, tf: -60 }),
  ] },
  cat: { label: 'Gatto e cammello', far: FLOOR, poses: [
    pose([78, 86], [134, 84], [40, 117], [40, 117], [130, 129], [130, 129], { curve: 11, look: 108, tn: 70, tf: 70 }),
    pose([78, 86], [134, 84], [40, 117], [40, 117], [130, 129], [130, 129], { curve: -11, look: 58, tn: 70, tf: 70 }),
  ] },
}
export const sceneForStep = (label: string): string | null => {
  const m: [RegExp, string][] = [[/polpaccio al muro/i, 'calfwall'], [/flessori della coscia/i, 'hamstring'], [/quadricipite/i, 'quad'], [/flessori dell/i, 'hipflex'], [/caviglia al muro/i, 'ankle'], [/slanci/i, 'swing'], [/gluteo a terra/i, 'glute'], [/gatto/i, 'cat'], [/ponte/i, 'bridge'], [/squat/i, 'squat'], [/affondi/i, 'backlunge'], [/polpacci/i, 'calf'], [/corsa|skip/i, 'run'], [/cammin/i, 'walk']]
  return m.find(x => x[0].test(label))?.[1] ?? null
}


const C = { skin: '#f2c09c', skinF: '#e2a67f', crease: '#d08f66', hair: '#2b3646', top: '#2f7fd6', topD: '#2366b4', shorts: '#1c2838', shortsF: '#121b27', shoe: '#fff', shoeF: '#d5e0ea', sole: '#9fb6cb', wall: '#dcebf7', wall2: '#cfe2f2', floor: '#a9c6df', grain: '#97b8d4', edge: '#86a9c8' }
/** Curva morbida e chiusa che passa per tutti i punti. */
function spline(pts: P[], closed = true) {
  const n = pts.length, at = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2)
    d += `C${n1(b[0] + (c[0] - a[0]) / 6)} ${n1(b[1] + (c[1] - a[1]) / 6)} ${n1(c[0] - (e[0] - b[0]) / 6)} ${n1(c[1] - (e[1] - b[1]) / 6)} ${n1(c[0])} ${n1(c[1])}`
  }
  return d + (closed ? 'Z' : '')
}
type Shape = [number, number, number][]
const THIGH_S: Shape = [[0, 8, 9.5], [.3, 8.6, 8.8], [.7, 6.8, 6.3], [1, 5.4, 5.2]]
const SHIN_S: Shape = [[0, 4.8, 5], [.28, 4.6, 6.6], [.6, 3.5, 4.4], [1, 2.8, 2.9]]
const SHORT_S: Shape = [[0, 9, 10.5], [.5, 9.3, 9.8], [1, 8.6, 8.6]]
const UP_S: Shape = [[0, 4.6, 4.6], [.3, 4.5, 4.3], [.7, 3.4, 3.3], [1, 2.9, 2.9]]
const FORE_S: Shape = [[0, 3, 3], [.3, 3.5, 3.3], [.75, 2.5, 2.4], [1, 2.1, 2.1]]
const HAND_S: Shape = [[0, 2.2, 2.2], [.5, 2.7, 2.3], [1, 1.7, 1.7]]
/** Un segmento del corpo: dritto dentro, con la sagoma del muscolo lungo i bordi. */
function Bone({ a, b, s, fill, cap = [2, 2] }: { a: P; b: P; s: Shape; fill: string; cap?: P }) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || .01, d: P = [dx / l, dy / l], nn: P = [d[1], -d[0]]
  const at = (t: number, w: number): P => [a[0] + dx * t + nn[0] * w, a[1] + dy * t + nn[1] * w]
  return <path fill={fill} d={spline([...s.map(x => at(x[0], x[1])), [b[0] + d[0] * cap[1], b[1] + d[1] * cap[1]] as P, ...[...s].reverse().map(x => at(x[0], -x[2])), [a[0] - d[0] * cap[0], a[1] - d[1] * cap[0]] as P])} />
}
function Shoe({ at, pitch, far }: { at: P; pitch: number; far?: boolean }) {
  const r = pitch * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), R = (p: P): P => [at[0] + p[0] * c - p[1] * s, at[1] + p[0] * s + p[1] * c]
  const up: P[] = [[-4.6, -5], [-3, -6], [3, -5.6], [5.6, -2.6], [10, .8], [15.5, 2.2], [19, 4], [20, 6.4], [19.4, 8], [6, 8], [-7, 8], [-7.6, 3.5], [-6.4, -1]]
  const a = R([-5.8, 8.2]), b = R([18.6, 8.2]), l1 = [R([4, -1]), R([6.5, -3])], l2 = [R([7, .8]), R([9.5, -1.2])]
  return <>
    <path fill={far ? C.shoeF : C.shoe} d={spline(up.map(R))} />
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.sole} stroke-width="2.4" stroke-linecap="round" />
    {[l1, l2].map(l => <line x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} stroke={C.sole} stroke-width=".9" stroke-linecap="round" />)}
  </>
}
function Leg({ hip, foot, pitch, side, far }: { hip: P; foot: P; pitch: number; side: number; far?: boolean }) {
  const { j, end } = joint(hip, foot, THIGH, SHIN, side), skin = far ? C.skinF : C.skin
  const dir: P = [(end[0] - j[0]) / SHIN, (end[1] - j[1]) / SHIN], k: P = [j[0] + dir[1] * 1.6, j[1] - dir[0] * 1.6]
  return <>
    <Bone a={j} b={end} s={SHIN_S} fill={skin} />
    <Shoe at={end} pitch={pitch} far={far} />
    <Bone a={lp(hip, j, .4)} b={j} s={THIGH_S.map(x => [x[0], x[1] * .85, x[2] * .85])} fill={skin} />
    <Bone a={hip} b={lp(hip, j, .56)} s={SHORT_S} fill={far ? C.shortsF : C.shorts} cap={[3, .3]} />
    {!far && <path fill="none" stroke={C.crease} stroke-width=".8" stroke-linecap="round" d={`M${n1(k[0] - 2)} ${n1(k[1] + 3)}Q${n1(k[0] + 1.5)} ${n1(k[1] + 1)} ${n1(k[0] + 1.5)} ${n1(k[1] - 3)}`} />}
  </>
}
function Arm({ s, hand, side, far }: { s: P; hand: P; side: number; far?: boolean }) {
  const { j, end } = joint(s, hand, UP, FORE, side), skin = far ? C.skinF : C.skin, d: P = [(end[0] - j[0]) / FORE, (end[1] - j[1]) / FORE]
  const thumb: P = [end[0] + (d[0] * .64 + d[1] * .77) * 4.5, end[1] + (d[1] * .64 - d[0] * .77) * 4.5]
  return <>
    <Bone a={j} b={end} s={FORE_S} fill={skin} />
    <Bone a={end} b={[end[0] + d[0] * 6.5, end[1] + d[1] * 6.5]} s={HAND_S} fill={skin} cap={[1, 1.2]} />
    <Bone a={end} b={thumb} s={[[0, 1.2, 1.2], [1, .9, .9]]} fill={skin} cap={[.5, .6]} />
    <Bone a={s} b={j} s={UP_S} fill={skin} />
  </>
}
function Head({ at, tilt, lying }: { at: P; tilt: number; lying?: boolean }) {
  const r = tilt * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), R = (p: P): P => [at[0] + p[0] * c + p[1] * s, at[1] + p[0] * s - p[1] * c]
  const base = R([-7.5, 6]), H = (p: P): P => { const x = p[0] + 7.5, y = 6 - p[1]; return lying ? [base[0] - y, base[1] + x + 3] : [base[0] + x, base[1] + y] } // la coda pende verso il basso, o resta sul pavimento se si è sdraiati
  const face: P[] = [[-8.5, 1], [-7.5, 8], [-1, 10.6], [5, 9.5], [7.6, 6], [7.9, 3.2], [8.6, 1.8], [10.8, -1.2], [8.7, -2.2], [9, -3.8], [8.3, -5], [8.2, -7.2], [6, -9.2], [1.5, -8.4], [-4, -5]]
  const hair: P[] = [[5.8, 10], [7.6, 7], [3, 6.2], [.8, 3], [.6, -.5], [-2.4, -1.2], [-3.6, -6.5], [-9, -3], [-10, 3], [-8.6, 8.5], [-3, 11.7], [2, 11.7]]
  const tail: P[] = [[-7.5, 6], [-13, 6.6], [-17.4, 1.5], [-18.6, -8], [-16.4, -15], [-15.4, -9], [-13, -3], [-9, .6]]
  const e = R([5.3, 2.6]), b1 = R([3.5, 5.2]), b2 = R([7, 4.9]), e1 = R([-.6, .8]), e2 = R([-2.2, -.8]), e3 = R([-.4, -3])
  return <>
    <path fill={C.hair} d={spline(tail.map(H))} />
    <path fill={C.skin} d={spline(face.map(R))} />
    <path fill={C.hair} d={spline(hair.map(R))} />
    <ellipse cx={n1(e[0])} cy={n1(e[1])} rx=".95" ry="1.2" fill={C.hair} transform={`rotate(${tilt} ${n1(e[0])} ${n1(e[1])})`} />
    <line x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} stroke={C.hair} stroke-width=".8" stroke-linecap="round" />
    <path fill="none" stroke={C.crease} stroke-width=".8" stroke-linecap="round" d={`M${n1(e1[0])} ${n1(e1[1])}Q${n1(e2[0])} ${n1(e2[1])} ${n1(e3[0])} ${n1(e3[1])}`} />
  </>
}
function Figure({ p, far }: { p: Pose; far: P }) {
  const len = Math.hypot(p.neck[0] - p.hip[0], p.neck[1] - p.hip[1]) || 1, w: P = [(p.neck[0] - p.hip[0]) / len, (p.neck[1] - p.hip[1]) / len], u: P = [-w[1], w[0]]
  const cv = p.curve ?? 0, R = (q: P): P => { const t = Math.max(0, Math.min(1, q[1] / TORSO)), x = q[0] + cv * (1 - (2 * t - 1) ** 2); return [p.hip[0] + u[0] * x + w[0] * q[1], p.hip[1] + u[1] * x + w[1] * q[1]] }
  const lean = Math.atan2(w[0], -w[1]) * 180 / Math.PI, tilt = p.look ?? lean * .4, t = tilt * Math.PI / 180
  const sh = R([-.5, TORSO - 7]), nb = R([-1, TORSO + 1]), nt = R([1.8, TORSO + 10]), head: P = [nt[0] + Math.sin(t) * 7 + 1, nt[1] - Math.cos(t) * 7]
  const hipF = add(p.hip, far), legs = p.legs ?? -1, arms = p.armN ?? 1
  const skin: P[] = [[-9, 28], [-9.6, 38], [-5, 44], [-1, 46], [3, 45], [7, 41], [9, 30]]
  const top: P[] = [[-9.6, -1], [-8.2, 8], [-9.4, 20], [-9.8, 33], [-7, 41], [-4.6, 41.6], [-2, 35], [3, 34.6], [4.6, 41], [6.6, 40], [9.6, 30], [8, 21], [6.8, 11], [8.8, -1], [0, -3]]
  const seat: P[] = [[-11, 3], [-9, -8], [1, -10], [10, -5], [10, 3], [0, 5.5]]
  return <>
    <Arm s={add(sh, far)} hand={add(p.hf, far)} side={p.armF ?? 1} far />
    <Leg hip={hipF} foot={add(p.ff, far)} pitch={p.tf ?? 0} side={p.legF ?? legs} far />
    <Bone a={nb} b={nt} s={[[0, 4.6, 6], [1, 3.8, 3.8]]} fill={C.skin} cap={[1, 1]} />
    <path fill={C.skin} d={spline(skin.map(R))} />
    <Head at={head} tilt={tilt} lying={tilt < -50 && head[1] > G - 24} />
    <path fill={C.top} d={spline(top.map(R))} />
    <path fill={C.shorts} d={spline(seat.map(R))} />
    <Leg hip={p.hip} foot={p.fn} pitch={p.tn ?? 0} side={legs} />
    <path fill="none" stroke={C.topD} stroke-width="1" stroke-linecap="round" d={spline([R([-2.5, 6]), R([-4.5, 17]), R([-3.5, 28])], false)} />
    <Arm s={sh} hand={p.hn} side={arms} />
  </>
}
function Frame({ s, p, x, n, id }: { s: Scene; p: Pose; x: number; n?: number; id: string }) {
  const z = s.zoom ?? .96
  return <g transform={`translate(${x} 0)`}>
    <clipPath id={id}><rect width="200" height="168" rx="12" /></clipPath>
    <g clip-path={`url(#${id})`}>
      <rect width="200" height="168" fill={C.wall} />
      <g transform={`translate(0 24)${s.slope ? ` rotate(${s.slope} 100 ${G})` : ''}`}>
        <rect x="-60" y={G - 26} width="320" height="26" fill={C.wall2} />
        <rect x="-60" y={G - 16} width="320" height="110" fill={C.floor} />
        <rect x="-60" y={G - 16} width="320" height="1.6" fill={C.edge} />
        {[[122, 8, 70], [122, 96, 188], [129, -4, 44], [129, 62, 150], [136, 24, 112], [136, 132, 206]].map(([y, a, b]) => <path fill="none" stroke={C.grain} stroke-width="1" stroke-linecap="round" d={`M${a} ${y}Q${(a + b) / 2} ${y + 1.2} ${b} ${y}`} />)}
      </g>
      <g transform={`translate(0 24) translate(100 ${G}) scale(${z}) translate(-100 ${-G})`}>
        <ellipse cx={(p.fn[0] + p.ff[0]) / 2 + 2} cy={G + 1} rx={Math.max(24, Math.abs(p.hip[0] - p.neck[0]) * .8 + 22)} ry="2.6" fill={C.grain} />
        {s.props?.(p)}
        <Figure p={p} far={s.far ?? [5, -3]} />
      </g>
      {n != null && <><circle cx="18" cy="18" r="11" fill="#fff" /><text x="18" y="22.5" text-anchor="middle" font-size="13" font-weight="700" fill="#27364a" font-family="inherit">{n}</text></>}
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
