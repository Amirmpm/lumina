import { useSyncExternalStore } from 'react';
import type { Lang, Project, Luminaire, Layout } from '../domain/types';
import { activeScenario, createProject, defaultInputs, newScenario, nowIso } from '../domain/project';
import { evaluate, summarize } from '../calc/evaluate';
import type { Evaluation } from '../calc/evaluate';
import { IdbStore, MemoryStore } from '../persistence/storage';
import type { IndexEntry, Store } from '../persistence/storage';
import { Autosaver, findRecovery } from '../persistence/autosave';
import type { DraftSink, SaveStatus } from '../persistence/autosave';
import { asCopy, importPackage } from '../persistence/package';
import { optimize } from '../optimize/optimizer';
import type { OptResult } from '../optimize/optimizer';
import type { UnitSystem } from '../lib/units';
import type { TunnelType } from '../domain/types';
import { uid } from '../lib/hash';

export type Stage = 'projects' | 'wizard' | 'design' | 'library' | 'results' | 'optimize' | 'scenarios' | 'files';
export interface Toast { id: string; tone: 'ok' | 'warn' | 'danger' | 'info'; text: string }
export interface Dialog { title: string; body: string; confirm: string; tone?: 'danger' | 'primary'; resolve: (v: boolean) => void }
export interface S {
  ready: boolean; project: Project | null; index: IndexEntry[]; lang: Lang; unit: UnitSystem; stage: Stage; wizardStep: number;
  sel: { x: number; lum: number | null }; review: boolean; save: { status: SaveStatus; at: string | null };
  past: Project[]; future: Project[]; evalV: number; toasts: Toast[]; dialog: Dialog | null;
  opt: OptResult | null; optRunning: number | null; recovery: Project | null; busy: string | null;
}
let state: S = {
  ready: false, project: null, index: [], lang: 'en', unit: 'metric', stage: 'projects', wizardStep: 0, sel: { x: 0, lum: null }, review: false,
  save: { status: 'saved', at: null }, past: [], future: [], evalV: 0, toasts: [], dialog: null, opt: null, optRunning: null, recovery: null, busy: null,
};
const ls = new Set<() => void>();
const set = (p: Partial<S>) => { state = { ...state, ...p }; ls.forEach((l) => l()); };
export const getState = () => state;
export function useS<T>(sel: (s: S) => T): T { return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => sel(state), () => sel(state)); }

const evalCache = new Map<string, Evaluation>();
export const getCachedEval = (hash: string | undefined) => (hash ? evalCache.get(hash) : undefined);

let store: Store = new MemoryStore();
let auto: Autosaver | null = null;
const sink: DraftSink | undefined = typeof localStorage !== 'undefined' ? { get: () => localStorage.getItem('lumina.draft'), set: (v) => localStorage.setItem('lumina.draft', v), clear: () => localStorage.removeItem('lumina.draft') } : undefined;
let lastKey = '', lastAt = 0;

export const act = {
  async init() {
    try { if (typeof indexedDB !== 'undefined') store = new IdbStore(); } catch { store = new MemoryStore(); }
    auto = new Autosaver(store, (status, at) => set({ save: { status, at } }), sink);
    let lang: Lang = 'en', unit: UnitSystem = 'metric';
    try { lang = (localStorage.getItem('lumina.lang') as Lang) === 'fa' ? 'fa' : 'en'; unit = localStorage.getItem('lumina.unit') === 'imperial' ? 'imperial' : 'metric'; } catch { /* ignore */ }
    const index = await store.list().catch(() => []);
    const recovery = sink ? await findRecovery(store, sink).catch(() => null) : null;
    set({ ready: true, index, lang, unit, recovery });
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => { void auto?.flush(); });
  },
  setLang(lang: Lang) { try { localStorage.setItem('lumina.lang', lang); } catch { /* ignore */ } set({ lang }); },
  setUnit(unit: UnitSystem) { try { localStorage.setItem('lumina.unit', unit); } catch { /* ignore */ } set({ unit }); },
  setStage(stage: Stage) { set({ stage }); },
  setWizardStep(wizardStep: number) { set({ wizardStep }); },
  toast(text: string, tone: Toast['tone'] = 'ok') { const id = uid('t'); set({ toasts: [...state.toasts, { id, tone, text }] }); setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), tone === 'danger' ? 7000 : 4000); },
  ask(title: string, body: string, confirm: string, tone: Dialog['tone'] = 'danger'): Promise<boolean> { return new Promise((resolve) => set({ dialog: { title, body, confirm, tone, resolve: (v) => { set({ dialog: null }); resolve(v); } } })); },
  select(sel: Partial<S['sel']>) { set({ sel: { ...state.sel, ...sel } }); },
  async refreshIndex() { set({ index: await store.list() }); },
  populate(p: Project) { for (const s of p.scenarios) { try { const ev = evaluate(p, s.layout); if (s.result && s.result.hash === ev.hash) evalCache.set(ev.hash, ev); } catch { /* skip */ } } set({ evalV: state.evalV + 1 }); },
  open(p: Project, review = false) {
    void auto?.flush();
    set({ project: p, review, past: [], future: [], stage: review ? 'results' : p.wizardDone ? 'design' : 'wizard', wizardStep: 0, opt: null, sel: { x: Number(p.inputs.length) / 2, lum: null }, recovery: null });
    act.populate(p);
  },
  async openById(id: string) { const p = await store.get(id); if (p) act.open(p); else act.toast('Project not found', 'danger'); },
  async create() {
    const p = createProject('road', 'Untitled project');
    await store.put(p); await act.refreshIndex(); act.open(p);
  },
  update(fn: (p: Project) => Project, o: { coalesce?: string; silent?: boolean } = {}) {
    const p = state.project; if (!p || state.review) return;
    const next = { ...fn(p), updatedAt: nowIso() };
    const t = Date.now(); const co = o.coalesce && o.coalesce === lastKey && t - lastAt < 1200; lastKey = o.coalesce ?? ''; lastAt = t;
    set({ project: next, past: o.silent || co ? state.past : [...state.past.slice(-99), p], future: o.silent ? state.future : [] });
    auto?.schedule(next);
  },
  undo() { const p = state.project; const prev = state.past[state.past.length - 1]; if (!p || !prev || state.review) return; set({ project: prev, past: state.past.slice(0, -1), future: [p, ...state.future] }); auto?.schedule(prev); },
  redo() { const p = state.project; const nx = state.future[0]; if (!p || !nx || state.review) return; set({ project: nx, future: state.future.slice(1), past: [...state.past, p] }); auto?.schedule(nx); },
  async saveNow() { try { await auto?.flush(); await act.refreshIndex(); act.toast('Saved'); } catch { act.toast('Save failed', 'danger'); } },
  async snapshot(label: string) { const p = state.project; if (!p || !auto) return; await auto.flush(); await auto.snapshot(p, 'manual', label); },
  async versions() { const p = state.project; return p ? store.versions(p.id) : []; },
  async rollback(v: Project) { const p = state.project; if (!p || !auto) return; await auto.snapshot(p, 'pre-rollback', 'Before rollback'); act.update(() => ({ ...v, id: p.id }), {}); },
  async removeProject(id: string) { await store.remove(id); if (state.project?.id === id) set({ project: null, stage: 'projects' }); await act.refreshIndex(); },
  async duplicate(id: string, suffix: string) { const p = await store.get(id); if (!p) return; const c = asCopy(p, suffix); await store.put(c); await act.refreshIndex(); },
  async getProject(id: string) { return store.get(id); },
  async allProjects() { const out: Project[] = []; for (const e of await store.list()) { const p = await store.get(e.id); if (p) out.push(p); } return out; },
  async importText(text: string, suffix: string): Promise<string | null> {
    const r = importPackage(text); if (!r.ok) return r.error;
    if (r.kind === 'backup') { for (const p of r.projects) { const exists = (await store.get(p.id)) !== undefined; await store.put(exists ? asCopy(p, suffix) : p); } await act.refreshIndex(); return null; }
    if (r.kind === 'review') { act.open(r.project, true); return null; }
    const exists = (await store.get(r.project.id)) !== undefined; const p = exists ? asCopy(r.project, suffix) : r.project;
    await store.put(p); await act.refreshIndex(); act.open(p); return null;
  },
  async makeEditableCopy(suffix: string) { const p = state.project; if (!p) return; const c = asCopy(p, suffix); await store.put(c); await act.refreshIndex(); act.open(c); },
  async recover() { const p = state.recovery; if (!p) return; await store.put(p); sink?.clear(); await act.refreshIndex(); act.open(p); act.toast('Recovered'); },
  discardRecovery() { sink?.clear(); set({ recovery: null }); },
  changeType(t: TunnelType) {
    act.update((p) => { const d = defaultInputs(t); const inputs = { ...d.inputs }, prov = { ...d.prov }; for (const k of Object.keys(inputs)) if (p.prov[k] === 'user' && typeof p.inputs[k] === typeof inputs[k]) { inputs[k] = p.inputs[k]; prov[k] = 'user'; } const base = createProject(t, p.name); return { ...p, tunnelType: t, inputs, prov, standardId: 'user', scenarios: base.scenarios.map((s, i) => ({ ...s, layout: { ...s.layout, luminaireId: p.scenarios[i]?.layout.luminaireId ?? s.layout.luminaireId } })), activeScenarioId: base.scenarios[0].id }; });
  },
  // ----- calculations
  calculate(all = false) {
    const p = state.project; if (!p) return;
    const targets = all ? p.scenarios : [activeScenario(p)];
    const results: Record<string, ReturnType<typeof summarize>> = {};
    let blocked = 0;
    for (const s of targets) { const ev = evaluate(p, s.layout); if (ev.ok) { evalCache.set(ev.hash, ev); results[s.id] = summarize(ev); } else blocked++; }
    set({ evalV: state.evalV + 1 });
    if (!state.review) act.update((q) => ({ ...q, scenarios: q.scenarios.map((s) => (results[s.id] ? { ...s, result: results[s.id]! } : s)) }), { silent: true });
    if (blocked) act.toast('blocked', 'warn');
  },
  evalOf(layout: Layout) { const p = state.project; if (!p) return null; const ev = evaluate(p, layout); return ev; },
  async runOpt() {
    const p = state.project; if (!p) return; set({ optRunning: 0 });
    const r = await optimize(p, p.opt, (f) => set({ optRunning: f }));
    set({ opt: r, optRunning: null });
  },
  addScenario(name: string, layout: Layout, source: 'manual' | 'optimizer', activate = true) {
    const sc = newScenario(name, layout, source);
    act.update((p) => ({ ...p, scenarios: [...p.scenarios, sc], activeScenarioId: activate ? sc.id : p.activeScenarioId }));
    return sc.id;
  },
  setLayout(patch: Partial<Layout>, coalesce?: string) {
    act.update((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === p.activeScenarioId ? { ...s, layout: { ...s.layout, ...patch } } : s)) }), { coalesce: coalesce ?? 'layout' });
  },
  upsertLuminaire(l: Luminaire) { act.update((p) => ({ ...p, luminaires: p.luminaires.some((x) => x.id === l.id) ? p.luminaires.map((x) => (x.id === l.id ? l : x)) : [...p.luminaires, l] })); },
  setBusy(busy: string | null) { set({ busy }); },
};
