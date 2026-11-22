import { useRef, useState } from 'react';
import { useT } from '../i18n';
import { Banner, Btn, Chip, Empty, FieldRow, Icon, Panel } from './kit';
import { act, useS } from './store';
import { TUNNEL_TYPES } from '../domain/fields';
import type { Group } from '../domain/fields';
import { resetInput, setInput, validateInputs, visibleFields } from '../domain/project';
import { STANDARDS, standardsFor } from '../standards/registry';
import { buildGeometry, geometryIssues } from '../geometry/tunnel';
import type { HazardRequirement, TunnelType } from '../domain/types';
import { exportProject } from '../persistence/package';
import { download } from './kit';

export async function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res([...(i.files ?? [])]); i.click(); });
}
export async function importPackageFile(t: (k: string) => string) {
  const [f] = await pickFiles('.json,.lumina,.lumina.json,application/json'); if (!f) return;
  const err = await act.importText(await f.text(), ' (imported)');
  if (err) act.toast(`${t('import.failed')}: ${t(err)}`, 'danger'); else act.toast(t('import.ok'));
}

export function Home() {
  const t = useT(); const index = useS((s) => s.index); const rec = useS((s) => s.recovery); const lang = useS((s) => s.lang);
  const fmtDate = (s: string) => new Date(s).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="h-full overflow-auto p-6"><div className="max-w-5xl mx-auto flex flex-col gap-4">
    <div className="flex items-center gap-3"><div className="flex-1"><h1 className="text-[20px] font-semibold">{t('home.title')}</h1><p className="text-[var(--muted)]">{t('home.sub')}</p></div>
      <Btn icon="upload" onClick={() => importPackageFile(t)}>{t('home.import')}</Btn><Btn variant="primary" icon="plus" onClick={() => act.create()}>{t('home.new')}</Btn></div>
    {rec && <Banner tone="warn" icon="history" actions={<><Btn sm variant="primary" onClick={() => act.recover()}>{t('home.recover')}</Btn><Btn sm onClick={() => act.discardRecovery()}>{t('home.discard')}</Btn></>}>{t('home.recoverHelp', { name: rec.name })}</Banner>}
    <Panel title={t('home.projects')} bodyClass="overflow-auto">
      {index.length === 0 ? <Empty icon="folder" title={t('home.empty')} body={t('home.emptyHelp')}><Btn variant="primary" icon="plus" onClick={() => act.create()}>{t('home.new')}</Btn></Empty> :
        <table className="tbl"><thead><tr><th>{t('home.name')}</th><th>{t('home.type')}</th><th>{t('home.updated')}</th><th /></tr></thead><tbody>
          {index.map((e) => <tr key={e.id}><td><button className="font-semibold hover:underline text-start" onClick={() => act.openById(e.id)}>{e.name}</button></td><td><Chip>{TUNNEL_TYPES.find((x) => x.id === e.tunnelType)?.label[lang]}</Chip></td><td className="num">{fmtDate(e.updatedAt)}</td>
            <td className="text-end whitespace-nowrap"><Btn sm onClick={() => act.openById(e.id)}>{t('home.open')}</Btn>{' '}
              <Btn sm iconOnly variant="ghost" icon="copy" title={t('home.duplicate')} onClick={async () => { await act.duplicate(e.id, ' (copy)'); act.toast(t('home.duplicated')); }} />
              <Btn sm iconOnly variant="ghost" icon="download" title={t('files.exportProject')} onClick={async () => { const p = await act.getProject(e.id); if (p) download(`${p.name.replace(/[^\w-]+/g, '_')}.lumina.json`, exportProject(p), 'application/json'); }} />
              <Btn sm iconOnly variant="ghost" icon="trash" title={t('common.delete')} onClick={async () => { if (await act.ask(t('home.deleteQ', { name: e.name }), t('home.deleteHelp'), t('common.delete'))) { await act.removeProject(e.id); act.toast(t('home.deleted')); } }} /></td></tr>)}
        </tbody></table>}
    </Panel>
    <p className="label flex items-center gap-1.5"><Icon n="lock" s={13} />{t('home.local')}</p>
  </div></div>;
}

const STEPS: { id: string; groups: Group[] }[] = [{ id: 'basics', groups: [] }, { id: 'geometry', groups: ['geometry'] }, { id: 'operating', groups: ['operating', 'environment'] }, { id: 'economic', groups: ['electrical', 'economic'] }, { id: 'standard', groups: ['criteria'] }];
const GROUP_KEY: Record<Group, string> = { geometry: 'grp.geometry', operating: 'grp.operating', environment: 'grp.environment', electrical: 'grp.electrical', economic: 'grp.economic', criteria: 'grp.criteria' };

export function Wizard() {
  const t = useT(); const p = useS((s) => s.project)!; const step = useS((s) => s.wizardStep); const lang = useS((s) => s.lang); const unit = useS((s) => s.unit);
  const [adv, setAdv] = useState(false); const metaRef = useRef(null);
  void metaRef;
  const issues = validateInputs(p); const g = buildGeometry(p.inputs, p.tunnelType); const gi = geometryIssues(g, p.inputs, p.tunnelType);
  const errsFor = (groups: Group[]) => issues.filter((i) => i.field && visibleFields(p).find((f) => f.key === i.field && groups.includes(f.group))).length + (groups.includes('geometry') ? gi.filter((i) => i.severity === 'error').length : 0);
  const all = visibleFields(p); const cnt = { default: 0, estimate: 0, user: 0 }; for (const f of all) cnt[p.prov[f.key] ?? 'user']++;
  const setStep = (n: number) => act.setWizardStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  const st = STEPS[step]; const totalErr = issues.filter((i) => i.severity === 'error').length + gi.filter((i) => i.severity === 'error').length;
  const set = (key: string, v: number | string) => act.update((x) => setInput(x, key, v), { coalesce: 'in-' + key });
  const fieldsFor = (groups: Group[]) => all.filter((f) => groups.includes(f.group));
  const renderGroup = (grp: Group) => {
    const fs = fieldsFor([grp]).filter((f) => (adv ? true : !f.advanced)); if (!fs.length) return null;
    return <div key={grp} className="mb-4"><h3 className="font-semibold mb-1 flex items-center gap-2">{t(GROUP_KEY[grp])}</h3><div className="grid gap-x-6 md:grid-cols-2">
      {fs.map((f) => <FieldRow key={f.key} def={f} value={p.inputs[f.key]} prov={p.prov[f.key]} unit={unit} lang={lang} onChange={(v) => set(f.key, v)} onReset={() => act.update((x) => resetInput(x, f.key))} error={issues.find((i) => i.field === f.key) ? t('issue.range', { min: f.min ?? '', max: f.max ?? '' }) : undefined} />)}</div></div>;
  };
  const hz = p.hazard; const setHz = (patch: Partial<HazardRequirement>) => act.update((x) => ({ ...x, hazard: { ...x.hazard, ...patch } }));
  const stds = standardsFor(p.tunnelType); const cur = STANDARDS.find((s) => s.id === p.standardId);
  return <div className="h-full flex min-h-0">
    <nav aria-label={t('wiz.steps')} className="w-60 shrink-0 border-e border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-1 overflow-auto">
      <div className="label px-2 pb-1">{t('wiz.title')}</div>
      {STEPS.map((s, i) => { const e = s.groups.length ? errsFor(s.groups) : p.name.trim() ? 0 : 1; return <button key={s.id} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-2.5 px-2 py-2 rounded-md text-start hover:bg-[var(--surface-3)]" style={i === step ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}>
        <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0" style={{ background: e ? 'var(--danger-soft)' : i < step ? 'var(--ok)' : 'var(--surface-3)', color: e ? 'var(--danger)' : i < step ? '#fff' : 'var(--muted)' }}>{e ? '!' : i < step ? <Icon n="check" s={11} /> : i + 1}</span><span className="font-medium">{t('wiz.s.' + s.id)}</span></button>; })}
      <div className="mt-auto p-2 rounded-md bg-[var(--surface-2)] text-[12px] text-[var(--muted)]"><div className="font-semibold text-[var(--text)] mb-1">{t('wiz.provSummary')}</div><div className="flex gap-1.5 flex-wrap"><Chip>{cnt.default} {t('prov.default')}</Chip><Chip tone="warn">{cnt.estimate} {t('prov.estimate')}</Chip><Chip tone="accent">{cnt.user} {t('prov.user')}</Chip></div><p className="mt-1.5">{t('wiz.provHelp')}</p></div>
    </nav>
    <div className="flex-1 min-w-0 overflow-auto"><div className="max-w-3xl mx-auto p-6">
      <h1 className="text-[18px] font-semibold mb-0.5">{t('wiz.s.' + st.id)}</h1><p className="text-[var(--muted)] mb-4">{t('wiz.h.' + st.id)}</p>
      {st.id === 'basics' && <div className="flex flex-col gap-4">
        <div><label className="label block mb-1" htmlFor="pn">{t('meta.name')} *</label><input id="pn" className="input" value={p.name} aria-invalid={!p.name.trim()} onChange={(e) => act.update((x) => ({ ...x, name: e.target.value }), { coalesce: 'name' })} /></div>
        <div><div className="label mb-1">{t('meta.type')} *</div><div role="radiogroup" aria-label={t('meta.type')} className="grid gap-2 md:grid-cols-3">{TUNNEL_TYPES.map((ty) => <button key={ty.id} role="radio" aria-checked={p.tunnelType === ty.id} onClick={async () => { if (ty.id === p.tunnelType) return; if (p.wizardDone && !(await act.ask(t('wiz.changeType'), t('wiz.changeTypeHelp'), t('common.confirm'), 'primary'))) return; act.changeType(ty.id as TunnelType); }}
          className="text-start panel p-3 hover:border-[var(--accent)]" style={p.tunnelType === ty.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}><div className="font-semibold">{ty.label[lang]}</div><p className="text-[12px] text-[var(--muted)] mt-1">{ty.desc[lang]}</p></button>)}</div></div>
        <div className="grid md:grid-cols-2 gap-3">{(['client', 'site', 'country', 'designer'] as const).map((k) => <div key={k}><label className="label block mb-1" htmlFor={'m-' + k}>{t('meta.' + k)}</label><input id={'m-' + k} className="input" value={p.meta[k]} onChange={(e) => act.update((x) => ({ ...x, meta: { ...x.meta, [k]: e.target.value } }), { coalesce: 'meta' + k })} /></div>)}</div>
        <div><label className="label block mb-1" htmlFor="m-notes">{t('meta.notes')}</label><textarea id="m-notes" rows={3} className="input" value={p.meta.notes} onChange={(e) => act.update((x) => ({ ...x, meta: { ...x.meta, notes: e.target.value } }), { coalesce: 'notes' })} /></div>
      </div>}
      {st.id !== 'basics' && st.id !== 'standard' && <>{st.groups.map(renderGroup)}
        <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={adv} onChange={(e) => setAdv(e.target.checked)} />{t('wiz.showAdvanced')}</label></>}
      {st.id === 'standard' && <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t('std.select')} className="flex flex-col gap-2">{stds.map((s) => <button key={s.id} role="radio" aria-checked={p.standardId === s.id} onClick={() => act.update((x) => ({ ...x, standardId: s.id }))} className="text-start panel p-3 hover:border-[var(--accent)]" style={p.standardId === s.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}>
          <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{s.name[lang]}</span><Chip tone={s.status === 'supported' ? 'ok' : s.status === 'partial' ? 'warn' : 'danger'}>{t('impl.' + s.status)}</Chip><span className="label ltr">{s.edition}</span></div>
          <p className="text-[12px] text-[var(--muted)] mt-1">{s.scope[lang]}</p></button>)}</div>
        {cur && cur.id !== 'none' && <Banner tone={cur.status === 'supported' ? 'info' : 'warn'} icon="alert"><b>{t('std.limits')}:</b> {cur.limitations[lang]}</Banner>}
        {cur?.id === 'none' && <Banner tone="warn" icon="alert">{cur.limitations[lang]}</Banner>}
        <div className="grid gap-x-6 md:grid-cols-2">{fieldsFor(['criteria']).map((f) => <FieldRow key={f.key} def={f} value={p.inputs[f.key]} prov={p.prov[f.key]} unit={unit} lang={lang} onChange={(v) => set(f.key, v)} onReset={() => act.update((x) => resetInput(x, f.key))} />)}</div>
        <div className="panel p-3"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={hz.required} onChange={(e) => setHz({ required: e.target.checked })} />{t('hz.title')}</label><p className="label mt-1">{t('hz.help')}</p>
          {hz.required && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div><label className="label block mb-1">{t('hz.type')}</label><select className="input" value={hz.hazardType} onChange={(e) => { const v = e.target.value as 'gas' | 'dust'; setHz({ hazardType: v, zone: v === 'gas' ? '1' : '21', group: v === 'gas' ? 'IIB' : 'IIIB' }); }}><option value="gas">{t('hz.gas')}</option><option value="dust">{t('hz.dust')}</option></select></div>
            <div><label className="label block mb-1">{t('hz.zone')}</label><select className="input" value={hz.zone} onChange={(e) => setHz({ zone: e.target.value as HazardRequirement['zone'] })}>{(hz.hazardType === 'gas' ? ['0', '1', '2'] : ['20', '21', '22']).map((z) => <option key={z}>{z}</option>)}</select></div>
            <div><label className="label block mb-1">{t('hz.group')}</label><select className="input" value={hz.group} onChange={(e) => setHz({ group: e.target.value as HazardRequirement['group'] })}>{(hz.hazardType === 'gas' ? ['IIA', 'IIB', 'IIC'] : ['IIIA', 'IIIB', 'IIIC']).map((z) => <option key={z}>{z}</option>)}</select></div>
            {hz.hazardType === 'gas' && <div><label className="label block mb-1">{t('hz.temp')}</label><select className="input" value={hz.tempClass} onChange={(e) => setHz({ tempClass: e.target.value as HazardRequirement['tempClass'] })}>{['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((z) => <option key={z}>{z}</option>)}</select></div>}
            <div className="col-span-full"><Banner tone="warn" icon="alert">{t('hz.warn')}</Banner></div></div>}</div>
        <Panel title={t('wiz.review')} bodyClass="p-3">{totalErr ? <Banner tone="danger" icon="alert">{t('wiz.blockers', { n: totalErr })}</Banner> : <Banner tone="ok" icon="check">{t('wiz.ready')}</Banner>}
          <ul className="mt-2 text-[12.5px] list-disc ps-5 text-[var(--muted)]"><li>{t('wiz.rv.defaults', { n: cnt.default + cnt.estimate })}</li><li>{t('wiz.rv.std', { s: cur?.name[lang] ?? '' })}</li></ul></Panel>
      </div>}
      <div className="flex justify-between mt-6 pt-4 border-t border-[var(--border)]">
        <Btn icon="chevron" onClick={() => setStep(step - 1)} disabled={step === 0} className="[&>svg]:rotate-180 rtl:[&>svg]:rotate-0">{t('common.back')}</Btn>
        {step < STEPS.length - 1 ? <Btn variant="primary" onClick={() => setStep(step + 1)}>{t('common.next')}</Btn>
          : <Btn variant="primary" icon="check" disabled={totalErr > 0} onClick={() => { act.update((x) => ({ ...x, wizardDone: true })); act.setStage('design'); act.calculate(); }}>{t('wiz.finish')}</Btn>}
      </div>
    </div></div>
  </div>;
}
