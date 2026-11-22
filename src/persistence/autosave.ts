import type { Project } from '../domain/types';
import { uid } from '../lib/hash';
import type { Store, Version } from './storage';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
export interface DraftSink { get(): string | null; set(v: string): void; clear(): void }
export const AUTO_VERSION_MS = 10 * 60 * 1000;
export const MAX_AUTO_VERSIONS = 20;

/** Debounced autosave with a synchronous crash-recovery draft and automatic version snapshots. */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Project | null = null;
  private lastVersionAt = 0;
  status: SaveStatus = 'saved';
  lastSavedAt: string | null = null;
  constructor(private store: Store, private onStatus: (s: SaveStatus, at: string | null) => void, private draft?: DraftSink, private delay = 700, private now: () => number = Date.now) {}
  private set(s: SaveStatus) { this.status = s; this.onStatus(s, this.lastSavedAt); }
  schedule(p: Project) {
    this.pending = p; this.set('unsaved');
    try { this.draft?.set(JSON.stringify({ at: p.updatedAt, project: p })); } catch { /* quota: draft is best-effort */ }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const p = this.pending; if (!p) return;
    this.pending = null; this.set('saving');
    try {
      await this.store.put(p);
      if (this.now() - this.lastVersionAt > AUTO_VERSION_MS) { await this.snapshot(p, 'auto', 'Autosave'); this.lastVersionAt = this.now(); }
      this.lastSavedAt = new Date().toISOString();
      if (!this.pending) { this.draft?.clear(); this.set('saved'); } else this.set('unsaved');
    } catch (e) { this.pending = this.pending ?? p; this.set('error'); throw e; }
  }
  async snapshot(p: Project, kind: Version['kind'], label: string) {
    await this.store.putVersion({ id: uid('ver'), projectId: p.id, at: new Date().toISOString(), label, kind, project: JSON.parse(JSON.stringify(p)) });
    const autos = (await this.store.versions(p.id)).filter((v) => v.kind === 'auto');
    for (const v of autos.slice(MAX_AUTO_VERSIONS)) await this.store.removeVersion(v.id);
  }
}
/** Returns an unsaved draft if it is newer than (or missing from) the stored copy. */
export async function findRecovery(store: Store, sink: DraftSink): Promise<Project | null> {
  const raw = sink.get(); if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { at: string; project: Project };
    const stored = await store.get(d.project.id);
    if (!stored || stored.updatedAt < d.at) return d.project;
  } catch { /* corrupt draft ignored */ }
  sink.clear(); return null;
}
