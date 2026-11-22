import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('favicon assets are available for browsers, home screens and offline use', () => {
  const html = readFileSync('index.html', 'utf8');
  const worker = readFileSync('public/sw.js', 'utf8');
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { icons: { src: string; sizes: string; type: string }[] };
  assert.match(html, /rel="icon"[^>]+icon\.svg\?v=2/);
  assert.match(html, /rel="alternate icon"[^>]+favicon\.ico\?v=2/);
  assert.match(html, /rel="apple-touch-icon"[^>]+apple-touch-icon\.png\?v=2/);
  assert.match(readFileSync('public/icon.svg', 'utf8'), /viewBox="0 0 64 64"/);
  for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
    const data = readFileSync(`public/${file}`);
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
  }
  const ico = readFileSync('public/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1); assert.ok(ico.readUInt16LE(4) >= 2);
  for (const path of ['icon.svg?v=2', 'favicon.ico?v=2', 'apple-touch-icon.png?v=2', 'icon-192.png?v=2', 'icon-512.png?v=2']) {
    assert.ok(existsSync(`public/${path.split('?')[0]}`));
    assert.ok(worker.includes(path), `${path} is cached for offline use`);
  }
  for (const size of ['any', '192x192', '512x512']) assert.ok(manifest.icons.some((icon) => icon.sizes === size));
});
