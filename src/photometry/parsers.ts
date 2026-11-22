// IES (LM-63) and LDT (EULUMDAT) parsers. Input is untrusted: strict validation, size limits, no throwing on bad data.
import type { Photometry } from '../domain/types';
import { MAX_TABLE, expandSymmetry, makePhotometry } from './index';

export interface ParsedLum {
  ok: true; photometry: Photometry;
  info: { manufacturer?: string; model?: string; power?: number; length?: number; width?: number; height?: number; lumensDeclared?: number; cct?: number; cri?: number };
}
export interface ParseFail { ok: false; errors: string[] }
export type ParseResult = ParsedLum | ParseFail;
const MAX_BYTES = 5_000_000;
const fail = (...errors: string[]): ParseFail => ({ ok: false, errors });
const nums = (s: string): number[] => s.replace(/,/g, ' ').split(/[\s]+/).filter(Boolean).map(Number);
const strictAsc = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);

export function parseIES(text: string): ParseResult {
  if (typeof text !== 'string' || text.length === 0) return fail('ies.empty');
  if (text.length > MAX_BYTES) return fail('file.tooLarge');
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first < 0 || !/^IESNA/i.test(lines[first].trim())) {
    // LM-63-1986 files may omit the header line, but must contain TILT=
    if (!lines.some((l) => /^TILT\s*=/i.test(l.trim()))) return fail('ies.noHeader');
  }
  const tiltIdx = lines.findIndex((l) => /^TILT\s*=/i.test(l.trim()));
  if (tiltIdx < 0) return fail('ies.noTilt');
  const kw: Record<string, string> = {};
  for (const l of lines.slice(0, tiltIdx)) {
    const m = /^\[([A-Z0-9_]+)\]\s*(.*)$/i.exec(l.trim());
    if (m) kw[m[1].toUpperCase()] = ((kw[m[1].toUpperCase()] ?? '') + ' ' + m[2]).trim();
  }
  let body = lines.slice(tiltIdx + 1);
  const tilt = lines[tiltIdx].split('=')[1].trim().toUpperCase();
  if (tilt.startsWith('INCLUDE')) {
    // lamp-to-luminaire geometry, n pairs, angles, factors — skip them
    const t = nums(body.join(' '));
    if (t.length < 2 || t.slice(0, 2).some((v) => !Number.isFinite(v))) return fail('ies.badTilt');
    const npairs = t[1];
    if (!Number.isInteger(npairs) || npairs < 0 || npairs > 1000) return fail('ies.badTilt');
    const skip = 2 + 2 * npairs;
    body = [t.slice(skip).join(' ')];
  } else if (tilt !== 'NONE') return fail('ies.tiltUnsupported');
  const t = nums(body.join(' '));
  if (t.length < 13) return fail('ies.truncated');
  if (t.some((v) => !Number.isFinite(v))) return fail('ies.nonNumeric');
  const [nLamps, lumens, mult, nV, nH, ptype, utype, w, l, h, ballast, , watts] = t;
  if (!Number.isInteger(nV) || !Number.isInteger(nH) || nV < 1 || nH < 1) return fail('ies.badCounts');
  if (nV * nH > MAX_TABLE || nV > 2000 || nH > 2000) return fail('file.tooLarge');
  if (ptype !== 1) return fail('ies.typeUnsupported'); // only Type C is implemented
  if (!(mult > 0)) return fail('ies.badMultiplier');
  const need = 13 + nV + nH + nV * nH;
  if (t.length < need) return fail('ies.truncated');
  const V = t.slice(13, 13 + nV), H = t.slice(13 + nV, 13 + nV + nH);
  if (!strictAsc(V) || !strictAsc(H)) return fail('ies.anglesNotAscending');
  if (V[0] < 0 || V[nV - 1] > 180 || H[0] < 0 || H[nH - 1] > 360) return fail('ies.angleRange');
  const cdRaw = t.slice(13 + nV + nH, need);
  if (cdRaw.some((v) => v < 0)) return fail('ies.negativeCandela');
  const rows: number[][] = [];
  for (let i = 0; i < nH; i++) rows.push(cdRaw.slice(i * nV, (i + 1) * nV).map((v) => v * mult));
  const warnings: string[] = [];
  if (nH > 1 && ![0, 90, 180, 360].includes(H[nH - 1]) && !(H[0] === 90 && H[nH - 1] === 270)) warnings.push('ies.oddHorizontal');
  if (ballast !== 1 && Number.isFinite(ballast)) warnings.push('ies.ballastNotApplied');
  if (V[0] > 0) warnings.push('ies.gammaStart');
  const ex = nH === 1 ? { C: [0, 360], cd: [rows[0], rows[0]] } : expandSymmetry(H, V, rows);
  const to_m = utype === 1 ? 0.3048 : 1;
  const declared = lumens > 0 ? nLamps * lumens : undefined;
  const photometry = makePhotometry(ex.C, V, ex.cd, 'verified', 'IES', declared, warnings);
  if (!(photometry.flux > 0)) return fail('ies.zeroFlux');
  return {
    ok: true, photometry,
    info: { manufacturer: kw.MANUFAC, model: kw.LUMINAIRE || kw.LUMCAT, power: watts > 0 ? watts : undefined, length: Math.abs(l) * to_m || undefined, width: Math.abs(w) * to_m || undefined, height: Math.abs(h) * to_m || undefined, lumensDeclared: declared },
  };
}

export function parseLDT(text: string): ParseResult {
  if (typeof text !== 'string' || text.length === 0) return fail('ldt.empty');
  if (text.length > MAX_BYTES) return fail('file.tooLarge');
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length < 30) return fail('ldt.truncated');
  const L = (k: number) => (lines[k] ?? '').trim(); // 0-based line
  const int = (k: number) => Number.parseInt(L(k), 10);
  const flt = (k: number) => Number.parseFloat(L(k).replace(',', '.'));
  const typeInd = int(1), symInd = int(2), Mc = int(3), Ng = int(5);
  if (![1, 2, 3].includes(typeInd)) return fail('ldt.badType');
  if (![0, 1, 2, 3, 4].includes(symInd)) return fail('ldt.badSymmetry');
  if (!Number.isInteger(Mc) || !Number.isInteger(Ng) || Mc < 1 || Ng < 1) return fail('ldt.badCounts');
  const planes = symInd === 0 ? Mc : symInd === 1 ? 1 : symInd === 4 ? Mc / 4 + 1 : Mc / 2 + 1;
  if (!Number.isInteger(planes) || planes * Ng > MAX_TABLE || Ng > 2000 || Mc > 4000) return fail('ldt.badCounts');
  const nSets = int(25);
  if (!Number.isInteger(nSets) || nSets < 1 || nSets > 20) return fail('ldt.badLampSets');
  const lampStart = 26;
  const flux = (() => { let s = 0; for (let k = 0; k < nSets; k++) { const nl = Math.abs(Number.parseInt(L(lampStart + k * 6), 10)); const f = Number.parseFloat(L(lampStart + k * 6 + 2).replace(',', '.')); s += (Number.isFinite(nl) ? nl : 0) * (Number.isFinite(f) ? f : 0); } return s; })();
  const watts = flt(lampStart + 5);
  const dataStart = lampStart + nSets * 6;
  const t = nums(lines.slice(dataStart).join(' '));
  const need = 10 + planes + Ng + planes * Ng;
  if (t.length < need) return fail('ldt.truncated');
  if (t.slice(0, need).some((v) => !Number.isFinite(v))) return fail('ldt.nonNumeric');
  const Cang = t.slice(10, 10 + planes), G = t.slice(10 + planes, 10 + planes + Ng);
  if (!strictAsc(G) || (planes > 1 && !strictAsc(Cang))) return fail('ldt.anglesNotAscending');
  if (G[0] < 0 || G[Ng - 1] > 180) return fail('ldt.angleRange');
  const conv = flt(23) > 0 ? flt(23) : 1; // conversion factor for luminous intensities
  if (!(flux > 0)) return fail('ldt.noFlux'); // cd/klm values cannot be scaled without lamp flux
  const raw = t.slice(10 + planes + Ng, need);
  if (raw.some((v) => v < 0)) return fail('ldt.negativeCandela');
  const rows: number[][] = [];
  for (let i = 0; i < planes; i++) rows.push(raw.slice(i * Ng, (i + 1) * Ng).map((v) => (v * flux * conv) / 1000));
  const H = symInd === 1 ? [0] : Cang;
  const ex = expandSymmetry(H, G, rows);
  const warnings: string[] = [];
  const lorl = flt(22);
  const photometry = makePhotometry(ex.C, G, ex.cd, 'verified', 'LDT', flux, warnings);
  if (!(photometry.flux > 0)) return fail('ldt.zeroFlux');
  if (lorl > 0 && Math.abs(photometry.flux - (flux * lorl) / 100) / Math.max(1, (flux * lorl) / 100) > 0.1) warnings.push('ldt.fluxMismatch');
  return {
    ok: true, photometry,
    info: { manufacturer: L(0) || undefined, model: L(8) || L(9) || undefined, power: watts > 0 ? watts : undefined, length: flt(12) > 0 ? flt(12) / 1000 : undefined, width: flt(13) > 0 ? flt(13) / 1000 : undefined, height: flt(14) > 0 ? flt(14) / 1000 : undefined, lumensDeclared: flux },
  };
}
export function parsePhotometricFile(name: string, text: string): ParseResult {
  const n = name.toLowerCase();
  if (n.endsWith('.ies')) return parseIES(text);
  if (n.endsWith('.ldt')) return parseLDT(text);
  return fail('file.unsupportedType');
}
