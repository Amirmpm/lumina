// Unit architecture: every stored value is canonical SI-ish (m, lx, W, lm, cd, °C, km/h).
// Display conversion happens only at the UI edge via these functions.
export type UnitKind = 'length' | 'illuminance' | 'speed' | 'temperature' | 'area' | 'none';
export type UnitSystem = 'metric' | 'imperial';

export const M_PER_FT = 0.3048;
export const LX_PER_FC = 10.763910416709722;
export const KMH_PER_MPH = 1.609344;

export function toDisplay(kind: UnitKind, v: number, sys: UnitSystem): number {
  if (sys === 'metric') return v;
  switch (kind) {
    case 'length': return v / M_PER_FT;
    case 'area': return v / (M_PER_FT * M_PER_FT);
    case 'illuminance': return v / LX_PER_FC;
    case 'speed': return v / KMH_PER_MPH;
    case 'temperature': return v * 9 / 5 + 32;
    default: return v;
  }
}
export function fromDisplay(kind: UnitKind, v: number, sys: UnitSystem): number {
  if (sys === 'metric') return v;
  switch (kind) {
    case 'length': return v * M_PER_FT;
    case 'area': return v * M_PER_FT * M_PER_FT;
    case 'illuminance': return v * LX_PER_FC;
    case 'speed': return v * KMH_PER_MPH;
    case 'temperature': return (v - 32) * 5 / 9;
    default: return v;
  }
}
export function unitLabel(kind: UnitKind, sys: UnitSystem, metric: string): string {
  if (sys === 'metric') return metric;
  switch (kind) {
    case 'length': return 'ft';
    case 'area': return 'ft²';
    case 'illuminance': return 'fc';
    case 'speed': return 'mph';
    case 'temperature': return '°F';
    default: return metric;
  }
}
export function fmt(v: number | undefined | null, d = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: false });
}
