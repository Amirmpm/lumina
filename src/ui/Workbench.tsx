import { useEffect, useMemo, useRef, useState } from 'react';
import { useT, tr } from '../i18n';
import { Banner, Btn, CanvasView, Chip, Icon, Section, Seg, FieldRow } from './kit';
import { LAYOUT_FIELDS, useModel } from './model';
import { act, useS } from './store';
import { CAM_PRESETS, draw3D, drawColorbar, drawPlan, drawSection, floorPick, lumScreenPositions, planFit } from './draw';
import type { Cam, Tx } from './draw';
import { visibleFields, resetInput, setInput } from '../domain/project';
import { TUNNEL_TYPES } from '../domain/fields';
import { fmt } from '../lib/units';
import type { Arrangement } from '../domain/types';

export function Workbench() {
  const m = useModel(); const t = useT(); const sel = useS((s) => s.sel); const review = useS((s) => s.review);
  const lang = useS((s) => s.lang);
  const { lum, geom, pos, ev, status, issues } = m;
  const [mode, setMode] = useState<'split' | '3d' | 'plan' | 'section'>('split');
  const [heat, setHeat] = useState(true); const [lums, setLums] = useState(true); const [full, setFull] = useState(false);
  const [cam, setCam] = useState<Cam>(() => CAM_PRESETS.iso(geom, sel.x));
  const camRef = useRef(cam); camRef.current = cam;
  const [plan, setPlan] = useState<Tx | null>(null);
  const grid = status === 'fresh' ? ev?.grid : undefined; const mf = ev?.mf ?? 1;
  const vmax = ev?.initial ? ev.initial.max * mf : 0;
  const selX = Math.min(geom.L, Math.max(0, sel.x));
  const preset = (k: string) => setCam(CAM_PRESETS[k](geom, selX));
  const drag = useRef<{ x: number; y: number; moved: number; pan: boolean } | null>(null);
  const dims = useRef({ w: 1, h: 1 });

  const profile = useMemo(() => {
    if (!grid) return null; const i = Math.min(grid.nx - 1, Math.max(0, Math.floor(selX / grid.dx)));
    return grid.ys.map((y, j) => ({ y, e: grid.E[i * grid.ny + j] * mf }));
  }, [grid, selX, mf]);
  const pickLum = (px: number, py: number, c: Cam, w: number, h: number) => { let best: number | null = null, bd = 14; for (const e of lumScreenPositions(c, w, h, pos)) { const d = Math.hypot(e.p[0] - px, e.p[1] - py); if (d < bd) { bd = d; best = e.i; } } return best; };

  const h3 = {
    onDown: (x: number, y: number, e: React.PointerEvent) => { drag.current = { x, y, moved: 0, pan: e.shiftKey || e.button === 1 || e.button === 2 }; },
    onMove: (x: number, y: number) => {
      const d = drag.current; if (!d) return; const dx = x - d.x, dy = y - d.y; d.moved += Math.abs(dx) + Math.abs(dy); d.x = x; d.y = y;
      setCam((c) => { if (!d.pan) return { ...c, yaw: c.yaw - dx * 0.008, pitch: Math.max(-0.2, Math.min(1.5, c.pitch + dy * 0.006)) }; const k = c.dist * 0.0015; return { ...c, tx: c.tx + Math.sin(c.yaw) * dx * k, ty: c.ty - Math.cos(c.yaw) * dx * k, tz: Math.max(0, c.tz + dy * k) }; });
    },
    onUp: (x: number, y: number) => {
      const d = drag.current; drag.current = null; if (!d || d.moved > 5) return; const { w, h } = dims.current;
      const li = pickLum(x, y, camRef.current, w, h); if (li !== null) { act.select({ lum: li, x: pos[li].x }); return; }
      const f = floorPick(camRef.current, w, h, x, y); if (f) act.select({ x: Math.min(geom.L, Math.max(0, f[0])), lum: null });
    },
    onWheel: (_x: number, _y: number, dy: number) => setCam((c) => ({ ...c, dist: Math.max(4, Math.min(geom.L * 3 + 100, c.dist * Math.exp(dy * 0.0012))) })),
    onDouble: () => preset('iso'),
  };
  const planDrag = useRef<{ x: number; moved: number } | null>(null);
  const planTx = (w: number, h: number): Tx => { const f = planFit(w, h, geom); const b = plan ?? f; return { x0: b.x0, scale: b.scale, y0: (h - geom.W * b.scale) / 2 }; };
  const hPlan = {
    onDown: (x: number) => { planDrag.current = { x, moved: 0 }; },
    onMove: (x: number) => { const d = planDrag.current; if (!d) return; const dx = x - d.x; d.x = x; d.moved += Math.abs(dx); setPlan((b) => { const { w, h } = dims.current; const cur = b ?? planFit(w, h, geom); return { ...cur, x0: cur.x0 - dx / cur.scale }; }); },
    onUp: (x: number, y: number) => { const d = planDrag.current; planDrag.current = null; if (!d || d.moved > 4) return; const { w, h } = dims.current; const tx = planTx(w, h); const wx = tx.x0 + x / tx.scale;
      let best: number | null = null, bd = 9; pos.forEach((q, i) => { const dd = Math.hypot((q.x - tx.x0) * tx.scale - x, tx.y0 + q.y * tx.scale - y); if (dd < bd) { bd = dd; best = i; } });
      if (best !== null) act.select({ lum: best, x: pos[best].x }); else act.select({ x: Math.min(geom.L, Math.max(0, wx)), lum: null }); },
    onWheel: (x: number, _y: number, dy: number) => setPlan((b) => { const { w, h } = dims.current; const cur = b ?? planFit(w, h, geom); const f = Math.exp(-dy * 0.0015); const ns = Math.max(0.05, Math.min(400, cur.scale * f)); const wx = cur.x0 + x / cur.scale; return { ...cur, scale: ns, x0: wx - x / ns }; }),
    onDouble: () => setPlan(null),
  };
  const wrapDraw = <A extends unknown[]>(fn: (ctx: CanvasRenderingContext2D, w: number, h: number, ...a: A) => void, ...a: A) => (ctx: CanvasRenderingContext2D, w: number, h: number) => { dims.current = { w, h }; fn(ctx, w, h, ...a); };

  const d3 = (<CanvasView label={t('view.3d')} cursor="grab" deps={[cam, geom, pos, grid, selX, sel.lum, heat, lums, full, mf]} handlers={h3}
    draw={wrapDraw((ctx, w, h) => { draw3D(ctx, w, h, cam, geom, pos, lum, grid, vmax, mf, selX, sel.lum, { heat, lums, full }); if (grid && heat) drawColorbar(ctx, w - 170, 12, 150, 8, 0, vmax, 'lx', true); })} />);
  const dPlan = (<CanvasView label={t('view.plan')} cursor="crosshair" deps={[plan, geom, pos, grid, selX, sel.lum, heat, lums, mf]} handlers={hPlan}
    draw={(ctx, w, h) => { dims.current = { w, h }; const tx = planTx(w, h); drawPlan(ctx, w, h, tx, geom, pos, lum, grid, vmax, mf, selX, sel.lum, { heat, lums }); if (grid && heat) drawColorbar(ctx, w - 170, 10, 150, 8, 0, vmax, 'lx'); }} />);
  const dSec = (<CanvasView label={t('view.section')} deps={[geom, pos, selX, sel.lum, profile, lang]}
    draw={(ctx, w, h) => drawSection(ctx, w, h, geom, pos, lum, selX, sel.lum, profile, Math.max(...(profile?.map((q) => q.e) ?? [0]), 1e-9), { x: `x = ${selX.toFixed(1)} m`, w: t('view.width'), h: t('view.height'), e: t('view.eAcross') })} />);

  const lumX = pos.filter((q) => q.row === 0).map((q) => q.x);
  const jump = (dir: 1 | -1) => { const xs = [...new Set(pos.map((q) => +q.x.toFixed(4)))].sort((a, b) => a - b); const nx = dir > 0 ? xs.find((x) => x > selX + 1e-6) : [...xs].reverse().find((x) => x < selX - 1e-6); if (nx !== undefined) act.select({ x: nx, lum: pos.findIndex((q) => +q.x.toFixed(4) === nx) }); };
  void lumX;
  useEffect(() => { if (sel.x > geom.L) act.select({ x: geom.L / 2 }); }, [geom.L, sel.x]);
  const panelTitle = (k: string, icon: string) => <div className="absolute top-2 start-2 z-10 chip" style={{ background: 'var(--surface)', backdropFilter: 'blur(2px)' }}><Icon n={icon} s={11} />{t(k)}</div>;
  const cell = (k: string, icon: string, node: React.ReactNode, cls = '') => <div className={'relative min-h-0 min-w-0 border border-[var(--border)] rounded-lg overflow-hidden bg-white ' + cls}>{panelTitle(k, icon)}{node}</div>;

  return <div className="flex h-full min-h-0">
    <div className="flex-1 flex flex-col min-w-0 p-3 gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Seg value={mode} onChange={setMode} label={t('view.mode')} items={[{ id: 'split', label: t('view.split'), icon: 'layers' }, { id: '3d', label: '3D', icon: 'cube' }, { id: 'plan', label: t('view.plan'), icon: 'plan' }, { id: 'section', label: t('view.section'), icon: 'section' }]} />
        <Seg value={'' as string} onChange={(v) => preset(v)} label={t('view.camera')} items={[{ id: 'iso', label: t('cam.iso'), icon: 'cam' }, { id: 'top', label: t('cam.top') }, { id: 'side', label: t('cam.side') }, { id: 'front', label: t('cam.front') }]} />
        <div className="seg"><button aria-pressed={heat} onClick={() => setHeat(!heat)} title={t('view.heatHelp')}>{t('view.heat')}</button><button aria-pressed={lums} onClick={() => setLums(!lums)}>{t('view.lums')}</button><button aria-pressed={full} onClick={() => setFull(!full)} title={t('view.fullHelp')}>{t('view.full')}</button></div>
        <div className="flex-1" />
        <span className="label hidden xl:inline">{t('view.hint')}</span>
      </div>
      {status !== 'fresh' && !review && <Banner tone={status === 'blocked' ? 'danger' : 'warn'} icon="alert" actions={status !== 'blocked' ? <Btn sm variant="primary" icon="play" onClick={() => act.calculate()}>{t('calc.run')}</Btn> : undefined}>{status === 'blocked' ? t('calc.blockedHelp', { n: issues.filter((i) => i.severity === 'error').length }) : status === 'stale' ? t('calc.staleHelp') : t('calc.noneHelp')}</Banner>}
      <div className="flex-1 min-h-0 grid gap-2" style={mode === 'split' ? { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' } : { gridTemplateColumns: 'minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr)' }}>
        {(mode === 'split' || mode === '3d') && cell('view.3d', 'cube', d3, mode === 'split' ? 'row-span-2' : '')}
        {(mode === 'split' || mode === 'plan') && cell('view.plan', 'plan', dPlan)}
        {(mode === 'split' || mode === 'section') && cell('view.section', 'section', dSec)}
      </div>
      <div className="panel flex items-center gap-3 px-3 h-11 shrink-0">
        <span className="label whitespace-nowrap">{t('view.location')}</span>
        <Btn sm variant="ghost" iconOnly icon="chevron" title={t('view.prev')} className="rotate-180 rtl:rotate-0" onClick={() => jump(-1)} />
        <input type="range" aria-label={t('view.location')} className="flex-1 accent-[var(--accent)]" min={0} max={geom.L} step={Math.max(0.1, geom.L / 2000)} value={selX} onChange={(e) => act.select({ x: Number(e.target.value), lum: null })} />
        <Btn sm variant="ghost" iconOnly icon="chevron" title={t('view.next')} className="rtl:rotate-180" onClick={() => jump(1)} />
        <span className="num ltr w-24 text-end font-medium">{selX.toFixed(1)} / {fmt(geom.L, 0)} m</span>
      </div>
    </div>
    <Inspector />
  </div>;
}

function Inspector() {
  const m = useModel(); const t = useT(); const lang = useS((s) => s.lang); const unit = useS((s) => s.unit); const sel = useS((s) => s.sel); const review = useS((s) => s.review);
  const { p, sc, lum, pos, geom, issues, ev } = m; const lay = sc.layout;
  const type = TUNNEL_TYPES.find((x) => x.id === p.tunnelType)!;
  const geomFields = visibleFields(p).filter((f) => f.group === 'geometry');
  const q = sel.lum !== null ? pos[sel.lum] : null;
  let eHere: { avg: number; min: number } | null = null;
  if (ev?.grid) { const g = ev.grid; const i = Math.min(g.nx - 1, Math.max(0, Math.floor(sel.x / g.dx))); const col = Array.from({ length: g.ny }, (_, j) => g.E[i * g.ny + j] * ev.mf); eHere = { avg: col.reduce((a, b) => a + b, 0) / col.length, min: Math.min(...col) }; }
  const dis = review;
  const lf = (k: keyof typeof LAYOUT_FIELDS, v: number | null | undefined, set: (n: number) => void) => <FieldRow def={LAYOUT_FIELDS[k]} value={v ?? 0} prov={null} unit={unit} lang={lang} onChange={(x) => set(Number(x))} />;
  return <aside aria-label={t('insp.title')} className="w-[320px] shrink-0 border-s border-[var(--border)] bg-[var(--surface)] overflow-y-auto" style={dis ? { pointerEvents: 'none', opacity: 0.7 } : undefined}>
    {issues.length > 0 && <Section title={t('insp.issues')} badge={<Chip tone={issues.some((i) => i.severity === 'error') ? 'danger' : 'warn'}>{issues.length}</Chip>}>
      <ul className="flex flex-col gap-1">{issues.map((i, k) => <li key={k} className="flex gap-1.5 items-start text-[12px]"><Icon n="alert" s={13} className="mt-0.5 shrink-0" /><span style={{ color: i.severity === 'error' ? 'var(--danger)' : 'var(--warn)' }}>{t(i.key, { ...(i.params ?? {}), field: 'field' in i && i.field ? (visibleFields(p).find((f) => f.key === i.field)?.label[lang] ?? i.field) : '' })}</span></li>)}</ul></Section>}
    <Section title={t('insp.selection')}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]"><span className="label">{t('insp.x')}</span><span className="num ltr text-end">{sel.x.toFixed(2)} m</span>
        {eHere && <><span className="label">{t('insp.eHere')}</span><span className="num ltr text-end">{eHere.avg.toFixed(1)} lx</span><span className="label">{t('insp.eHereMin')}</span><span className="num ltr text-end">{eHere.min.toFixed(1)} lx</span></>}
        {q && <><span className="label">{t('insp.lum')}</span><span className="num ltr text-end">#{(sel.lum ?? 0) + 1} · {t('insp.row')} {q.row + 1}</span><span className="label">x / y / z</span><span className="num ltr text-end">{q.x.toFixed(2)} / {q.y.toFixed(2)} / {q.z.toFixed(2)} m</span></>}</div>
      {!q && <p className="label mt-1">{t('insp.selHelp')}</p>}
    </Section>
    <Section title={t('insp.layout')}>
      <div className="py-1.5"><label className="label block mb-1" htmlFor="lay-lum">{t('insp.luminaire')}</label>
        <select id="lay-lum" className="input" value={lay.luminaireId} onChange={(e) => act.setLayout({ luminaireId: e.target.value }, 'lum')}>{p.luminaires.map((l) => <option key={l.id} value={l.id}>{l.model}{l.photometry ? '' : ' ⚠'}</option>)}</select>
        {lum && <div className="flex gap-1 mt-1 flex-wrap"><Chip tone={lum.photometry?.quality === 'verified' ? 'ok' : lum.photometry ? 'warn' : 'danger'}>{t('phot.' + (lum.photometry?.quality ?? 'none'))}</Chip><Chip>{lum.power} W</Chip>{lum.photometry && <Chip>{Math.round(lum.photometry.flux)} lm</Chip>}</div>}</div>
      <div className="py-1.5"><label className="label block mb-1" htmlFor="lay-arr">{t('insp.arrangement')}</label>
        <select id="lay-arr" className="input" value={lay.arrangement} onChange={(e) => act.setLayout({ arrangement: e.target.value as Arrangement }, 'arr')}>{type.arrangements.map((a) => <option key={a} value={a}>{t('arr.' + a)}</option>)}</select></div>
      {lf('count', lay.count, (n) => act.setLayout({ count: Math.max(1, Math.round(n)) }, 'count'))}
      <div className="py-1.5"><span className="label block mb-1">{t('insp.spacingMode')}</span><Seg value={lay.spacingMode} onChange={(v) => act.setLayout({ spacingMode: v })} items={[{ id: 'auto', label: t('insp.auto') }, { id: 'manual', label: t('insp.manual') }]} />
        <div className="label mt-1">{lay.spacingMode === 'auto' ? t('insp.spacingNow', { s: (geom.L / Math.max(1, lay.count)).toFixed(2) }) : ''}</div></div>
      {lay.spacingMode === 'manual' && <>{lf('spacing', lay.spacing, (n) => act.setLayout({ spacing: n }, 'sp'))}{lf('startOffset', lay.startOffset, (n) => act.setLayout({ startOffset: n }, 'so'))}</>}
      {lf('wallInset', lay.wallInset, (n) => act.setLayout({ wallInset: n }, 'wi'))}
      <div className="py-1.5"><span className="label block mb-1">{t('insp.mount')}</span><Seg value={lay.mountHeight === null ? 'auto' : 'fixed'} onChange={(v) => act.setLayout({ mountHeight: v === 'auto' ? null : Math.max(1, +(Math.min(...pos.map((q2) => q2.z), geom.maxZ - 0.3)).toFixed(2)) })} items={[{ id: 'auto', label: t('insp.followCeiling') }, { id: 'fixed', label: t('insp.fixed') }]} /></div>
      {lay.mountHeight !== null && lf('mountHeight', lay.mountHeight, (n) => act.setLayout({ mountHeight: n }, 'mh'))}
      <div className="flex items-center gap-4 py-1.5"><label className="flex items-center gap-1.5"><input type="checkbox" checked={lay.staggered} onChange={(e) => act.setLayout({ staggered: e.target.checked })} />{t('insp.staggered')}</label>
        <label className="flex items-center gap-1.5">{t('insp.yaw')}<select className="input input-sm w-16" value={lay.yaw} onChange={(e) => act.setLayout({ yaw: Number(e.target.value) })}><option value={0}>0°</option><option value={90}>90°</option></select></label></div>
      <p className="label">{t('insp.total', { n: pos.length })}</p>
    </Section>
    <Section title={t('insp.geometry')}>
      {geomFields.map((f) => <FieldRow key={f.key} def={f} value={p.inputs[f.key]} prov={p.prov[f.key]} unit={unit} lang={lang} onChange={(v) => act.update((x) => setInput(x, f.key, v), { coalesce: 'in-' + f.key })} onReset={() => act.update((x) => resetInput(x, f.key))} />)}
    </Section>
  </aside>;
}
void tr;
