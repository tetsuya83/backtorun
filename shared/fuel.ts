/* Calcolatore per il lungo: un punto di partenza da adattare, con regole fisse che funzionano anche offline. */
export type Climate = 'fresco' | 'mite' | 'caldo'
export interface FuelPlan { min: number; rate: [number, number] | null; carbs: [number, number] | null; gels: [number, number] | null; everyMin: number | null; water: [number, number]; liters: [number, number] }

const WATER: Record<Climate, [number, number]> = { fresco: [400, 500], mite: [500, 700], caldo: [600, 800] }
const five = (n: number) => Math.round(n / 5) * 5
const tenth = (n: number) => Math.round(n * 10) / 10

/** Da 1 a 2,5 ore 30-60 g l'ora, oltre 60-90: l'acqua si regola sempre con la sete. */
export function fuelPlan(min: number, climate: Climate, gel = 25): FuelPlan | null {
  if (!Number.isFinite(min) || min < 1 || min > 720 || !Number.isFinite(gel) || gel < 5) return null
  const h = min / 60, water = WATER[climate], liters: [number, number] = [tenth(water[0] * h / 1000), tenth(water[1] * h / 1000)]
  if (min < 60) return { min, rate: null, carbs: null, gels: null, everyMin: null, water, liters }
  const rate: [number, number] = min < 150 ? [30, 60] : [60, 90]
  const carbs: [number, number] = [five(rate[0] * h), five(rate[1] * h)]
  return { min, rate, carbs, gels: [Math.ceil(carbs[0] / gel), Math.ceil(carbs[1] / gel)], everyMin: five(60 * gel / rate[0]), water, liters }
}
