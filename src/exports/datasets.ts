// Engineering datasets shared by XLSX/CSV exports and DXF/OBJ builders. Every row carries units and project id.
import type { Project } from '../domain/types';
import type { Evaluation } from '../calc/evaluate';
import { FIELDS } from '../domain/fields';
import { standardById } from '../standards/registry';
import type { Cell, DxfItem } from './files';
import { buildDxf } from './files';
import type { Lang } from '../domain/types';

export interface Sheet { name: string; rows: Cell[][] }
export function buildSheets(p: Project, evs: Map<string, Evaluation>, lang: Lang): Sheet[] {
  const std = standardById(p.standardId);
  const head = [['Lumina export', ''], ['project_id', p.id], ['project_name', p.name], ['tunnel_type', p.tunnelType], ['schema_version', p.schemaVersion], ['standard', `${std.name.en} (${std.edition}) — implementation: ${std.status}`], ['exported_at', new Date().toISOString()], ['note', 'Direct illuminance only (no inter-reflection). See README for method, conventions and limitations.'], []];
  const inputs: Cell[][] = [...head, ['key', 'label', 'value', 'unit', 'provenance']];
  for (const f of FIELDS) if (f.key in p.inputs) inputs.push([f.key, f.label[lang], p.inputs[f.key] as Cell, f.unit ?? '', p.prov[f.key] ?? '']);
  const lum: Cell[][] = [['project_id', 'luminaire_id', 'kind', 'manufacturer', 'model', 'power_W', 'length_m', 'width_m', 'height_m', 'photometry_quality', 'photometry_format', 'integrated_flux_lm', 'ex_certificate_id', 'ex_marking', 'source']];
  for (const l of p.luminaires) lum.push([p.id, l.id, l.kind, l.manufacturer ?? '', l.model, l.power, l.length, l.width, l.height, l.photometry?.quality ?? 'none', l.photometry?.format ?? '', l.photometry ? +l.photometry.flux.toFixed(1) : '', l.ex?.certificateId ?? '', l.ex?.marking ?? '', l.source]);
  const sc: Cell[][] = [['project_id', 'scenario', 'luminaire', 'arrangement', 'count_per_row', 'luminaires_total', 'Eavg_initial_lx', 'Emin_initial_lx', 'Emax_initial_lx', 'Eavg_maintained_lx', 'Emin_maintained_lx', 'U0', 'Ud', 'maintenance_factor', 'power_kW', 'energy_kWh_per_year', 'initial_cost', 'lifecycle_cost', 'standard_verdict', 'photometry_quality']];
  const crit: Cell[][] = [['project_id', 'scenario', 'standard', 'criterion', 'metric', 'requirement', 'unit', 'actual', 'verdict', 'origin', 'reference']];
  const lay: Cell[][] = [['project_id', 'scenario', 'luminaire_index', 'row', 'x_m', 'y_m', 'z_m', 'yaw_deg']];
  for (const s of p.scenarios) {
    const ev = evs.get(s.id); if (!ev) continue;
    const l = ev.layout;
    sc.push([p.id, s.name, ev.lum?.model ?? '', l.arrangement, l.count, ev.nTotal, ev.initial?.avg, ev.initial?.min, ev.initial?.max, ev.maintained?.avg, ev.maintained?.min, ev.initial?.u0, ev.initial?.ud, ev.mf, ev.econ?.kW, ev.econ?.kWhYear, ev.econ?.initial, ev.econ?.lcc, ev.std.verdict, ev.photQuality].map((v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
    for (const r of ev.std.results) crit.push([p.id, s.name, p.standardId, r.label[lang], r.metric ?? '', r.value, r.unit ?? '', r.actual === undefined ? '' : +r.actual.toFixed(4), r.verdict, r.origin, r.ref]);
    ev.positions.forEach((q, i) => lay.push([p.id, s.name, i + 1, q.row + 1, +q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), q.yaw]));
  }
  const act = evs.get(p.activeScenarioId); const grid: Cell[][] = [['project_id', 'scenario', 'x_m', 'y_m', 'E_initial_lx', 'E_maintained_lx']];
  if (act?.grid) { const g = act.grid; const an = p.scenarios.find((s) => s.id === p.activeScenarioId)?.name ?? ''; for (let i = 0; i < g.nx; i++) for (let j = 0; j < g.ny; j++) grid.push([p.id, an, +g.xs[i].toFixed(3), +g.ys[j].toFixed(3), +g.E[i * g.ny + j].toFixed(3), +(g.E[i * g.ny + j] * act.mf).toFixed(3)]); }
  return [{ name: 'Inputs', rows: inputs }, { name: 'Luminaires', rows: lum }, { name: 'Scenarios', rows: sc }, { name: 'Criteria', rows: crit }, { name: 'Layout', rows: lay }, { name: 'Grid', rows: grid }];
}

export function dxfFor(p: Project, ev: Evaluation): string {
  const g = ev.geom, it: DxfItem[] = [], line = (layer: string, a: [number, number], b: [number, number]) => it.push({ t: 'LINE', layer, a, b });
  line('TUNNEL_PLAN', [0, 0], [g.L, 0]); line('TUNNEL_PLAN', [g.L, 0], [g.L, g.W]); line('TUNNEL_PLAN', [g.L, g.W], [0, g.W]); line('TUNNEL_PLAN', [0, g.W], [0, 0]);
  line('CALC_ZONE', [0, g.zone.y0], [g.L, g.zone.y0]); line('CALC_ZONE', [0, g.zone.y1], [g.L, g.zone.y1]);
  const lum = ev.lum; const hl = (lum?.length ?? 0.6) / 2, hw = (lum?.width ?? 0.1) / 2;
  for (const q of ev.positions) {
    const c: [number, number][] = [[q.x - hl, q.y - hw], [q.x + hl, q.y - hw], [q.x + hl, q.y + hw], [q.x - hl, q.y + hw]];
    for (let k = 0; k < 4; k++) line('LUMINAIRES', c[k], c[(k + 1) % 4]);
  }
  it.push({ t: 'TEXT', layer: 'LABELS', p: [0, -2], h: Math.max(0.3, g.W / 20), s: `${p.name} - plan (m) - ${ev.nTotal} x ${lum?.model ?? 'n/a'} - ${ev.layout.arrangement}` });
  const ox = g.L + 15; // section placed right of plan; x offset = L + 15 m
  for (let k = 0; k < g.outline.length; k++) { const a = g.outline[k], b = g.outline[(k + 1) % g.outline.length]; line('TUNNEL_SECTION', [ox + a.y, a.z], [ox + b.y, b.z]); }
  for (const y of new Set(ev.positions.map((q) => +q.y.toFixed(3)))) { const q = ev.positions.find((z) => +z.y.toFixed(3) === y)!; it.push({ t: 'CIRCLE', layer: 'LUMINAIRES_SECTION', c: [ox + q.y, q.z], r: Math.max(0.1, (lum?.height ?? 0.1) / 2) }); }
  line('DIMENSIONS', [ox, -1], [ox + g.W, -1]); it.push({ t: 'TEXT', layer: 'DIMENSIONS', p: [ox + g.W / 2 - 1, -1.8], h: 0.3, s: `W = ${g.W.toFixed(2)} m` });
  it.push({ t: 'TEXT', layer: 'LABELS', p: [ox, g.maxZ + 1], h: 0.3, s: 'Cross-section (m)' });
  return buildDxf(it);
}
export function objFor(ev: Evaluation) {
  const g = ev.geom; const n = g.outline.length;
  const verts: [number, number, number][] = [...g.outline.map((o) => [0, o.y, o.z] as [number, number, number]), ...g.outline.map((o) => [g.L, o.y, o.z] as [number, number, number])];
  const faces: number[][] = []; for (let k = 0; k < n; k++) faces.push([k, (k + 1) % n, n + ((k + 1) % n), n + k]);
  const parts = [{ name: 'tunnel_shell', verts, faces }];
  const l = ev.lum; const hl = (l?.length ?? 0.6) / 2, hw = (l?.width ?? 0.1) / 2, hh = (l?.height ?? 0.1) / 2;
  const lv: [number, number, number][] = [], lf: number[][] = [];
  for (const q of ev.positions) {
    const b = lv.length; for (const dz of [-hh, hh]) for (const [dx, dy] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) lv.push([q.x + dx, q.y + dy, q.z + dz]);
    lf.push([b, b + 1, b + 2, b + 3], [b + 4, b + 5, b + 6, b + 7], [b, b + 1, b + 5, b + 4], [b + 1, b + 2, b + 6, b + 5], [b + 2, b + 3, b + 7, b + 6], [b + 3, b, b + 4, b + 7]);
  }
  parts.push({ name: 'luminaires', verts: lv, faces: lf });
  return parts;
}
