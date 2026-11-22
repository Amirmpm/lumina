// Dependency-free file writers: CSV, ZIP(store), XLSX, DXF (R12 ASCII), OBJ, PDF (image pages).
export type Cell = string | number | null | undefined;
const enc = new TextEncoder();

// ---------- CSV
export function toCsv(rows: Cell[][]): string {
  const esc = (c: Cell) => {
    if (c === null || c === undefined) return '';
    let s = String(c);
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s; // spreadsheet formula-injection guard
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

// ---------- ZIP (stored, no compression)
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(d: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  const u16 = (v: number) => [v & 255, (v >> 8) & 255], u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...name]);
    chunks.push(lh, f.data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]));
    off += lh.length + f.data.length;
  }
  const cs = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  return concat([...chunks, ...central, end]);
}
export function unzip(b: Uint8Array): { name: string; data: Uint8Array }[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip: no end record');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip: bad central dir');
    const size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    const data = b.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + size);
    if (crc32(data) !== dv.getUint32(p + 16, true)) throw new Error('zip: crc mismatch ' + name);
    out.push({ name, data }); p += 46 + nl + xl + cl;
  }
  return out;
}
export function concat(parts: Uint8Array[]): Uint8Array { const t = parts.reduce((a, c) => a + c.length, 0); const o = new Uint8Array(t); let k = 0; for (const c of parts) { o.set(c, k); k += c.length; } return o; }

// ---------- XLSX
const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export function buildXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  const names = sheets.map((s, i) => xml(s.name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet' + (i + 1)));
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, s: string) => files.push({ name, data: enc.encode(s) });
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
      if (c === null || c === undefined || c === '') return '';
      const ref = colName(ci) + (ri + 1);
      return typeof c === 'number' && Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(c))}</t></is></c>`;
    }).join('')}</row>`).join('');
    add(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zip(files);
}

// ---------- DXF (AC1009 ASCII). Non-ASCII text is replaced because R12 has no Unicode text.
export interface DxfEnt { t: 'LINE'; layer: string; a: [number, number]; b: [number, number] } 
export type DxfItem = DxfEnt | { t: 'CIRCLE'; layer: string; c: [number, number]; r: number } | { t: 'TEXT'; layer: string; p: [number, number]; h: number; s: string };
export const LAYERS: Record<string, number> = { TUNNEL_PLAN: 7, CALC_ZONE: 3, LUMINAIRES: 2, TUNNEL_SECTION: 7, LUMINAIRES_SECTION: 2, DIMENSIONS: 1, LABELS: 5 };
export function buildDxf(items: DxfItem[]): string {
  const o: string[] = [];
  const g = (c: number, v: string | number) => { o.push(String(c), String(typeof v === 'number' ? +v.toFixed(6) : v)); };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 6); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYERS).length);
  for (const [n, c] of Object.entries(LAYERS)) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of items) {
    g(0, e.t); g(8, e.layer);
    if (e.t === 'LINE') { g(10, e.a[0]); g(20, e.a[1]); g(30, 0); g(11, e.b[0]); g(21, e.b[1]); g(31, 0); }
    else if (e.t === 'CIRCLE') { g(10, e.c[0]); g(20, e.c[1]); g(30, 0); g(40, e.r); }
    else { g(10, e.p[0]); g(20, e.p[1]); g(30, 0); g(40, e.h); g(1, e.s.replace(/[^\x20-\x7e]/g, '?')); }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export function parseDxfEntities(s: string): { type: string; layer: string }[] {
  const L = s.split(/\r?\n/); const out: { type: string; layer: string }[] = []; let inEnt = false;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim();
    if (c === '2' && v === 'ENTITIES') inEnt = true;
    else if (c === '0' && v === 'ENDSEC') inEnt = false;
    else if (inEnt && c === '0') out.push({ type: v, layer: '' });
    else if (inEnt && c === '8' && out.length) out[out.length - 1].layer = v;
  }
  return out;
}

// ---------- OBJ (metres, Y-up conversion not applied: x along tunnel, y transverse, z up)
export function buildObj(parts: { name: string; verts: [number, number, number][]; faces: number[][] }[]): string {
  const o = ['# Lumina tunnel model — units: metres; x = tunnel axis, y = transverse, z = up'];
  let base = 0;
  for (const p of parts) { o.push('o ' + p.name.replace(/\s+/g, '_')); for (const v of p.verts) o.push(`v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`); for (const f of p.faces) o.push('f ' + f.map((i) => i + 1 + base).join(' ')); base += p.verts.length; }
  return o.join('\n') + '\n';
}

// ---------- PDF: each page is a full-page JPEG (renders Persian/Latin text identically via the browser canvas).
export function buildPdf(pages: { jpeg: Uint8Array; w: number; h: number }[], title: string): Uint8Array {
  const parts: Uint8Array[] = []; const offs: number[] = []; let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, fn: () => void) => { offs[n] = len; push(`${n} 0 obj\n`); fn(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const nObj = 2 + pages.length * 3 + 1;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2; const W = 595.28, H = (595.28 * p.h) / p.w;
    obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    const s = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(ct, () => push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`));
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); push(p.jpeg); push('\nendstream'); });
  });
  const info = nObj; obj(info, () => push(`<< /Title (${title.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '')}) /Producer (Lumina) >>`));
  const xr = len;
  push(`xref\n0 ${nObj + 1}\n0000000000 65535 f \n` + offs.slice(1).map((o2) => String(o2).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${nObj + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xr}\n%%EOF\n`);
  return concat(parts);
}
export function pdfPageCount(b: Uint8Array): number { const s = new TextDecoder('latin1').decode(b); const m = /\/Type \/Pages \/Count (\d+)/.exec(s); return m ? Number(m[1]) : 0; }
