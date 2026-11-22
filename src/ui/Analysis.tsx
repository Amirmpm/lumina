import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { Banner, BarChart, Btn, CanvasView, Chip, Empty, Icon, LineChart, Panel, Section, verdictChip } from './kit';
import { useModel } from './model';
import { act, useS } from './store';
import { drawColorbar, drawPlan, planFit } from './draw';
import { evaluate } from '../calc/evaluate';
import type { Evaluation } from '../calc/evaluate';
import { standardById } from '../standards/registry';
import { fmt, toDisplay, unitLabel } from '../lib/units';
import { FIELDS, TUNNEL_TYPES } from '../domain/fields';
import type { Arrangement, Layout } from '../domain/types';
import type { Candidate } from '../optimize/optimizer';
import { activeScenario } from '../domain/project';

const Row = ({ k, v, u }: { k: string; v: React.ReactNode; u?: string }) => <tr><td className="label">{k}</td><td className="n ltr">{v}{u ? <span className="text-[var(--faint)]"> {u}</span> : null}</td></tr>;

export function Results() {
  const m = useModel(); const t = useT(); const lang = useS((s) => s.lang); const unit = useS((s) => s.unit); const sel = useS((s) => s.sel); const review = useS((s) => s.review);
  const { p, sc, lum, ev, status, issues } = m; const std = standardById(p.standardId);
  const lx = (v: number) => fmt(toDisplay('illuminance', v, unit), 1); const lxu = unitLabel('illuminance', unit, 'lx');
  const profile = useMemo(() => { if (!ev?.grid) return []; const g = ev.grid; return g.xs.map((x, i) => { let s = 0; for (let j = 0; j < g.ny; j++) s += g.E[i * g.ny + j]; return [x, (s / g.ny) * ev.mf] as [number, number]; }); }, [ev]);
  const eReq = ev?.std.results.find((r) => r.metric === 'eAvgM' && r.value !== undefined);
  const bar = <div className="flex items-center gap-2">{status === 'fresh' ? <Chip tone="ok"><Icon n="check" s={11} />{t('calc.fresh')}</Chip> : status === 'stale' ? <Chip tone="warn">{t('calc.stale')}</Chip> : status === 'blocked' ? <Chip tone="danger">{t('calc.blocked')}</Chip> : <Chip>{t('calc.none')}</Chip>}<Btn variant="primary" icon="play" disabled={status === 'blocked' || review} onClick={() => act.calculate()}>{t('calc.run')} <span className="kbd">Ctrl+↵</span></Btn></div>;
  if (!ev) return <div className="h-full overflow-auto p-4"><div className="flex items-center gap-3 mb-3"><h1 className="h-title flex-1">{t('res.title')} — {sc.name}</h1>{bar}</div>
    {status === 'blocked' ? <Panel title={t('res.blockers')} bodyClass="p-3"><ul className="list-disc ps-5">{issues.filter((i) => i.severity === 'error').map((i, k) => <li key={k} style={{ color: 'var(--danger)' }}>{t(i.key, { ...(i.params ?? {}), field: 'field' in i && i.field ? (FIELDS.find((f) => f.key === i.field)?.label[lang] ?? i.field) : '' })}</li>)}</ul><p className="label mt-2">{t('res.blockersHelp')}</p></Panel>
      : <Empty icon="chart" title={status === 'stale' ? t('calc.staleHelp') : t('calc.noneHelp')}><Btn variant="primary" icon="play" disabled={review} onClick={() => act.calculate()}>{t('calc.run')}</Btn></Empty>}</div>;
  const E = ev.initial!, M = ev.maintained!, ec = ev.econ!, el = ev.elec!, lm = ev.lumen!;
  const critKeys = ['length', 'width', 'shape', 'workPlane', 'gridSpacing', 'llmf', 'lmf', 'uf', 'hoursYear', 'energyPrice', 'years', 'discount'];
  return <div className="h-full flex min-h-0">
    <div className="flex-1 min-w-0 overflow-auto p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3"><h1 className="h-title flex-1">{t('res.title')} — {sc.name} <span className="label ltr">#{ev.hash.slice(0, 7)}</span></h1>{bar}</div>
      {lum?.photometry?.quality !== 'verified' && <Banner tone="warn" icon="alert">{t('res.photWarn', { q: t('phot.' + (lum?.photometry?.quality ?? 'none')) })}</Banner>}
      {ev.std.unsupported > 0 && <Banner tone="warn" icon="alert">{t('res.unsupportedWarn', { n: ev.std.unsupported })}</Banner>}
      {ev.grid?.coarsened && <Banner tone="info" icon="info">{t('res.coarse')}</Banner>}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <Panel title={t('res.heat')} className="h-[300px]"><div className="h-[262px]"><CanvasView label={t('res.heat')} deps={[ev, sel.x]} draw={(ctx, w, h) => { const tx = planFit(w, h, ev.geom, 22); drawPlan(ctx, w, h, tx, ev.geom, ev.positions, ev.lum, ev.grid, E.max * ev.mf, ev.mf, sel.x, null, { heat: true, lums: true }); drawColorbar(ctx, w - 190, 8, 170, 8, 0, E.max * ev.mf, lxu); }} /></div></Panel>
        <Panel title={t('res.metrics')} bodyClass="overflow-auto"><table className="tbl"><tbody>
          <Row k={t('m.eAvg')} v={lx(E.avg)} u={lxu} /><Row k={t('m.eMin')} v={lx(E.min)} u={lxu} /><Row k={t('m.eMax')} v={lx(E.max)} u={lxu} />
          <Row k={t('m.eAvgM')} v={<b>{lx(M.avg)}</b>} u={lxu} /><Row k={t('m.eMinM')} v={<b>{lx(M.min)}</b>} u={lxu} /><Row k={t('m.u0')} v={fmt(E.u0, 3)} /><Row k={t('m.ud')} v={fmt(E.ud, 3)} />
          <Row k={t('m.n')} v={ev.nTotal} /><Row k={t('m.kW')} v={fmt(ec.kW, 2)} u="kW" /><Row k={t('m.kWh')} v={fmt(ec.kWhYear, 0)} u="kWh/yr" /><Row k={t('m.initial')} v={fmt(ec.initial, 0)} u="cur" /><Row k={t('m.lcc')} v={<b>{fmt(ec.lcc, 0)}</b>} u="cur" />
        </tbody></table></Panel>
      </div>
      <Panel title={t('res.profile')} bodyClass="p-3"><LineChart xUnit="m" yUnit={lxu} series={[{ color: 'var(--accent)', pts: profile.map(([x, y]) => [x, toDisplay('illuminance', y, unit)] as [number, number]) }]} hlines={eReq && eReq.value ? [{ y: toDisplay('illuminance', eReq.value, unit), label: t('res.req'), color: 'var(--danger)' }] : []} vline={sel.x} onClickX={(x) => act.select({ x, lum: null })} /><p className="label mt-1">{t('res.profileHelp')}</p></Panel>
      {ev.walls && <Panel title={t('res.walls')} bodyClass="overflow-auto"><table className="tbl"><thead><tr><th /><th className="n">{t('m.avg')}</th><th className="n">{t('m.min')}</th><th className="n">{t('m.max')}</th></tr></thead><tbody>{(['left', 'right'] as const).map((s) => <tr key={s}><td>{t('res.wall.' + s)}</td><td className="n">{lx(ev.walls![s].avg * ev.mf)}</td><td className="n">{lx(ev.walls![s].min * ev.mf)}</td><td className="n">{lx(ev.walls![s].max * ev.mf)}</td></tr>)}</tbody></table><p className="label p-2">{t('res.wallsHelp', { h: Math.min(2, ev.geom.wallVertical).toFixed(1) })}</p></Panel>}
    </div>
    <aside className="w-[430px] shrink-0 border-s border-[var(--border)] bg-[var(--surface)] overflow-y-auto">
      <Section title={t('res.criteria')} badge={verdictChip(ev.std.verdict, t)}>
        <div className="font-medium">{std.name[lang]}</div><div className="label ltr mb-2">{std.edition} · {t('impl.' + std.status)}</div>
        {ev.std.results.length === 0 ? <Banner tone="warn" icon="alert">{t('res.noCriteria')}</Banner> : <table className="tbl"><thead><tr><th>{t('res.criterion')}</th><th className="n">{t('res.req')}</th><th className="n">{t('res.actual')}</th><th /></tr></thead><tbody>
          {ev.std.results.map((r) => <tr key={r.id}><td>{r.label[lang]}<div className="label ltr">{r.ref}</div>{r.origin === 'placeholder' && <Chip tone="warn" title={t('std.placeholderHelp')}>{t('std.placeholder')}</Chip>}{r.origin === 'normative-unverified' && <Chip tone="info" title={t('std.verifyHelp')}>{t('std.verify')}</Chip>}</td><td className="n">{r.value !== undefined ? (r.unit ? lx(r.value) : fmt(r.value, 2)) : '—'}</td><td className="n">{r.actual !== undefined ? (r.unit ? lx(r.actual) : fmt(r.actual, 3)) : '—'}</td><td>{verdictChip(r.verdict, t)}</td></tr>)}</tbody></table>}
        <p className="label mt-2">{std.limitations[lang]}</p>
      </Section>
      <Section title={t('res.basis')} open>
        <ul className="list-disc ps-5 text-[12.5px] flex flex-col gap-1"><li>{t('basis.method')}</li><li>{t('basis.directOnly')}</li><li>{t('basis.grid', { nx: ev.grid!.nx, ny: ev.grid!.ny, dx: ev.grid!.dx.toFixed(2), dy: ev.grid!.dy.toFixed(2) })}</li><li>{t('basis.convention')}</li><li>{t('basis.noTemp')}</li><li>{t('basis.cutoff')}</li><li>{t('basis.noLum')}</li></ul>
        <div className="mt-2 font-mono text-[12px] bg-[var(--surface-2)] rounded p-2 ltr leading-6">E = I(C,γ)·cosθ / d²<br />E<sub>m</sub> = E · LLMF · LMF = E · {fmt(p.inputs.llmf as number, 3)} · {fmt(p.inputs.lmf as number, 3)} = E · {fmt(ev.mf, 4)}<br />U0 = E<sub>min</sub>/E<sub>avg</sub>, Ud = E<sub>min</sub>/E<sub>max</sub></div>
      </Section>
      <Section title={t('res.lumen')} open={false}>
        <table className="tbl"><tbody><Row k="N · Φ" v={`${lm.N} × ${fmt(lm.flux, 0)}`} u="lm" /><Row k={t('res.uf')} v={fmt(lm.UF, 2)} /><Row k="A" v={fmt(lm.area, 1)} u="m²" /><Row k={t('res.lumenE')} v={lx(lm.E)} u={lxu} /><Row k={t('res.pbpE')} v={lx(M.avg)} u={lxu} /><Row k={t('res.directUf')} v={fmt(lm.directUtilance, 3)} /></tbody></table><p className="label mt-1">{t('res.lumenHelp')}</p>
      </Section>
      <Section title={t('res.inputs')} open={false}>
        <table className="tbl"><tbody>{critKeys.filter((k) => k in p.inputs).map((k) => { const f = FIELDS.find((x) => x.key === k)!; const v = p.inputs[k]; return <tr key={k}><td className="label">{f.label[lang]}</td><td className="n ltr">{typeof v === 'number' ? fmt(toDisplay(f.uk ?? 'none', v, unit), 3) : String(v)} {f.unit ? unitLabel(f.uk ?? 'none', unit, f.unit) : ''}</td><td><Chip tone={p.prov[k] === 'user' ? 'accent' : p.prov[k] === 'estimate' ? 'warn' : ''}>{t('prov.' + p.prov[k])}</Chip></td></tr>; })}</tbody></table>
      </Section>
      <Section title={t('res.energy')} open={false}>
        <table className="tbl"><tbody><Row k={t('m.initial')} v={fmt(ec.initial, 0)} u="cur" /><Row k={t('res.energyYear')} v={fmt(ec.energyCostYear, 0)} u="cur/yr" /><Row k={t('res.maintYear')} v={fmt(ec.maintYear, 0)} u="cur/yr" /><Row k={t('res.replace')} v={fmt(ec.replacementNpv, 0)} u="cur" /><Row k={t('m.lcc')} v={fmt(ec.lcc, 0)} u="cur" /></tbody></table>
        {ec.priceEstimated && <Banner tone="warn" icon="alert">{t('res.priceEst')}</Banner>}<ul className="label list-disc ps-5 mt-1">{ec.assumptions.map((a) => <li key={a} className="ltr">{a}</li>)}</ul>
        <div className="mt-2 font-medium">{t('res.elec')}</div><table className="tbl"><tbody><Row k={t('res.current')} v={fmt(el.current, 1)} u="A" /><Row k={t('res.section')} v={fmt(el.sectionMm2, 1)} u="mm²" /><Row k={t('res.vd')} v={<span style={{ color: el.ok ? 'var(--ok)' : 'var(--danger)' }}>{fmt(el.vdPct, 2)}</span>} u="%" /></tbody></table><p className="label">{t('res.elecHelp')}</p>
      </Section>
      {p.hazard.required && <Section title={t('ex.title')}><Banner tone={ev.ex.status === 'incompatible' ? 'danger' : 'warn'} icon="alert">{t('ex.' + ev.ex.status)}{ev.ex.reasons.length ? ': ' + ev.ex.reasons.map((r) => t(r)).join('; ') : ''}<div className="mt-1 text-[12px]">{t('ex.disclaimer')}</div></Banner></Section>}
      {ev.warnings.length > 0 && <Section title={t('insp.issues')}><ul className="list-disc ps-5">{ev.warnings.map((w, i) => <li key={i} style={{ color: 'var(--warn)' }}>{t(w.key, w.params as Record<string, string | number>)}</li>)}</ul></Section>}
    </aside>
  </div>;
}

// ───────────────────────────────────────── Optimize
export function Optimize() {
  const t = useT(); const p = useS((s) => s.project)!; const r = useS((s) => s.opt); const running = useS((s) => s.optRunning); const review = useS((s) => s.review); const lang = useS((s) => s.lang);
  const [selId, setSelId] = useState<string | null>(null);
  const o = p.opt; const type = TUNNEL_TYPES.find((x) => x.id === p.tunnelType)!; const std = standardById(p.standardId);
  const crit = std.criteria(p).filter((c) => c.status !== 'unsupported' && c.metric);
  const setO = (patch: Partial<typeof o>) => act.update((x) => ({ ...x, opt: { ...x.opt, ...patch } }), { coalesce: 'opt' });
  const wk: [keyof typeof o.weights, string][] = [['lcc', 'obj.lcc'], ['energy', 'obj.energy'], ['count', 'obj.count'], ['uniformity', 'obj.uniformity'], ['maintenance', 'obj.maintenance']];
  const shown = r?.candidates ?? []; const cand = shown.find((c) => c.id === selId) ?? shown[0];
  const stale = false; void stale;
  const save = (c: Candidate, toDesign: boolean) => { const id = act.addScenario(`${t('opt.scenarioName')} #${c.rank ?? '–'} ${c.lumModel}`, c.layout, 'optimizer'); void id; act.toast(t('opt.saved')); if (toDesign) act.setStage('design'); };
  return <div className="h-full flex min-h-0">
    <aside className="w-[320px] shrink-0 border-e border-[var(--border)] bg-[var(--surface)] overflow-y-auto">
      <Section title={t('opt.constraints')}>
        <Banner tone="info" icon="lock">{t('opt.hardHelp')}</Banner>
        <ul className="mt-2 text-[12.5px] list-disc ps-5">{crit.length ? crit.map((c) => <li key={c.id}>{c.label[lang]} ≥ {fmt(c.value, 2)} {c.unit ?? ''}{c.origin === 'placeholder' ? ' (' + t('std.placeholder') + ')' : ''}</li>) : <li style={{ color: 'var(--danger)' }}>{t('opt.noCriteria')}</li>}{p.hazard.required && <li>{t('opt.exHard')}</li>}<li>{t('opt.mountHard')}</li></ul>
        <div className="grid grid-cols-2 gap-2 mt-3"><div><label className="label block mb-1">{t('opt.maxCount')}</label><input className="input num ltr" inputMode="numeric" value={o.maxCount} onChange={(e) => setO({ maxCount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></div><div><label className="label block mb-1">{t('opt.maxSpacing')} (m)</label><input className="input num ltr" inputMode="decimal" value={o.maxSpacing} onChange={(e) => setO({ maxSpacing: Math.max(0, Number(e.target.value) || 0) })} /></div></div><p className="label mt-1">{t('opt.zeroNone')}</p>
      </Section>
      <Section title={t('opt.objectives')}>
        {wk.map(([k, lk]) => <div key={k} className="py-1"><div className="flex justify-between"><label htmlFor={'w-' + k}>{t(lk)}</label><span className="num">{o.weights[k]}</span></div><input id={'w-' + k} type="range" min={0} max={5} step={1} className="w-full accent-[var(--accent)]" value={o.weights[k]} onChange={(e) => setO({ weights: { ...o.weights, [k]: Number(e.target.value) } })} /></div>)}<p className="label">{t('opt.weightsHelp')}</p>
      </Section>
      <Section title={t('opt.search')}>
        <div className="label mb-1">{t('opt.luminaires')}</div>{p.luminaires.map((l) => <label key={l.id} className="flex items-center gap-2 py-0.5" style={l.photometry ? undefined : { opacity: 0.5 }}><input type="checkbox" disabled={!l.photometry} checked={o.libraryIds.length === 0 ? !!l.photometry : o.libraryIds.includes(l.id)} onChange={(e) => { const base = o.libraryIds.length ? o.libraryIds : p.luminaires.filter((z) => z.photometry).map((z) => z.id); setO({ libraryIds: e.target.checked ? [...new Set([...base, l.id])] : base.filter((x) => x !== l.id) }); }} /><span className="flex-1 truncate">{l.model}</span><Chip tone={l.photometry?.quality === 'verified' ? 'ok' : 'warn'}>{t('phot.' + (l.photometry?.quality ?? 'none'))}</Chip></label>)}
        <div className="label mt-2 mb-1">{t('opt.arrangements')}</div>{type.arrangements.map((a) => <label key={a} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={o.arrangements.length === 0 || o.arrangements.includes(a as Arrangement)} onChange={(e) => { const base = o.arrangements.length ? o.arrangements : (type.arrangements as Arrangement[]); setO({ arrangements: e.target.checked ? [...new Set([...base, a as Arrangement])] : base.filter((x) => x !== a) }); }} />{t('arr.' + a)}</label>)}
      </Section>
      <div className="p-3"><Btn variant="primary" className="w-full" icon="wand" disabled={review || running !== null} onClick={() => act.runOpt()}>{running !== null ? `${t('opt.running')} ${Math.round(running * 100)}%` : t('opt.run')}</Btn>
        {running !== null && <div className="h-1.5 bg-[var(--surface-3)] rounded mt-2"><div className="h-full rounded bg-[var(--accent)]" style={{ width: `${running * 100}%` }} /></div>}<p className="label mt-2">{t('opt.noAi')}</p></div>
    </aside>
    <div className="flex-1 min-w-0 overflow-auto p-3 flex flex-col gap-3">
      {!r ? <Empty icon="wand" title={t('opt.empty')} body={t('opt.emptyHelp')} /> : r.blocked ? <Banner tone="danger" icon="alert">{t(r.blocked)}</Banner> : <>
        <div className="flex items-center gap-2 flex-wrap"><h1 className="h-title">{t('opt.results')}</h1><Chip tone={r.feasibleCount ? 'ok' : 'danger'}>{t('opt.feasibleN', { n: r.feasibleCount, total: r.candidates.length })}</Chip><span className="label">{t('opt.evals', { n: r.evaluations })}</span></div>
        {r.feasibleCount === 0 && <Banner tone="danger" icon="alert"><b>{t('opt.infeasible')}</b><br />{t('opt.infeasibleHelp')}<ul className="list-disc ps-5 mt-1">{[...new Set(r.candidates.flatMap((c) => c.violations.map((v) => v.key)))].map((k) => <li key={k}>{t(k)}</li>)}</ul></Banner>}
        <Panel bodyClass="overflow-auto max-h-[46vh]"><table className="tbl"><thead><tr><th>#</th><th>{t('lib.model')}</th><th>{t('insp.arrangement')}</th><th className="n">N/{t('opt.row')}</th><th className="n">N</th><th className="n">E<sub>avg,m</sub></th><th className="n">E<sub>min,m</sub></th><th className="n">U0</th><th className="n">kW</th><th className="n">LCC</th><th className="n">{t('opt.score')}</th><th /></tr></thead><tbody>
          {shown.map((c) => <tr key={c.id} aria-selected={c.id === (cand?.id)} onClick={() => setSelId(c.id)} className="cursor-pointer" style={c.feasible ? undefined : { opacity: 0.75 }}><td>{c.rank ?? '—'}</td><td>{c.lumModel}</td><td>{t('arr.' + c.layout.arrangement)}</td><td className="n">{c.layout.count}</td><td className="n">{c.metrics?.n ?? '—'}</td><td className="n">{c.metrics ? fmt(c.metrics.eAvgM, 1) : '—'}</td><td className="n">{c.metrics ? fmt(c.metrics.eMinM, 1) : '—'}</td><td className="n">{c.metrics ? fmt(c.metrics.u0, 2) : '—'}</td><td className="n">{c.metrics ? fmt(c.metrics.kW, 2) : '—'}</td><td className="n">{c.obj ? fmt(c.obj.lcc, 0) : '—'}</td><td className="n">{c.score !== undefined ? fmt(c.score, 3) : '—'}</td><td>{c.feasible ? <Chip tone="ok">{t('opt.feasible')}</Chip> : <Chip tone="danger">{t('opt.infeas')}</Chip>}</td></tr>)}</tbody></table></Panel>
        {cand && <Panel title={`${cand.rank ? '#' + cand.rank + ' · ' : ''}${cand.lumModel} · ${t('arr.' + cand.layout.arrangement)} · ${cand.layout.count}/${t('opt.row')}`} actions={<><Btn sm variant="primary" disabled={review || !cand.metrics} onClick={() => save(cand, false)}>{t('opt.saveScenario')}</Btn><Btn sm disabled={review || !cand.metrics} onClick={() => save(cand, true)}>{t('opt.editInDesign')}</Btn></>} bodyClass="p-3 grid md:grid-cols-2 gap-4">
          <div><div className="font-medium mb-1">{cand.feasible ? t('opt.whyRank') : t('opt.whyNot')}</div>
            {cand.violations.length > 0 && <ul className="list-disc ps-5 text-[12.5px]" style={{ color: 'var(--danger)' }}>{cand.violations.map((v, i) => <li key={i}>{t(v.key, v.params as Record<string, string | number>)}</li>)}</ul>}
            {cand.vsBest ? <ul className="list-disc ps-5 text-[12.5px]">{cand.vsBest.map((d) => <li key={d.k}>{t('obj.' + (d.k === 'u0' ? 'uniformity' : d.k))}: <span style={{ color: d.better ? 'var(--ok)' : 'var(--warn)' }}>{d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}% {t(d.better ? 'opt.better' : 'opt.worse')}</span></li>)}</ul> : cand.rank === 1 ? <p className="text-[12.5px]">{t('opt.bestHelp')}</p> : null}</div>
          <div><div className="flex gap-1 flex-wrap mb-2">{cand.flags.map((f) => <Chip key={f} tone="warn">{t(f)}</Chip>)}</div>{cand.metrics && <table className="tbl"><tbody><Row k={t('m.eAvgM')} v={fmt(cand.metrics.eAvgM, 1)} u="lx" /><Row k={t('m.eMinM')} v={fmt(cand.metrics.eMinM, 1)} u="lx" /><Row k="U0" v={fmt(cand.metrics.u0, 3)} /><Row k={t('m.lcc')} v={fmt(cand.obj?.lcc ?? 0, 0)} u="cur" /><Row k={t('m.kWh')} v={fmt(cand.obj?.energy ?? 0, 0)} u="kWh/yr" /></tbody></table>}</div>
        </Panel>}
        <div className="label"><b>{t('opt.method')}</b><ul className="list-disc ps-5">{r.notes.map((n) => <li key={n}>{t(n)}</li>)}</ul></div></>}
    </div>
  </div>;
}

// ───────────────────────────────────────── Scenarios
const PALETTE = ['#d4a735', '#c26a00', '#3d5a99', '#8a3b6b'];
export function Scenarios() {
  const t = useT(); const p = useS((s) => s.project)!; const review = useS((s) => s.review); useS((s) => s.evalV);
  const [chosen, setChosen] = useState<string[]>([]);
  const ids = chosen.length ? chosen.filter((id) => p.scenarios.some((s) => s.id === id)) : p.scenarios.slice(0, 4).map((s) => s.id);
  const cols = ids.map((id) => p.scenarios.find((s) => s.id === id)!).slice(0, 4);
  const evs = useMemo(() => new Map<string, Evaluation>(cols.map((s) => [s.id, evaluate(p, s.layout)])), [p, cols.map((c) => c.id + JSON.stringify(c.layout)).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = cols.filter((s) => evs.get(s.id)?.ok);
  const vmax = Math.max(1, ...ok.map((s) => { const e = evs.get(s.id)!; return e.initial!.max * e.mf; }));
  const best = (f: (e: Evaluation) => number, min = true) => { const v = ok.map((s) => f(evs.get(s.id)!)); return v.length ? (min ? Math.min(...v) : Math.max(...v)) : NaN; };
  const bLcc = best((e) => e.econ!.lcc), bKwh = best((e) => e.econ!.kWhYear), bN = best((e) => e.nTotal), bE = best((e) => e.maintained!.avg, false), bU = best((e) => e.maintained!.u0, false);
  const hl = (c: boolean) => (c ? { background: 'var(--ok-soft)', fontWeight: 600 } : undefined);
  const std = standardById(p.standardId); const eReq = std.criteria(p).find((c) => c.metric === 'eAvgM' && c.value !== undefined);
  const ranking = [...ok].sort((a, b) => { const A = evs.get(a.id)!, B = evs.get(b.id)!; return Number(B.std.hardPass) - Number(A.std.hardPass) || A.econ!.lcc - B.econ!.lcc; });
  const diffKeys = (['luminaireId', 'arrangement', 'count', 'spacingMode', 'spacing', 'mountHeight', 'staggered', 'yaw', 'wallInset'] as (keyof Layout)[]).filter((k) => new Set(cols.map((s) => JSON.stringify(s.layout[k]))).size > 1);
  const rename = (id: string, name: string) => act.update((x) => ({ ...x, scenarios: x.scenarios.map((s) => (s.id === id ? { ...s, name } : s)) }), { coalesce: 'sn' + id });
  const dupl = (id: string) => { const s = p.scenarios.find((z) => z.id === id)!; act.addScenario(s.name + ' (copy)', { ...s.layout }, 'manual', false); };
  const del = async (id: string) => { if (p.scenarios.length < 2) { act.toast(t('scn.last'), 'warn'); return; } const s = p.scenarios.find((z) => z.id === id)!; if (await act.ask(t('scn.deleteQ', { name: s.name }), t('scn.deleteHelp'), t('common.delete'))) act.update((x) => { const rest = x.scenarios.filter((z) => z.id !== id); return { ...x, scenarios: rest, activeScenarioId: x.activeScenarioId === id ? rest[0].id : x.activeScenarioId }; }); };
  return <div className="h-full overflow-auto p-4 flex flex-col gap-3">
    <div className="flex items-center gap-2"><h1 className="h-title flex-1">{t('scn.title')}</h1><Btn icon="plus" disabled={review} onClick={() => act.addScenario(activeScenario(p).name + ' (copy)', { ...activeScenario(p).layout }, 'manual')}>{t('scn.new')}</Btn><Btn variant="primary" icon="play" disabled={review} onClick={() => act.calculate(true)}>{t('scn.calcAll')}</Btn></div>
    <Panel bodyClass="overflow-auto"><table className="tbl"><thead><tr><th style={{ width: 28 }} /><th>{t('scn.name')}</th><th>{t('lib.model')}</th><th>{t('insp.arrangement')}</th><th className="n">N/{t('opt.row')}</th><th>{t('scn.source')}</th><th>{t('scn.state')}</th><th /></tr></thead><tbody>
      {p.scenarios.map((s) => { const lum = p.luminaires.find((l) => l.id === s.layout.luminaireId); const active = s.id === p.activeScenarioId; return <tr key={s.id} aria-selected={active}>
        <td><input type="checkbox" aria-label={t('scn.compare')} checked={ids.includes(s.id)} onChange={(e) => setChosen(e.target.checked ? [...ids, s.id].slice(-4) : ids.filter((x) => x !== s.id))} /></td>
        <td><input className="input input-sm" aria-label={t('scn.name')} value={s.name} disabled={review} onChange={(e) => rename(s.id, e.target.value)} /></td><td>{lum?.model ?? '—'}</td><td>{t('arr.' + s.layout.arrangement)}</td><td className="n">{s.layout.count}</td><td><Chip>{t('scn.src.' + s.source)}</Chip></td>
        <td>{active ? <Chip tone="accent">{t('scn.active')}</Chip> : null} {s.result ? <Chip tone={s.result.verdict === 'pass' ? 'ok' : s.result.verdict === 'fail' ? 'danger' : 'warn'}>{t('verdict.' + s.result.verdict)}</Chip> : <Chip>{t('calc.none')}</Chip>}</td>
        <td className="text-end whitespace-nowrap"><Btn sm disabled={active} onClick={() => act.update((x) => ({ ...x, activeScenarioId: s.id }))}>{t('scn.activate')}</Btn> <Btn sm variant="ghost" iconOnly icon="copy" title={t('home.duplicate')} disabled={review} onClick={() => dupl(s.id)} /><Btn sm variant="ghost" iconOnly icon="trash" title={t('common.delete')} disabled={review} onClick={() => del(s.id)} /></td></tr>; })}</tbody></table></Panel>
    {cols.length < 2 ? <Banner tone="info" icon="info">{t('scn.pickTwo')}</Banner> : <>
      <Banner tone="info" icon="info">{t('scn.consistent')} {diffKeys.length ? t('scn.differ', { f: diffKeys.map((k) => t('lf.' + k)).join(', ') }) : t('scn.noDiff')}</Banner>
      <Panel title={t('scn.sideBySide')} bodyClass="overflow-auto"><table className="tbl"><thead><tr><th />{cols.map((s, i) => <th key={s.id} className="n"><span className="dot me-1" style={{ background: PALETTE[i] }} />{s.name}</th>)}</tr></thead><tbody>
        {([['m.eAvgM', (e: Evaluation) => fmt(e.maintained!.avg, 1), (e: Evaluation) => Math.abs(e.maintained!.avg - bE) < 1e-9], ['m.eMinM', (e: Evaluation) => fmt(e.maintained!.min, 1), () => false], ['m.u0', (e: Evaluation) => fmt(e.maintained!.u0, 3), (e: Evaluation) => Math.abs(e.maintained!.u0 - bU) < 1e-9], ['m.n', (e: Evaluation) => String(e.nTotal), (e: Evaluation) => e.nTotal === bN], ['m.kWh', (e: Evaluation) => fmt(e.econ!.kWhYear, 0), (e: Evaluation) => Math.abs(e.econ!.kWhYear - bKwh) < 1e-6], ['m.initial', (e: Evaluation) => fmt(e.econ!.initial, 0), () => false], ['m.lcc', (e: Evaluation) => fmt(e.econ!.lcc, 0), (e: Evaluation) => Math.abs(e.econ!.lcc - bLcc) < 1e-6]] as [string, (e: Evaluation) => string, (e: Evaluation) => boolean][]).map(([k, f, b]) => <tr key={k}><td className="label">{t(k)}</td>{cols.map((s) => { const e = evs.get(s.id)!; return <td key={s.id} className="n num" style={e.ok ? hl(b(e)) : undefined}>{e.ok ? f(e) : '—'}</td>; })}</tr>)}
        <tr><td className="label">{t('res.criteria')}</td>{cols.map((s) => <td key={s.id} className="n">{verdictChip(evs.get(s.id)!.std.verdict, t)}</td>)}</tr>
        <tr><td className="label">{t('lib.photometry')}</td>{cols.map((s) => <td key={s.id} className="n"><Chip tone={evs.get(s.id)!.photQuality === 'verified' ? 'ok' : 'warn'}>{t('phot.' + evs.get(s.id)!.photQuality)}</Chip></td>)}</tr></tbody></table><p className="label p-2">{t('scn.bestHelp')}</p></Panel>
      <div className="grid lg:grid-cols-3 gap-3">
        <Panel title={t('m.lcc') + ' (cur)'} bodyClass="p-3"><BarChart unit="cur" fmtD={0} items={ok.map((s) => ({ label: s.name, value: evs.get(s.id)!.econ!.lcc, color: PALETTE[cols.indexOf(s)] }))} /></Panel>
        <Panel title={t('m.kWh')} bodyClass="p-3"><BarChart unit="kWh/yr" fmtD={0} items={ok.map((s) => ({ label: s.name, value: evs.get(s.id)!.econ!.kWhYear, color: PALETTE[cols.indexOf(s)] }))} /></Panel>
        <Panel title={t('m.eAvgM')} bodyClass="p-3"><BarChart unit="lx" items={ok.map((s) => ({ label: s.name, value: evs.get(s.id)!.maintained!.avg, color: PALETTE[cols.indexOf(s)] }))} refLine={eReq?.value} refLabel={t('res.req')} /></Panel>
      </div>
      <Panel title={t('scn.heat', { v: fmt(vmax, 1) })} bodyClass="p-2"><div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 2)}, minmax(0,1fr))` }}>{cols.map((s, i) => { const e = evs.get(s.id)!; return <div key={s.id} className="border border-[var(--border)] rounded-md overflow-hidden"><div className="px-2 py-1 text-[12px] font-medium bg-[var(--surface-2)]"><span className="dot me-1" style={{ background: PALETTE[i] }} />{s.name}</div><div className="h-[150px]">{e.ok ? <CanvasView label={s.name} deps={[e, vmax]} draw={(ctx, w, h) => { const tx = planFit(w, h, e.geom, 14); drawPlan(ctx, w, h, tx, e.geom, e.positions, e.lum, e.grid, vmax / e.mf, e.mf, -1, null, { heat: true, lums: false }); }} /> : <Empty icon="alert" title={t('calc.blocked')} />}</div></div>; })}</div><div className="h-6 px-2"><CanvasView label="scale" deps={[vmax]} draw={(ctx, w) => drawColorbar(ctx, 8, 2, Math.min(280, w - 70), 7, 0, vmax, 'lx')} /></div></Panel>
      <Panel title={t('scn.rationale')} bodyClass="p-3"><ol className="list-decimal ps-5 flex flex-col gap-1.5">{ranking.map((s) => { const e = evs.get(s.id)!; const pros: string[] = [], cons: string[] = []; if (Math.abs(e.econ!.lcc - bLcc) < 1e-6) pros.push(t('scn.pro.lcc')); if (Math.abs(e.econ!.kWhYear - bKwh) < 1e-6) pros.push(t('scn.pro.energy')); if (Math.abs(e.maintained!.u0 - bU) < 1e-9) pros.push(t('scn.pro.u0')); if (e.nTotal === bN) pros.push(t('scn.pro.n')); if (!e.std.hardPass && e.std.results.length) cons.push(t('scn.con.fail')); if (e.econ!.lcc > bLcc * 1.2) cons.push(t('scn.con.lcc', { p: (((e.econ!.lcc - bLcc) / bLcc) * 100).toFixed(0) })); return <li key={s.id}><b>{s.name}</b> — {e.std.hardPass ? t('scn.meets') : e.std.results.length ? t('scn.notMeets') : t('scn.noCrit')}{pros.length ? '; ' + pros.join(', ') : ''}{cons.length ? '; ' + cons.join(', ') : ''}</li>; })}</ol><p className="label mt-2">{t('scn.rankBasis')}</p></Panel></>}
  </div>;
}
