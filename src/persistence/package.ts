// Portable project packages: editable project, read-only review package, full backup, version diff.
import type { Project } from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';
import { migrateProject } from '../domain/project';
import { hashOf, uid } from '../lib/hash';
import { activeScenarioSummary } from './util';

export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
export type PkgKind = 'project' | 'review' | 'backup';
const FORMAT = { project: 'lumina-project', review: 'lumina-review', backup: 'lumina-backup' } as const;

export function exportProject(p: Project): string {
  return JSON.stringify({ format: FORMAT.project, packageVersion: 1, app: 'Lumina', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: hashOf(p), project: p }, null, 1);
}
/** Review package: identical data, flagged readOnly with a summary; importing it never touches the source project. */
export function exportReview(p: Project): string {
  return JSON.stringify({ format: FORMAT.review, packageVersion: 1, app: 'Lumina', readOnly: true, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: hashOf(p), summary: activeScenarioSummary(p), project: p }, null, 1);
}
export function exportBackup(ps: Project[]): string {
  return JSON.stringify({ format: FORMAT.backup, packageVersion: 1, app: 'Lumina', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), checks: ps.map(hashOf), projects: ps }, null, 1);
}
export type ImportResult =
  | { ok: true; kind: 'project' | 'review'; project: Project; notes: string[]; checksumOk: boolean }
  | { ok: true; kind: 'backup'; projects: Project[]; notes: string[]; checksumOk: boolean; skipped: number }
  | { ok: false; error: string };

export function importPackage(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'file.tooLarge' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'import.notJson' }; }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'import.notObject' };
  const r = raw as Record<string, unknown>;
  if (r.format === FORMAT.project || r.format === FORMAT.review) {
    const m = migrateProject(r.project);
    if (!m.ok) return m;
    return { ok: true, kind: r.format === FORMAT.review ? 'review' : 'project', project: m.project, notes: m.notes, checksumOk: typeof r.checksum === 'string' && r.checksum === hashOf(r.project) };
  }
  if (r.format === FORMAT.backup && Array.isArray(r.projects)) {
    const projects: Project[] = []; let skipped = 0;
    const checks = Array.isArray(r.checks) ? (r.checks as string[]) : [];
    let allOk = checks.length === r.projects.length;
    (r.projects as unknown[]).forEach((x, i) => { const m = migrateProject(x); if (m.ok) { projects.push(m.project); if (checks[i] !== hashOf(x)) allOk = false; } else skipped++; });
    return { ok: true, kind: 'backup', projects, notes: [], checksumOk: allOk, skipped };
  }
  // bare project JSON
  if ('schemaVersion' in r && 'tunnelType' in r) { const m = migrateProject(r); if (!m.ok) return m; return { ok: true, kind: 'project', project: m.project, notes: m.notes, checksumOk: false }; }
  return { ok: false, error: 'import.unknownFormat' };
}
/** Fresh identity so an imported project never overwrites an existing one unintentionally. */
export function asCopy(p: Project, suffix: string): Project {
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  const scenarios = p.scenarios.map((s) => { const id = uid('scn'); idMap.set(s.id, id); return { ...s, id }; });
  return { ...JSON.parse(JSON.stringify(p)), id: uid('prj'), name: p.name + suffix, createdAt: now, updatedAt: now, scenarios: JSON.parse(JSON.stringify(scenarios)), activeScenarioId: idMap.get(p.activeScenarioId) ?? scenarios[0].id };
}

export interface DiffItem { path: string; before: unknown; after: unknown }
export function diffProjects(a: Project, b: Project): DiffItem[] {
  const out: DiffItem[] = [];
  const cmp = (path: string, x: unknown, y: unknown) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path, before: x, after: y }); };
  cmp('name', a.name, b.name); cmp('tunnelType', a.tunnelType, b.tunnelType); cmp('standardId', a.standardId, b.standardId);
  for (const k of new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)])) cmp('inputs.' + k, a.inputs[k], b.inputs[k]);
  for (const k of Object.keys(a.hazard) as (keyof Project['hazard'])[]) cmp('hazard.' + k, a.hazard[k], b.hazard[k]);
  for (const k of Object.keys(a.meta) as (keyof Project['meta'])[]) cmp('meta.' + k, a.meta[k], b.meta[k]);
  const sa = new Map(a.scenarios.map((s) => [s.id, s])), sb = new Map(b.scenarios.map((s) => [s.id, s]));
  for (const [id, s] of sa) { const t = sb.get(id); if (!t) out.push({ path: `scenario[${s.name}]`, before: 'present', after: 'removed' }); else { cmp(`scenario[${s.name}].name`, s.name, t.name); for (const k of Object.keys(s.layout) as (keyof typeof s.layout)[]) cmp(`scenario[${s.name}].layout.${k}`, s.layout[k], t.layout[k]); } }
  for (const [id, s] of sb) if (!sa.has(id)) out.push({ path: `scenario[${s.name}]`, before: 'absent', after: 'added' });
  const la = new Map(a.luminaires.map((l) => [l.id, l])), lb = new Map(b.luminaires.map((l) => [l.id, l]));
  for (const [id, l] of la) { const m = lb.get(id); if (!m) out.push({ path: `luminaire[${l.model}]`, before: 'present', after: 'removed' }); else if (hashOf(l) !== hashOf(m)) out.push({ path: `luminaire[${l.model}]`, before: 'v1', after: 'modified' }); }
  for (const [id, l] of lb) if (!la.has(id)) out.push({ path: `luminaire[${l.model}]`, before: 'absent', after: 'added' });
  return out;
}
