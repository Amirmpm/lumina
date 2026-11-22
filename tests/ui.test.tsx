import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';
import App from '../src/App';
import { act } from '../src/ui/store';
import { D, tr } from '../src/i18n';
import { createProject, setInput } from '../src/domain/project';
import { evaluate } from '../src/calc/evaluate';
import { CAM_PRESETS, draw3D, drawPlan, drawSection, planFit } from '../src/ui/draw';
import { renderReportPdf } from '../src/exports/report';
import { pdfPageCount } from '../src/exports/files';
import type { Project, TunnelType } from '../src/domain/types';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });

test('i18n: every key referenced in source exists in both languages; no empty strings', () => {
  const keys = new Set<string>();
  for (const f of walk('src')) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\(\s*(['"])([\w.\-]+)\1/g)) keys.add(m[2]);
    for (const m of s.matchAll(/\btr\(\s*lang\s*,\s*(['"])([\w.\-]+)\1/g)) keys.add(m[2]);
    for (const m of s.matchAll(/['"]((?:issue|opt|ex|ies|ldt|file|import|grp|obj|basis|verdict|impl|kind|phot|arr|scn|ver|origin|lf|type|prov|wiz\.[sh]|files|lib\.f|res\.wall)\.[A-Za-z0-9-]+)['"]/g)) keys.add(m[1]);
  }
  const dyn = ['phot.verified', 'phot.sample-synthetic', 'phot.approximate', 'phot.none', 'verdict.pass', 'verdict.fail', 'verdict.indeterminate', 'verdict.unsupported', 'verdict.none', 'impl.supported', 'impl.partial', 'impl.unsupported', 'type.road', 'type.mining', 'type.railway', 'kind.sample', 'kind.imported', 'kind.custom', 'origin.user', 'origin.placeholder', 'origin.none', 'origin.normative-unverified', 'ver.auto', 'ver.manual', 'ver.pre-rollback', 'res.wall.left', 'res.wall.right', 'scn.src.manual', 'scn.src.optimizer', 'prov.default', 'prov.estimate', 'prov.user',
    ...['basics', 'geometry', 'operating', 'economic', 'standard'].flatMap((s) => ['wiz.s.' + s, 'wiz.h.' + s]), ...['center', 'left', 'right', 'both-walls', 'two-rows', 'three-rows'].map((a) => 'arr.' + a), ...['power', 'flux', 'fluxDecl', 'dims', 'mounting', 'ip', 'voltage', 'price', 'life', 'cct', 'cri'].map((k) => 'lib.f.' + k), ...['not-required', 'no-data', 'incompatible', 'declared-needs-verification'].map((k) => 'ex.' + k), ...['lcc', 'energy', 'count', 'uniformity', 'maintenance'].map((k) => 'obj.' + k), ...['luminaireId', 'arrangement', 'count', 'spacingMode', 'spacing', 'mountHeight', 'staggered', 'yaw', 'wallInset'].map((k) => 'lf.' + k), ...['client', 'site', 'country', 'designer'].map((k) => 'meta.' + k)];
  dyn.forEach((k) => keys.add(k));
  const missing = [...keys].filter((k) => !D[k] && !/\.$/.test(k) && /^[a-z]/.test(k) && !/^(files\.(xlsx|xls)|file\.ies)$/.test(k)).filter((k) => !['wiz.s', 'wiz.h', 'lib.f'].includes(k));
  assert.deepEqual(missing, [], 'missing keys: ' + missing.join(', '));
  for (const [k, [en, fa]] of Object.entries(D)) { assert.ok(en.trim() && fa.trim(), k); const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(); assert.equal(ph(en), ph(fa), 'placeholders differ in ' + k); }
  assert.equal(tr('fa', 'wiz.blockers', { n: 3 }), '۳ مشکل باید پیش از محاسبه رفع شود'); assert.equal(tr('en', 'issue.missing', { field: '' }), 'missing or not a number');
});

async function seed(type: TunnelType, shape?: string): Promise<Project> {
  await act.init();
  let p = createProject(type, 'SSR ' + type); if (shape) p = setInput(p, 'shape', shape); p = { ...p, wizardDone: true };
  act.open(p); act.calculate(true); return p;
}
test('UI smoke (server render): every stage renders in EN and FA for every tunnel type, RTL set, no key leaks', async () => {
  const stages = ['projects', 'wizard', 'design', 'library', 'results', 'optimize', 'scenarios', 'files'] as const;
  for (const type of ['road', 'mining', 'railway'] as const) {
    await seed(type, type === 'railway' ? 'circular' : undefined);
    for (const lang of ['en', 'fa'] as const) {
      act.setLang(lang);
      for (const st of stages) {
        act.setStage(st);
        if (st === 'wizard') for (let i = 0; i < 5; i++) { act.setWizardStep(i); const h = renderToString(<App />); assert.ok(h.length > 500, `${type}/${lang}/wizard${i}`); }
        const html = renderToString(<App />);
        assert.ok(html.length > 800, `${type}/${lang}/${st} rendered`);
        const expect: Record<string, [string, string]> = { projects: ['Projects', 'پروژه‌ها'], wizard: ['Project setup', 'راه‌اندازی پروژه'], design: ['Cross-section', 'مقطع عرضی'], library: ['Import IES / LDT', 'درون‌ریزی IES / LDT'], results: ['Calculation results', 'نتایج محاسبه'], optimize: ['Hard constraints', 'قیدهای سخت'], scenarios: ['Scenarios &amp; comparison', 'سناریوها و مقایسه'], files: ['Version history', 'تاریخچه‌ی نسخه‌ها'] };
        assert.ok(html.includes(expect[st][lang === 'fa' ? 1 : 0]), `${type}/${lang}/${st} shows localized content "${expect[st][lang === 'fa' ? 1 : 0]}"`);
        assert.ok(html.includes(`dir="${lang === 'fa' ? 'rtl' : 'ltr'}"`), 'direction attribute');
        const leaks = [...html.matchAll(/>([a-z]+\.[A-Za-z0-9.-]+)</g)].map((m) => m[1]).filter((k) => !/\.(com|org|json|xlsx|ies|ldt)$/.test(k));
        assert.deepEqual(leaks, [], `raw keys leaked in ${type}/${lang}/${st}`);
      }
    }
  }
});

// Minimal recording 2D context so the drawing code and report layout execute for real (no pixels are checked).
function fakeCtx() {
  const calls: string[] = []; const target: Record<string, unknown> = { canvas: null };
  const ctx = new Proxy(target, { get: (t, k: string) => (k in t ? t[k] : k === 'measureText' ? (s: string) => ({ width: String(s).length * 9 }) : (..._a: unknown[]) => { calls.push(k); }), set: (t, k: string, v) => { t[k] = v; return true; } });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
test('drawing code runs for all geometries and produces draw calls; report pipeline yields a PDF in both languages', async () => {
  for (const [type, shape] of [['road', 'arched'], ['mining', 'rect'], ['railway', 'circular']] as const) {
    let p = createProject(type, 'D'); p = setInput(p, 'shape', shape); p = setInput(p, 'length', 120);
    const lay = p.scenarios[0].layout; const ev = evaluate(p, lay); assert.ok(ev.ok, `${type}/${shape} evaluates: ${JSON.stringify(ev.blockers)}`);
    const f = fakeCtx(); const vmax = ev.initial!.max * ev.mf;
    draw3D(f.ctx, 800, 500, CAM_PRESETS.iso(ev.geom, 60), ev.geom, ev.positions, ev.lum, ev.grid, vmax, ev.mf, 60, 0, { heat: true, lums: true, full: false });
    drawPlan(f.ctx, 800, 300, planFit(800, 300, ev.geom), ev.geom, ev.positions, ev.lum, ev.grid, vmax, ev.mf, 60, null);
    drawSection(f.ctx, 500, 300, ev.geom, ev.positions, ev.lum, 60, 0, [{ y: 1, e: 5 }, { y: 2, e: 9 }], 9, { x: 'x', w: 'w', h: 'h', e: 'e' });
    assert.ok(f.calls.filter((c) => c === 'fill' || c === 'fillRect').length > 100, 'drew many primitives');
  }
  const p = createProject('mining', 'Report'); const ev = new Map(p.scenarios.map((s) => [s.id, evaluate(p, s.layout)]));
  const fake = fakeCtx();
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => fake.ctx, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' }) };
  for (const lang of ['en', 'fa'] as const) { const pdf = renderReportPdf(p, ev, lang, 100); assert.ok(pdfPageCount(pdf) >= 3, `report pages (${lang}): ${pdfPageCount(pdf)}`); assert.equal(new TextDecoder('latin1').decode(pdf.slice(0, 5)), '%PDF-'); }
});
