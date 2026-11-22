// Single parametric geometry model: feeds 3D, plan, section, calculations, DXF and OBJ.
// Coordinates: x along tunnel axis (0..L), y transverse across floor (0..W, left→right when looking +x), z up from floor.
import type { Arrangement, Layout, Luminaire } from '../domain/types';

export interface Pt { y: number; z: number }
export interface Geometry {
  L: number; W: number; shape: string;
  outline: Pt[]; // closed cross-section polygon (floor included), counter-clockwise starting floor-left
  upper: Pt[]; // upper boundary polyline (drawing); for circular shapes use `circ` for exact lookup
  circ?: { r: number; cz: number };
  maxZ: number; wallVertical: number; // height up to which side walls are vertical (y = 0 and y = W)
  zone: { y0: number; y1: number }; // calculation zone on the floor
  floorY: [number, number];
}
type In = Record<string, number | string>;
const n = (i: In, k: string, d: number) => (typeof i[k] === 'number' ? (i[k] as number) : d);

export function buildGeometry(i: In, type: string): Geometry {
  const L = n(i, 'length', 100), W = n(i, 'width', 5), shape = String(i.shape ?? 'rect');
  const upper: Pt[] = [];
  let wallVertical = 0, maxZ = 0;
  let outline: Pt[];
  let circ: { r: number; cz: number } | undefined;
  if (shape === 'circular') {
    const D = Math.max(n(i, 'diameter', 5), W * 1.02), r = D / 2;
    const cz = Math.sqrt(r * r - (W / 2) * (W / 2)); // bore centre height above the floor chord
    const a0 = Math.asin(W / 2 / r);
    const N = 64;
    for (let k = 0; k <= N; k++) {
      const t = a0 + (2 * Math.PI - 2 * a0) * (k / N); // angle from downward vertical, left → crown → right
      upper.push({ y: W / 2 - r * Math.sin(t), z: cz - r * Math.cos(t) });
    }
    outline = [...upper];
    circ = { r, cz };
    maxZ = cz + r; wallVertical = 0;
  } else {
    const Hw = n(i, 'wallHeight', 3);
    wallVertical = Hw;
    const f = shape === 'arched' ? n(i, 'crownRise', 1) : 0;
    upper.push({ y: 0, z: Hw });
    if (f > 0) {
      const r = (W * W / 4 + f * f) / (2 * f), cz = Hw + f - r;
      const N = 40;
      for (let k = 1; k < N; k++) {
        const y = (W * k) / N;
        upper.push({ y, z: cz + Math.sqrt(Math.max(0, r * r - (y - W / 2) * (y - W / 2))) });
      }
    }
    upper.push({ y: W, z: Hw });
    maxZ = Hw + f;
    outline = [{ y: 0, z: 0 }, ...upper, { y: W, z: 0 }];
    return finish();
  }
  return finish();

  function finish(): Geometry {
    // For circular shape: outline closes from last point back to first through the floor chord.
    let y0 = 0, y1 = W;
    if (type === 'road') {
      const cw = Math.min(W, n(i, 'lanes', 2) * n(i, 'laneWidth', 3.5));
      y0 = (W - cw) / 2; y1 = y0 + cw;
    } else if (i.calcZone === 'walkway') {
      y1 = Math.min(W, n(i, 'walkwayWidth', 1.2));
    }
    return { L, W, shape, outline, upper, circ, maxZ, wallVertical, zone: { y0, y1 }, floorY: [0, W] };
  }
}

/** Ceiling (upper boundary) height at transverse position y. Linear interpolation on the polyline. */
export function ceilingAt(g: Geometry, y: number): number {
  if (g.circ) return g.circ.cz + Math.sqrt(Math.max(0, g.circ.r ** 2 - (y - g.W / 2) ** 2));
  const u = g.upper;
  if (y <= u[0].y) return u[0].z;
  for (let k = 1; k < u.length; k++) {
    if (y <= u[k].y) {
      const a = u[k - 1], b = u[k];
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.z + t * (b.z - a.z);
    }
  }
  return u[u.length - 1].z;
}

export function rowYs(g: Geometry, arr: Arrangement, inset: number): number[] {
  const W = g.W;
  const ins = Math.min(Math.max(inset, 0.1), W / 2 - 0.05);
  switch (arr) {
    case 'center': return [W / 2];
    case 'left': return [ins];
    case 'right': return [W - ins];
    case 'both-walls': return [ins, W - ins];
    case 'two-rows': return [W / 4, (3 * W) / 4];
    case 'three-rows': return [W / 6, W / 2, (5 * W) / 6];
  }
}

export interface Placed { x: number; y: number; z: number; row: number; index: number; yaw: number }
export function layoutPositions(g: Geometry, lay: Layout, lum: Pick<Luminaire, 'height'> | undefined): Placed[] {
  const ys = rowYs(g, lay.arrangement, lay.wallInset);
  const out: Placed[] = [];
  const nC = Math.max(0, Math.floor(lay.count));
  const sp = lay.spacingMode === 'auto' ? g.L / Math.max(nC, 1) : lay.spacing;
  const st = lay.spacingMode === 'auto' ? sp / 2 : lay.startOffset;
  ys.forEach((y, row) => {
    const shift = lay.staggered && row % 2 === 1 ? sp / 2 : 0;
    for (let k = 0; k < nC; k++) {
      let x = st + k * sp + shift;
      if (lay.spacingMode === 'auto' && shift) x = st + k * sp - shift; // keep inside [0,L]
      const z = lay.mountHeight ?? ceilingAt(g, y) - (lum?.height ?? 0.1) - 0.05;
      out.push({ x, y, z, row, index: k, yaw: lay.yaw });
    }
  });
  return out;
}

export interface GeoIssue { key: string; severity: 'error' | 'warning'; params?: Record<string, string | number> }
export function geometryIssues(g: Geometry, i: In, type: string): GeoIssue[] {
  const out: GeoIssue[] = [];
  if (type === 'road' && n(i, 'lanes', 2) * n(i, 'laneWidth', 3.5) > g.W + 1e-9) out.push({ key: 'issue.lanesExceed', severity: 'error' });
  if (g.shape === 'circular' && n(i, 'diameter', 5) < g.W * 1.02) out.push({ key: 'issue.diameterSmall', severity: 'error' });
  if (i.calcZone === 'walkway' && n(i, 'walkwayWidth', 1) >= g.W) out.push({ key: 'issue.walkwayWide', severity: 'error' });
  if (g.maxZ < 2) out.push({ key: 'issue.lowClearance', severity: 'warning', params: { h: g.maxZ.toFixed(2) } });
  return out;
}
export function layoutIssues(g: Geometry, lay: Layout, lum: Luminaire | undefined, pos: Placed[]): GeoIssue[] {
  const out: GeoIssue[] = [];
  if (!lum) { out.push({ key: 'issue.noLuminaire', severity: 'error' }); return out; }
  if (!lum.photometry) out.push({ key: 'issue.noPhotometry', severity: 'error' });
  if (lay.count < 1) out.push({ key: 'issue.countZero', severity: 'error' });
  const ys = rowYs(g, lay.arrangement, lay.wallInset);
  for (const y of ys) {
    const c = ceilingAt(g, y);
    const z = lay.mountHeight ?? c - lum.height - 0.05;
    if (z + lum.height / 2 > c + 1e-6 && lay.mountHeight !== null) { out.push({ key: 'issue.mountAbove', severity: 'error', params: { y: y.toFixed(2), c: c.toFixed(2) } }); break; }
    if (z < 1.0) { out.push({ key: 'issue.mountLow', severity: 'warning', params: { z: z.toFixed(2) } }); break; }
  }
  if (pos.length > 1) {
    const xs = pos.filter((p) => p.row === 0).map((p) => p.x);
    const minDx = xs.length > 1 ? Math.min(...xs.slice(1).map((x, k) => x - xs[k])) : Infinity;
    if (minDx < lum.length - 1e-9) out.push({ key: 'issue.overlap', severity: 'error', params: { d: minDx.toFixed(2), l: lum.length.toFixed(2) } });
    if (pos.some((p) => p.x < -1e-9 || p.x > g.L + 1e-9)) out.push({ key: 'issue.outside', severity: 'error' });
  }
  return out;
}
