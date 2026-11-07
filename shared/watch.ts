/* Le corse dei prossimi sette giorni, pronte per Intervals.icu. */
import { addDays, sessionDate, sessionKey, type Planned, type Timeline } from './engine'
import { blocksOf } from './blocks'
import { workoutText, type WatchEvent } from './intervals'

export function watchEvents(t: Timeline, planned: Planned[], today: string, days = 7): WatchEvent[] {
  const end = addDays(today, days), out: WatchEvent[] = []
  for (const s of t.slots) for (const x of s.sessions) {
    const date = sessionDate(s, x.day)
    if (x.km === 0 || date < today || date >= end) continue
    const b = blocksOf(x)
    out.push({ id: sessionKey(s, x.day), date, name: x.text.slice(0, 120), description: b ? workoutText(b) : x.text })
  }
  for (const p of planned) if (p.mode === 'add' && p.sport === 'corsa' && p.date >= today && p.date < end) out.push({ id: `p-${p.id}`, date: p.date, name: p.name.slice(0, 120), description: p.blocks?.length ? workoutText(p.blocks) : p.text })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
