// Deterministic point-by-point direct illuminance engine. Pure functions, no UI/state dependencies.
//   E = I(C,γ) · cosθ / d²      (θ = incidence angle between surface normal and the ray to the source)
// Direct component only: inter-reflections are NOT included (conservative; disclosed in calculation basis).
import type { Photometry } from '../domain/types';
import { interp2 } from '../photometry';
import type { Geometry, Placed } from '../geometry/tunnel';

export interface GridResult {
  xs: number[]; ys: number[]; // cell-centre coordinates
  E: Float64Array; // initial illuminance, row-major [ix * ny + iy]
  nx: number; ny: number; dx: number; dy: number; coarsened: boolean;
}
export interface Stats { avg: number; min: number; max: number; u0: number; ud: number }
export interface WallResult { left: Stats; right: Stats; heights: number[] }
export interface PointResult { E: number }
export interface CalcOptions { workPlane: number; gridSpacing: number; coarse?: number; cutoff?: number; maxNx?: number }

export function stats(a: ArrayLike<number>): Stats {
  let s = 0, mn = Infinity, mx = -Infinity;
  const n = a.length;
  for (let i = 0; i < n; i++) { const v = a[i]; s += v; if (v < mn) mn = v; if (v > mx) mx = v; }
  const avg = n ? s / n : 0;
  return { avg, min: n ? mn : 0, max: n ? mx : 0, u0: avg > 0 ? mn / avg : 0, ud: mx > 0 ? mn / mx : 0 };
}
export const rad = (d: number) => (d * Math.PI) / 180;

/** Illuminance at point p with unit normal n from all luminaires within `cutoff` metres along x. */
export function illuminanceAt(p: [number, number, number], nrm: [number, number, number], pos: Placed[], phot: Pick<Photometry, 'C' | 'G' | 'cd'>, cutoff = Infinity): number {
  let e = 0;
  for (const l of pos) {
    const dx = p[0] - l.x, dy = p[1] - l.y, dz = p[2] - l.z;
    if (Math.abs(dx) > cutoff) continue;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-9) continue;
    const d = Math.sqrt(d2);
    const gamma = (Math.acos(Math.max(-1, Math.min(1, -dz / d))) * 180) / Math.PI;
    const ya = rad(l.yaw), cy = Math.cos(ya), sy = Math.sin(ya);
    const lx = dx * cy + dy * sy, ly = -dx * sy + dy * cy;
    let c = (Math.atan2(ly, lx) * 180) / Math.PI; if (c < 0) c += 360;
    const I = interp2(phot.C, phot.G, phot.cd, c, gamma);
    if (I <= 0) continue;
    const cosT = -(nrm[0] * dx + nrm[1] * dy + nrm[2] * dz) / d;
    if (cosT <= 0) continue;
    e += (I * cosT) / d2;
  }
  return e;
}

export function floorGrid(g: Geometry, pos: Placed[], phot: Pick<Photometry, 'C' | 'G' | 'cd'>, o: CalcOptions): GridResult {
  const k = o.coarse ?? 1;
  const maxNx = o.maxNx ?? 600;
  const wantNx = Math.ceil(g.L / (o.gridSpacing * k));
  const nx = Math.max(1, Math.min(maxNx, wantNx));
  const zw = g.zone.y1 - g.zone.y0;
  const ny = Math.max(2, Math.min(40, Math.ceil(zw / o.gridSpacing)));
  const dx = g.L / nx, dy = zw / ny;
  const xs = Array.from({ length: nx }, (_, i) => (i + 0.5) * dx);
  const ys = Array.from({ length: ny }, (_, j) => g.zone.y0 + (j + 0.5) * dy);
  const E = new Float64Array(nx * ny);
  const cutoff = o.cutoff ?? 40;
  const zp = o.workPlane;
  for (const l of pos) {
    const lo = Math.max(0, Math.floor((l.x - cutoff) / dx)), hi = Math.min(nx - 1, Math.ceil((l.x + cutoff) / dx));
    const dz = zp - l.z;
    if (dz >= 0) continue; // luminaire below the plane: contributes nothing downward
    const ya = rad(l.yaw), cy = Math.cos(ya), sy = Math.sin(ya);
    for (let i = lo; i <= hi; i++) {
      const px = xs[i] - l.x;
      for (let j = 0; j < ny; j++) {
        const py = ys[j] - l.y;
        const d2 = px * px + py * py + dz * dz, d = Math.sqrt(d2);
        const cosg = -dz / d;
        const gamma = (Math.acos(cosg) * 180) / Math.PI;
        const lx = px * cy + py * sy, ly = -px * sy + py * cy;
        let c = (Math.atan2(ly, lx) * 180) / Math.PI; if (c < 0) c += 360;
        const I = interp2(phot.C, phot.G, phot.cd, c, gamma);
        if (I > 0) E[i * ny + j] += (I * cosg) / d2;
      }
    }
  }
  return { xs, ys, E, nx, ny, dx, dy, coarsened: wantNx > nx };
}

/** Vertical illuminance on side walls (inward normals) up to `hMax` m — only for geometries with vertical walls. */
export function wallSurfaces(g: Geometry, pos: Placed[], phot: Pick<Photometry, 'C' | 'G' | 'cd'>, spacing: number): WallResult | null {
  if (g.wallVertical <= 0) return null;
  const hMax = Math.min(g.wallVertical, 2);
  const nz = Math.max(2, Math.ceil(hMax / 0.5));
  const nx = Math.max(1, Math.min(300, Math.ceil(g.L / Math.max(spacing, 1))));
  const heights = Array.from({ length: nz }, (_, k) => ((k + 0.5) * hMax) / nz);
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) * g.L) / nx;
    for (const z of heights) {
      left.push(illuminanceAt([x, 0, z], [0, 1, 0], pos, phot, 40));
      right.push(illuminanceAt([x, g.W, z], [0, -1, 0], pos, phot, 40));
    }
  }
  return { left: stats(left), right: stats(right), heights };
}

export interface LumenMethod { E: number; N: number; flux: number; UF: number; MF: number; area: number }
/** Lumen method: E_avg,maintained = N·Φ·UF·MF / A */
export const lumenMethodE = (N: number, flux: number, UF: number, MF: number, area: number) => (area > 0 ? (N * flux * UF * MF) / area : 0);
export const lumenMethodN = (E: number, flux: number, UF: number, MF: number, area: number) => (flux * UF * MF > 0 ? Math.ceil((E * area) / (flux * UF * MF)) : Infinity);
