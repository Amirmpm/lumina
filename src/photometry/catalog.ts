// Internal catalogue. Every record here is a SAMPLE with synthetic photometry. No manufacturer, product,
// certification or price is claimed. Real data must come from imported IES/LDT files.
import type { Luminaire } from '../domain/types';
import { syntheticPhotometry } from './index';

const S = 'Lumina SAMPLE record — generic, synthetic cos^n photometry normalised to the stated flux. Not a manufacturer product.';
const mk = (id: string, model: string, power: number, flux: number, nA: number, nT: number, len: number, wid: number): Luminaire => ({
  id, model, kind: 'sample', source: S, power, length: len, width: wid, height: 0.1, mounting: 'ceiling / wall bracket (sample)',
  photometry: syntheticPhotometry(flux, nA, nT, 'sample-synthetic', 'synthetic'),
});
export function sampleCatalog(): Luminaire[] {
  return [
    mk('sample-20', 'Sample LED linear 20 W', 20, 2600, 1.5, 3, 0.6, 0.08),
    mk('sample-40', 'Sample LED linear 40 W', 40, 5400, 1.5, 3, 1.2, 0.08),
    mk('sample-60', 'Sample LED linear 60 W', 60, 8200, 1.5, 3, 1.2, 0.1),
    mk('sample-100', 'Sample LED 100 W wide', 100, 13500, 2, 2, 0.5, 0.3),
    mk('sample-150', 'Sample LED 150 W wide', 150, 20500, 2, 2, 0.6, 0.35),
    mk('sample-200n', 'Sample LED 200 W narrow', 200, 27000, 6, 6, 0.7, 0.4),
  ];
}
/** Converts upstream (legacy web app) luminaire JSON. `ex_rated` booleans are NOT carried over. */
export function importLegacyLuminaires(raw: unknown): { items: Luminaire[]; skipped: number } {
  const items: Luminaire[] = []; let skipped = 0;
  if (!Array.isArray(raw)) return { items, skipped: 1 };
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') { skipped++; continue; }
    const power = Number(r.watts), lumens = Number(r.lumens);
    if (typeof r.model !== 'string' || !(power > 0) || !(lumens > 0)) { skipped++; continue; }
    const n = Math.max(1, Math.min(60, 100 / Math.max(10, Number(r.beam_angle) || 100) * 1.5));
    items.push({
      id: 'legacy-' + r.model.replace(/[^A-Za-z0-9]+/g, '-'), model: r.model, kind: 'custom', power,
      source: 'Imported from legacy Lumina web catalogue. Flux/power/price unverified; photometry is an approximate lobe from beam angle. Legacy "ex_rated" flag was ignored — no explosion-protection data established.',
      length: 0.6, width: 0.1, height: 0.1, mounting: 'unspecified', lifeHours: Number(r.life_h) || undefined,
      priceEach: Number(r.price_usd) > 0 ? Number(r.price_usd) : undefined, pf: Number(r.pf) || undefined,
      photometry: syntheticPhotometry(lumens, n, n, 'approximate', 'beam-approx'),
    });
  }
  return { items, skipped };
}
