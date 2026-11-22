import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { Banner, Btn, Chip, Empty, Icon, Modal, Panel, PolarPlot, Seg } from './kit';
import { act, useS } from './store';
import { blankLuminaire, activeScenario } from '../domain/project';
import type { ExProtection, Luminaire } from '../domain/types';
import { parsePhotometricFile } from '../photometry/parsers';
import { approximateFromBeam } from '../photometry';
import { screenEx } from '../standards/ex';
import { hashString, uid } from '../lib/hash';
import { pickFiles } from './Wizard';
import { fmt } from '../lib/units';

type Outcome = { name: string; ok: boolean; msgs: string[] };
const quality = (l: Luminaire) => l.photometry?.quality ?? 'none';
const qTone = (q: string) => (q === 'verified' ? 'ok' : q === 'none' ? 'danger' : 'warn') as 'ok' | 'warn' | 'danger';

export function Library() {
  const t = useT(); const p = useS((s) => s.project)!; const review = useS((s) => s.review); const [selId, setSelId] = useState(p.luminaires[0]?.id ?? '');
  const [q, setQ] = useState(''); const [kind, setKind] = useState<'all' | Luminaire['kind']>('all');
  const [edit, setEdit] = useState<Luminaire | null>(null); const [report, setReport] = useState<Outcome[] | null>(null);
  const rows = useMemo(() => p.luminaires.filter((l) => (kind === 'all' || l.kind === kind) && (l.model + (l.manufacturer ?? '')).toLowerCase().includes(q.toLowerCase())), [p.luminaires, q, kind]);
  const sel = p.luminaires.find((l) => l.id === selId);
  const used = (id: string) => p.scenarios.some((s) => s.layout.luminaireId === id);
  const doImport = async () => {
    const files = await pickFiles('.ies,.ldt,.IES,.LDT', true); if (!files.length) return; const out: Outcome[] = []; let last = '';
    for (const f of files) {
      if (f.size > 5_000_000) { out.push({ name: f.name, ok: false, msgs: [t('file.tooLarge')] }); continue; }
      let text = ''; try { text = await f.text(); } catch { out.push({ name: f.name, ok: false, msgs: [t('file.unreadable')] }); continue; }
      const r = parsePhotometricFile(f.name, text);
      if (!r.ok) { out.push({ name: f.name, ok: false, msgs: r.errors.map((e) => t(e)) }); continue; }
      const i = r.info; const l: Luminaire = { ...blankLuminaire(), id: uid('lum'), kind: 'imported', manufacturer: i.manufacturer, model: i.model || f.name.replace(/\.[^.]+$/, ''), power: i.power ?? 0, length: i.length ?? 0.6, width: i.width ?? 0.1, height: i.height ?? 0.1, fileName: f.name, fileHash: hashString(text), source: `${r.photometry.format} file "${f.name}" imported ${new Date().toISOString().slice(0, 10)} (manufacturer-supplied data is not verified by Lumina)`, photometry: r.photometry };
      const msgs = r.photometry.warnings.map((w) => t(w)); if (!i.power) msgs.push(t('lib.powerMissing')); if (!i.length) msgs.push(t('lib.dimMissing'));
      act.upsertLuminaire(l); out.push({ name: f.name, ok: true, msgs }); last = l.id;
    }
    if (last) setSelId(last); setReport(out);
  };
  const del = async (l: Luminaire) => { if (used(l.id)) { act.toast(t('lib.inUse'), 'warn'); return; } if (await act.ask(t('lib.deleteQ', { name: l.model }), t('lib.deleteHelp'), t('common.delete'))) { act.update((x) => ({ ...x, luminaires: x.luminaires.filter((z) => z.id !== l.id) })); setSelId(p.luminaires.find((z) => z.id !== l.id)?.id ?? ''); } };
  const dup = (l: Luminaire) => { const c: Luminaire = { ...JSON.parse(JSON.stringify(l)), id: uid('lum'), model: l.model + ' (copy)', kind: l.kind === 'sample' ? 'custom' : l.kind }; act.upsertLuminaire(c); setSelId(c.id); };
  const useIt = (l: Luminaire) => { const sc = activeScenario(p); act.setLayout({ luminaireId: l.id }); act.toast(t('lib.usedIn', { s: sc.name })); };
  return <div className="h-full flex min-h-0">
    <div className="flex-1 min-w-0 flex flex-col p-3 gap-2">
      <div className="flex items-center gap-2 flex-wrap"><div className="relative w-64"><Icon n="search" s={14} className="absolute top-2 start-2 text-[var(--faint)]" /><input className="input ps-7" placeholder={t('lib.search')} aria-label={t('lib.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Seg value={kind} onChange={setKind} items={[{ id: 'all', label: t('lib.all') }, { id: 'sample', label: t('kind.sample') }, { id: 'imported', label: t('kind.imported') }, { id: 'custom', label: t('kind.custom') }]} />
        <div className="flex-1" /><Btn icon="upload" disabled={review} onClick={doImport}>{t('lib.import')}</Btn><Btn variant="primary" icon="plus" disabled={review} onClick={() => setEdit(blankLuminaire())}>{t('lib.new')}</Btn></div>
      <Banner tone="info" icon="info">{t('lib.help')}</Banner>
      <Panel className="flex-1" bodyClass="overflow-auto h-full">
        {rows.length === 0 ? <Empty icon="bolt" title={t('lib.empty')} body={t('lib.emptyHelp')} /> :
          <table className="tbl"><thead><tr><th>{t('lib.model')}</th><th>{t('lib.kind')}</th><th>{t('lib.photometry')}</th><th className="n">W</th><th className="n">lm</th><th className="n">{t('lib.dims')}</th><th>Ex</th></tr></thead><tbody>
            {rows.map((l) => { const ex = screenEx(p.hazard, l); return <tr key={l.id} aria-selected={l.id === selId} onClick={() => setSelId(l.id)} className="cursor-pointer">
              <td><button className="font-medium text-start" onClick={() => setSelId(l.id)}>{l.model}</button>{l.manufacturer && <div className="label">{l.manufacturer}</div>}</td>
              <td><Chip tone={l.kind === 'sample' ? 'info' : ''}>{t('kind.' + l.kind)}</Chip></td><td><Chip tone={qTone(quality(l))}>{t('phot.' + quality(l))}</Chip></td>
              <td className="n">{fmt(l.power, 1)}</td><td className="n">{l.photometry ? Math.round(l.photometry.flux) : '—'}</td><td className="n ltr">{fmt(l.length, 2)}×{fmt(l.width, 2)}×{fmt(l.height, 2)}</td>
              <td>{l.ex ? <Chip tone={ex.status === 'incompatible' ? 'danger' : 'warn'}>{t('ex.' + ex.status)}</Chip> : <span className="label">—</span>}</td></tr>; })}</tbody></table>}
      </Panel>
    </div>
    <aside className="w-[380px] shrink-0 border-s border-[var(--border)] bg-[var(--surface)] overflow-y-auto" aria-label={t('lib.detail')}>
      {!sel ? <Empty icon="bolt" title={t('lib.selectOne')} /> : <div className="p-3 flex flex-col gap-3">
        <div><h2 className="h-title">{sel.model}</h2><div className="label">{sel.manufacturer ?? t('lib.noMaker')}</div><div className="flex gap-1 mt-2 flex-wrap"><Chip tone={sel.kind === 'sample' ? 'info' : ''}>{t('kind.' + sel.kind)}</Chip><Chip tone={qTone(quality(sel))}>{t('phot.' + quality(sel))}</Chip></div></div>
        <div className="flex gap-1.5 flex-wrap"><Btn sm variant="primary" disabled={review || !sel.photometry} onClick={() => useIt(sel)}>{t('lib.use')}</Btn><Btn sm icon="copy" disabled={review} onClick={() => dup(sel)}>{t('home.duplicate')}</Btn><Btn sm disabled={review || sel.kind === 'sample'} onClick={() => setEdit(sel)}>{t('common.edit')}</Btn><Btn sm variant="ghost" icon="trash" disabled={review} onClick={() => del(sel)} title={t('common.delete')} /></div>
        {sel.kind === 'sample' && <Banner tone="info" icon="info">{t('lib.sampleNote')}</Banner>}
        {sel.photometry?.quality === 'approximate' && <Banner tone="warn" icon="alert">{t('lib.approxNote')}</Banner>}
        {!sel.photometry && <Banner tone="danger" icon="alert">{t('lib.noPhotNote')}</Banner>}
        <div><div className="label mb-1">{t('lib.provenance')}</div><p className="text-[12.5px]">{sel.source}</p>{sel.fileName && <p className="label ltr mt-1">{sel.fileName} · #{sel.fileHash}</p>}</div>
        {sel.photometry && <div><div className="flex items-center justify-between"><span className="label">{t('lib.polar')}</span><span className="label"><span style={{ color: 'var(--accent)' }}>━</span> C0–C180 <span style={{ color: 'var(--warn)' }}>┅</span> C90–C270</span></div><div className="grid place-items-center"><PolarPlot ph={sel.photometry} /></div></div>}
        <table className="tbl"><tbody>{([['power', `${fmt(sel.power, 1)} W`], ['flux', sel.photometry ? `${fmt(sel.photometry.flux, 0)} lm` : '—'], ['fluxDecl', sel.photometry?.declaredFlux ? `${fmt(sel.photometry.declaredFlux, 0)} lm` : '—'], ['dims', `${fmt(sel.length, 3)} × ${fmt(sel.width, 3)} × ${fmt(sel.height, 3)} m`], ['mounting', sel.mounting || '—'], ['ip', sel.ip || '—'], ['voltage', sel.voltage ? `${sel.voltage} V` : '—'], ['price', sel.priceEach ? fmt(sel.priceEach, 2) : t('lib.priceMissing')], ['life', sel.lifeHours ? `${fmt(sel.lifeHours, 0)} h` : '—'], ['cct', sel.cct ? `${sel.cct} K` : '—'], ['cri', sel.cri ?? '—']] as [string, string | number][]).map(([k, v]) => <tr key={k}><td className="label">{t('lib.f.' + k)}</td><td className="ltr text-end">{v}</td></tr>)}</tbody></table>
        {sel.photometry && sel.photometry.warnings.length > 0 && <ul className="text-[12px] list-disc ps-5" style={{ color: 'var(--warn)' }}>{sel.photometry.warnings.map((w) => <li key={w}>{t(w)}</li>)}</ul>}
        <div><div className="label mb-1">{t('ex.title')}</div>{sel.ex ? <div className="text-[12.5px] flex flex-col gap-1"><div className="ltr font-mono">{sel.ex.marking || '—'}</div><div className="label ltr">{sel.ex.scheme} · {sel.ex.certificateId || t('ex.noCert')} · {sel.ex.hazardType} {sel.ex.zone ?? ''} {sel.ex.group ?? ''} {sel.ex.tempClass ?? ''}</div>
          {(() => { const s = screenEx(p.hazard, sel); return <Banner tone={s.status === 'incompatible' ? 'danger' : 'warn'} icon="alert">{t('ex.' + s.status)}{s.reasons.length ? ': ' + s.reasons.map((r) => t(r)).join('; ') : ''}<div className="text-[11.5px] mt-1">{t('ex.disclaimer')}</div></Banner>; })()}</div> : <p className="label">{t('ex.none')}</p>}</div>
      </div>}
    </aside>
    {edit && <LumEditor lum={edit} onClose={() => setEdit(null)} onSave={(l) => { act.upsertLuminaire(l); setSelId(l.id); setEdit(null); }} />}
    {report && <Modal title={t('lib.importReport')} onClose={() => setReport(null)} wide><ul className="flex flex-col gap-2">{report.map((o, i) => <li key={i} className="flex gap-2 items-start"><Icon n={o.ok ? 'check' : 'x'} className="mt-0.5" /><div><div className="font-medium ltr">{o.name} — <span style={{ color: o.ok ? 'var(--ok)' : 'var(--danger)' }}>{o.ok ? t('lib.imported') : t('lib.rejected')}</span></div>{o.msgs.map((m, k) => <div key={k} className="text-[12px] text-[var(--muted)]">{m}</div>)}</div></li>)}</ul></Modal>}
  </div>;
}

function LumEditor({ lum, onClose, onSave }: { lum: Luminaire; onClose: () => void; onSave: (l: Luminaire) => void }) {
  const t = useT(); const [l, setL] = useState<Luminaire>(lum); const [flux, setFlux] = useState(String(lum.photometry?.declaredFlux ?? 3000)); const [beam, setBeam] = useState('100'); const [mode, setMode] = useState<'keep' | 'none' | 'approx'>(lum.photometry ? 'keep' : 'none');
  const [hasEx, setHasEx] = useState(!!lum.ex);
  const [ex, setEx] = useState<ExProtection>(lum.ex ?? { hazardType: 'gas', zone: '1', group: 'IIB', tempClass: 'T4', marking: '', scheme: 'ATEX', certificateId: '', scope: '', limitations: '' });
  const num = (k: keyof Luminaire, label: string, unit = '', opt = false) => <div><label className="label block mb-1">{label}{unit && ` (${unit})`}</label><input className="input num ltr" inputMode="decimal" value={l[k] === undefined ? '' : String(l[k])} onChange={(e) => { const v = e.target.value; setL({ ...l, [k]: v === '' && opt ? undefined : Number(v) } as Luminaire); }} /></div>;
  const txt = (k: keyof Luminaire, label: string) => <div><label className="label block mb-1">{label}</label><input className="input" value={String(l[k] ?? '')} onChange={(e) => setL({ ...l, [k]: e.target.value } as Luminaire)} /></div>;
  const bad = !l.model.trim() || !(l.power >= 0) || !(l.length > 0) || !(l.width > 0) || !(l.height > 0) || (mode === 'approx' && !(Number(flux) > 0 && Number(beam) > 0 && Number(beam) <= 180));
  const save = () => { const out: Luminaire = { ...l, ex: hasEx ? ex : undefined, kind: l.kind === 'sample' ? 'custom' : l.kind };
    if (mode === 'none') out.photometry = null; if (mode === 'approx') out.photometry = approximateFromBeam(Number(flux), Number(beam)); if (out.kind === 'custom' && !out.source) out.source = 'User-defined record'; onSave(out); };
  return <Modal title={lum.model ? t('common.edit') + ': ' + lum.model : t('lib.new')} onClose={onClose} wide>
    <div className="grid grid-cols-2 gap-3">{txt('manufacturer', t('lib.maker'))}{txt('model', t('lib.model') + ' *')}{num('power', t('lib.f.power'), 'W')}{txt('mounting', t('lib.f.mounting'))}{num('length', t('lib.length'), 'm')}{num('width', t('lib.width'), 'm')}{num('height', t('lib.height'), 'm')}{txt('ip', t('lib.f.ip'))}{num('voltage', t('lib.f.voltage'), 'V', true)}{num('priceEach', t('lib.f.price'), '', true)}{num('lifeHours', t('lib.f.life'), 'h', true)}{num('cct', t('lib.f.cct'), 'K', true)}{num('cri', t('lib.f.cri'), '', true)}
      <div className="col-span-2">{txt('source', t('lib.provenance'))}</div></div>
    <div className="panel p-3 mt-3"><div className="font-semibold mb-1">{t('lib.photometry')}</div>
      <Seg value={mode} onChange={setMode} items={[...(lum.photometry ? [{ id: 'keep' as const, label: t('lib.keepPhot') }] : []), { id: 'none' as const, label: t('lib.noPhot') }, { id: 'approx' as const, label: t('lib.approx') }]} />
      {mode === 'none' && <Banner tone="danger" icon="alert">{t('lib.noPhotNote')}</Banner>}
      {mode === 'approx' && <><Banner tone="warn" icon="alert">{t('lib.approxNote')}</Banner><div className="grid grid-cols-2 gap-3 mt-2"><div><label className="label block mb-1">{t('lib.flux')} (lm)</label><input className="input ltr num" value={flux} onChange={(e) => setFlux(e.target.value)} /></div><div><label className="label block mb-1">{t('lib.beam')} (°)</label><input className="input ltr num" value={beam} onChange={(e) => setBeam(e.target.value)} /></div></div></>}
      <p className="label mt-2">{t('lib.importHint')}</p></div>
    <div className="panel p-3 mt-3"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={hasEx} onChange={(e) => setHasEx(e.target.checked)} />{t('ex.hasData')}</label><p className="label mt-1">{t('ex.help')}</p>
      {hasEx && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div><label className="label block mb-1">{t('hz.type')}</label><select className="input" value={ex.hazardType} onChange={(e) => setEx({ ...ex, hazardType: e.target.value as 'gas' | 'dust', zone: e.target.value === 'gas' ? '1' : '21', group: e.target.value === 'gas' ? 'IIB' : 'IIIB' })}><option value="gas">{t('hz.gas')}</option><option value="dust">{t('hz.dust')}</option></select></div>
        <div><label className="label block mb-1">{t('hz.zone')}</label><select className="input" value={ex.zone} onChange={(e) => setEx({ ...ex, zone: e.target.value as ExProtection['zone'] })}>{(ex.hazardType === 'gas' ? ['0', '1', '2'] : ['20', '21', '22']).map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><label className="label block mb-1">{t('hz.group')}</label><select className="input" value={ex.group} onChange={(e) => setEx({ ...ex, group: e.target.value as ExProtection['group'] })}>{(ex.hazardType === 'gas' ? ['IIA', 'IIB', 'IIC'] : ['IIIA', 'IIIB', 'IIIC']).map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><label className="label block mb-1">{t('hz.temp')}</label><select className="input" value={ex.tempClass ?? ''} onChange={(e) => setEx({ ...ex, tempClass: (e.target.value || undefined) as ExProtection['tempClass'] })}><option value="">—</option>{['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((z) => <option key={z}>{z}</option>)}</select></div>
        <div className="col-span-2"><label className="label block mb-1">{t('ex.marking')}</label><input className="input ltr" value={ex.marking} onChange={(e) => setEx({ ...ex, marking: e.target.value })} /></div>
        <div><label className="label block mb-1">{t('ex.scheme')}</label><input className="input ltr" value={ex.scheme} onChange={(e) => setEx({ ...ex, scheme: e.target.value })} /></div>
        <div><label className="label block mb-1">{t('ex.certId')}</label><input className="input ltr" value={ex.certificateId} onChange={(e) => setEx({ ...ex, certificateId: e.target.value })} /></div>
        <div className="col-span-2"><label className="label block mb-1">{t('ex.scope')}</label><input className="input" value={ex.scope} onChange={(e) => setEx({ ...ex, scope: e.target.value })} /></div>
        <div className="col-span-2"><label className="label block mb-1">{t('ex.limitations')}</label><input className="input" value={ex.limitations} onChange={(e) => setEx({ ...ex, limitations: e.target.value })} /></div></div>}</div>
    <div className="flex justify-end gap-2 mt-4"><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="primary" disabled={bad} onClick={save}>{t('common.save')}</Btn></div>
  </Modal>;
}
