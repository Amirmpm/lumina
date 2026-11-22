import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const light = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1] ?? '';
function token(block: string, name: string) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  assert.ok(value, `missing --${name}`);
  return value;
}
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
test('gold theme uses a bright accent and keeps text readable in both modes', () => {
  assert.ok(luminance(token(light, 'accent')) > 0.45, 'light theme gold should be bright');
  for (const [name, palette] of [['light', light], ['dark', dark]] as const) {
    for (const [foreground, background] of [['accent-text', 'accent'], ['accent-text', 'accent-hover'], ['accent-ink', 'accent-soft'], ['text', 'surface'], ['muted', 'surface']] as const) {
      const ratio = contrast(token(palette, foreground), token(palette, background));
      assert.ok(ratio >= 4.5, `${name}: --${foreground} on --${background} contrast ${ratio.toFixed(2)} is below 4.5`);
    }
  }
  assert.match(css, /\.btn-primary\s*\{[^}]*color:\s*var\(--accent-text\)/);
  assert.match(css, /\.rail-item\[aria-current="page"\]\s*\{[^}]*color:\s*var\(--accent-ink\)/);
});
