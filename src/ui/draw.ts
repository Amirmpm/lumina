// Canvas renderers shared by the interactive views and the PDF report: all derive from the one geometry model.
import type { Geometry, Placed } from '../geometry/tunnel';
import type { GridResult } from '../calc/engine';
import type { Luminaire } from '../domain/types';

const STOPS = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]];
export function heat(t: number): string {
  t = Math.max(0, Math.min(1, t)); const x = t * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
export const C = { ink: '#14202b', line: '#9aa5b1', faint: '#d9dde3', accent: '#0b7a75', lum: '#f2a900', text: '#161b22', muted: '#5b6574', bg3d: '#101820' };
export interface Tx { x0: number; scale: number; y0: number } // plan: world x → px = (x-x0)*scale ; world y → px = y0 + y*scale

export function drawColorbar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vmin: number, vmax: number, unit: string, dark = false) {
  for (let i = 0; i < w; i++) { ctx.fillStyle = heat(i / (w - 1)); ctx.fillRect(x + i, y, 1, h); }
  ctx.fillStyle = dark ? '#cfd6de' : C.muted; ctx.font = '11px system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(vmin.toFixed(1), x, y + h + 2);
  ctx.textAlign = 'right'; ctx.fillText(vmax.toFixed(1) + ' ' + unit, x + w, y + h + 2); ctx.textAlign = 'left';
}
export function planFit(w: number, h: number, g: Geometry, pad = 28): Tx {
  const scale = Math.min((w - 2 * pad) / g.L, (h - 2 * pad - 20) / g.W);
  return { x0: -pad / scale, scale, y0: (h - g.W * scale) / 2 };
}
export function drawPlan(ctx: CanvasRenderingContext2D, w: number, h: number, tx: Tx, g: Geometry, pos: Placed[], lum: Luminaire | undefined, grid: GridResult | undefined, vmax: number, mf: number, selX: number, selLum: number | null, o: { heat: boolean; lums: boolean; label?: string; bg?: string } = { heat: true, lums: true }) {
  ctx.fillStyle = o.bg ?? '#fbfcfd'; ctx.fillRect(0, 0, w, h);
  const X = (x: number) => (x - tx.x0) * tx.scale, Y = (y: number) => tx.y0 + y * tx.scale;
  ctx.fillStyle = '#eef1f4'; ctx.fillRect(X(0), Y(0), g.L * tx.scale, g.W * tx.scale);
  if (grid && o.heat) {
    const vm = vmax > 0 ? vmax : 1; const sx = Math.max(1, Math.ceil(1 / (grid.dx * tx.scale)));
    for (let i = 0; i < grid.nx; i += sx) { const px = X(i * grid.dx); if (px > w || X((i + sx) * grid.dx) < 0) continue; for (let j = 0; j < grid.ny; j++) { ctx.fillStyle = heat((grid.E[i * grid.ny + j] * mf) / vm); ctx.fillRect(px, Y(g.zone.y0 + j * grid.dy), grid.dx * sx * tx.scale + 0.8, grid.dy * tx.scale + 0.8); } }
  } else { ctx.fillStyle = '#dfe9ee'; ctx.fillRect(X(0), Y(g.zone.y0), g.L * tx.scale, (g.zone.y1 - g.zone.y0) * tx.scale); }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(X(0), Y(0), g.L * tx.scale, g.W * tx.scale);
  ctx.setLineDash([4, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1; for (const y of [g.zone.y0, g.zone.y1]) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(g.L), Y(y)); ctx.stroke(); } ctx.setLineDash([]);
  if (o.lums) {
    const lw = Math.max(3, (lum?.length ?? 0.6) * tx.scale), lh = Math.max(3, Math.min(8, (lum?.width ?? 0.1) * tx.scale + 2));
    pos.forEach((q, i) => { const px = X(q.x); if (px < -10 || px > w + 10) return; ctx.fillStyle = i === selLum ? '#fff' : C.lum; ctx.strokeStyle = i === selLum ? C.accent : C.ink; ctx.lineWidth = i === selLum ? 2 : 0.8; ctx.fillRect(px - lw / 2, Y(q.y) - lh / 2, lw, lh); ctx.strokeRect(px - lw / 2, Y(q.y) - lh / 2, lw, lh); });
  }
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(selX), Y(0) - 8); ctx.lineTo(X(selX), Y(g.W) + 8); ctx.stroke();
  ctx.fillStyle = C.accent; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`x = ${selX.toFixed(1)} m`, X(selX), Y(0) - 10); ctx.textAlign = 'left';
  // scale bar
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].find((s) => s * tx.scale > 60) ?? 1000;
  ctx.fillStyle = C.muted; ctx.fillRect(12, h - 14, step * tx.scale, 2); ctx.font = '11px system-ui'; ctx.textBaseline = 'bottom'; ctx.fillText(step + ' m', 12, h - 17);
  if (o.label) { ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(o.label, w - 10, h - 6); ctx.textAlign = 'left'; }
}

export function drawSection(ctx: CanvasRenderingContext2D, w: number, h: number, g: Geometry, pos: Placed[], lum: Luminaire | undefined, selX: number, selLum: number | null, profile: { y: number; e: number }[] | null, emax: number, texts: { x: string; w: string; h: string; e: string }, o: { bg?: string } = {}) {
  ctx.fillStyle = o.bg ?? '#fbfcfd'; ctx.fillRect(0, 0, w, h);
  const ymin = Math.min(0, ...g.outline.map((p) => p.y)), ymax = Math.max(g.W, ...g.outline.map((p) => p.y));
  const padL = 36, padR = 36, padT = 26, bottom = profile ? 64 : 34;
  const sc = Math.min((w - padL - padR) / (ymax - ymin), (h - padT - bottom) / g.maxZ);
  const ox = (w - (ymax - ymin) * sc) / 2 - ymin * sc, oz = h - bottom;
  const X = (y: number) => ox + y * sc, Z = (z: number) => oz - z * sc;
  ctx.beginPath(); g.outline.forEach((p, i) => (i ? ctx.lineTo(X(p.y), Z(p.z)) : ctx.moveTo(X(p.y), Z(p.z)))); ctx.closePath();
  ctx.fillStyle = '#eef1f4'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(11,122,117,.28)'; ctx.fillRect(X(g.zone.y0), Z(0) - 3, (g.zone.y1 - g.zone.y0) * sc, 6);
  const at = pos.map((q, i) => ({ q, i })).filter(({ q }) => Math.abs(q.x - selX) <= Math.max(0.6, (lum?.length ?? 0.6) / 2 + 1e-6) || false);
  const rowsShown = new Set<number>();
  const nearest = new Map<number, { q: Placed; i: number }>();
  for (const { q, i } of pos.map((q, i) => ({ q, i }))) { const c = nearest.get(q.row); if (!c || Math.abs(q.x - selX) < Math.abs(c.q.x - selX)) nearest.set(q.row, { q, i }); }
  void at; void rowsShown;
  for (const { q, i } of nearest.values()) { const r = Math.max(4, ((lum?.height ?? 0.1) * sc) / 2 + 2); ctx.fillStyle = i === selLum ? '#fff' : C.lum; ctx.strokeStyle = i === selLum ? C.accent : C.ink; ctx.lineWidth = i === selLum ? 2.5 : 1; ctx.beginPath(); ctx.arc(X(q.y), Z(q.z), r, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(242,169,0,.45)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(q.y), Z(q.z) + r); ctx.lineTo(X(q.y), Z(0)); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = C.muted; ctx.font = '11px system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(0), Z(0) + 20); ctx.lineTo(X(g.W), Z(0) + 20); ctx.moveTo(X(0), Z(0) + 16); ctx.lineTo(X(0), Z(0) + 24); ctx.moveTo(X(g.W), Z(0) + 16); ctx.lineTo(X(g.W), Z(0) + 24); ctx.stroke();
  ctx.fillText(`${texts.w} ${g.W.toFixed(2)} m`, X(g.W / 2), Z(0) + 24);
  ctx.textAlign = 'left'; ctx.fillText(`${texts.h} ${g.maxZ.toFixed(2)} m`, 8, 8); ctx.fillText(texts.x, 8, 22);
  if (profile && profile.length && emax > 0) {
    const base = Z(0) + 56, hh = 22; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath();
    profile.forEach((p, i) => (i ? ctx.lineTo(X(p.y), base - (p.e / emax) * hh) : ctx.moveTo(X(p.y), base - (p.e / emax) * hh))); ctx.stroke();
    ctx.fillStyle = C.accent; ctx.textAlign = 'right'; ctx.fillText(texts.e, w - 8, base - hh - 4); ctx.textAlign = 'left';
  }
}
export interface Cam { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number }
export const CAM_PRESETS: Record<string, (g: Geometry, x: number) => Cam> = {
  iso: (g, x) => ({ yaw: -0.9, pitch: 0.5, dist: Math.max(18, g.W * 3), tx: x, ty: g.W / 2, tz: g.maxZ / 3 }),
  top: (g, x) => ({ yaw: -Math.PI / 2, pitch: 1.5, dist: Math.max(20, g.W * 3), tx: x, ty: g.W / 2, tz: 0 }),
  side: (g, x) => ({ yaw: -Math.PI / 2 + 0.001, pitch: 0.05, dist: Math.max(22, g.W * 3.5), tx: x, ty: g.W / 2, tz: g.maxZ / 2 }),
  front: (g, x) => ({ yaw: 0, pitch: 0.08, dist: Math.max(16, g.W * 2.6), tx: x + 20, ty: g.W / 2, tz: g.maxZ / 2 }),
};
export function camBasis(c: Cam) {
  const eye = [c.tx + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)];
  const f = [c.tx - eye[0], c.ty - eye[1], c.tz - eye[2]]; const fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  let r = [f[1], -f[0], 0]; const rl = Math.hypot(...r) || 1; r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { eye, f, r, u };
}
export function project3(c: Cam, w: number, h: number) {
  const b = camBasis(c); const focal = h / 2 / Math.tan(0.4);
  return (x: number, y: number, z: number): [number, number, number] | null => {
    const d = [x - b.eye[0], y - b.eye[1], z - b.eye[2]];
    const cz = d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2]; if (cz < 0.2) return null;
    return [w / 2 + ((d[0] * b.r[0] + d[1] * b.r[1] + d[2] * b.r[2]) / cz) * focal, h / 2 - ((d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2]) / cz) * focal, cz];
  };
}
export function floorPick(c: Cam, w: number, h: number, sx: number, sy: number): [number, number] | null {
  const b = camBasis(c); const focal = h / 2 / Math.tan(0.4);
  const d = [0, 1, 2].map((k) => b.f[k] + ((sx - w / 2) / focal) * b.r[k] - ((sy - h / 2) / focal) * b.u[k]);
  if (Math.abs(d[2]) < 1e-6) return null; const t = -b.eye[2] / d[2]; if (t < 0) return null;
  return [b.eye[0] + d[0] * t, b.eye[1] + d[1] * t];
}
export function draw3D(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Cam, g: Geometry, pos: Placed[], lum: Luminaire | undefined, grid: GridResult | undefined, vmax: number, mf: number, selX: number, selLum: number | null, o: { heat: boolean; lums: boolean; full: boolean; bg?: string }) {
  ctx.fillStyle = o.bg ?? C.bg3d; ctx.fillRect(0, 0, w, h);
  const P = project3(cam, w, h);
  const half = o.full ? g.L : Math.min(g.L, 70) / 2 + 5;
  const x0 = o.full ? 0 : Math.max(0, selX - half), x1 = o.full ? g.L : Math.min(g.L, selX + half);
  const rings = Math.max(2, Math.min(40, Math.ceil((x1 - x0) / (o.full ? Math.max(5, g.L / 40) : 2.5))));
  const xs = Array.from({ length: rings + 1 }, (_, i) => x0 + ((x1 - x0) * i) / rings);
  type Poly = { pts: [number, number][]; z: number; fill: string };
  const polys: Poly[] = []; const n = g.outline.length;
  const add = (pts: ([number, number, number] | null)[], fill: string) => { if (pts.some((p) => !p)) return; const q = pts as [number, number, number][]; polys.push({ pts: q.map((p) => [p[0], p[1]]), z: (q[0][2] + q[1][2] + q[2][2] + q[3 % q.length][2]) / 4, fill }); };
  for (let i = 0; i < rings; i++) for (let k = 0; k < n; k++) { const a = g.outline[k], b = g.outline[(k + 1) % n]; if (k === n - 1 && g.shape !== 'circular' ? false : false) continue; add([P(xs[i], a.y, a.z), P(xs[i + 1], a.y, a.z), P(xs[i + 1], b.y, b.z), P(xs[i], b.y, b.z)], k % 2 ? 'rgba(120,150,170,.16)' : 'rgba(150,175,195,.12)'); }
  // floor
  if (grid && o.heat) {
    const vm = vmax > 0 ? vmax : 1; const i0 = Math.max(0, Math.floor(x0 / grid.dx)), i1 = Math.min(grid.nx - 1, Math.ceil(x1 / grid.dx)); const st = Math.max(1, Math.ceil((i1 - i0) / 160));
    for (let i = i0; i <= i1; i += st) for (let j = 0; j < grid.ny; j++) { const xa = i * grid.dx, xb = Math.min(g.L, (i + st) * grid.dx), ya = g.zone.y0 + j * grid.dy, yb = ya + grid.dy; add([P(xa, ya, 0), P(xb, ya, 0), P(xb, yb, 0), P(xa, yb, 0)], heat((grid.E[i * grid.ny + j] * mf) / vm)); }
  }
  add([P(x0, 0, 0), P(x1, 0, 0), P(x1, g.W, 0), P(x0, g.W, 0)], grid && o.heat ? 'rgba(30,45,60,.9)' : 'rgba(46,64,82,.95)');
  polys.sort((a, b) => b.z - a.z);
  // the floor base polygon must be drawn first: move it to the front of the list
  const baseIdx = polys.findIndex((p) => p.fill.startsWith('rgba(30,45') || p.fill.startsWith('rgba(46,64'));
  if (baseIdx > 0) polys.unshift(polys.splice(baseIdx, 1)[0]);
  for (const p of polys) { ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fillStyle = p.fill; ctx.fill(); }
  ctx.lineWidth = 1;
  const ring = (x: number, col: string, lw: number) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let started = false; for (let k = 0; k <= n; k++) { const a = g.outline[k % n]; const p = P(x, a.y, a.z); if (!p) { started = false; continue; } if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]); } ctx.stroke(); };
  for (const x of xs) ring(x, 'rgba(160,185,205,.38)', 1);
  const stride = Math.max(1, Math.floor(n / 12));
  ctx.strokeStyle = 'rgba(160,185,205,.3)'; for (let k = 0; k < n; k += stride) { const a = g.outline[k]; const p = P(x0, a.y, a.z), q = P(x1, a.y, a.z); if (p && q) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } }
  ring(Math.min(g.L, Math.max(0, selX)), '#2ee6d6', 2.5);
  if (o.lums) {
    const hl = (lum?.length ?? 0.6) / 2, hw = Math.max((lum?.width ?? 0.1) / 2, 0.05), z = (q: Placed) => q.z;
    const items = pos.map((q, i) => ({ q, i })).filter(({ q }) => q.x >= x0 - 1 && q.x <= x1 + 1);
    const big = items.length > 400;
    for (const { q, i } of items) {
      const sel = i === selLum; ctx.fillStyle = sel ? '#ffffff' : '#ffc233'; ctx.strokeStyle = sel ? '#2ee6d6' : '#7a5500'; ctx.lineWidth = sel ? 2 : 1;
      if (big) { const p = P(q.x, q.y, z(q)); if (p) { ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); } continue; }
      const pts = [P(q.x - hl, q.y - hw, z(q)), P(q.x + hl, q.y - hw, z(q)), P(q.x + hl, q.y + hw, z(q)), P(q.x - hl, q.y + hw, z(q))];
      if (pts.every((p) => p)) { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1]))); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (sel) { const a = P(q.x, q.y, z(q)), b = P(q.x, q.y, 0); if (a && b) { ctx.strokeStyle = 'rgba(255,194,51,.7)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); } }
    }
  }
}
export function lumScreenPositions(cam: Cam, w: number, h: number, pos: Placed[]) { const P = project3(cam, w, h); return pos.map((q, i) => ({ i, p: P(q.x, q.y, q.z) })).filter((e) => e.p) as { i: number; p: [number, number, number] }[]; }
