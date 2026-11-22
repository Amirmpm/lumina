import { useEffect, useLayoutEffect, useState } from 'react';
import { useT } from './i18n';
import { act, useS } from './ui/store';
import type { Stage } from './ui/store';
import { Banner, Btn, Chip, DialogHost, Icon, ToastHost, verdictChip } from './ui/kit';
import { Home, Wizard } from './ui/Wizard';
import { Workbench } from './ui/Workbench';
import { Library } from './ui/Library';
import { Optimize, Results, Scenarios } from './ui/Analysis';
import { Files } from './ui/Files';
import { useModel } from './ui/model';
import { ThemeContext } from './ui/theme';
import type { Theme } from './ui/theme';
import { TUNNEL_TYPES } from './domain/fields';

const RAIL: { id: Stage; icon: string; k: string }[] = [
  { id: 'wizard', icon: 'sliders', k: 'stage.wizard' }, { id: 'design', icon: 'cube', k: 'stage.design' }, { id: 'library', icon: 'bolt', k: 'stage.library' },
  { id: 'results', icon: 'chart', k: 'stage.results' }, { id: 'optimize', icon: 'wand', k: 'stage.optimize' }, { id: 'scenarios', icon: 'compare', k: 'stage.scenarios' }, { id: 'files', icon: 'folder', k: 'stage.files' },
];

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const t = useT();
  const label = t(theme === 'light' ? 'theme.switchDark' : 'theme.switchLight');
  return <button className="btn btn-ink btn-sm" onClick={onToggle} aria-label={label} title={label}>
    {theme === 'light'
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></svg>
      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>}
    <span className="max-[700px]:hidden">{t(theme === 'light' ? 'theme.dark' : 'theme.light')}</span>
  </button>;
}
function SaveChip() {
  const t = useT(); const s = useS((x) => x.save); const review = useS((x) => x.review);
  if (review) return <Chip tone="info"><Icon n="lock" s={11} />{t('save.readonly')}</Chip>;
  const at = s.at ? new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (s.status === 'saved') return <Chip tone="ok"><Icon n="check" s={11} />{t('save.saved')} {at}</Chip>;
  if (s.status === 'saving') return <Chip><Icon n="refresh" s={11} className="spin" />{t('save.saving')}</Chip>;
  if (s.status === 'unsaved') return <Chip tone="warn">{t('save.unsaved')}</Chip>;
  return <button className="chip chip-danger" onClick={() => act.saveNow()}><Icon n="alert" s={11} />{t('save.error')}</button>;
}
function StatusBar() {
  const m = useModel(); const t = useT(); const sel = useS((s) => s.sel); const { ev, status, issues, lum } = m;
  const errs = issues.filter((i) => i.severity === 'error').length;
  return <footer className="h-7 shrink-0 flex items-center gap-3 px-3 border-t border-[var(--border)] bg-[var(--surface)] text-[12px] overflow-hidden whitespace-nowrap">
    {status === 'fresh' ? <Chip tone="ok">{t('calc.fresh')}</Chip> : status === 'stale' ? <Chip tone="warn">{t('calc.stale')}</Chip> : status === 'blocked' ? <Chip tone="danger">{t('calc.blocked')}</Chip> : <Chip>{t('calc.none')}</Chip>}
    {ev?.maintained && <><span className="num ltr">E<sub>avg,m</sub> {ev.maintained.avg.toFixed(1)} lx</span><span className="num ltr">U0 {ev.maintained.u0.toFixed(2)}</span>{verdictChip(ev.std.verdict, t)}</>}
    <span className="flex-1" />
    {errs > 0 && <Chip tone="danger">{t('status.errors', { n: errs })}</Chip>}
    {lum && <Chip tone={lum.photometry?.quality === 'verified' ? 'ok' : lum.photometry ? 'warn' : 'danger'} title={t('phot.help')}>{t('lib.photometry')}: {t('phot.' + (lum.photometry?.quality ?? 'none'))}</Chip>}
    <span className="num ltr text-[var(--muted)]">x = {sel.x.toFixed(1)} m</span>
  </footer>;
}
function Shell({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const t = useT(); const s = useS((x) => x); const p = s.project!; const m = useModel();
  const type = TUNNEL_TYPES.find((x) => x.id === p.tunnelType)!;
  return <>
    <header className="h-11 shrink-0 flex items-center gap-2 px-3 text-[var(--ink-text)] border-b border-[var(--border)]" style={{ background: 'var(--ink)' }}>
      <button className="flex items-center gap-2 pe-3 me-1 border-e border-[var(--border)] h-7" onClick={() => act.setStage('projects')} title={t('nav.projects')} aria-label={t('nav.projects')}><LogoMark /><span className="font-semibold tracking-wide">Lumina</span></button>
      <input aria-label={t('meta.name')} className="bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] rounded px-2 h-7 font-medium min-w-[120px] max-w-[320px] w-[24ch]" value={p.name} disabled={s.review} onChange={(e) => act.update((x) => ({ ...x, name: e.target.value }), { coalesce: 'name' })} />
      <Chip>{type.label[s.lang]}</Chip><SaveChip />
      <span className="flex-1" />
      <Btn variant="ink" sm iconOnly icon="undo" title={`${t('common.undo')} (Ctrl+Z)`} disabled={!s.past.length || s.review} onClick={() => act.undo()} />
      <Btn variant="ink" sm iconOnly icon="redo" title={`${t('common.redo')} (Ctrl+Shift+Z)`} disabled={!s.future.length || s.review} onClick={() => act.redo()} />
      <button className="btn btn-primary btn-sm" disabled={m.status === 'blocked' || s.review} onClick={() => act.calculate()} title={t('calc.runHelp')}><Icon n="play" s={14} />{t('calc.run')}{m.status === 'stale' || m.status === 'none' ? <span className="dot" style={{ background: '#ffd68a' }} /> : null}</button>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <div className="seg" role="group" aria-label={t('common.language')}>
        {(['en', 'fa'] as const).map((l) => <button key={l} aria-pressed={s.lang === l} onClick={() => act.setLang(l)}>{l === 'en' ? 'EN' : 'فا'}</button>)}</div>
      <div className="seg" role="group" aria-label={t('common.units')}>
        {(['metric', 'imperial'] as const).map((u) => <button key={u} aria-pressed={s.unit === u} onClick={() => act.setUnit(u)}>{u === 'metric' ? 'm' : 'ft'}</button>)}</div>
    </header>
    {s.review && <Banner tone="info" icon="lock" actions={<Btn sm variant="primary" onClick={() => act.makeEditableCopy(' (copy)')}>{t('review.copy')}</Btn>}>{t('review.banner')}</Banner>}
    <div className="flex-1 flex min-h-0">
      <nav aria-label={t('nav.main')} className="w-[188px] max-[1100px]:w-[52px] shrink-0 bg-[var(--surface)] border-e border-[var(--border)] py-2 flex flex-col">
        <button className="rail-item" onClick={() => act.setStage('projects')} aria-current={s.stage === 'projects' ? 'page' : undefined} title={t('nav.projects')}><Icon n="home" /><span className="rail-label">{t('nav.projects')}</span></button>
        <div className="h-px bg-[var(--border)] my-1.5 mx-3" />
        {RAIL.map((r, i) => <button key={r.id} className="rail-item" aria-current={s.stage === r.id ? 'page' : undefined} title={t(r.k)} onClick={() => act.setStage(r.id)}><Icon n={r.icon} /><span className="rail-label flex-1">{t(r.k)}</span>
          {r.id === 'wizard' && !p.wizardDone && <span className="dot rail-label" style={{ background: 'var(--warn)' }} title={t('wiz.incomplete')} />}{r.id === 'results' && m.status !== 'fresh' && <span className="dot rail-label" style={{ background: m.status === 'blocked' ? 'var(--danger)' : 'var(--warn)' }} />}
          <span className="kbd rail-label opacity-0 hidden">{i}</span></button>)}
        <div className="mt-auto px-3 py-2 text-[11px] text-[var(--faint)] rail-label">{t('nav.shortcuts')}</div>
      </nav>
      <main className="flex-1 min-w-0 min-h-0 bg-[var(--bg)]">
        {s.stage === 'wizard' && <Wizard />}{s.stage === 'design' && <Workbench />}{s.stage === 'library' && <Library />}{s.stage === 'results' && <Results />}{s.stage === 'optimize' && <Optimize />}{s.stage === 'scenarios' && <Scenarios />}{s.stage === 'files' && <Files />}
      </main>
    </div>
    <StatusBar />
  </>;
}
function LogoMark() { return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V12a9 9 0 0118 0v8" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="9" r="2.6" fill="var(--accent)" /><path d="M12 12v8" stroke="var(--accent)" strokeWidth="1.4" strokeDasharray="2 2" /></svg>; }

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('lumina.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#15191f' : '#ffffff');
    try { localStorage.setItem('lumina.theme', theme); } catch { /* storage may be unavailable */ }
  }, [theme]);
  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light');
  const t = useT(); const ready = useS((s) => s.ready); const project = useS((s) => s.project); const stage = useS((s) => s.stage); const lang = useS((s) => s.lang);
  useEffect(() => { void act.init(); }, []);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr'; document.title = t('app.title'); }, [lang, t]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); act.calculate(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void act.saveNow(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) act.redo(); else act.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); act.redo(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  return <ThemeContext.Provider value={theme}><div className="h-full flex flex-col" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
    {!ready ? <div className="h-full grid place-items-center text-[var(--muted)]"><Icon n="refresh" className="spin" s={24} /></div> : project && stage !== 'projects' ? <Shell theme={theme} onToggleTheme={toggleTheme} /> : <>
      <header className="h-11 shrink-0 flex items-center gap-2 px-3 text-[var(--ink-text)] border-b border-[var(--border)]" style={{ background: 'var(--ink)' }}><LogoMark /><span className="font-semibold tracking-wide">Lumina</span><span className="text-[var(--ink-muted)] text-[12px] ms-2">{t('app.tag')}</span><span className="flex-1" />
        {project && <Btn variant="ink" sm onClick={() => act.setStage('design')}>{t('nav.back', { name: project.name })}</Btn>}
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <div className="seg" role="group" aria-label={t('common.language')}>{(['en', 'fa'] as const).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => act.setLang(l)}>{l === 'en' ? 'EN' : 'فا'}</button>)}</div></header>
      <main className="flex-1 min-h-0"><Home /></main></>}
    <DialogHost /><ToastHost />
  </div></ThemeContext.Provider>;
}
