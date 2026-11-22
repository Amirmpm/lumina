// Orchestrates geometry → positions → photometric calculation → economics → standards for one layout.
import type { Layout, Luminaire, PhotQuality, Project, ScenarioResult } from '../domain/types';
import { buildGeometry, geometryIssues, layoutIssues, layoutPositions } from '../geometry/tunnel';
import type { GeoIssue, Geometry, Placed } from '../geometry/tunnel';
import { floorGrid, lumenMethodE, stats, wallSurfaces } from './engine';
import type { GridResult, Stats, WallResult } from './engine';
import { electrical, lifecycle } from './economics';
import type { EconOut, Electrical } from './economics';
import { evaluateCriteria, standardById } from '../standards/registry';
import type { StdEvaluation } from '../standards/registry';
import { screenEx } from '../standards/ex';
import type { ExScreen } from '../standards/ex';
import { validateInputs } from '../domain/project';
import type { Issue } from '../domain/project';
import { hashOf } from '../lib/hash';
import { photFingerprint } from '../photometry';
import { nowIso } from '../domain/project';

export interface Evaluation {
  ok: boolean; blockers: (Issue | GeoIssue)[]; warnings: (Issue | GeoIssue)[];
  geom: Geometry; positions: Placed[]; lum?: Luminaire; layout: Layout;
  grid?: GridResult; initial?: Stats; maintained?: Stats; mf: number; walls?: WallResult | null;
  econ?: EconOut; elec?: Electrical; std: StdEvaluation; ex: ExScreen;
  lumen?: { E: number; UF: number; area: number; flux: number; N: number; directUtilance: number };
  photQuality: PhotQuality | 'none'; hash: string; nTotal: number;
}
const num = (p: Project, k: string, d = 0) => (typeof p.inputs[k] === 'number' ? (p.inputs[k] as number) : d);

export function inputsHash(p: Project, layout: Layout): string {
  const lum = p.luminaires.find((l) => l.id === layout.luminaireId);
  return hashOf({ t: p.tunnelType, i: p.inputs, std: p.standardId, hz: p.hazard, layout, lum: lum ? { id: lum.id, p: lum.power, pr: lum.priceEach, life: lum.lifeHours, f: photFingerprint(lum.photometry), ex: lum.ex, d: [lum.length, lum.height] } : null });
}
export function evaluate(p: Project, layout: Layout, o: { coarse?: number; walls?: boolean } = {}): Evaluation {
  const geom = buildGeometry(p.inputs, p.tunnelType);
  const lum = p.luminaires.find((l) => l.id === layout.luminaireId);
  const positions = layoutPositions(geom, layout, lum);
  const blockers: (Issue | GeoIssue)[] = [...validateInputs(p).filter((i) => i.severity === 'error'), ...geometryIssues(geom, p.inputs, p.tunnelType).filter((i) => i.severity === 'error'), ...layoutIssues(geom, layout, lum, positions).filter((i) => i.severity === 'error')];
  const warnings: (Issue | GeoIssue)[] = [...geometryIssues(geom, p.inputs, p.tunnelType).filter((i) => i.severity === 'warning'), ...layoutIssues(geom, layout, lum, positions).filter((i) => i.severity === 'warning')];
  const std = standardById(p.standardId);
  const mf = num(p, 'llmf', 1) * num(p, 'lmf', 1);
  const ex: ExScreen = lum ? screenEx(p.hazard, lum) : { status: 'no-data', reasons: [] };
  const base: Evaluation = {
    ok: false, blockers, warnings, geom, positions, lum, layout, mf, std: evaluateCriteria(std, p, null), ex,
    photQuality: lum?.photometry?.quality ?? 'none', hash: inputsHash(p, layout), nTotal: positions.length,
  };
  if (blockers.length || !lum || !lum.photometry) return base;
  const phot = lum.photometry;
  const grid = floorGrid(geom, positions, phot, { workPlane: num(p, 'workPlane'), gridSpacing: num(p, 'gridSpacing', 1), coarse: o.coarse });
  const initial = stats(grid.E);
  const maintained: Stats = { avg: initial.avg * mf, min: initial.min * mf, max: initial.max * mf, u0: initial.u0, ud: initial.ud };
  const area = geom.L * (geom.zone.y1 - geom.zone.y0);
  const N = positions.length, flux = phot.flux;
  const directUtilance = N * flux > 0 ? (initial.avg * area) / (N * flux) : 0;
  const uf = num(p, 'uf', 0.35);
  const econ = lifecycle({ n: N, powerEach: lum.power, priceEach: lum.priceEach, defPrice: num(p, 'defPrice'), installFactor: num(p, 'installFactor'), hours: num(p, 'hoursYear'), energyPrice: num(p, 'energyPrice'), years: num(p, 'years'), discountPct: num(p, 'discount'), maintCostEach: num(p, 'maintCost'), lifeHours: lum.lifeHours });
  const elec = electrical(N * lum.power, num(p, 'voltage', 230), num(p, 'pf', 0.9), num(p, 'feeder'), num(p, 'maxVd', 5));
  const walls = o.walls === false ? undefined : wallSurfaces(geom, positions, phot, num(p, 'gridSpacing', 1) * 2);
  return {
    ...base, ok: true, grid, initial, maintained, walls, econ, elec,
    lumen: { E: lumenMethodE(N, flux, uf, mf, area), UF: uf, area, flux, N, directUtilance },
    std: evaluateCriteria(std, p, { eAvgM: maintained.avg, eMinM: maintained.min, u0: maintained.u0 }),
  };
}
export function summarize(ev: Evaluation): ScenarioResult | null {
  if (!ev.ok || !ev.initial || !ev.maintained || !ev.econ) return null;
  return {
    hash: ev.hash, at: nowIso(), eAvg: ev.initial.avg, eMin: ev.initial.min, eMax: ev.initial.max, u0: ev.initial.u0, ud: ev.initial.ud,
    eAvgM: ev.maintained.avg, eMinM: ev.maintained.min, n: ev.nTotal, kW: ev.econ.kW, kWhYear: ev.econ.kWhYear, lcc: ev.econ.lcc, initial: ev.econ.initial,
    verdict: ev.std.verdict === 'none' ? 'indeterminate' : ev.std.verdict, photQuality: ev.photQuality,
  };
}
