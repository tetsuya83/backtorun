/* Manda a Intervals.icu le corse dei prossimi sette giorni, solo quando cambiano. */
import { call, data, online } from './api'
import { addDays, buildTimeline, planFor } from '../shared/engine'
import { watchEvents } from '../shared/watch'
import { todayISO } from './guide'

const KEY = 'btr-watch'
export interface WatchStatus { h: string; at: number; n: number; err?: string | null }
export const watchStatus = (): WatchStatus | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } }
const remember = (s: WatchStatus) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* solo un promemoria */ } }
let running = false
export async function syncWatch(force = false, off = false): Promise<WatchStatus | null> {
  const d = data.value
  if (!d?.me?.intervals || (!off && !d.state.watchSync) || !online.value || running) return null
  const today = todayISO(), events = off ? [] : watchEvents(buildTimeline(planFor(d), d.state), d.state.planned ?? [], today)
  const h = today + JSON.stringify(events), last = watchStatus()
  if (!force && !off && last?.h === h && !last.err) return last
  running = true
  try {
    await call('PUT', '/api/intervals/plan', { from: today, to: addDays(today, 6), events })
    const s = { h: off ? '' : h, at: Date.now(), n: events.length, err: null }; remember(s); return s
  } catch (e: any) {
    const s = { h, at: Date.now(), n: events.length, err: e?.message ?? 'Invio non riuscito.' }; remember(s); return s
  } finally { running = false }
}
