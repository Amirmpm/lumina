// Energy, lifecycle cost and electrical indications. All inputs explicit; all assumptions returned for traceability.
export const STANDARD_SIZES_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
export const COPPER_RHO = 0.0225; // Ω·mm²/m — copper at elevated conductor temperature (conservative)

/** NPV of end-of-year amounts. */
export function npv(amounts: number[], rate: number): number {
  return amounts.reduce((s, a, k) => s + a / Math.pow(1 + rate, k + 1), 0);
}
export interface EconIn { n: number; powerEach: number; priceEach?: number; defPrice: number; installFactor: number; hours: number; energyPrice: number; years: number; discountPct: number; maintCostEach: number; lifeHours?: number }
export interface EconOut { initial: number; kW: number; kWhYear: number; energyCostYear: number; maintYear: number; replacementNpv: number; npvRunning: number; lcc: number; priceEstimated: boolean; assumptions: string[] }
export function lifecycle(e: EconIn): EconOut {
  const price = e.priceEach && e.priceEach > 0 ? e.priceEach : e.defPrice;
  const priceEstimated = !(e.priceEach && e.priceEach > 0);
  const kW = (e.n * e.powerEach) / 1000;
  const kWhYear = kW * e.hours;
  const energyCostYear = kWhYear * e.energyPrice;
  const maintYear = e.n * e.maintCostEach;
  const r = e.discountPct / 100;
  const annual = Array.from({ length: Math.max(0, Math.round(e.years)) }, () => energyCostYear + maintYear);
  const npvRunning = npv(annual, r);
  // luminaire replacement when rated life is exhausted within the analysis period (full-luminaire replacement assumed)
  let replacementNpv = 0;
  if (e.lifeHours && e.lifeHours > 0 && e.hours > 0) {
    const lifeYears = e.lifeHours / e.hours;
    for (let k = 1; k * lifeYears < e.years - 1e-9; k++) replacementNpv += (e.n * price * (1 + e.installFactor)) / Math.pow(1 + r, Math.ceil(k * lifeYears));
  }
  const initial = e.n * price * (1 + e.installFactor);
  return {
    initial, kW, kWhYear, energyCostYear, maintYear, replacementNpv, npvRunning, lcc: initial + npvRunning + replacementNpv, priceEstimated,
    assumptions: ['initial = N × price × (1 + installFactor)', 'running = Σ (energy + maintenance)/(1+r)^t, t = 1..years, constant tariff', 'replacement = full luminaire + install at each rated-life boundary inside the period', 'no dimming, no residual value, no inflation'],
  };
}
export interface Electrical { current: number; kVA: number; minSectionMm2: number; sectionMm2: number; vdPct: number; ok: boolean }
/** Indicative single-phase check with the whole load lumped at the far end of the feeder (conservative). */
export function electrical(totalW: number, V: number, pf: number, feeder: number, maxVdPct: number): Electrical {
  if (!(V > 0) || !(pf > 0) || totalW <= 0) return { current: 0, kVA: 0, minSectionMm2: 0, sectionMm2: 0, vdPct: 0, ok: true };
  const I = totalW / (V * pf);
  const minS = (2 * feeder * I * COPPER_RHO * pf) / ((maxVdPct / 100) * V);
  const S = STANDARD_SIZES_MM2.find((s) => s >= minS) ?? STANDARD_SIZES_MM2[STANDARD_SIZES_MM2.length - 1];
  const vd = (2 * feeder * I * COPPER_RHO * pf) / S;
  return { current: I, kVA: totalW / pf / 1000, minSectionMm2: minS, sectionMm2: S, vdPct: (vd / V) * 100, ok: (vd / V) * 100 <= maxVdPct + 1e-9 };
}
