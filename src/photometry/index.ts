// Photometric distribution handling. Convention (documented in README):
//  gamma = angle from nadir (0 = straight down). C = azimuth; C0 = +x (along tunnel axis), C90 = +y (transverse).
//  Luminaire yaw rotates the C frame about the vertical axis. Intensities are absolute candela.
import type { Photometry, PhotQuality } from '../domain/types';

export const MAX_TABLE = 200_000;

export function foldC(c: number, h0: number, hN: number): number {
  c = ((c % 360) + 360) % 360;
  if (hN === 0) return 0;
  if (h0 === 0 && hN === 90) { if (c > 180) c = 360 - c; if (c > 90) c = 180 - c; return c; }
  if (h0 === 0 && hN === 180) { if (c > 180) c = 360 - c; return c; }
  if (h0 === 90 && hN === 270) { if (c < 90) c = 180 - c; if (c > 270) c = 540 - c; return c; }
  return c;
}
function bracket(a: number[], x: number): number {
  let lo = 0, hi = a.length - 1;
  if (x <= a[0]) return 0;
  if (x >= a[hi]) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m; else hi = m; }
  return lo;
}
/** Bilinear interpolation in a (C,G) candela table. Outside the gamma range intensity is 0. */
export function interp2(C: number[], G: number[], cd: number[][], c: number, g: number): number {
  if (g < G[0] - 1e-9 || g > G[G.length - 1] + 1e-9) return 0;
  if (C.length === 1) { // single plane
    const j = G.length === 1 ? 0 : bracket(G, g);
    if (G.length === 1) return cd[0][0];
    const t = (g - G[j]) / (G[j + 1] - G[j]);
    return cd[0][j] + Math.min(Math.max(t, 0), 1) * (cd[0][j + 1] - cd[0][j]);
  }
  c = ((c % 360) + 360) % 360;
  const i = bracket(C, c), j = G.length === 1 ? 0 : bracket(G, g);
  const tc = Math.min(Math.max((c - C[i]) / (C[i + 1] - C[i]), 0), 1);
  const tg = G.length === 1 ? 0 : Math.min(Math.max((g - G[j]) / (G[j + 1] - G[j]), 0), 1);
  const j1 = G.length === 1 ? 0 : j + 1;
  const a = cd[i][j] + tg * (cd[i][j1] - cd[i][j]);
  const b = cd[i + 1][j] + tg * (cd[i + 1][j1] - cd[i + 1][j]);
  return a + tc * (b - a);
}
export function intensity(p: Pick<Photometry, 'C' | 'G' | 'cd'>, cDeg: number, gDeg: number): number {
  return interp2(p.C, p.G, p.cd, cDeg, gDeg);
}
/** Total flux (lm) = ∫∫ I sinγ dγ dC. Exact for piecewise-constant I in γ per band; trapezoid in C. */
export function integrateFlux(C: number[], G: number[], cd: number[][]): number {
  const bands = C.map((_, i) => {
    let s = 0;
    for (let j = 0; j < G.length - 1; j++) {
      const g0 = (G[j] * Math.PI) / 180, g1 = (G[j + 1] * Math.PI) / 180;
      s += ((cd[i][j] + cd[i][j + 1]) / 2) * (Math.cos(g0) - Math.cos(g1));
    }
    return s;
  });
  if (C.length === 1) return bands[0] * 2 * Math.PI;
  let tot = 0;
  for (let i = 0; i < C.length - 1; i++) tot += ((bands[i] + bands[i + 1]) / 2) * (((C[i + 1] - C[i]) * Math.PI) / 180);
  return tot;
}
/** Expand a symmetric table to the full 0..360 range. `rows` are indexed by H (given C angles). */
export function expandSymmetry(H: number[], G: number[], rows: number[][]): { C: number[]; cd: number[][] } {
  if (H.length === 1) return { C: [0, 360], cd: [rows[0], rows[0]] };
  const h0 = H[0], hN = H[H.length - 1];
  const sym = (hN === 90 && h0 === 0) || (hN === 180 && h0 === 0) || (h0 === 90 && hN === 270);
  const T = new Set<number>([0, 360]);
  const add = (v: number) => { v = ((v % 360) + 360) % 360; T.add(v); };
  for (const h of H) { add(h); if (sym) { add(180 - h); add(180 + h); add(360 - h); } }
  if (!sym && hN < 360) T.add(hN);
  const C = [...T].sort((a, b) => a - b);
  const cd = C.map((c) => {
    const f = sym ? foldC(c, h0, hN) : c;
    const rowAt = (cc: number) => {
      const i = bracket(H, cc);
      const t = H[i + 1] === H[i] ? 0 : Math.min(Math.max((cc - H[i]) / (H[i + 1] - H[i]), 0), 1);
      return G.map((_, j) => rows[i][j] + t * (rows[i + 1][j] - rows[i][j]));
    };
    return rowAt(Math.min(Math.max(f, h0), hN));
  });
  return { C, cd };
}
export function makePhotometry(C: number[], G: number[], cd: number[][], quality: PhotQuality, format: Photometry['format'], declaredFlux?: number, warnings: string[] = []): Photometry {
  return { quality, format, C, G, cd, flux: integrateFlux(C, G, cd), declaredFlux, warnings };
}
export function peakIntensity(p: Photometry): number { return Math.max(...p.cd.map((r) => Math.max(...r))); }

/** Synthetic lobe I = A cos^n(γ) with n varying between C0 (nA) and C90 (nT); normalised to `flux` lm. */
export function syntheticPhotometry(flux: number, nA: number, nT: number, quality: PhotQuality, format: Photometry['format']): Photometry {
  const C: number[] = [], G: number[] = [];
  for (let c = 0; c <= 360; c += 15) C.push(c);
  for (let g = 0; g <= 90; g += 2.5) G.push(g);
  const raw = C.map((c) => {
    const cr = (c * Math.PI) / 180, n = nA * Math.cos(cr) ** 2 + nT * Math.sin(cr) ** 2;
    return G.map((g) => Math.max(0, Math.cos((g * Math.PI) / 180)) ** n);
  });
  const k = flux / integrateFlux(C, G, raw);
  return makePhotometry(C, G, raw.map((r) => r.map((v) => v * k)), quality, format, flux);
}
export function cosinePowerExponent(beamDeg: number): number {
  if (beamDeg >= 180) return 1;
  const ch = Math.cos((beamDeg * Math.PI) / 360);
  if (ch >= 1 - 1e-9) return 500;
  if (ch <= 1e-9) return 1;
  return -Math.log(2) / Math.log(ch);
}
export function approximateFromBeam(flux: number, beamDeg: number): Photometry {
  const n = cosinePowerExponent(beamDeg);
  return syntheticPhotometry(flux, n, n, 'approximate', 'beam-approx');
}
export const photFingerprint = (p: Photometry | null): string => {
  if (!p) return 'none';
  let h = 0;
  for (const r of p.cd) for (const v of r) h = (Math.imul(h, 31) + Math.round(v * 1000)) | 0;
  return `${p.quality}:${p.C.length}x${p.G.length}:${h}:${p.flux.toFixed(1)}`;
};
