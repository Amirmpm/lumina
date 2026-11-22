import type { Project } from '../domain/types';

export interface IndexEntry { id: string; name: string; tunnelType: string; updatedAt: string; createdAt: string }
export interface Version { id: string; projectId: string; at: string; label: string; kind: 'auto' | 'manual' | 'pre-rollback'; project: Project }
export interface Store {
  list(): Promise<IndexEntry[]>; get(id: string): Promise<Project | undefined>; put(p: Project): Promise<void>; remove(id: string): Promise<void>;
  putVersion(v: Version): Promise<void>; versions(projectId: string): Promise<Version[]>; removeVersion(id: string): Promise<void>;
}
const entry = (p: Project): IndexEntry => ({ id: p.id, name: p.name, tunnelType: p.tunnelType, updatedAt: p.updatedAt, createdAt: p.createdAt });

export class MemoryStore implements Store {
  projects = new Map<string, string>(); vers = new Map<string, Version>();
  async list() { return [...this.projects.values()].map((s) => entry(JSON.parse(s) as Project)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) { const s = this.projects.get(id); return s ? (JSON.parse(s) as Project) : undefined; }
  async put(p: Project) { this.projects.set(p.id, JSON.stringify(p)); }
  async remove(id: string) { this.projects.delete(id); for (const [k, v] of this.vers) if (v.projectId === id) this.vers.delete(k); }
  async putVersion(v: Version) { this.vers.set(v.id, JSON.parse(JSON.stringify(v))); }
  async versions(pid: string) { return [...this.vers.values()].filter((v) => v.projectId === pid).sort((a, b) => b.at.localeCompare(a.at)); }
  async removeVersion(id: string) { this.vers.delete(id); }
}

/** IndexedDB-backed store (browser). Whole-project records; transactions make each write atomic (crash-safe). */
export class IdbStore implements Store {
  private db: Promise<IDBDatabase>;
  constructor(name = 'lumina') {
    this.db = new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); const v = r.result.createObjectStore('versions', { keyPath: 'id' }); v.createIndex('pid', 'projectId'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  private async tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  }
  async list() { const all = await this.tx<Project[]>('projects', 'readonly', (s) => s.getAll()); return all.map(entry).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) { return this.tx<Project | undefined>('projects', 'readonly', (s) => s.get(id)); }
  async put(p: Project) { await this.tx('projects', 'readwrite', (s) => s.put(p)); }
  async remove(id: string) { await this.tx('projects', 'readwrite', (s) => s.delete(id)); for (const v of await this.versions(id)) await this.removeVersion(v.id); }
  async putVersion(v: Version) { await this.tx('versions', 'readwrite', (s) => s.put(v)); }
  async versions(pid: string) { const all = await this.tx<Version[]>('versions', 'readonly', (s) => s.index('pid').getAll(pid)); return all.sort((a, b) => b.at.localeCompare(a.at)); }
  async removeVersion(id: string) { await this.tx('versions', 'readwrite', (s) => s.delete(id)); }
}
