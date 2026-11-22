import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent as RPE, WheelEvent as RWE } from 'react';
import { useT } from '../i18n';
import type { FieldDef } from '../domain/fields';
import type { Prov, Photometry } from '../domain/types';
import { fmt, fromDisplay, toDisplay, unitLabel } from '../lib/units';
import type { UnitSystem } from '../lib/units';
import { act, useS } from './store';
import { useTheme } from './theme';

const P: Record<string, string> = {
  plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', copy: 'M9 9h11v11H9zM5 15V4h11', download: 'M12 4v12m0 0l-4-4m4 4l4-4M5 20h14', upload: 'M12 16V4m0 0l-4 4m4-4l4 4M5 20h14',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3', check: 'M5 13l4 4L19 7', alert: 'M12 4l9 16H3zM12 10v4M12 17v.5', info: 'M12 11v6M12 7.5v.5M12 3a9 9 0 100 18 9 9 0 000-18z',
  x: 'M6 6l12 12M18 6L6 18', chevron: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6', cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5', plan: 'M3 6h18v12H3zM3 12h18', section: 'M4 20V11a8 8 0 0116 0v9zM4 20h16',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16', play: 'M7 4l13 8-13 8z', folder: 'M3 6h6l2 2h10v11H3z', save: 'M5 4h12l3 3v13H5zM8 4v5h8V4M8 20v-6h8v6', book: 'M5 4h13v16H5zM5 17h13M9 8h5',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z', chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6', layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5', settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .5-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19 7 21l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z', file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3', compare: 'M4 5h7v14H4zM13 5h7v14h-7z', history: 'M4 12a8 8 0 108-8M4 4v5h5M12 8v5l3 2', globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  refresh: 'M20 12a8 8 0 10-3 6.2M20 5v5h-5', sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4', ruler: 'M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2', wand: 'M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z',
  star: 'M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z', menu: 'M4 7h16M4 12h16M4 17h16', cam: 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 11.5a3 3 0 100 6 3 3 0 000-6z', target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 100 6 3 3 0 000-6z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z', home: 'M4 11l8-7 8 7M6 10v10h12V10',
};
export function Icon({ n, s = 16, className = '' }: { n: string; s?: number; className?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={P[n] ?? ''} /></svg>;
}
type BtnP = { variant?: 'primary' | 'danger' | 'ghost' | 'ink'; sm?: boolean; icon?: string; iconOnly?: boolean; children?: ReactNode; title?: string; onClick?: () => void; disabled?: boolean; className?: string; type?: 'button' | 'submit'; pressed?: boolean };
export function Btn({ variant, sm, icon, iconOnly, children, title, onClick, disabled, className = '', type = 'button', pressed }: BtnP) {
  const cls = ['btn', variant ? 'btn-' + variant : '', sm ? 'btn-sm' : '', iconOnly ? 'btn-icon' : '', className].join(' ');
  return <button type={type} className={cls} title={title} aria-label={iconOnly ? title : undefined} aria-pressed={pressed} onClick={onClick} disabled={disabled}>{icon && <Icon n={icon} s={sm ? 14 : 16} />}{children}</button>;
}
export function Chip({ tone = '', children, title }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' | ''; children: ReactNode; title?: string }) { return <span className={'chip ' + (tone ? 'chip-' + tone : '')} title={title}>{children}</span>; }
export function Panel({ title, actions, children, className = '', bodyClass = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return <section className={'panel flex flex-col min-h-0 ' + className}>{title !== undefined && <header className="panel-h"><span className="flex-1 truncate">{title}</span>{actions}</header>}<div className={'min-h-0 ' + bodyClass}>{children}</div></section>;
}
export function Section({ title, children, open: o = true, badge }: { title: ReactNode; children: ReactNode; open?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(o);
  return <div><button className="sec-h" aria-expanded={open} onClick={() => setOpen(!open)}><span className="flex items-center gap-2">{title}{badge}</span><Icon n="down" s={14} className={open ? '' : '-rotate-90 rtl:rotate-90'} /></button>{open && <div className="px-3 py-2">{children}</div>}</div>;
}
export function Empty({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center text-center gap-2 py-12 px-6"><div className="w-11 h-11 rounded-full bg-[var(--surface-3)] grid place-items-center text-[var(--muted)]"><Icon n={icon} s={20} /></div><div className="font-semibold">{title}</div>{body && <p className="max-w-md text-[var(--muted)]">{body}</p>}{children}</div>;
}
export function Banner({ tone, icon = 'info', children, actions }: { tone: 'ok' | 'warn' | 'danger' | 'info'; icon?: string; children: ReactNode; actions?: ReactNode }) {
  const c = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)' }[tone], bg = { ok: 'var(--ok-soft)', warn: 'var(--warn-soft)', danger: 'var(--danger-soft)', info: 'var(--info-soft)' }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className="flex items-start gap-2 rounded-md px-3 py-2" style={{ background: bg, color: c }}><Icon n={icon} className="mt-0.5 shrink-0" /><div className="flex-1 text-[var(--text)]">{children}</div>{actions}</div>;
}
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; icon?: string }[] }) {
  return <div role="tablist" className="flex border-b border-[var(--border)]">{items.map((i) => <button key={i.id} role="tab" className="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)}>{i.icon && <Icon n={i.icon} s={14} />}{i.label}</button>)}</div>;
}
export function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; icon?: string; title?: string }[]; label?: string }) {
  return <div className="seg" role="group" aria-label={label}>{items.map((i) => <button key={i.id} aria-pressed={value === i.id} title={i.title} onClick={() => onChange(i.id)}>{i.icon && <Icon n={i.icon} s={14} />}{i.label}</button>)}</div>;
}

export function DialogHost() {
  const d = useS((s) => s.dialog); const t = useT(); const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (d) { ref.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') d.resolve(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); } }, [d]);
  if (!d) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) d.resolve(false); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" className="pop panel w-[420px] max-w-[92vw] p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <h2 id="dlg-t" className="h-title mb-2">{d.title}</h2><p className="text-[var(--muted)] mb-5 whitespace-pre-line">{d.body}</p>
      <div className="flex justify-end gap-2"><Btn onClick={() => d.resolve(false)}>{t('common.cancel')}</Btn><button ref={ref} className={'btn ' + (d.tone === 'danger' ? 'btn-danger' : 'btn-primary')} onClick={() => d.resolve(true)}>{d.confirm}</button></div>
    </div></div>;
}
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className={'pop panel flex flex-col max-h-[90vh] ' + (wide ? 'w-[720px]' : 'w-[480px]') + ' max-w-full'} style={{ boxShadow: 'var(--shadow-lg)' }}>
      <header className="panel-h"><span className="flex-1 h-title">{title}</span><Btn variant="ghost" sm iconOnly icon="x" title="Close" onClick={onClose} /></header><div className="overflow-auto p-4">{children}</div></div></div>;
}
export function ToastHost() {
  const ts = useS((s) => s.toasts);
  return <div className="fixed bottom-10 end-4 z-[60] flex flex-col gap-2" aria-live="polite">{ts.map((x) => <div key={x.id} className="pop panel px-3 py-2 flex items-center gap-2 max-w-sm" style={{ boxShadow: 'var(--shadow)', borderInlineStart: `3px solid var(--${x.tone === 'ok' ? 'ok' : x.tone})` }}><Icon n={x.tone === 'ok' ? 'check' : x.tone === 'danger' ? 'alert' : 'info'} />{x.text}</div>)}</div>;
}

const provChip = (p: Prov | undefined, t: (k: string) => string) => (p === 'default' ? <Chip title={t('prov.defaultHelp')}>{t('prov.default')}</Chip> : p === 'estimate' ? <Chip tone="warn" title={t('prov.estimateHelp')}>{t('prov.estimate')}</Chip> : <Chip tone="accent">{t('prov.user')}</Chip>);
export function FieldRow({ def, value, prov, onChange, onReset, unit, lang, error }: { def: FieldDef; value: number | string; prov?: Prov | null; onChange: (v: number | string) => void; onReset?: () => void; unit: UnitSystem; lang: 'en' | 'fa'; error?: string }) {
  const t = useT(); const [open, setOpen] = useState(false);
  const isNum = def.type === 'number';
  const shown = isNum && typeof value === 'number' && Number.isFinite(value) ? +toDisplay(def.uk ?? 'none', value, unit).toFixed(4) : '';
  const [txt, setTxt] = useState(String(shown)); const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(String(shown)); setBad(false); }, [shown]);
  const commit = () => { const v = Number(txt.replace(',', '.')); if (txt.trim() === '' || !Number.isFinite(v)) { setBad(true); return; } setBad(false); const c = fromDisplay(def.uk ?? 'none', v, unit); if (c !== value) onChange(def.key === 'lanes' ? Math.round(c) : c); };
  const id = 'f-' + def.key; const u = def.unit ? unitLabel(def.uk ?? 'none', unit, def.unit) : '';
  const err = bad ? t('issue.number') : error;
  return <div className="py-1.5">
    <div className="flex items-center gap-1.5 mb-1"><label htmlFor={id} className="label flex-1">{def.label[lang]}{def.recorded && <span className="ms-1 text-[var(--faint)]" title={t('field.recorded')}>•</span>}</label>{prov !== null && provChip(prov ?? undefined, t)}
      <button className="text-[var(--faint)] hover:text-[var(--text)]" aria-expanded={open} aria-label={t('field.why')} title={t('field.why')} onClick={() => setOpen(!open)}><Icon n="info" s={14} /></button></div>
    <div className="flex items-center gap-1.5">
      {isNum ? <input id={id} className="input num ltr text-end" inputMode="decimal" value={txt} aria-invalid={!!err} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTxt(String(shown)); setBad(false); } }} />
        : <select id={id} className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>{def.options!.map((o) => <option key={o.v} value={o.v}>{o.label[lang]}</option>)}</select>}
      {u && <span className="label w-12 shrink-0 ltr">{u}</span>}
      {prov === 'user' && onReset && <Btn variant="ghost" sm iconOnly icon="refresh" title={t('field.reset')} onClick={onReset} />}
    </div>
    {err && <div className="text-[11.5px] mt-1" style={{ color: 'var(--danger)' }} role="alert">{err}{def.min !== undefined && !bad ? '' : ''}</div>}
    {open && <div className="mt-1 text-[11.5px] text-[var(--muted)] bg-[var(--surface-2)] rounded p-2">{def.why[lang]}{def.min !== undefined && <div className="mt-1 ltr">{t('field.range')}: {fmt(toDisplay(def.uk ?? 'none', def.min, unit), 3)} – {fmt(toDisplay(def.uk ?? 'none', def.max ?? Infinity, unit), 3)} {u}</div>}</div>}
  </div>;
}
export function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSz({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, [ref]);
  return sz;
}
export interface CvHandlers { onDown?: (x: number, y: number, e: RPE) => void; onMove?: (x: number, y: number, e: RPE) => void; onUp?: (x: number, y: number, e: RPE) => void; onWheel?: (x: number, y: number, dy: number) => void; onDouble?: () => void }
export function CanvasView({ draw, deps, label, handlers, cursor }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean) => void; deps: unknown[]; label: string; handlers?: CvHandlers; cursor?: string }) {
  const theme = useTheme();
  const wrap = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null); const { w, h } = useSize(wrap);
  useEffect(() => { const c = cv.current; if (!c || w < 4 || h < 4) return; const dpr = window.devicePixelRatio || 1; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(ctx, w, h, theme === 'dark'); }, [w, h, theme, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: { clientX: number; clientY: number }): [number, number] => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return <div ref={wrap} className="relative w-full h-full overflow-hidden"><canvas ref={cv} role="img" aria-label={label} tabIndex={0} style={{ width: w, height: h, touchAction: 'none', cursor: cursor ?? 'crosshair', display: 'block' }}
    onPointerDown={(e) => { cv.current!.setPointerCapture(e.pointerId); handlers?.onDown?.(...pos(e), e); }} onPointerMove={(e) => handlers?.onMove?.(...pos(e), e)} onPointerUp={(e) => handlers?.onUp?.(...pos(e), e)}
    onWheel={(e: RWE) => { if (handlers?.onWheel) { const [x, y] = pos(e); handlers.onWheel(x, y, e.deltaY); } }} onDoubleClick={() => handlers?.onDouble?.()} /></div>;
}

// ───────── charts (SVG)
export function BarChart({ items, unit, refLine, refLabel, fmtD = 1 }: { items: { label: string; value: number; color?: string }[]; unit: string; refLine?: number; refLabel?: string; fmtD?: number }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value), refLine ?? 0);
  return <div className="flex flex-col gap-1.5" role="img" aria-label={unit}>{items.map((i, k) => <div key={k} className="flex items-center gap-2"><div className="w-28 truncate text-[12px] text-[var(--muted)]" title={i.label}>{i.label}</div>
    <div className="relative flex-1 h-5 bg-[var(--surface-3)] rounded-sm"><div className="h-full rounded-sm" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? 'var(--accent)' }} />{refLine !== undefined && <div className="absolute top-[-2px] bottom-[-2px] w-0.5" style={{ insetInlineStart: `${(refLine / max) * 100}%`, background: 'var(--danger)' }} title={refLabel} />}</div>
    <div className="w-20 text-end num ltr text-[12px]">{fmt(i.value, fmtD)}</div></div>)}<div className="text-[11px] text-[var(--faint)] flex justify-between"><span className="ltr">{unit}</span>{refLine !== undefined && <span style={{ color: 'var(--danger)' }}>▍ {refLabel}</span>}</div></div>;
}
export function LineChart({ series, hlines = [], vline, height = 150, xUnit, yUnit, onClickX }: { series: { color: string; pts: [number, number][]; name?: string }[]; hlines?: { y: number; label: string; color: string }[]; vline?: number; height?: number; xUnit: string; yUnit: string; onClickX?: (x: number) => void }) {
  const ref = useRef<HTMLDivElement>(null); const { w } = useSize(ref);
  const all = series.flatMap((s) => s.pts); const xs = all.map((p) => p[0]); const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 1);
  const ymax = Math.max(1e-9, ...all.map((p) => p[1]), ...hlines.map((h) => h.y)) * 1.1;
  const pl = 40, pr = 8, pt = 8, pb = 22; const X = (x: number) => pl + ((x - x0) / (x1 - x0 || 1)) * (w - pl - pr), Y = (y: number) => pt + (1 - y / ymax) * (height - pt - pb);
  return <div ref={ref} className="w-full"><svg width={w} height={height} role="img" aria-label={yUnit} onClick={(e) => { if (!onClickX) return; const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const x = x0 + ((e.clientX - r.left - pl) / (w - pl - pr)) * (x1 - x0); onClickX(Math.min(x1, Math.max(x0, x))); }} style={{ cursor: onClickX ? 'crosshair' : 'default', direction: 'ltr' }}>
    {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={pl} x2={w - pr} y1={Y(ymax * f)} y2={Y(ymax * f)} stroke="var(--surface-3)" /><text x={pl - 4} y={Y(ymax * f) + 3} textAnchor="end" fontSize="10" fill="var(--faint)">{fmt(ymax * f, ymax < 10 ? 1 : 0)}</text></g>)}
    {[0, 0.5, 1].map((f) => <text key={f} x={X(x0 + (x1 - x0) * f)} y={height - 6} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fontSize="10" fill="var(--faint)">{fmt(x0 + (x1 - x0) * f, 0)}{f === 1 ? ' ' + xUnit : ''}</text>)}
    {hlines.map((h, i) => <g key={i}><line x1={pl} x2={w - pr} y1={Y(h.y)} y2={Y(h.y)} stroke={h.color} strokeDasharray="4 3" /><text x={w - pr} y={Y(h.y) - 3} textAnchor="end" fontSize="10" fill={h.color}>{h.label}</text></g>)}
    {series.map((s, i) => <polyline key={i} fill="none" stroke={s.color} strokeWidth="1.6" points={s.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} />)}
    {vline !== undefined && <line x1={X(vline)} x2={X(vline)} y1={pt} y2={height - pb} stroke="var(--accent)" strokeWidth="2" />}
  </svg></div>;
}
export function PolarPlot({ ph, size = 230 }: { ph: Photometry; size?: number }) {
  const c = size / 2, R = c - 22; const peak = Math.max(...ph.cd.map((r) => Math.max(...r))) || 1;
  const cut = (cDeg: number) => { // table lookup by nearest plane
    const idx = ph.C.reduce((b, v, i) => (Math.abs(v - cDeg) < Math.abs(ph.C[b] - cDeg) ? i : b), 0); return ph.cd[idx];
  };
  const path = (cA: number, cB: number) => { const a = cut(cA), b = cut(cB); const pts: string[] = [];
    ph.G.forEach((g, j) => { const r = (a[j] / peak) * R, th = (g * Math.PI) / 180; pts.push(`${c + r * Math.sin(th)},${c + r * Math.cos(th)}`); });
    [...ph.G].reverse().forEach((g) => { const j = ph.G.indexOf(g); const r = (b[j] / peak) * R, th = (g * Math.PI) / 180; pts.push(`${c - r * Math.sin(th)},${c + r * Math.cos(th)}`); }); return pts.join(' '); };
  return <svg width={size} height={size} role="img" aria-label="polar" style={{ direction: 'ltr' }}>{[0.25, 0.5, 0.75, 1].map((f) => <circle key={f} cx={c} cy={c} r={R * f} fill="none" stroke="var(--border)" />)}
    <line x1={c} x2={c} y1={c - R} y2={c + R} stroke="var(--border)" /><line x1={c - R} x2={c + R} y1={c} y2={c} stroke="var(--border)" />
    <polyline points={path(0, 180)} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.8" /><polyline points={path(90, 270)} fill="none" stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="5 3" />
    <text x={c} y={size - 4} textAnchor="middle" fontSize="10" fill="var(--faint)">0°</text><text x={c + R + 2} y={c - 3} textAnchor="end" fontSize="10" fill="var(--faint)">90°</text><text x={6} y={12} fontSize="10" fill="var(--faint)">{Math.round(peak)} cd</text></svg>;
}
export function verdictChip(v: string, t: (k: string) => string) {
  const tone = v === 'pass' ? 'ok' : v === 'fail' ? 'danger' : v === 'unsupported' ? '' : v === 'none' ? '' : 'warn';
  const icon = v === 'pass' ? 'check' : v === 'fail' ? 'x' : 'alert';
  return <Chip tone={tone as 'ok'}><Icon n={icon} s={11} />{t('verdict.' + v)}</Chip>;
}
export function download(name: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });
export { act };
