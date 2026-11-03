/** Avvisi del timer: suoni, vibrazione, voce del telefono e schermo acceso. Nessuno di questi richiede la rete. */
let ctx: AudioContext | null = null
let queued: OscillatorNode[] = []
export function unlockSound() {
  try { ctx ??= new AudioContext(); void ctx.resume() } catch { ctx = null }
}
const tone = (at: number, hz: number, len: number) => {
  if (!ctx) return
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at
  o.frequency.value = hz; o.type = 'square'
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + len)
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + .02); queued.push(o)
}
export type Cue = 'work' | 'rest' | 'move' | 'end' | 'pip'
const PATTERN: Record<Cue, [number, number, number][]> = {
  work: [[0, 1046, .18], [.24, 1318, .28]], rest: [[0, 523, .4]], move: [[0, 784, .22]], pip: [[0, 660, .08]],
  end: [[0, 784, .16], [.2, 1046, .16], [.4, 1318, .36]],
}
/** I suoni si programmano in anticipo sull'orologio audio, che continua a girare anche se la pagina rallenta. */
export function schedule(list: { at: number; cue: Cue }[]) { for (const x of list) for (const [d, hz, len] of PATTERN[x.cue]) tone(Math.max(0, x.at) + d, hz, len) }
export function clearScheduled() { for (const o of queued) { try { o.stop() } catch { /* già terminato */ } } queued = [] }
export const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p) } catch { /* non disponibile */ } }
export function say(t: string) {
  try {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t); u.lang = 'it-IT'; speechSynthesis.speak(u)
  } catch { /* la voce è un di più */ }
}
/** Tiene acceso lo schermo finché serve; il sistema lo rilascia se la pagina si nasconde, quindi si richiede al ritorno. */
export function keepAwake() {
  let lock: WakeLockSentinel | null = null, on = true
  const get = async () => { try { if (on && document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen') ?? null } catch { lock = null } }
  const vis = () => { if (document.visibilityState === 'visible') void get() }
  document.addEventListener('visibilitychange', vis); void get()
  return () => { on = false; document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}) }
}
export const local = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* archivio non disponibile */ } },
  del(k: string) { try { localStorage.removeItem(k) } catch { /* archivio non disponibile */ } },
}
