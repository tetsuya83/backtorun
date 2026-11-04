import { describe, it, expect } from 'vitest'
import { data, switchPlan } from '../src/api'
import { defaultState } from '../shared/engine'
import plan from '../shared/plan.json'
import { advise, dayRange, forecastUrl, hourAt, kindOf, parseForecast, runHour, skyOf, type Hour } from '../shared/weather'

const H = (x: Partial<Hour> = {}): Hour => ({ t: '2026-11-05T06:00', temp: 4, feels: 1, rainP: 0, rain: 0, wind: 5, gust: 10, code: 3, day: false, ...x })
const raw = { hourly: { time: ['2026-11-05T05:00', '2026-11-05T06:00', '2026-11-05T14:00'], temperature_2m: [3, 4, 11], apparent_temperature: [0, 1, 9], precipitation_probability: [0, 10, 60], precipitation: [0, 0, 1], weather_code: [3, 3, 61], wind_speed_10m: [5, 6, 7], wind_gusts_10m: [9, 9, 9], is_day: [0, 0, 1] } }

describe('previsioni', () => {
  it('legge la risposta e trova ora e giornata', () => {
    const f = parseForecast(raw, 'Cornaredo', 'k', 1)!
    expect(hourAt(f, '2026-11-05', 6)).toMatchObject({ temp: 4, feels: 1, day: false })
    expect(hourAt(f, '2026-11-05', 14)?.day).toBe(true)
    expect(hourAt(f, '2026-11-06', 6)).toBeUndefined()
    expect(dayRange(f, '2026-11-05')).toEqual({ min: 3, max: 11 })
    expect(parseForecast({}, 'x', 'k', 1)).toBeNull()
  })
  it('arrotonda la posizione a circa un km', () => {
    const u = forecastUrl(45.498765, 9.034321)
    expect(u).toContain('latitude=45.50&longitude=9.03')
    expect(u).toContain('apparent_temperature')
  })
  it('usa ora feriale e domenicale', () => {
    expect(runHour({}, '2026-11-05')).toBe(6)
    expect(runHour({}, '2026-11-08')).toBe(8)
    expect(runHour({ hour: 19, sunday: 10 }, '2026-11-08')).toBe(10)
  })
  it('riconosce i codici del cielo', () => {
    expect(skyOf(0).sky).toBe('sole'); expect(skyOf(48).sky).toBe('nebbia'); expect(skyOf(63).sky).toBe('pioggia')
    expect(skyOf(75).sky).toBe('neve'); expect(skyOf(95).sky).toBe('temporale'); expect(skyOf(67).text).toBe('Pioggia gelata')
  })
})
describe('tipo di seduta', () => {
  it('distingue cammino, facile, lungo e intenso', () => {
    expect(kindOf({ text: "6×[1' corsa + 2' cammino]", km: null, fatica: '2-3' })).toBe('cammino')
    expect(kindOf({ text: 'Lento 6 km', km: 6, fatica: '2-3' })).toBe('facile')
    expect(kindOf({ text: 'Lungo 18 km', km: 18, fatica: '4-5' })).toBe('lungo')
    expect(kindOf({ text: 'Interval 5×1000', km: 9, fatica: '7-8' })).toBe('intenso')
    expect(kindOf({ text: 'Maratona', km: 42.2, race: true })).toBe('intenso')
  })
})
describe('consigli', () => {
  it('riproduce il mattino freddo e buio', () => {
    const a = advise(H(), 'facile', 6)
    expect(a.wear).toBe('Maglia termica, antivento leggero, calzamaglia, guanti, luce frontale e riflettenti')
    expect(a.tips).toContain('Parti leggermente infreddolito: dopo 10 minuti starai bene.')
    expect(a.stop).toBeUndefined()
  })
  it('il lungo copre più delle ripetute', () => {
    const h = H({ feels: 3 })
    expect(advise(h, 'lungo').wear).toMatch(/termica/)
    expect(advise(h, 'intenso').wear).not.toMatch(/termica/)
  })
  it('la pioggia sostituisce l\'antivento e il sole aggiunge il cappellino', () => {
    const a = advise(H({ code: 63, rain: 2, rainP: 80 }), 'facile')
    expect(a.wear).toContain('giacca antipioggia leggera'); expect(a.wear).not.toContain('antivento')
    expect(a.tips).toContain('Tieni pronto un cambio asciutto per quando rientri.')
    expect(advise(H({ code: 0, temp: 24, feels: 24, day: true }), 'facile').wear).toContain('cappellino e occhiali')
  })
  it('avvisa su temporale, ghiaccio, caldo e raffiche', () => {
    expect(advise(H({ code: 95 }), 'facile').stop).toMatch(/Temporale/)
    expect(advise(H({ code: 67 }), 'facile').tips[0]).toMatch(/scivoloso/)
    expect(advise(H({ temp: 33, feels: 35, day: true }), 'lungo').stop).toMatch(/Caldo/)
    expect(advise(H({ temp: 23, feels: 23, day: true }), 'lungo').tips[0]).toMatch(/accorcia del 10-20%/)
    expect(advise(H({ gust: 80 }), 'facile').stop).toMatch(/Raffiche/)
  })
  it('non supera quattro consigli e copre il grande freddo', () => {
    const a = advise(H({ temp: -9, feels: -14, code: 71, rain: 1, rainP: 90, wind: 30 }), 'lungo', 20)
    expect(a.tips.length).toBeLessThanOrEqual(4); expect(a.wear).toContain('berretto')
  })
})
describe('impostazioni', () => {
  it('restano quando si cambia o si ferma il piano', () => {
    const weather = { city: 'Roma', lat: 41.9, lon: 12.5, hour: 7 }
    data.value = { plan: plan as any, state: { ...defaultState, mode: 'base', restart: true, weather }, activities: [], tests: [] }
    switchPlan('custom')
    expect(data.value!.state.weather).toEqual(weather)
    switchPlan('base')
    expect(data.value!.state.weather).toEqual(weather)
  })
})
