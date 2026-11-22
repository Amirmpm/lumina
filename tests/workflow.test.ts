import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setInput, newScenario, migrateProject, activeScenario } from '../src/domain/project';
import { evaluate, inputsHash, summarize } from '../src/calc/evaluate';
import { STANDARDS, evaluateCriteria, standardById } from '../src/standards/registry';
import { screenEx } from '../src/standards/ex';
import { optimize } from '../src/optimize/optimizer';
import { Autosaver, findRecovery } from '../src/persistence/autosave';
import type { DraftSink } from '../src/persistence/autosave';
import { MemoryStore } from '../src/persistence/storage';
import { asCopy, diffProjects, exportBackup, exportProject, exportReview, importPackage } from '../src/persistence/package';
import { buildPdf, buildXlsx, parseDxfEntities, pdfPageCount, toCsv, unzip, zip } from '../src/exports/files';
import { buildSheets, dxfFor, objFor } from '../src/exports/datasets';
import { buildObj } from '../src/exports/files';
import { importLegacyLuminaires } from '../src/photometry/catalog';
import type { HazardRequirement, Project } from '../src/domain/types';

const small = (): Project => {
  let p = createProject('mining', 'Test mine');
  p = setInput(p, 'length', 80); p = setInput(p, 'width', 4.5);
  return p;
};
const evAll = (p: Project) => new Map(p.scenarios.map((s) => [s.id, evaluate(p, s.layout)]));

test('standards: statuses are honest — unsupported never passes, partial standards stay indeterminate', () => {
  const p = small();
  const cie = evaluateCriteria(standardById('cie88'), { ...p, tunnelType: 'road' }, { eAvgM: 1e6, eMinM: 1e6, u0: 1 });
  assert.equal(cie.verdict, 'indeterminate'); assert.ok(cie.results.every((r) => r.verdict === 'unsupported')); assert.equal(cie.hardPass, false);
  const en = evaluateCriteria(standardById('en13201-p'), { ...p, tunnelType: 'road', inputs: { ...p.inputs, pclass: 'P2' } }, { eAvgM: 12, eMinM: 2.5, u0: 0.2 });
  assert.equal(en.results.find((r) => r.id === 'p-eavg')!.value, 10); assert.equal(en.results.find((r) => r.id === 'p-eavg')!.verdict, 'pass');
  assert.equal(en.verdict, 'indeterminate'); assert.equal(en.hardPass, true, 'supported criteria pass but overall is not a pass');
  const enFail = evaluateCriteria(standardById('en13201-p'), { ...p, inputs: { ...p.inputs, pclass: 'P2' } }, { eAvgM: 12, eMinM: 1.5, u0: 0.1 });
  assert.equal(enFail.verdict, 'fail'); assert.deepEqual(enFail.failed, ['p-emin']);
  const none = evaluateCriteria(standardById('none'), p, { eAvgM: 5, eMinM: 1, u0: 0.2 }); assert.equal(none.verdict, 'none');
  const nul = evaluateCriteria(standardById('user'), p, null); assert.ok(nul.results.every((r) => r.verdict === 'indeterminate')); assert.equal(nul.hardPass, false);
  const user = evaluateCriteria(standardById('user'), setInput(p, 'crit_eavg', 20), { eAvgM: 25, eMinM: 6, u0: 0.3 }); assert.equal(user.verdict, 'pass');
  assert.equal(user.results[0].origin, 'user'); assert.equal(user.results[1].origin, 'placeholder');
  for (const s of STANDARDS) { assert.ok(s.edition && s.scope.en && s.limitations.en && s.source); if (s.status === 'unsupported') assert.ok(s.criteria(p).every((c) => c.status === 'unsupported')); }
});

test('explosion-protection screen: never states suitability; needs certificate and sufficient zone/group/T-class', () => {
  const h: HazardRequirement = { required: true, hazardType: 'gas', zone: '1', group: 'IIB', tempClass: 'T4' };
  const ex = { hazardType: 'gas' as const, zone: '1' as const, group: 'IIC' as const, tempClass: 'T5' as const, marking: 'II 2G Ex db IIC T5 Gb', scheme: 'ATEX', certificateId: 'TEST-123', scope: 's', limitations: 'l' };
  assert.equal(screenEx({ ...h, required: false }, {}).status, 'not-required');
  assert.equal(screenEx(h, {}).status, 'no-data');
  assert.equal(screenEx(h, { ex }).status, 'declared-needs-verification');
  assert.equal(screenEx(h, { ex: { ...ex, certificateId: '' } }).status, 'no-data');
  assert.equal(screenEx(h, { ex: { ...ex, zone: '2' } }).status, 'incompatible');
  assert.equal(screenEx(h, { ex: { ...ex, group: 'IIA' } }).status, 'incompatible');
  assert.equal(screenEx(h, { ex: { ...ex, tempClass: 'T3' } }).status, 'incompatible');
  assert.equal(screenEx(h, { ex: { ...ex, hazardType: 'dust', zone: '21' } }).status, 'incompatible');
  assert.equal(screenEx({ ...h, zone: '2' }, { ex: { ...ex, zone: '1' } }).status, 'declared-needs-verification');
});

test('stale-result handling: any relevant change alters the input hash; irrelevant change does not', () => {
  const p = small(); const lay = activeScenario(p).layout; const h0 = inputsHash(p, lay);
  assert.equal(inputsHash(p, lay), h0);
  assert.notEqual(inputsHash(setInput(p, 'length', 90), lay), h0);
  assert.notEqual(inputsHash(p, { ...lay, count: lay.count + 1 }), h0);
  assert.notEqual(inputsHash({ ...p, luminaires: p.luminaires.map((l) => (l.id === lay.luminaireId ? { ...l, power: l.power + 1 } : l)) }, lay), h0);
  assert.equal(inputsHash({ ...p, name: 'renamed' }, lay), h0);
});

test('evaluation: realistic mining project produces traceable numbers; blockers explain missing inputs', () => {
  const p = small(); const ev = evaluate(p, activeScenario(p).layout);
  assert.ok(ev.ok && ev.initial && ev.maintained && ev.grid && ev.econ);
  assert.ok(Math.abs(ev.maintained.avg - ev.initial.avg * p.inputs.llmf * p.inputs.lmf) < 1e-9);
  assert.ok(ev.lumen && ev.lumen.directUtilance > 0 && ev.lumen.directUtilance <= 1);
  assert.equal(ev.photQuality, 'sample-synthetic');
  const broken = evaluate({ ...p, inputs: { ...p.inputs, width: NaN } }, activeScenarioSummaryLayout(p));
  assert.equal(broken.ok, false); assert.ok(broken.blockers.some((b) => b.key === 'issue.missing'));
  const noLum = evaluate(p, { ...activeScenario(p).layout, luminaireId: 'nope' }); assert.equal(noLum.ok, false);
  const noPh = evaluate({ ...p, luminaires: p.luminaires.map((l) => ({ ...l, photometry: null })) }, activeScenario(p).layout); assert.equal(noPh.ok, false);
  assert.ok(noPh.blockers.some((b) => b.key === 'issue.noPhotometry'));
});
function activeScenarioSummaryLayout(p: Project) { return activeScenario(p).layout; }

test('optimiser: feasible candidates satisfy all criteria on re-evaluation; ranking follows score', async () => {
  const p = small();
  const r = await optimize(p, p.opt);
  assert.ok(!r.blocked && r.feasibleCount > 0, 'some feasible layouts exist');
  const feas = r.candidates.filter((c) => c.feasible);
  for (const c of feas) { const ev = evaluate(p, c.layout); assert.ok(ev.ok && ev.std.hardPass, 'hard constraints hold: ' + c.lumModel); assert.ok(c.metrics!.eAvgM >= Number(p.inputs.crit_eavg) - 1e-9); }
  assert.deepEqual(feas.map((c) => c.rank), feas.map((_, i) => i + 1));
  for (let i = 1; i < feas.length; i++) assert.ok(feas[i].score! >= feas[i - 1].score! - 1e-12);
  assert.ok(r.candidates.slice(0, feas.length).every((c) => c.feasible), 'feasible ranked before infeasible');
  // cost-only weights must still be constrained: cheapest feasible still meets criteria
  const cost = await optimize(p, { ...p.opt, weights: { lcc: 1, energy: 0, count: 0, uniformity: 0, maintenance: 0 } });
  const top = cost.candidates[0]; assert.ok(top.feasible && top.metrics!.eAvgM >= Number(p.inputs.crit_eavg) - 1e-9);
  assert.ok(top.obj!.lcc <= Math.min(...cost.candidates.filter((c) => c.feasible).map((c) => c.obj!.lcc)) + 1e-9);
});
test('optimiser: infeasible, blocked and Ex-constrained cases are reported, never relaxed', async () => {
  const p = small();
  const imp = await optimize(setInput(p, 'crit_eavg', 5000), { ...p.opt, maxCount: 5 });
  assert.equal(imp.feasibleCount, 0); assert.ok(imp.candidates.length > 0 && imp.candidates.every((c) => !c.feasible && c.violations.length > 0));
  const none = await optimize({ ...p, standardId: 'none' }, p.opt); assert.equal(none.blocked, 'opt.noCriteria');
  const cie = await optimize({ ...p, tunnelType: 'road', standardId: 'cie88' }, p.opt); assert.equal(cie.blocked, 'opt.noCriteria');
  const hz = await optimize({ ...p, hazard: { ...p.hazard, required: true } }, p.opt);
  assert.equal(hz.feasibleCount, 0); assert.ok(hz.candidates.every((c) => c.violations.some((v) => v.key === 'opt.exNotEstablished')));
  const withEx = { ...p, hazard: { ...p.hazard, required: true }, luminaires: p.luminaires.map((l) => ({ ...l, ex: { hazardType: 'gas' as const, zone: '1' as const, group: 'IIC' as const, tempClass: 'T6' as const, marking: 'TEST', scheme: 'TEST', certificateId: 'TEST-1', scope: '', limitations: '' } })) };
  const ok = await optimize(withEx, p.opt); assert.ok(ok.feasibleCount > 0); assert.ok(ok.candidates.filter((c) => c.feasible).every((c) => c.flags.includes('ex.verifyCert')));
  const spacing = await optimize(p, { ...p.opt, maxSpacing: 0.5, maxCount: 10 }); assert.ok(spacing.candidates.every((c) => !c.feasible));
});

const memSink = (): DraftSink & { v: string | null } => ({ v: null, get() { return this.v; }, set(x: string) { this.v = x; }, clear() { this.v = null; } });
test('autosave: debounced write, status transitions, versions, crash recovery from draft', async () => {
  const store = new MemoryStore(); const sink = memSink(); const states: string[] = [];
  const a = new Autosaver(store, (s) => states.push(s), sink, 5);
  let p = small(); a.schedule(p); assert.equal(a.status, 'unsaved'); assert.ok(sink.v, 'draft written synchronously');
  await a.flush(); assert.equal(a.status, 'saved'); assert.equal(sink.v, null);
  assert.deepEqual(states.slice(0, 3), ['unsaved', 'saving', 'saved']);
  assert.equal((await store.get(p.id))!.name, 'Test mine'); assert.equal((await store.versions(p.id)).length, 1, 'first autosave snapshot');
  // simulated crash: draft newer than stored copy
  p = setInput({ ...p, updatedAt: new Date(Date.now() + 5000).toISOString() }, 'length', 123); a.schedule(p);
  const rec = await findRecovery(store, sink); assert.ok(rec && rec.inputs.length === 123, 'unsaved edit recovered');
  await a.flush(); assert.equal(await findRecovery(store, sink), null);
  // rollback via version
  await a.snapshot(p, 'manual', 'v1'); const vs = await store.versions(p.id); assert.ok(vs.some((v) => v.label === 'v1'));
  const old = vs.find((v) => v.label === 'v1')!.project; assert.equal(old.inputs.length, 123);
  // failure surfaces as error status without data loss
  const bad = new MemoryStore(); bad.put = async () => { throw new Error('quota'); }; const st2: string[] = []; const b = new Autosaver(bad, (s) => st2.push(s), memSink(), 5);
  b.schedule(p); await assert.rejects(b.flush()); assert.equal(b.status, 'error');
  // list / delete
  assert.equal((await store.list()).length, 1); await store.remove(p.id); assert.equal((await store.list()).length, 0); assert.equal((await store.versions(p.id)).length, 0);
});

test('project package: round-trip, tamper detection, review package, backup, hostile input, version safety', () => {
  const p = small();
  const r = importPackage(exportProject(p)); assert.ok(r.ok && r.kind === 'project'); if (!r.ok || r.kind === 'backup') return;
  assert.equal(r.checksumOk, true); assert.deepEqual(r.project.inputs, p.inputs); assert.equal(r.project.luminaires.length, p.luminaires.length);
  assert.deepEqual(r.project.luminaires[0].photometry!.cd[3], p.luminaires[0].photometry!.cd[3], 'photometric data embedded');
  const tampered = JSON.parse(exportProject(p)); tampered.project.inputs.length = 999;
  const t = importPackage(JSON.stringify(tampered)); assert.ok(t.ok && t.kind !== 'backup' && t.checksumOk === false);
  const rv = importPackage(exportReview(p)); assert.ok(rv.ok && rv.kind === 'review');
  assert.equal(JSON.parse(exportReview(p)).readOnly, true);
  const bk = importPackage(exportBackup([p, small()])); assert.ok(bk.ok && bk.kind === 'backup' && bk.projects.length === 2 && bk.checksumOk);
  for (const bad of ['', '{', '[]', '{"format":"x"}', JSON.stringify({ format: 'lumina-project', project: { schemaVersion: 1 } }), JSON.stringify({ format: 'lumina-project', project: { ...p, schemaVersion: 99 } }), JSON.stringify({ format: 'lumina-project', project: { ...p, tunnelType: 'moon' } }), JSON.stringify({ format: 'lumina-project', project: { ...p, inputs: { ...p.inputs, length: 'abc' } } }), JSON.stringify({ format: 'lumina-project', project: { ...p, luminaires: [{ id: 1 }] } })]) assert.equal(importPackage(bad).ok, false, bad.slice(0, 40));
  const nv = migrateProject({ ...p, schemaVersion: 99 }); assert.ok(!nv.ok && nv.error === 'import.newer');
  const cp = asCopy(p, ' (copy)'); assert.notEqual(cp.id, p.id); assert.notEqual(cp.scenarios[0].id, p.scenarios[0].id); assert.equal(cp.activeScenarioId, cp.scenarios[0].id);
  const rvProj = (rv as { project: Project }).project; rvProj.name = 'changed'; assert.equal(p.name, 'Test mine', 'review import cannot alter the source');
});
test('version comparison identifies changed inputs, layouts, scenarios and luminaires', () => {
  const a = small(); let b = setInput(a, 'length', 120);
  b = { ...b, scenarios: [{ ...b.scenarios[0], layout: { ...b.scenarios[0].layout, count: 99 } }, newScenario('Alt', b.scenarios[0].layout, 'manual')], luminaires: b.luminaires.slice(1) };
  const d = diffProjects(a, b).map((x) => x.path);
  assert.ok(d.includes('inputs.length') && d.includes('scenario[Baseline].layout.count') && d.includes('scenario[Alt]') && d.some((x) => x.startsWith('luminaire[')));
  assert.deepEqual(diffProjects(a, a), []);
});
test('legacy luminaire import: ex_rated flag is NOT carried over; photometry is marked approximate', () => {
  const r = importLegacyLuminaires([{ model: 'X1', watts: 20, lumens: 2600, beam_angle: 90, ex_rated: true, price_usd: 18 }, { model: 'bad' }, null]);
  assert.equal(r.items.length, 1); assert.equal(r.skipped, 2);
  assert.equal(r.items[0].ex, undefined); assert.equal(r.items[0].photometry!.quality, 'approximate'); assert.ok(/ignored/.test(r.items[0].source));
});

test('exports: XLSX/CSV/DXF/OBJ/PDF contain real project data and re-parse', () => {
  const p = small(); const evs = evAll(p); const ev = evs.get(p.activeScenarioId)!;
  const sheets = buildSheets(p, evs, 'en');
  const xl = unzip(buildXlsx(sheets)); const names = xl.map((f) => f.name);
  assert.ok(names.includes('xl/workbook.xml') && names.includes('xl/worksheets/sheet6.xml'));
  const txt = (n: string) => new TextDecoder().decode(xl.find((f) => f.name === n)!.data);
  assert.ok(txt('xl/worksheets/sheet1.xml').includes(p.id) && txt('xl/worksheets/sheet1.xml').includes('Tunnel length'));
  assert.ok(txt('xl/worksheets/sheet5.xml').includes('<v>' + ev.positions[0].x.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '</v>'));
  const gridRows = sheets[5].rows.length - 1; assert.equal(gridRows, ev.grid!.nx * ev.grid!.ny);
  const csv = toCsv([['a', '=cmd()'], ['x,y', 'q"z'], [1, null]]); assert.ok(csv.includes("'=cmd()") && csv.includes('"x,y"') && csv.includes('"q""z"'));
  const dxf = dxfFor(p, ev); const ents = parseDxfEntities(dxf);
  assert.equal(ents.filter((e) => e.layer === 'LUMINAIRES').length, ev.nTotal * 4); assert.ok(ents.some((e) => e.type === 'CIRCLE' && e.layer === 'LUMINAIRES_SECTION')); assert.ok(ents.some((e) => e.layer === 'TUNNEL_SECTION'));
  assert.ok(dxf.includes('$INSUNITS') && dxf.trim().endsWith('EOF'));
  const obj = buildObj(objFor(ev)); const v = obj.split('\n').filter((l) => l.startsWith('v ')).length; const f = obj.split('\n').filter((l) => l.startsWith('f '));
  assert.equal(v, ev.geom.outline.length * 2 + ev.nTotal * 8); assert.ok(f.every((l) => l.split(' ').slice(1).every((i) => Number(i) >= 1 && Number(i) <= v)));
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); const pdf = buildPdf([{ jpeg, w: 100, h: 140 }, { jpeg, w: 100, h: 140 }], 'T'); assert.equal(pdfPageCount(pdf), 2);
  const s = new TextDecoder('latin1').decode(pdf); assert.ok(s.startsWith('%PDF-1.4') && s.trim().endsWith('%%EOF') && /startxref\n\d+/.test(s));
  const off = Number(/startxref\n(\d+)/.exec(s)![1]); assert.equal(s.slice(off, off + 4), 'xref');
  assert.deepEqual(unzip(zip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]))[0].name, 'a.txt');
});

test('end-to-end workflow: create → calculate → optimise → scenario → save → reopen → compare → export', async () => {
  const store = new MemoryStore(); const auto = new Autosaver(store, () => {}, undefined, 1);
  let p = setInput(setInput(createProject('mining', 'E2E'), 'length', 80), 'width', 4.5);
  const base = evaluate(p, activeScenario(p).layout); assert.ok(base.ok);
  const opt = await optimize(p, p.opt); assert.ok(opt.feasibleCount > 0);
  const best = opt.candidates[0]; const sc = newScenario('Optimised #1', best.layout, 'optimizer');
  p = { ...p, scenarios: [...p.scenarios, sc], activeScenarioId: sc.id };
  const evs = evAll(p); p = { ...p, scenarios: p.scenarios.map((s) => ({ ...s, result: summarize(evs.get(s.id)!) ?? undefined })) };
  assert.ok(p.scenarios.every((s) => s.result && s.result.hash === evs.get(s.id)!.hash));
  auto.schedule(p); await auto.flush();
  const reopened = (await store.get(p.id))!; const ev2 = evaluate(reopened, activeScenario(reopened).layout);
  assert.equal(ev2.hash, evs.get(sc.id)!.hash); assert.ok(Math.abs(ev2.initial!.avg - evs.get(sc.id)!.initial!.avg) < 1e-9, 'reopened project reproduces the same result');
  const imported = importPackage(exportProject(reopened)); assert.ok(imported.ok && imported.kind === 'project');
  const proj2 = (imported as { project: Project }).project; assert.equal(evaluate(proj2, activeScenario(proj2).layout).hash, ev2.hash, 'package round-trip is hash-identical');
  const stale = setInput(reopened, 'length', 100); assert.notEqual(inputsHash(stale, sc.layout), reopened.scenarios.find((x) => x.id === sc.id)!.result!.hash, 'result is stale after geometry edit');
  const sheets = buildSheets(reopened, evAll(reopened), 'fa'); assert.equal(sheets[2].rows.length, 3, 'two scenarios in comparison sheet');
  assert.ok(sheets[0].rows.some((r) => r[0] === 'length' && String(r[1]).includes('طول')), 'Persian labels in FA export, same values');
  assert.equal(sheets[0].rows.find((r) => r[0] === 'length')![2], 80);
});
