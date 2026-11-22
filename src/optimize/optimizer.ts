// Algorithmic layout optimiser (deterministic; no AI). Method:
//  1. enumerate (luminaire × arrangement) combinations that satisfy mounting / Ex / count / spacing constraints;
//  2. for each, search the smallest per-row count whose coarse-grid evaluation meets ALL supported criteria
//     (exponential bracket + bisection; assumes illuminance grows with count — verified afterwards on the full grid);
//  3. add over-provisioned variants and the nearest infeasible count, fully evaluate them on the project grid;
//  4. rank feasible candidates by weighted min-max-normalised objectives.
// Hard constraints (criteria, mounting, Ex data) are never traded against cost or energy. Optimality is only
// claimed within this discretised search space, not globally.
import type { Arrangement, Layout, Luminaire, OptSettings, Project } from '../domain/types';
import { evaluate } from '../calc/evaluate';
import type { Evaluation } from '../calc/evaluate';
import { TUNNEL_TYPES } from '../domain/fields';
import { standardById } from '../standards/registry';
import { lumenMethodN } from '../calc/engine';
import { hashOf, uid } from '../lib/hash';

export interface Objectives { lcc: number; energy: number; count: number; u0: number; maintenance: number }
export interface Candidate {
  id: string; layout: Layout; lumModel: string; photQuality: string;
  feasible: boolean; violations: { key: string; params?: Record<string, string | number> }[];
  metrics?: { eAvgM: number; eMinM: number; u0: number; n: number; kW: number };
  obj?: Objectives; score?: number; rank?: number; flags: string[];
  vsBest?: { k: keyof Objectives; pct: number; better: boolean }[];
}
export interface OptResult { ranAt: string; candidates: Candidate[]; feasibleCount: number; blocked?: string; evaluations: number; settingsHash: string; notes: string[] }

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function candidateFrom(p: Project, lum: Luminaire, layout: Layout, ev: Evaluation, extraViolations: Candidate['violations'] = []): Candidate {
  const violations = [...extraViolations];
  const flags: string[] = [];
  if (!ev.ok) for (const b of ev.blockers) violations.push({ key: b.key, params: b.params });
  for (const r of ev.std.results) if (r.verdict === 'fail') violations.push({ key: 'opt.critFail', params: { id: r.id, actual: Number((r.actual ?? 0).toFixed(3)), req: r.value ?? 0 } });
  if (ev.ex.status === 'declared-needs-verification') flags.push('ex.verifyCert');
  if (p.hazard.required && (ev.ex.status === 'no-data' || ev.ex.status === 'incompatible')) violations.push({ key: 'opt.exNotEstablished' });
  if (lum.photometry?.quality !== 'verified') flags.push('opt.photNotVerified');
  if (ev.econ?.priceEstimated) flags.push('opt.priceEstimated');
  if (ev.std.unsupported > 0) flags.push('opt.unsupportedCriteria');
  const feasible = ev.ok && violations.length === 0;
  const c: Candidate = { id: uid('cand'), layout, lumModel: lum.model, photQuality: ev.photQuality, feasible, violations, flags };
  if (ev.ok && ev.maintained && ev.econ) {
    c.metrics = { eAvgM: ev.maintained.avg, eMinM: ev.maintained.min, u0: ev.maintained.u0, n: ev.nTotal, kW: ev.econ.kW };
    c.obj = { lcc: ev.econ.lcc, energy: ev.econ.kWhYear, count: ev.nTotal, u0: ev.maintained.u0, maintenance: ev.econ.maintYear * Number(p.inputs.years) + ev.econ.replacementNpv };
  }
  return c;
}

export async function optimize(p: Project, s: OptSettings, progress?: (f: number) => void): Promise<OptResult> {
  const std = standardById(p.standardId);
  const supported = std.criteria(p).filter((c) => c.status !== 'unsupported' && c.metric);
  const settingsHash = hashOf({ s, std: p.standardId, i: p.inputs, hz: p.hazard, l: p.luminaires.map((l) => l.id) });
  const out: OptResult = { ranAt: new Date().toISOString(), candidates: [], feasibleCount: 0, evaluations: 0, settingsHash, notes: [] };
  if (supported.length === 0) { out.blocked = 'opt.noCriteria'; return out; }
  const type = TUNNEL_TYPES.find((t) => t.id === p.tunnelType)!;
  const arrs = (s.arrangements.length ? s.arrangements : (type.arrangements as Arrangement[])).filter((a) => (type.arrangements as string[]).includes(a));
  const lums = p.luminaires.filter((l) => l.photometry && (s.libraryIds.length === 0 || s.libraryIds.includes(l.id)));
  if (!lums.length) { out.blocked = 'opt.noLuminaires'; return out; }
  const L = Number(p.inputs.length);
  const base = p.scenarios.find((x) => x.id === p.activeScenarioId)?.layout ?? p.scenarios[0].layout;
  const total = lums.length * arrs.length; let done = 0;
  const cands: Candidate[] = [];
  for (const lum of lums) {
    for (const arr of arrs) {
      progress?.(done++ / total);
      await tick();
      const mk = (n: number): Layout => ({ ...base, luminaireId: lum.id, arrangement: arr, count: n, spacingMode: 'auto', mountHeight: null });
      // Ex hard constraint — equipment without established compatible data is excluded, not computed
      if (p.hazard.required) {
        const probe = evaluate(p, mk(2), { coarse: 8, walls: false }); out.evaluations++;
        if (probe.ex.status === 'no-data' || probe.ex.status === 'incompatible') { cands.push(candidateFrom(p, lum, mk(2), probe, [{ key: 'opt.exNotEstablished' }])); continue; }
      }
      const nHiGeo = Math.max(1, Math.floor(L / Math.max(lum.length, 0.05)));
      const nHi = s.maxCount > 0 ? Math.min(nHiGeo, s.maxCount) : nHiGeo;
      const nLo = s.maxSpacing > 0 ? Math.ceil(L / s.maxSpacing) : 1;
      if (nLo > nHi) { cands.push({ id: uid('cand'), layout: mk(nLo), lumModel: lum.model, photQuality: lum.photometry!.quality, feasible: false, violations: [{ key: 'opt.spacingConflict', params: { lo: nLo, hi: nHi } }], flags: [] }); continue; }
      const ok = (n: number) => { out.evaluations++; const ev = evaluate(p, mk(n), { coarse: 2, walls: false }); return ev.ok && ev.std.hardPass && (!p.hazard.required || ev.ex.status === 'declared-needs-verification'); };
      const rows = arr === 'center' || arr === 'left' || arr === 'right' ? 1 : arr === 'three-rows' ? 3 : 2;
      const area = L * (Number(p.inputs.width));
      const seed = Math.min(nHi, Math.max(nLo, Math.ceil(lumenMethodN(Number(p.inputs.crit_eavg ?? 10), lum.photometry!.flux, Number(p.inputs.uf ?? 0.35), Number(p.inputs.llmf) * Number(p.inputs.lmf), area) / rows) || 1));
      let nStar: number | null = null;
      if (ok(seed)) {
        let a = nLo, b = seed;
        while (a < b) { const m = Math.floor((a + b) / 2); if (ok(m)) b = m; else a = m + 1; }
        nStar = b;
      } else {
        let lo = seed, hi = Math.min(nHi, seed * 2), found = false;
        while (true) { if (ok(hi)) { found = true; break; } if (hi >= nHi) break; lo = hi; hi = Math.min(nHi, hi * 2); }
        if (found) { let a = lo + 1, b = hi; while (a < b) { const m = Math.floor((a + b) / 2); if (ok(m)) b = m; else a = m + 1; } nStar = b; }
      }
      if (nStar === null) { // infeasible: report the best attempt (max count) with its violations
        const ev = evaluate(p, mk(nHi), { walls: true }); out.evaluations++;
        const c = candidateFrom(p, lum, mk(nHi), ev, [{ key: 'opt.cannotMeet', params: { n: nHi } }]); cands.push(c); continue;
      }
      const ns = new Set<number>([nStar, Math.min(nHi, nStar + Math.ceil(nStar * 0.2)), Math.min(nHi, nStar + Math.ceil(nStar * 0.5))]);
      for (const n of [...ns].sort((x, y) => x - y)) { const ev = evaluate(p, mk(n)); out.evaluations++; cands.push(candidateFrom(p, lum, mk(n), ev)); }
      if (nStar - 1 >= nLo) { const ev = evaluate(p, mk(nStar - 1)); out.evaluations++; const c = candidateFrom(p, lum, mk(nStar - 1), ev); if (!c.feasible) cands.push(c); }
    }
  }
  progress?.(1);
  // de-duplicate identical layouts
  const seen = new Set<string>();
  const uniq = cands.filter((c) => { const k = hashOf({ ...c.layout }); if (seen.has(k)) return false; seen.add(k); return true; });
  const feas = uniq.filter((c) => c.feasible && c.obj);
  const keys: (keyof Objectives)[] = ['lcc', 'energy', 'count', 'u0', 'maintenance'];
  const w = { lcc: s.weights.lcc, energy: s.weights.energy, count: s.weights.count, u0: s.weights.uniformity, maintenance: s.weights.maintenance };
  const wsum = keys.reduce((a, k) => a + Math.max(0, w[k]), 0) || 1;
  const val = (c: Candidate, k: keyof Objectives) => (k === 'u0' ? -(c.obj![k]) : c.obj![k]);
  const rng = keys.map((k) => { const v = feas.map((c) => val(c, k)); return [Math.min(...v), Math.max(...v)] as const; });
  for (const c of feas) c.score = keys.reduce((a, k, i) => a + (Math.max(0, w[k]) * ((rng[i][1] - rng[i][0] > 1e-12) ? (val(c, k) - rng[i][0]) / (rng[i][1] - rng[i][0]) : 0)), 0) / wsum;
  feas.sort((a, b) => a.score! - b.score! || a.obj!.lcc - b.obj!.lcc);
  feas.forEach((c, i) => { c.rank = i + 1; });
  const best = feas[0];
  if (best) for (const c of feas) if (c !== best) c.vsBest = keys.map((k) => ({ k, pct: best.obj![k] === 0 ? 0 : ((c.obj![k] - best.obj![k]) / Math.abs(best.obj![k])) * 100, better: k === 'u0' ? c.obj![k] > best.obj![k] : c.obj![k] < best.obj![k] }));
  const infeas = uniq.filter((c) => !c.feasible).sort((a, b) => (b.metrics?.eAvgM ?? 0) - (a.metrics?.eAvgM ?? 0));
  out.candidates = [...feas, ...infeas];
  out.feasibleCount = feas.length;
  out.notes = ['opt.noteMethod', 'opt.noteGrid', 'opt.noteMono'];
  return out;
}
