// Crea un FIT di prova: 5 km in 34', FC 140-160
import { Encoder, Profile } from '@garmin/fitsdk'
import { writeFileSync } from 'fs'
const M = Profile.MesgNum, e = new Encoder()
const start = new Date(process.argv[3] ?? '2026-11-10T06:00:00Z')
const at = s => new Date(start.getTime() + s * 1000)
e.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'suunto', product: 0, timeCreated: start, serialNumber: 1 })
const T = 2040, D = 5000
for (let s = 0; s <= T; s += 5) e.onMesg(M.RECORD, { timestamp: at(s), distance: D * s / T, heartRate: Math.round(140 + 20 * s / T), speed: D / T })
e.onMesg(M.LAP, { timestamp: at(T), startTime: start, totalElapsedTime: T, totalTimerTime: T, totalDistance: D })
e.onMesg(M.SESSION, { timestamp: at(T), startTime: start, sport: 'running', totalElapsedTime: T, totalTimerTime: T, totalDistance: D, avgHeartRate: 150, maxHeartRate: 160, firstLapIndex: 0, numLaps: 1 })
e.onMesg(M.ACTIVITY, { timestamp: at(T), numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', totalTimerTime: T })
writeFileSync(process.argv[2], e.close())
