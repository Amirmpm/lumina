// PDF engineering report. Pages are rendered on <canvas> (so Persian shaping/RTL is handled by the browser) and embedded as JPEG.
import type { Lang, Project } from '../domain/types';
import type { Evaluation } from '../calc/evaluate';
import { FIELDS } from '../domain/fields';
import { standardById } from '../standards/registry';
import { tr } from '../i18n';
import { buildPdf } from './files';
import { CAM_PRESETS, draw3D, drawColorbar, drawPlan, drawSection, planFit } from '../ui/draw';
import { fmt } from '../lib/units';

const W = 1240, H = 1754, M = 72;
const INK = '#14202b', MUTED = '#566171', ACC = '#0b7a75', LINE = '#d5dae1';
class Doc {
  pages: HTMLCanvasElement[] = []; c!: CanvasRenderingContext2D; y = 0; rtl: boolean; font: string;
  constructor(public lang: Lang, public title: string) { this.rtl = lang === 'fa'; this.font = this.rtl ? 'Vazirmatn, Tahoma, "Segoe UI", sans-serif' : 'Inter, "Segoe UI", Arial, sans-serif'; this.page(); }
  page() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; this.pages.push(cv); this.c = cv.getContext('2d')!; this.c.fillStyle = '#fff'; this.c.fillRect(0, 0, W, H); this.y = M + 20;
    this.c.fillStyle = MUTED; this.c.font = `18px ${this.font}`; this.c.direction = this.rtl ? 'rtl' : 'ltr'; this.c.textAlign = this.rtl ? 'right' : 'left'; this.c.textBaseline = 'alphabetic';
    this.c.fillText(`Lumina · ${this.title}`, this.rtl ? W - M : M, 50); this.c.fillStyle = LINE; this.c.fillRect(M, 60, W - 2 * M, 1);
  }
  x(left: number) { return this.rtl ? W - M - left : M + left; }
  ensure(h: number) { if (this.y + h > H - M - 30) this.page(); }
  txt(s: string, o: { size?: number; bold?: boolean; color?: string; left?: number; maxW?: number; gap?: number } = {}) {
    const size = o.size ?? 20, c = this.c; c.font = `${o.bold ? '700 ' : ''}${size}px ${this.font}`; c.fillStyle = o.color ?? INK; c.textAlign = this.rtl ? 'right' : 'left'; c.direction = this.rtl ? 'rtl' : 'ltr';
    const maxW = (o.maxW ?? W - 2 * M) - (o.left ?? 0); const words = s.split(/\s+/); let line = ''; const lines: string[] = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line);
    for (const l of lines) { this.ensure(size * 1.5); c.fillText(l, this.x(o.left ?? 0), this.y + size); this.y += size * 1.45; } this.y += o.gap ?? 4;
  }
  h(s: string) { this.ensure(70); this.y += 12; this.c.fillStyle = ACC; this.c.fillRect(this.x(0) - (this.rtl ? W - 2 * M : 0), this.y, W - 2 * M, 2); this.y += 8; this.txt(s, { size: 28, bold: true, gap: 8 }); }
  table(head: string[], rows: string[][], widths: number[]) {
    const tot = widths.reduce((a, b) => a + b, 0), cw = widths.map((w) => (w / tot) * (W - 2 * M)); const c = this.c; const rowH = 34;
    const draw = (cells: string[], bold: boolean, bg?: string) => { this.ensure(rowH + 4); if (bg) { c.fillStyle = bg; c.fillRect(M, this.y, W - 2 * M, rowH); } let left = 0; cells.forEach((s, i) => { c.font = `${bold ? '700 ' : ''}17px ${this.font}`; c.fillStyle = bold ? MUTED : INK; c.direction = this.rtl ? 'rtl' : 'ltr'; c.textAlign = this.rtl ? 'right' : 'left'; let t = s; while (c.measureText(t).width > cw[i] - 14 && t.length > 3) t = t.slice(0, -2); if (t !== s) t += '…'; c.fillText(t, this.x(left + 7), this.y + 23); left += cw[i]; }); c.fillStyle = LINE; c.fillRect(M, this.y + rowH, W - 2 * M, 1); this.y += rowH; };
    draw(head, true, '#f5f6f8'); rows.forEach((r) => draw(r, false)); this.y += 12;
  }
  img(w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void, left = 0) { this.ensure(h + 10); const cv = document.createElement('canvas'); cv.width = w * 1.5; cv.height = h * 1.5; const x = cv.getContext('2d')!; x.scale(1.5, 1.5); fn(x); this.c.drawImage(cv, this.x(left) - (this.rtl ? w : 0), this.y, w, h); this.c.strokeStyle = LINE; this.c.strokeRect(this.x(left) - (this.rtl ? w : 0), this.y, w, h); this.y += h + 12; }
}
const jpegBytes = (cv: HTMLCanvasElement) => { const b = atob(cv.toDataURL('image/jpeg', 0.9).split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

export function renderReportPdf(p: Project, evs: Map<string, Evaluation>, lang: Lang, selX: number): Uint8Array {
  const t = (k: string, a?: Record<string, string | number>) => tr(lang, k, a);
  const d = new Doc(lang, p.name); const ev = evs.get(p.activeScenarioId)!; const std = standardById(p.standardId); const sc = p.scenarios.find((s) => s.id === p.activeScenarioId)!;
  d.y = 110; d.txt(t('rep.title'), { size: 44, bold: true, gap: 10 }); d.txt(p.name, { size: 30, color: ACC, bold: true, gap: 10 });
  d.txt(`${t('meta.type')}: ${t('type.' + p.tunnelType)} · ${t('rep.date')}: ${new Date().toISOString().slice(0, 10)} · ${t('rep.scenario')}: ${sc.name}`, { color: MUTED });
  d.txt(`${t('meta.client')}: ${p.meta.client || '—'} · ${t('meta.site')}: ${p.meta.site || '—'} · ${t('meta.country')}: ${p.meta.country || '—'} · ${t('meta.designer')}: ${p.meta.designer || '—'}`, { color: MUTED, gap: 14 });
  d.txt(t('rep.disclaimer'), { size: 18, color: '#9a5b06', gap: 10 });
  d.h(t('rep.s1'));
  d.table([t('rep.param'), t('rep.value'), t('rep.unit'), t('rep.prov')], FIELDS.filter((f) => f.key in p.inputs && !f.key.startsWith('crit') && f.key !== 'pclass').map((f) => [f.label[lang], String(typeof p.inputs[f.key] === 'number' ? fmt(p.inputs[f.key] as number, 3) : (f.options?.find((o) => o.v === p.inputs[f.key])?.label[lang] ?? p.inputs[f.key])), f.unit ?? '', t('prov.' + p.prov[f.key])]), [5, 2, 1.3, 1.4]);
  d.h(t('rep.s2')); d.txt(`${std.name[lang]} — ${std.edition} — ${t('impl.' + std.status)}`, { bold: true }); d.txt(std.scope[lang], { color: MUTED }); d.txt(`${t('std.limits')}: ${std.limitations[lang]}`, { color: '#9a5b06', gap: 8 });
  if (ev.std.results.length) d.table([t('res.criterion'), t('res.req'), t('res.actual'), t('rep.status'), t('rep.origin')], ev.std.results.map((r) => [r.label[lang], r.value !== undefined ? `${fmt(r.value, 2)} ${r.unit ?? ''}` : '—', r.actual !== undefined ? fmt(r.actual, 2) : '—', t('verdict.' + r.verdict), t('origin.' + r.origin)]), [4, 1.5, 1.5, 1.5, 2]);
  d.txt(`${t('res.criteria')}: ${t('verdict.' + (ev.std.verdict === 'none' ? 'indeterminate' : ev.std.verdict))}`, { bold: true });
  if (p.hazard.required) d.txt(`${t('ex.title')}: ${t('ex.' + ev.ex.status)} — ${t('ex.disclaimer')}`, { color: '#9a5b06' });
  d.h(t('rep.s3')); const g = ev.geom;
  d.txt(`L = ${fmt(g.L, 1)} m · W = ${fmt(g.W, 2)} m · H = ${fmt(g.maxZ, 2)} m · ${t('rep.zone')} y = ${fmt(g.zone.y0, 2)}–${fmt(g.zone.y1, 2)} m`, { color: MUTED });
  const vmax = ev.initial ? ev.initial.max * ev.mf : 1;
  d.img(W - 2 * M, 380, (x) => { draw3D(x, W - 2 * M, 380, CAM_PRESETS.iso(g, selX), g, ev.positions, ev.lum, ev.grid, vmax, ev.mf, selX, null, { heat: true, lums: true, full: false }); if (ev.grid) drawColorbar(x, W - 2 * M - 170, 12, 150, 8, 0, vmax, 'lx', true); });
  d.img(W - 2 * M, 250, (x) => drawPlan(x, W - 2 * M, 250, planFit(W - 2 * M, 250, g, 22), g, ev.positions, ev.lum, ev.grid, vmax, ev.mf, selX, null, { heat: true, lums: true }));
  d.img(520, 330, (x) => drawSection(x, 520, 330, g, ev.positions, ev.lum, selX, null, null, 1, { x: `x = ${selX.toFixed(1)} m`, w: t('view.width'), h: t('view.height'), e: '' }));
  d.h(t('rep.s4')); const l = ev.lum;
  if (l) { d.txt(`${l.model}${l.manufacturer ? ' — ' + l.manufacturer : ''} · ${t('kind.' + l.kind)} · ${t('phot.' + (l.photometry?.quality ?? 'none'))}`, { bold: true }); d.txt(l.source, { color: MUTED }); d.txt(`${l.power} W · ${l.photometry ? fmt(l.photometry.flux, 0) : '—'} lm · ${fmt(l.length, 2)}×${fmt(l.width, 2)}×${fmt(l.height, 2)} m · ${l.fileName ?? ''} ${l.fileHash ? '#' + l.fileHash : ''}`); if (l.photometry?.quality !== 'verified') d.txt(t('res.photWarn', { q: t('phot.' + (l.photometry?.quality ?? 'none')) }), { color: '#9a5b06' }); }
  d.h(t('rep.s5')); const rows = new Map<number, number[]>(); ev.positions.forEach((q) => rows.set(q.row, [...(rows.get(q.row) ?? []), q.x]));
  d.table([t('insp.row'), t('rep.count'), 'y (m)', 'z (m)', t('rep.spacing')], [...rows.entries()].map(([r, xs]) => { const q = ev.positions.find((z) => z.row === r)!; return [String(r + 1), String(xs.length), fmt(q.y, 2), fmt(q.z, 2), xs.length > 1 ? fmt((xs[xs.length - 1] - xs[0]) / (xs.length - 1), 2) : '—']; }), [1, 1, 1, 1, 1]);
  d.txt(`${t('insp.arrangement')}: ${t('arr.' + ev.layout.arrangement)} · ${t('insp.total', { n: ev.nTotal })}`, { color: MUTED });
  d.h(t('rep.s6'));
  if (ev.initial && ev.maintained && ev.econ && ev.lumen) {
    d.table([t('rep.param'), t('rep.value')], [[t('m.eAvg'), `${fmt(ev.initial.avg, 1)} lx`], [t('m.eMin'), `${fmt(ev.initial.min, 1)} lx`], [t('m.eMax'), `${fmt(ev.initial.max, 1)} lx`], [t('m.eAvgM'), `${fmt(ev.maintained.avg, 1)} lx`], [t('m.eMinM'), `${fmt(ev.maintained.min, 1)} lx`], ['U0 = Emin/Eavg', fmt(ev.initial.u0, 3)], ['Ud = Emin/Emax', fmt(ev.initial.ud, 3)], [t('res.lumenE'), `${fmt(ev.lumen.E, 1)} lx (UF = ${fmt(ev.lumen.UF, 2)} ${t('prov.estimate')})`]], [3, 2]);
    for (const k of ['basis.method', 'basis.directOnly', 'basis.convention', 'basis.noTemp', 'basis.cutoff', 'basis.noLum']) d.txt('• ' + t(k), { size: 18, color: MUTED });
    d.txt(`E = I(C,γ)·cosθ / d²   ·   Em = E · LLMF · LMF = E · ${fmt(ev.mf, 4)}`, { size: 20, bold: true });
    d.h(t('rep.s7')); d.table([t('rep.param'), t('rep.value')], [[t('m.n'), String(ev.nTotal)], [t('m.kW'), `${fmt(ev.econ.kW, 2)} kW`], [t('m.kWh'), `${fmt(ev.econ.kWhYear, 0)} kWh/yr`], [t('m.initial'), fmt(ev.econ.initial, 0)], [t('res.energyYear'), fmt(ev.econ.energyCostYear, 0)], [t('res.maintYear'), fmt(ev.econ.maintYear, 0)], [t('m.lcc'), fmt(ev.econ.lcc, 0)]], [3, 2]);
    for (const a of ev.econ.assumptions) d.txt('• ' + a, { size: 17, color: MUTED }); if (ev.econ.priceEstimated) d.txt(t('res.priceEst'), { color: '#9a5b06' });
  }
  d.h(t('rep.s8')); const rowsS = p.scenarios.map((s) => { const e = evs.get(s.id)!; return [s.name, e.lum?.model ?? '—', `${t('arr.' + s.layout.arrangement)} ×${s.layout.count}`, e.maintained ? fmt(e.maintained.avg, 1) : '—', e.maintained ? fmt(e.maintained.u0, 2) : '—', e.econ ? fmt(e.econ.kWhYear, 0) : '—', e.econ ? fmt(e.econ.lcc, 0) : '—', t('verdict.' + (e.std.verdict === 'none' ? 'indeterminate' : e.std.verdict))]; });
  d.table([t('scn.name'), t('lib.model'), t('insp.arrangement'), 'Eavg,m', 'U0', 'kWh/yr', 'LCC', t('res.criteria')], rowsS, [2, 2.4, 2.4, 1.2, 1, 1.3, 1.3, 1.6]);
  d.h(t('rep.s9')); [...ev.warnings.map((w) => t(w.key, w.params as Record<string, string | number>)), t('rep.l1'), t('rep.l2'), t('rep.l3')].forEach((s) => d.txt('• ' + s, { size: 18, color: MUTED }));
  return buildPdf(d.pages.map((cv) => ({ jpeg: jpegBytes(cv), w: W, h: H })), `${p.name} — Lumina report`);
}
