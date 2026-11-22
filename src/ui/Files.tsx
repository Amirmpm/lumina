import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { Banner, Btn, Chip, Empty, Icon, Modal, Panel } from './kit';
import { act, useS } from './store';
import { download } from './kit';
import { evaluate } from '../calc/evaluate';
import type { Evaluation } from '../calc/evaluate';
import { buildSheets, dxfFor, objFor } from '../exports/datasets';
import { buildObj, buildXlsx, parseDxfEntities, pdfPageCount, toCsv, unzip, zip } from '../exports/files';
import { renderReportPdf } from '../exports/report';
import { exportBackup, exportProject, exportReview, importPackage, diffProjects } from '../persistence/package';
import type { DiffItem } from '../persistence/package';
import type { Project } from '../domain/types';
import type { Version } from '../persistence/storage';
import { importPackageFile } from './Wizard';

const nav = typeof navigator !== 'undefined' ? navigator : undefined;
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'project';
export function Files() {
  const t = useT(); const p = useS((s) => s.project)!; const lang = useS((s) => s.lang); const sel = useS((s) => s.sel); const review = useS((s) => s.review); const save = useS((s) => s.save); const busy = useS((s) => s.busy);
  const [vers, setVers] = useState<Version[]>([]); const [label, setLabel] = useState(''); const [diff, setDiff] = useState<{ v: Version; items: DiffItem[] } | null>(null);
  const [last, setLast] = useState<{ name: string; size: number; check: string } | null>(null);
  const reload = () => act.versions().then(setVers);
  useEffect(() => { void reload(); }, [p.id, save.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const evalAll = () => new Map<string, Evaluation>(p.scenarios.map((s) => [s.id, evaluate(p, s.layout)]));
  const run = async (kind: string) => {
    act.setBusy(kind);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const evs = evalAll(); const ev = evs.get(p.activeScenarioId)!; const base = safe(p.name);
      if (!ev.ok && ['pdf', 'xlsx', 'csv', 'dxf', 'obj'].includes(kind)) { act.toast(t('files.blocked'), 'warn'); return; }
      let name = '', data: BlobPart = '', mime = '', check = '';
      if (kind === 'pdf') { const b = renderReportPdf(p, evs, lang, sel.x); const s = new TextDecoder('latin1').decode(b); if (!s.startsWith('%PDF-') || !s.includes('%%EOF')) throw new Error('pdf'); check = `${pdfPageCount(b)} ${t('files.pages')}`; name = `${base}.report.pdf`; data = b as BlobPart; mime = 'application/pdf'; }
      else if (kind === 'xlsx') { const sheets = buildSheets(p, evs, lang); const b = buildXlsx(sheets); const z = unzip(b); if (z.length < sheets.length + 4) throw new Error('xlsx'); check = `${sheets.length} ${t('files.sheets')}`; name = `${base}.xlsx`; data = b as BlobPart; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
      else if (kind === 'csv') { const sheets = buildSheets(p, evs, lang); const b = zip(sheets.map((s) => ({ name: `${base}_${s.name}.csv`, data: new TextEncoder().encode(toCsv(s.rows)) }))); if (unzip(b).length !== sheets.length) throw new Error('csv'); check = `${sheets.length} CSV`; name = `${base}.csv.zip`; data = b as BlobPart; mime = 'application/zip'; }
      else if (kind === 'dxf') { const s = dxfFor(p, ev); const n = parseDxfEntities(s); if (!n.length) throw new Error('dxf'); check = `${n.length} ${t('files.entities')}`; name = `${base}.dxf`; data = s; mime = 'application/dxf'; }
      else if (kind === 'obj') { const s = buildObj(objFor(ev)); const v = s.split('\n').filter((l) => l.startsWith('v ')).length; if (!v) throw new Error('obj'); check = `${v} ${t('files.vertices')}`; name = `${base}.obj`; data = s; mime = 'text/plain'; }
      else if (kind === 'project' || kind === 'review') { const s = kind === 'project' ? exportProject(p) : exportReview(p); const r = importPackage(s); if (!r.ok || (r.kind !== 'backup' && !r.checksumOk)) throw new Error('pkg'); check = t('files.checksumOk'); name = `${base}.${kind === 'project' ? 'lumina' : 'review'}.json`; data = s; mime = 'application/json'; }
      else if (kind === 'backup') { const all = await act.allProjects(); const s = exportBackup(all); const r = importPackage(s); if (!r.ok || r.kind !== 'backup' || r.projects.length !== all.length) throw new Error('bk'); check = `${all.length} ${t('files.projects')}`; name = `lumina-backup-${new Date().toISOString().slice(0, 10)}.json`; data = s; mime = 'application/json'; }
      download(name, data, mime); const size = typeof data === 'string' ? new Blob([data]).size : (data as Uint8Array).length;
      setLast({ name, size, check }); act.toast(t('files.created', { name }));
    } catch (e) { act.toast(t('files.failed') + ': ' + (e as Error).message, 'danger'); } finally { act.setBusy(null); }
  };
  const Ex = ({ k, icon, title, desc, off }: { k: string; icon: string; title: string; desc: string; off?: boolean }) => <div className="flex items-start gap-3 p-3 border-b border-[var(--surface-3)]"><div className="w-8 h-8 rounded bg-[var(--surface-3)] grid place-items-center shrink-0"><Icon n={icon} /></div><div className="flex-1 min-w-0"><div className="font-medium">{title}</div><div className="label">{desc}</div></div><Btn sm icon="download" disabled={off || busy !== null} onClick={() => run(k)}>{busy === k ? t('files.working') : t('files.export')}</Btn></div>;
  const restore = async (v: Version) => { if (await act.ask(t('files.restoreQ'), t('files.restoreHelp'), t('files.restore'), 'primary')) { await act.rollback(v.project); act.toast(t('files.restored')); await reload(); } };
  const fd = (s: string) => new Date(s).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const val = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return <div className="h-full overflow-auto p-4"><div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-4 items-start">
    <div className="flex flex-col gap-4">
      <Panel title={t('files.export')} bodyClass="">
        <Ex k="pdf" icon="file" title={t('files.pdf')} desc={t('files.pdfHelp')} /><Ex k="xlsx" icon="grid" title="Excel (.xlsx)" desc={t('files.xlsxHelp')} /><Ex k="csv" icon="grid" title={t('files.csv')} desc={t('files.csvHelp')} />
        <Ex k="dxf" icon="ruler" title="DXF" desc={t('files.dxfHelp')} /><Ex k="obj" icon="cube" title={t('files.obj')} desc={t('files.objHelp')} /><Ex k="project" icon="folder" title={t('files.exportProject')} desc={t('files.projectHelp')} /><Ex k="review" icon="lock" title={t('files.review')} desc={t('files.reviewHelp')} />
        {last && <div className="p-3"><Banner tone="ok" icon="check">{t('files.verified')}: <b className="ltr">{last.name}</b> · {(last.size / 1024).toFixed(1)} KB · {last.check}</Banner></div>}
      </Panel>
      <Panel title={t('files.backup')} bodyClass="p-3 flex flex-col gap-2"><p className="label">{t('files.backupHelp')}</p><div className="flex gap-2"><Btn icon="download" onClick={() => run('backup')} disabled={busy !== null}>{t('files.backupAll')}</Btn><Btn icon="upload" onClick={() => importPackageFile(t)}>{t('files.restoreFile')}</Btn></div></Panel>
    </div>
    <div className="flex flex-col gap-4">
      <Panel title={t('files.versions')} bodyClass="">
        <div className="p-3 flex gap-2 border-b border-[var(--border)]"><input className="input" placeholder={t('files.versionLabel')} aria-label={t('files.versionLabel')} value={label} onChange={(e) => setLabel(e.target.value)} /><Btn variant="primary" icon="save" disabled={review} onClick={async () => { await act.snapshot(label || t('files.manual')); setLabel(''); await reload(); act.toast(t('files.versionSaved')); }}>{t('files.saveVersion')}</Btn></div>
        {vers.length === 0 ? <Empty icon="history" title={t('files.noVersions')} body={t('files.versionsHelp')} /> : <table className="tbl"><thead><tr><th>{t('files.when')}</th><th>{t('files.label')}</th><th /></tr></thead><tbody>{vers.map((v) => <tr key={v.id}><td className="num">{fd(v.at)}</td><td>{v.label} <Chip>{t('ver.' + v.kind)}</Chip></td><td className="text-end whitespace-nowrap"><Btn sm icon="compare" onClick={() => setDiff({ v, items: diffProjects(v.project as Project, p) })}>{t('files.compare')}</Btn> <Btn sm disabled={review} onClick={() => restore(v)}>{t('files.restore')}</Btn></td></tr>)}</tbody></table>}
      </Panel>
      <Panel title={t('files.offline')} bodyClass="p-3 text-[12.5px] flex flex-col gap-1.5"><div className="flex items-center gap-2"><span className="dot" style={{ background: (nav?.onLine ?? true) ? 'var(--ok)' : 'var(--warn)' }} />{(nav?.onLine ?? true) ? t('files.online') : t('files.offlineNow')}</div><p className="label">{t('files.offlineHelp')}</p>
        <div className="flex items-center gap-2"><Chip tone={!!nav && 'serviceWorker' in nav && !!nav.serviceWorker.controller ? 'ok' : ''}>{!!nav && 'serviceWorker' in nav && !!nav.serviceWorker.controller ? t('files.swActive') : t('files.swInactive')}</Chip></div></Panel>
    </div>
    {diff && <Modal title={`${t('files.compare')}: ${diff.v.label} → ${t('files.current')}`} onClose={() => setDiff(null)} wide>{diff.items.length === 0 ? <p>{t('files.noChanges')}</p> : <table className="tbl"><thead><tr><th>{t('files.path')}</th><th>{t('files.before')}</th><th>{t('files.after')}</th></tr></thead><tbody>{diff.items.map((d, i) => <tr key={i}><td className="ltr font-mono text-[11.5px]">{d.path}</td><td className="ltr">{val(d.before)}</td><td className="ltr">{val(d.after)}</td></tr>)}</tbody></table>}</Modal>}
  </div></div>;
}
