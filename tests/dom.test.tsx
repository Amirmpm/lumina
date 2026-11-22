// Interactive UI test: drives the real React app through a full workflow in a simulated DOM (happy-dom).
// Optional dependency: `npm i -D happy-dom` (adds ~33 MB). The test skips itself when it is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act as reactAct } from 'react';
import { createRoot } from 'react-dom/client';
import { unzip } from '../src/exports/files';
import { importPackage, exportReview } from '../src/persistence/package';

let Window: (new (o?: object) => any) | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
try { ({ Window } = await import('happy-dom')); } catch { Window = null; }

test('DOM workflow: wizard → design → results → optimise → scenarios → library → edit/undo → exports → restart → review', { skip: !Window && 'happy-dom not installed' }, async () => {
  const win = new Window!({ url: 'http://localhost/', width: 1400, height: 900 });
  const g = globalThis as Record<string, unknown>;
  for (const k of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLCanvasElement', 'HTMLAnchorElement', 'Node', 'Element', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'getComputedStyle', 'MutationObserver', 'SVGElement', 'DocumentFragment', 'Text']) { try { Object.defineProperty(g, k, { value: k === 'window' ? win : win[k], configurable: true, writable: true }); } catch { /* read-only */ } }
  g.IS_REACT_ACT_ENVIRONMENT = true; g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0); g.cancelAnimationFrame = clearTimeout;
  g.ResizeObserver = class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} unobserve() {} };
  Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get: () => 640, configurable: true }); Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get: () => 400, configurable: true });
  const colors: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : k === 'measureText' ? (s: string) => ({ width: s.length * 8 }) : () => undefined), set: (t, k: string, v) => { if (k === 'fillStyle' && typeof v === 'string') colors.push(v); t[k] = v; return true; } });
  win.HTMLCanvasElement.prototype.getContext = () => ctx; win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,/9j/2Q==';
  const blobs: Blob[] = []; const downloads: string[] = [];
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => { blobs.push(b); return 'blob:x'; };
  win.HTMLAnchorElement.prototype.click = function (this: { download: string }) { downloads.push(this.download); };

  const { default: App } = await import('../src/App');
  const store = await import('../src/ui/store');
  const doc = win.document;
  const container = doc.createElement('div'); doc.body.appendChild(container);
  const wait = (ms = 30) => reactAct(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const text = () => doc.body.textContent as string;
  const all = (sel: string) => [...doc.querySelectorAll(sel)] as HTMLElement[];
  const find = (t: string, sel = 'button,[role=radio],[role=tab]') => all(sel).find((e) => (t.startsWith('=') ? (e.textContent ?? '').trim() === t.slice(1) : (e.textContent ?? '').trim().includes(t)) || e.getAttribute('aria-label') === t || e.getAttribute('title') === t);
  const click = async (t: string, sel?: string) => { process.stdout.write(`[step] click ${t}\n`); const el = find(t, sel); assert.ok(el, `button "${t}" not found`); await reactAct(async () => { el!.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); await wait(); };
  const setVal = async (el: HTMLElement, v: string, commit = true) => { await reactAct(async () => {
    const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    // happy-dom does not route synthetic events to React 19 root listeners reliably, so call the element's real React props handlers.
    const pk = Object.keys(el).find((k) => k.startsWith('__reactProps$')); const props = (pk ? (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[pk] : {}) as Record<string, (e: unknown) => void>;
    assert.ok(props.onChange, 'element has a React onChange handler'); props.onChange({ target: el, currentTarget: el });
  }); await wait();
    if (commit && el.tagName === 'INPUT') await reactAct(async () => { // blur happens after re-render in a browser: re-read fresh props
      const pk2 = Object.keys(el).find((k) => k.startsWith('__reactProps$'))!; ((el as unknown as Record<string, Record<string, (e: unknown) => void>>)[pk2]).onBlur?.({ target: el, currentTarget: el }); });
    await wait(); };
  const waitFor = async (pred: () => boolean, what: string, ms = 30000) => { process.stdout.write(`[step] waitFor ${what}\n`); const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) assert.fail('timeout: ' + what); await wait(50); } };
  const errors: string[] = []; const origErr = console.error; console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };

  // A saved preference is restored on startup and survives a remount.
  win.localStorage.setItem('lumina.theme', 'dark');
  let root = createRoot(container); await reactAct(async () => { root.render(<App />); }); await wait(100);
  assert.ok(text().includes('Projects'));
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  await click('Switch to light theme');
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(win.localStorage.getItem('lumina.theme'), 'light');
  await click('Switch to dark theme');
  await reactAct(async () => { root.unmount(); });
  root = createRoot(container); await reactAct(async () => { root.render(<App />); }); await wait(100);
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(win.localStorage.getItem('lumina.theme'), 'dark');
  await click('New project'); assert.ok(text().includes('Project setup'));
  await click('Switch to light theme'); assert.equal(doc.documentElement.dataset.theme, 'light');
  await click('Switch to dark theme'); assert.equal(doc.documentElement.dataset.theme, 'dark');
  await click('Mining / underground', '[role=radio]'); assert.ok(find('Mining / underground', '[role=radio]')!.getAttribute('aria-checked') === 'true');
  await setVal(doc.getElementById('pn')!, 'DOM Test Mine');
  for (let i = 0; i < 4; i++) await click('Next');
  assert.ok(text().includes('Project-defined criteria')); await click('Finish & calculate');
  assert.ok(text().includes('Cross-section') && text().includes('Up to date'), 'design view with fresh calculation');
  assert.equal(store.getState().project!.name, 'DOM Test Mine'); assert.equal(store.getState().project!.tunnelType, 'mining');
  assert.ok(colors.includes('#171b22'), 'dark canvases use the dark background');
  colors.length = 0;
  await click('Switch to light theme');
  assert.ok(colors.includes('#fbfcfd'), 'canvas redraws with light colors when switching themes');
  colors.length = 0;
  await click('Switch to dark theme');
  assert.ok(colors.includes('#171b22'), 'canvas redraws with dark colors when switching back');

  await click('فا'); assert.equal(doc.documentElement.dir, 'rtl'); assert.ok(text().includes('مقطع عرضی')); assert.ok(find('تغییر به حالت روشن')); await click('EN'); assert.equal(doc.documentElement.dir, 'ltr');
  await click('ft'); assert.ok(text().includes('ft')); await click('=m');

  colors.length = 0; await click('Results'); assert.ok(text().includes('Calculation results') && text().includes('E avg (maintained)') && text().includes('Criteria')); assert.ok(colors.includes('#171b22'), 'results heat map uses dark background');
  await click('Optimize'); await click('Run optimisation'); await waitFor(() => text().includes('Ranked candidates'), 'optimisation finished');
  assert.ok(store.getState().opt!.feasibleCount > 0); await click('Save as scenario'); assert.equal(store.getState().project!.scenarios.length, 2);
  await click('Scenarios'); assert.ok(text().includes('Side-by-side') && all('table tbody tr').length >= 2);

  await click('Luminaires'); assert.ok(text().includes('Sample LED linear 40 W') && text().includes('Sample (synthetic)'));
  await click('New luminaire'); const inputs = all('input.input'); await setVal(inputs.find((i) => (i as HTMLInputElement).value === '' && i.parentElement?.textContent?.includes('Model'))!, 'My custom 50 W');
  await click('Save', 'button'); assert.ok(text().includes('My custom 50 W') && text().includes('No photometry'), 'custom luminaire without photometry is flagged');
  assert.ok(store.getState().project!.luminaires.some((l) => l.model === 'My custom 50 W' && l.photometry === null));

  await click('Design'); const len0 = store.getState().project!.inputs.length as number;
  await setVal(doc.getElementById('f-length')!, '150'); assert.equal(store.getState().project!.inputs.length, 150); assert.ok(/Stale|Not calculated/.test(text()), 'result no longer shown as up to date after geometry change (the active scenario was just saved from the optimiser, so it may read "Not calculated")');
  await reactAct(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); }); await wait(); assert.ok(text().includes('Up to date'), 'Ctrl+Enter recalculates');
  await click('Undo (Ctrl+Z)'); assert.equal(store.getState().project!.inputs.length, len0, 'undo restores length');
  await setVal(doc.getElementById('f-length')!, '150'); await reactAct(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); }); await wait();

  await click('Files & export');
  for (const [label, ext] of [['PDF engineering report', '.pdf'], ['Excel', '.xlsx'], ['CSV bundle', '.zip'], ['DXF', '.dxf'], ['3D model', '.obj'], ['Editable project file', '.lumina.json'], ['Read-only review package', '.review.json']] as const) {
    const row = all('div').find((d) => d.className.includes('border-b') && (d.textContent ?? '').includes(label) && d.querySelector('button'))!; assert.ok(row, label);
    const n = downloads.length; await reactAct(async () => { row.querySelector('button')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); await wait(300);
    assert.equal(downloads.length, n + 1, `${label} produced a download`); assert.ok(downloads[n].endsWith(ext), `${downloads[n]} ends with ${ext}`);
  }
  assert.ok(text().includes('Created and re-parsed'));
  const xlsx = blobs[1]; assert.ok(xlsx.size > 1000); assert.ok(unzip(new Uint8Array(await xlsx.arrayBuffer())).some((f) => f.name === 'xl/worksheets/sheet1.xml'));
  const pkg = importPackage(await blobs[5].text()); assert.ok(pkg.ok && pkg.kind === 'project' && pkg.checksumOk);
  const dxf = await blobs[3].text(); assert.ok(dxf.includes('LUMINAIRES') && dxf.includes('SECTION'));

  await wait(1200); assert.equal(store.getState().save.status, 'saved', 'autosave completed');
  const id = store.getState().project!.id; const stored = await store.act.getProject(id); assert.equal(stored!.inputs.length, 150, 'edit persisted');
  await store.act.setStage('projects'); await store.act.openById(id); await wait(); assert.equal(store.getState().project!.inputs.length, 150, 'reopened project keeps edits');
  const list = await store.act.allProjects(); assert.ok(list.length >= 1);
  const err = await store.act.importText(exportReview(stored!), ' (review)'); assert.equal(err, null); await wait();
  assert.equal(store.getState().review, true); assert.ok(text().includes('Read-only review package'));
  store.act.update((p) => ({ ...p, name: 'HACK' })); assert.notEqual(store.getState().project!.name, 'HACK', 'review mode blocks edits');
  assert.equal((await store.act.getProject(id))!.name, 'DOM Test Mine', 'source project untouched');
  console.error = origErr;
  const real = errors.filter((e) => !/not wrapped in act|Warning: |ReactDOMTestUtils/.test(e)); assert.deepEqual(real, [], 'no console errors');
  await reactAct(async () => { root.unmount(); }); await win.happyDOM?.close?.();
});
