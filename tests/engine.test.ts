import test from 'node:test';
import assert from 'node:assert/strict';
import { fromDisplay, toDisplay } from '../src/lib/units';
import { buildGeometry, ceilingAt, layoutIssues, layoutPositions } from '../src/geometry/tunnel';
import { foldC, integrateFlux, interp2, makePhotometry, syntheticPhotometry, approximateFromBeam } from '../src/photometry';
import { parseIES, parseLDT, parsePhotometricFile } from '../src/photometry/parsers';
import { illuminanceAt, floorGrid, lumenMethodE, lumenMethodN, stats } from '../src/calc/engine';
import { electrical, lifecycle, npv } from '../src/calc/economics';
import { createProject, defaultInputs, validateInputs } from '../src/domain/project';
import type { Layout } from '../src/domain/types';
import type { Placed } from '../src/geometry/tunnel';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('unit conversions round-trip and match exact factors', () => {
  close(toDisplay('length', 3.048, 'imperial'), 10, 1e-9);
  close(toDisplay('illuminance', 10.763910416709722, 'imperial'), 1, 1e-9);
  close(toDisplay('temperature', 100, 'imperial'), 212, 1e-9);
  for (const k of ['length', 'area', 'illuminance', 'speed', 'temperature'] as const) close(fromDisplay(k, toDisplay(k, 12.34, 'imperial'), 'imperial'), 12.34, 1e-9, k);
  assert.equal(toDisplay('length', 5, 'metric'), 5);
});

test('geometry: arched, rectangular and circular ceilings', () => {
  const base = { ...defaultInputs('road').inputs };
  const arched = buildGeometry({ ...base, shape: 'arched', width: 10, wallHeight: 4, crownRise: 2 }, 'road');
  close(ceilingAt(arched, 5), 6, 1e-9); close(ceilingAt(arched, 0), 4, 1e-9); close(arched.maxZ, 6, 1e-9);
  const rect = buildGeometry({ ...base, shape: 'rect', width: 8, wallHeight: 5 }, 'road');
  close(ceilingAt(rect, 3), 5, 1e-9);
  const circ = buildGeometry({ ...base, shape: 'circular', width: 6, diameter: 10 }, 'road');
  close(ceilingAt(circ, 3), 4 + 5, 1e-9, 'crown = chord-to-centre + r'); // cz = sqrt(25-9)=4
  close(ceilingAt(circ, 0), 8, 1e-9, 'at floor corner: cz + sqrt(r²-3²) = 4+4');
});
test('geometry: road calculation zone = lanes × width, centred', () => {
  const g = buildGeometry({ ...defaultInputs('road').inputs, width: 10.5, lanes: 2, laneWidth: 3.5 }, 'road');
  close(g.zone.y1 - g.zone.y0, 7, 1e-9); close(g.zone.y0, 1.75, 1e-9);
  const m = buildGeometry({ ...defaultInputs('mining').inputs, calcZone: 'walkway', walkwayWidth: 1.2 }, 'mining');
  close(m.zone.y1, 1.2, 1e-9);
});
test('layout positions: auto spacing is cell-centred; overlap and mount issues are detected', () => {
  const p = createProject('mining', 't');
  const g = buildGeometry({ ...p.inputs, length: 100 }, 'mining');
  const lay: Layout = { ...p.scenarios[0].layout, arrangement: 'both-walls', count: 10, spacingMode: 'auto' };
  const pos = layoutPositions(g, lay, p.luminaires[1]);
  assert.equal(pos.length, 20); close(pos[0].x, 5, 1e-9); close(pos[9].x, 95, 1e-9);
  assert.ok(pos.every((q) => q.x > 0 && q.x < 100));
  const dense = { ...lay, count: 200 };
  const issues = layoutIssues(g, dense, p.luminaires[1], layoutPositions(g, dense, p.luminaires[1]));
  assert.ok(issues.some((i) => i.key === 'issue.overlap'));
  const high = { ...lay, mountHeight: 50 };
  assert.ok(layoutIssues(g, high, p.luminaires[1], pos).some((i) => i.key === 'issue.mountAbove'));
});

test('photometry: isotropic flux = 4πI, Lambertian flux = πI0, symmetric folding', () => {
  const C = [0, 360], G = Array.from({ length: 181 }, (_, i) => i);
  close(integrateFlux(C, G, [G.map(() => 100), G.map(() => 100)]), 4 * Math.PI * 100, 0.2);
  const G2 = Array.from({ length: 181 }, (_, i) => i / 2);
  const lam = G2.map((g) => 1000 * Math.cos((g * Math.PI) / 180));
  close(integrateFlux(C, G2, [lam, lam]), Math.PI * 1000, 0.5);
  assert.equal(foldC(100, 0, 90), 80); assert.equal(foldC(200, 0, 90), 20); assert.equal(foldC(300, 0, 180), 60); assert.equal(foldC(30, 90, 270), 150);
  const syn = syntheticPhotometry(5000, 1.5, 3, 'sample-synthetic', 'synthetic');
  close(syn.flux, 5000, 1, 'synthetic normalised to flux');
  const ap = approximateFromBeam(1000, 90); close(ap.flux, 1000, 1); assert.equal(ap.quality, 'approximate');
});
test('photometry: bilinear interpolation and out-of-range intensity', () => {
  const C = [0, 90, 360], G = [0, 90], cd = [[100, 0], [200, 0], [100, 0]];
  close(interp2(C, G, cd, 45, 0), 150, 1e-9); close(interp2(C, G, cd, 0, 45), 50, 1e-9); close(interp2(C, G, cd, 0, 120), 0, 1e-9);
});

const IES = `IESNA:LM-63-2002
[TEST] SYNTHETIC-TEST
[MANUFAC] Test Maker
[LUMINAIRE] Cosine test
TILT=NONE
1 1000 1 5 1 1 2 0.5 0.5 0.1
1 1 10
0 22.5 45 67.5 90
0
1000 923.88 707.1 382.68 0
`;
test('IES parser: valid Type C file → verified photometry with correct flux', () => {
  const r = parseIES(IES); assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.photometry.quality, 'verified'); assert.equal(r.photometry.format, 'IES');
  close(r.photometry.flux, Math.PI * 1000, 5); assert.equal(r.info.manufacturer, 'Test Maker'); assert.equal(r.info.power, 10);
  close(r.info.length ?? 0, 0.5, 1e-9);
});
test('IES parser: quadrant symmetry is expanded to 360°', () => {
  const t = IES.replace('1 1000 1 5 1 1 2', '1 1000 1 3 3 1 2').replace('0 22.5 45 67.5 90\n0\n1000 923.88 707.1 382.68 0', '0 45 90\n0 45 90\n100 100 0\n200 200 0\n100 100 0');
  const r = parseIES(t); assert.ok(r.ok); if (!r.ok) return;
  close(interp2(r.photometry.C, r.photometry.G, r.photometry.cd, 270, 0), 100, 1e-9); // mirrored quadrant
  close(interp2(r.photometry.C, r.photometry.G, r.photometry.cd, 180, 10), interp2(r.photometry.C, r.photometry.G, r.photometry.cd, 0, 10), 1e-6);
});
test('IES parser: rejects malformed / unsupported / hostile input without throwing', () => {
  const bad: [string, string][] = [['', 'ies.empty'], ['hello world', 'ies.noHeader'], [IES.replace('TILT=NONE', ''), 'ies.noTilt'], [IES.replace(' 5 1 1 2', ' 5 1 2 2'), 'ies.typeUnsupported'], [IES.slice(0, IES.length - 12), 'ies.truncated'], [IES.replace('1000 923.88', 'abc 923.88'), 'ies.nonNumeric'], [IES.replace('0 22.5 45 67.5 90', '0 45 22.5 67.5 90'), 'ies.anglesNotAscending'], [IES.replace('1000 923.88', '-5 923.88'), 'ies.negativeCandela'], [IES.replace(' 5 1 1 2', ' 99999 99999 1 2'), 'file.tooLarge'], [IES.replace('TILT=NONE', 'TILT=WEIRD'), 'ies.tiltUnsupported']];
  for (const [t, code] of bad) { const r = parseIES(t); assert.ok(!r.ok, code); if (!r.ok) assert.ok(r.errors.includes(code), `${code} got ${r.errors}`); }
  assert.ok(!parsePhotometricFile('x.txt', IES).ok);
  assert.ok(parsePhotometricFile('X.IES', IES).ok);
});

function ldt(opts: { sym?: number; flux?: number } = {}): string {
  const L: (string | number)[] = ['Test Co', 1, opts.sym ?? 1, 1, 0, 5, 22.5, 'rep', 'Cosine LDT', 'n1', 'f.ldt', 'date', 600, 0, 100, 500, 0, 0, 0, 0, 0, 0, 100, 1, 0, 1, 1, 'LED', opts.flux ?? 3141.6, 4000, 80, 30];
  const v = [1000, 923.88, 707.1, 382.68, 0].map((x) => (x * 0.31831).toFixed(3));
  return [...L, '0.5 0.5 0.5 0.5 0.5', '0.5 0.5 0.5 0.5 0.5', '0', '0 22.5 45 67.5 90', ...v].join('\n');
}
test('LDT parser: valid file → cd/klm scaled by lamp flux, flux matches', () => {
  const r = parseLDT(ldt()); assert.ok(r.ok); if (!r.ok) return;
  assert.equal(r.photometry.format, 'LDT'); close(r.photometry.flux, Math.PI * 1000, 8); assert.equal(r.photometry.warnings.length, 0);
  close(r.info.power ?? 0, 30, 1e-9); close(r.info.length ?? 0, 0.6, 1e-9);
});
test('LDT parser: rejects truncated, bad symmetry and missing flux', () => {
  assert.ok(!parseLDT('a\nb').ok);
  assert.ok(!parseLDT(ldt({ sym: 9 })).ok);
  assert.ok(!parseLDT(ldt({ flux: 0 })).ok);
  assert.ok(!parseLDT(ldt().split('\n').slice(0, 40).join('\n')).ok);
});

test('point-by-point: single isotropic source — nadir E = I/h² and offset E = I·h/d³ (cos law)', () => {
  const I = 800, h = 5; const ph = makePhotometry([0, 360], Array.from({ length: 181 }, (_, i) => i), [Array(181).fill(I), Array(181).fill(I)], 'verified', 'IES');
  const pos: Placed[] = [{ x: 0, y: 0, z: h, row: 0, index: 0, yaw: 0 }];
  close(illuminanceAt([0, 0, 0], [0, 0, 1], pos, ph), I / (h * h), 1e-9);
  const d = Math.hypot(3, 4, h); close(illuminanceAt([3, 4, 0], [0, 0, 1], pos, ph), (I * h) / d ** 3, 1e-9);
  close(illuminanceAt([0, 0, 0], [1, 0, 0], pos, ph), 0, 1e-12, 'vertical plane facing away sees no light at nadir');
  // vertical plane at x=3 facing the source: E = I cosθ/d², cosθ = 3/d
  const d2 = Math.hypot(3, h); close(illuminanceAt([3, 0, 0], [-1, 0, 0], pos, ph), (I * (3 / d2)) / d2 ** 2, 1e-9);
});
test('point-by-point: Lambertian source — flux on a floor disc = Φ·R²/(R²+h²) (integral check)', () => {
  const G = Array.from({ length: 181 }, (_, i) => i / 2), I0 = 1000;
  const lam = G.map((g) => I0 * Math.cos((g * Math.PI) / 180));
  const ph = makePhotometry([0, 360], G, [lam, lam], 'verified', 'IES');
  const h = 4, R = 12, pos: Placed[] = [{ x: 0, y: 0, z: h, row: 0, index: 0, yaw: 0 }];
  let tot = 0; const nr = 400;
  for (let i = 0; i < nr; i++) { const r = ((i + 0.5) * R) / nr; tot += illuminanceAt([r, 0, 0], [0, 0, 1], pos, ph) * 2 * Math.PI * r * (R / nr); }
  close(tot / (Math.PI * I0), R * R / (R * R + h * h), 0.002);
});
test('floor grid: cell-centred, symmetric for a centred source, sums to flux on a wide floor', () => {
  const G = Array.from({ length: 181 }, (_, i) => i / 2), lam = G.map((g) => 1000 * Math.cos((g * Math.PI) / 180));
  const ph = makePhotometry([0, 360], G, [lam, lam], 'verified', 'IES');
  const geom = buildGeometry({ ...defaultInputs('mining').inputs, length: 40, width: 30, shape: 'rect', wallHeight: 4 }, 'mining');
  const pos: Placed[] = [{ x: 20, y: 15, z: 4, row: 0, index: 0, yaw: 0 }];
  const g = floorGrid(geom, pos, ph, { workPlane: 0, gridSpacing: 0.5, cutoff: 100 });
  const s = stats(g.E); let sum = 0; for (let i = 0; i < g.E.length; i++) sum += g.E[i] * g.dx * g.dy;
  close(sum / (Math.PI * 1000), 1, 0.12, 'most flux lands on a 40×30 floor');
  close(g.E[Math.floor(g.nx / 2) * g.ny + Math.floor(g.ny / 2)] / g.E[Math.floor(g.nx / 2 - 1) * g.ny + Math.floor(g.ny / 2)], 1, 0.15);
  assert.ok(s.max >= s.avg && s.min <= s.avg && s.u0 === s.min / s.avg && s.ud === s.min / s.max);
  assert.equal(floorGrid(geom, [], ph, { workPlane: 0, gridSpacing: 1 }).E.every((v) => v === 0), true);
});
test('lumen method: known values', () => {
  close(lumenMethodE(20, 5000, 0.5, 0.8, 400), 100, 1e-9);
  assert.equal(lumenMethodN(100, 5000, 0.5, 0.8, 400), 20);
  assert.equal(lumenMethodE(5, 1000, 0.5, 0.8, 0), 0); assert.equal(lumenMethodN(100, 0, 0.5, 0.8, 10), Infinity);
});
test('economics: NPV, lifecycle and electrical known values', () => {
  close(npv([100, 100, 100], 0.1), 248.685, 0.001);
  const e = lifecycle({ n: 10, powerEach: 50, priceEach: 100, defPrice: 999, installFactor: 0.3, hours: 4000, energyPrice: 0.1, years: 3, discountPct: 10, maintCostEach: 5 });
  close(e.initial, 1300, 1e-9); close(e.kWhYear, 2000, 1e-9); close(e.energyCostYear, 200, 1e-9); close(e.lcc, 1300 + npv([250, 250, 250], 0.1), 1e-6); assert.equal(e.priceEstimated, false);
  assert.equal(lifecycle({ n: 1, powerEach: 1, defPrice: 77, installFactor: 0, hours: 1, energyPrice: 0, years: 1, discountPct: 0, maintCostEach: 0 }).priceEstimated, true);
  const el = electrical(2300, 230, 1, 100, 5); close(el.current, 10, 1e-9); assert.ok(el.ok && el.vdPct <= 5 && el.sectionMm2 >= el.minSectionMm2);
});
test('input validation: missing/out-of-range fields are reported with the field key', () => {
  const p = createProject('road', 'x'); assert.deepEqual(validateInputs(p), []);
  const bad = { ...p, inputs: { ...p.inputs, length: -5, width: NaN as unknown as number } };
  const iss = validateInputs(bad); assert.ok(iss.some((i) => i.field === 'length' && i.key === 'issue.range')); assert.ok(iss.some((i) => i.field === 'width' && i.key === 'issue.missing'));
});
