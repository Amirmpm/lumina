import { SCHEMA_VERSION } from './types';
import type { Arrangement, Layout, Luminaire, Project, Prov, Scenario, TunnelType } from './types';
import { FIELDS, TUNNEL_TYPES, fieldDefault, fieldsFor } from './fields';
import type { FieldDef } from './fields';
import { uid } from '../lib/hash';
import { sampleCatalog } from '../photometry/catalog';
import { lumenMethodN } from '../calc/engine';

export const nowIso = () => new Date().toISOString();
export function defaultInputs(t: TunnelType) {
  const inputs: Record<string, number | string> = {}; const prov: Record<string, Prov> = {};
  for (const f of fieldsFor(t)) { inputs[f.key] = fieldDefault(f, t); prov[f.key] = f.defProv; }
  return { inputs, prov };
}
export function createProject(t: TunnelType, name: string): Project {
  const { inputs, prov } = defaultInputs(t);
  const lums = sampleCatalog();
  const p: Project = {
    schemaVersion: SCHEMA_VERSION, id: uid('prj'), name, createdAt: nowIso(), updatedAt: nowIso(), tunnelType: t,
    meta: { client: '', site: '', country: '', designer: '', notes: '' }, inputs, prov,
    standardId: 'user', hazard: { required: false, hazardType: 'gas', zone: '1', group: 'IIB', tempClass: 'T4' },
    luminaires: lums, scenarios: [], activeScenarioId: '', wizardDone: false,
    opt: { weights: { lcc: 3, energy: 2, count: 1, uniformity: 2, maintenance: 1 }, maxCount: 0, maxSpacing: 0, libraryIds: [], arrangements: [] },
  };
  const sc = newScenario('Baseline', defaultLayout(p, 'sample-40'), 'manual');
  p.scenarios = [sc]; p.activeScenarioId = sc.id;
  return p;
}
export function defaultLayout(p: Project, lumId: string): Layout {
  const arr = (TUNNEL_TYPES.find((x) => x.id === p.tunnelType)?.arrangements[0] ?? 'center') as Arrangement;
  const lum = p.luminaires.find((l) => l.id === lumId);
  const rows = arr === 'center' || arr === 'left' || arr === 'right' ? 1 : arr === 'three-rows' ? 3 : 2;
  const n = Number(p.inputs.length), w = Number(p.inputs.width);
  const target = Number(p.inputs.crit_eavg ?? 10);
  const mf = Number(p.inputs.llmf) * Number(p.inputs.lmf);
  const flux = lum?.photometry?.flux ?? 1000;
  const tot = lumenMethodN(target, flux, Number(p.inputs.uf ?? 0.35), mf, n * w);
  const count = Math.max(2, Math.min(Math.ceil(n / 1.0), Math.ceil((Number.isFinite(tot) ? tot : 10) / rows)));
  return { luminaireId: lumId, arrangement: arr, count, spacingMode: 'auto', spacing: 10, startOffset: 5, wallInset: 0.3, mountHeight: null, staggered: false, yaw: 0 };
}
export function newScenario(name: string, layout: Layout, source: Scenario['source']): Scenario {
  return { id: uid('scn'), name, layout, notes: '', createdAt: nowIso(), source };
}
export const activeScenario = (p: Project): Scenario => p.scenarios.find((s) => s.id === p.activeScenarioId) ?? p.scenarios[0];

export function setInput(p: Project, key: string, v: number | string): Project {
  return { ...p, inputs: { ...p.inputs, [key]: v }, prov: { ...p.prov, [key]: 'user' } };
}
export function resetInput(p: Project, key: string): Project {
  const f = FIELDS.find((x) => x.key === key); if (!f) return p;
  return { ...p, inputs: { ...p.inputs, [key]: fieldDefault(f, p.tunnelType) }, prov: { ...p.prov, [key]: f.defProv } };
}
/** Inputs visible for the project's tunnel type & current selections. */
export function visibleFields(p: Project): FieldDef[] {
  const ctx = { ...p.inputs, __std: p.standardId };
  return fieldsFor(p.tunnelType).filter((f) => !f.visible || f.visible(ctx));
}
export interface Issue { key: string; severity: 'error' | 'warning' | 'info'; field?: string; params?: Record<string, string | number> }
export function validateInputs(p: Project): Issue[] {
  const out: Issue[] = [];
  for (const f of visibleFields(p)) {
    if (f.type !== 'number') continue;
    const v = p.inputs[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) { out.push({ key: 'issue.missing', severity: 'error', field: f.key }); continue; }
    if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) out.push({ key: 'issue.range', severity: 'error', field: f.key, params: { min: f.min ?? '', max: f.max ?? '' } });
  }
  return out;
}
export function newLuminaireId() { return uid('lum'); }
export function blankLuminaire(): Luminaire {
  return { id: newLuminaireId(), model: '', kind: 'custom', source: 'User-defined record', power: 40, length: 0.6, width: 0.1, height: 0.1, mounting: '', photometry: null };
}

// ---------- validation / migration of untrusted project data
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {}; // version N → N+1 (none yet: schema v1 is the first versioned format)
export type MigrateResult = { ok: true; project: Project; notes: string[] } | { ok: false; error: string };

export function migrateProject(raw: unknown): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: 'import.notObject' };
  let v = Number(raw.schemaVersion);
  if (!Number.isInteger(v) || v < 1) return { ok: false, error: 'import.noVersion' };
  if (v > SCHEMA_VERSION) return { ok: false, error: 'import.newer' };
  let cur: Record<string, unknown> = raw; const notes: string[] = [];
  while (v < SCHEMA_VERSION) { const m = MIGRATIONS[v]; if (!m) return { ok: false, error: 'import.noMigration' }; cur = m(cur); v++; notes.push(`migrated to v${v}`); }
  return validateProject(cur, notes);
}
export function validateProject(raw: Record<string, unknown>, notes: string[] = []): MigrateResult {
  const bad = (e: string): MigrateResult => ({ ok: false, error: e });
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return bad('import.badIdentity');
  if (!TUNNEL_TYPES.some((t) => t.id === raw.tunnelType)) return bad('import.badType');
  if (!isObj(raw.inputs) || !isObj(raw.prov)) return bad('import.badInputs');
  const type = raw.tunnelType as TunnelType;
  const base = defaultInputs(type);
  const inputs = { ...base.inputs }, prov = { ...base.prov };
  for (const f of fieldsFor(type)) {
    const v = (raw.inputs as Record<string, unknown>)[f.key];
    if (v === undefined) continue;
    if (f.type === 'number') { if (typeof v !== 'number' || !Number.isFinite(v)) return bad('import.badInputs'); inputs[f.key] = v; }
    else { if (typeof v !== 'string' || !f.options?.some((o) => o.v === v)) return bad('import.badInputs'); inputs[f.key] = v; }
    const pv = (raw.prov as Record<string, unknown>)[f.key]; prov[f.key] = pv === 'user' || pv === 'estimate' || pv === 'default' ? pv : 'user';
  }
  if (!Array.isArray(raw.luminaires) || !Array.isArray(raw.scenarios) || raw.scenarios.length === 0) return bad('import.badContent');
  for (const l of raw.luminaires as unknown[]) {
    if (!isObj(l) || typeof l.id !== 'string' || typeof l.model !== 'string' || !(Number(l.power) >= 0)) return bad('import.badLuminaire');
    const ph = l.photometry;
    if (ph !== null && ph !== undefined) {
      if (!isObj(ph) || !Array.isArray(ph.C) || !Array.isArray(ph.G) || !Array.isArray(ph.cd) || ph.cd.length !== ph.C.length) return bad('import.badLuminaire');
      if (ph.C.length * ph.G.length > 200_000) return bad('import.badLuminaire');
      for (const row of ph.cd as unknown[]) if (!Array.isArray(row) || row.length !== ph.G.length || row.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) return bad('import.badLuminaire');
    }
  }
  for (const s of raw.scenarios as unknown[]) if (!isObj(s) || typeof s.id !== 'string' || !isObj(s.layout) || typeof s.layout.luminaireId !== 'string' || !(Number(s.layout.count) >= 0)) return bad('import.badScenario');
  const p = { ...(raw as unknown as Project), inputs, prov } as Project;
  p.meta = { client: '', site: '', country: '', designer: '', notes: '', ...(isObj(raw.meta) ? (raw.meta as object) : {}) } as Project['meta'];
  p.luminaires = (raw.luminaires as Luminaire[]).map((l) => ({ ...l, photometry: l.photometry ?? null }));
  p.standardId = typeof raw.standardId === 'string' ? raw.standardId : 'none';
  if (!isObj(raw.hazard)) p.hazard = createProject(type, 'x').hazard;
  if (!isObj(raw.opt)) p.opt = createProject(type, 'x').opt;
  p.opt = { ...createProject(type, 'x').opt, ...p.opt };
  p.activeScenarioId = p.scenarios.some((s) => s.id === raw.activeScenarioId) ? (raw.activeScenarioId as string) : p.scenarios[0].id;
  p.schemaVersion = SCHEMA_VERSION; p.wizardDone = raw.wizardDone === true;
  return { ok: true, project: p, notes };
}
