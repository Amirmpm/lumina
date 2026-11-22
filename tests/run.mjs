import { build } from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = path.resolve('tests');
const entries = readdirSync(dir).filter((f) => /\.test\.tsx?$/.test(f)).map((f) => path.join(dir, f));
const out = path.resolve('.test-out');
rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: out, outExtension: { '.js': '.mjs' }, logLevel: 'error', external: ['happy-dom'],
  jsx: 'automatic', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  alias: { '@': path.resolve('src') },
});
const files = readdirSync(out).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(out, f));
const r = spawnSync(process.execPath, ['--test', '--test-force-exit', ...files], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
