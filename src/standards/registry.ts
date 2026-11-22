// Standards registry. Each entry states scope, edition, source and ACTUAL implementation status.
// Criteria values are only embedded where they are widely published and are flagged for verification
// against the purchased edition. Nothing here is a certification or a legal compliance statement.
import type { L, Project, TunnelType, Verdict } from '../domain/types';

export type ImplStatus = 'supported' | 'partial' | 'unsupported';
export type Metric = 'eAvgM' | 'eMinM' | 'u0';
export interface Criterion {
  id: string; label: L; metric?: Metric; op?: '>='; value?: number; unit?: string;
  ref: string; // reference to the criterion in the source (table/clause name only; no text reproduced)
  origin: 'normative-unverified' | 'user' | 'placeholder' | 'none';
  status: ImplStatus; // implementation status of THIS criterion
  note?: L;
}
export interface StandardDef {
  id: string; name: L; edition: string; publisher: string; source: string;
  scope: L; types: TunnelType[]; jurisdictions: string[]; status: ImplStatus;
  limitations: L; criteria: (p: Project) => Criterion[];
}
const L$ = (en: string, fa: string): L => ({ en, fa });

const P_CLASSES: Record<string, [number, number]> = { P1: [15, 3], P2: [10, 2], P3: [7.5, 1.5], P4: [5, 1], P5: [3, 0.6], P6: [2, 0.4] };

export const STANDARDS: StandardDef[] = [
  {
    id: 'none', name: L$('No standard selected', 'بدون استاندارد'), edition: '—', publisher: '—', source: '—',
    scope: L$('Calculation only; no compliance statement is produced.', 'فقط محاسبه؛ هیچ اظهار انطباقی تولید نمی‌شود.'),
    types: ['road', 'mining', 'railway'], jurisdictions: ['*'], status: 'supported',
    limitations: L$('Results show direct maintained illuminance and uniformity only. No pass/fail verdict can be made.', 'نتایج فقط روشنایی مستقیم و یکنواختی را نشان می‌دهند. حکم قبول/رد ممکن نیست.'),
    criteria: () => [],
  },
  {
    id: 'user', name: L$('Project-defined criteria', 'معیارهای تعریف‌شده توسط پروژه'), edition: 'user', publisher: 'Project owner', source: 'Entered by the user from the governing regulation/specification',
    scope: L$('Average, minimum and uniformity thresholds you enter. Use for mining, railway or any jurisdiction-specific requirement whose values are not embedded in Lumina.', 'آستانه‌های میانگین، کمینه و یکنواختی که شما وارد می‌کنید.'),
    types: ['road', 'mining', 'railway'], jurisdictions: ['*'], status: 'supported',
    limitations: L$('Lumina cannot verify that your values match the governing document. Defaults are placeholders, not regulation values.', 'لومینا نمی‌تواند تطابق مقادیر با سند حاکم را تأیید کند. مقادیر پیش‌فرض جایگزین هستند.'),
    criteria: (p) => {
      const isDefault = (k: string) => p.prov[k] !== 'user';
      const o = (k: string) => (isDefault(k) ? 'placeholder' : 'user') as Criterion['origin'];
      return [
        { id: 'u-eavg', label: L$('Maintained average illuminance', 'روشنایی متوسط نگهداری‌شده'), metric: 'eAvgM', op: '>=', value: Number(p.inputs.crit_eavg), unit: 'lx', ref: 'user input crit_eavg', origin: o('crit_eavg'), status: 'supported' },
        { id: 'u-emin', label: L$('Maintained minimum illuminance', 'روشنایی کمینه نگهداری‌شده'), metric: 'eMinM', op: '>=', value: Number(p.inputs.crit_emin), unit: 'lx', ref: 'user input crit_emin', origin: o('crit_emin'), status: 'supported' },
        { id: 'u-u0', label: L$('Overall uniformity U0 = Emin/Eavg', 'یکنواختی کلی U0'), metric: 'u0', op: '>=', value: Number(p.inputs.crit_u0), ref: 'user input crit_u0', origin: o('crit_u0'), status: 'supported' },
      ];
    },
  },
  {
    id: 'en13201-p', name: L$('EN 13201-2 P-classes (illuminance subset)', 'EN 13201-2 کلاس‌های P (زیرمجموعه‌ی روشنایی)'), edition: 'EN 13201-2:2015', publisher: 'CEN', source: 'https://standards.cencenelec.eu (purchase required)',
    scope: L$('Road/street lighting for pedestrians and low-speed users. It is NOT a tunnel standard; shown for tunnel approach/exit roads or walkways only.', 'روشنایی راه/خیابان برای عابران و سرعت پایین. استاندارد تونل نیست؛ فقط برای مسیرهای ورودی/خروجی یا پیاده‌رو.'),
    types: ['road'], jurisdictions: ['EU', 'EEA', 'UK'], status: 'partial',
    limitations: L$('Only the maintained Eavg / Emin requirements of the selected P-class are evaluated. Values are transcribed and flagged "verify against the purchased edition". Semi-cylindrical/vertical illuminance, glare and luminance classes are not evaluated.', 'فقط Eavg/Emin نگهداری‌شده‌ی کلاس P ارزیابی می‌شود. مقادیر باید با ویرایش خریداری‌شده تأیید شوند.'),
    criteria: (p) => {
      const pc = String(p.inputs.pclass ?? 'P4'); const [ea, em] = P_CLASSES[pc] ?? P_CLASSES.P4;
      return [
        { id: 'p-eavg', label: L$(`${pc}: maintained average illuminance`, `${pc}: روشنایی متوسط`), metric: 'eAvgM', op: '>=', value: ea, unit: 'lx', ref: 'EN 13201-2 Table (P classes), Eavg', origin: 'normative-unverified', status: 'supported' },
        { id: 'p-emin', label: L$(`${pc}: minimum illuminance`, `${pc}: روشنایی کمینه`), metric: 'eMinM', op: '>=', value: em, unit: 'lx', ref: 'EN 13201-2 Table (P classes), Emin', origin: 'normative-unverified', status: 'supported' },
        { id: 'p-vert', label: L$('Semi-cylindrical / vertical illuminance (where specified)', 'روشنایی نیم‌استوانه‌ای / قائم'), ref: 'EN 13201-2 additional criteria', origin: 'none', status: 'unsupported' },
      ];
    },
  },
  {
    id: 'cie88', name: L$('CIE 88 — road tunnel lighting guide', 'CIE 88 — راهنمای روشنایی تونل جاده‌ای'), edition: 'CIE 88:2004', publisher: 'CIE', source: 'https://cie.co.at/publications (purchase required)',
    scope: L$('Threshold, transition, interior and exit zones for road tunnels; luminance-based.', 'نواحی ورودی، گذار، داخلی و خروجی تونل؛ مبتنی بر درخشندگی.'),
    types: ['road'], jurisdictions: ['International'], status: 'unsupported',
    limitations: L$('Not implemented: requires L20 / access-zone luminance, road-surface luminance coefficients, and zone-wise luminance calculation. Lumina does not compute road-surface luminance, so no CIE 88 statement is made.', 'پیاده‌سازی نشده: به محاسبه‌ی درخشندگی نیاز دارد که در لومینا موجود نیست.'),
    criteria: () => [
      { id: 'c-th', label: L$('Threshold-zone luminance', 'درخشندگی ناحیه‌ی ورودی'), ref: 'CIE 88 threshold zone', origin: 'none', status: 'unsupported' },
      { id: 'c-int', label: L$('Interior-zone luminance and uniformity', 'درخشندگی و یکنواختی ناحیه‌ی داخلی'), ref: 'CIE 88 interior zone', origin: 'none', status: 'unsupported' },
      { id: 'c-fl', label: L$('Flicker / glare (TI)', 'سوسو / خیرگی'), ref: 'CIE 88 flicker, disability glare', origin: 'none', status: 'unsupported' },
    ],
  },
  {
    id: 'mining-regs', name: L$('Mining / underground lighting regulations', 'مقررات روشنایی معادن'), edition: 'jurisdiction-specific', publisher: 'National mining authorities', source: 'e.g. national mine-safety regulations (not embedded)',
    scope: L$('Requirements differ by country and mine type (coal / non-coal, gassy / non-gassy).', 'الزامات بسته به کشور و نوع معدن متفاوت است.'),
    types: ['mining'], jurisdictions: ['*'], status: 'unsupported',
    limitations: L$('No authoritative threshold tables are embedded. The legacy Lumina country table was removed because its values were unsourced. Use "Project-defined criteria" with values from your regulation.', 'جدول کشورها در نسخه‌ی قبل به دلیل نداشتن منبع حذف شد. از «معیارهای پروژه» استفاده کنید.'),
    criteria: () => [{ id: 'm-all', label: L$('Jurisdiction-specific illuminance / glare requirements', 'الزامات روشنایی/خیرگی'), ref: 'jurisdiction-specific', origin: 'none', status: 'unsupported' }],
  },
  {
    id: 'rail-regs', name: L$('Railway / metro tunnel requirements', 'الزامات تونل ریلی / مترو'), edition: 'jurisdiction-specific', publisher: 'Railway authorities / infrastructure managers', source: 'e.g. EU TSI SRT (not embedded)',
    scope: L$('Walkway, emergency and maintenance lighting requirements differ by network and country.', 'الزامات پیاده‌رو و اضطراری بسته به شبکه متفاوت است.'),
    types: ['railway'], jurisdictions: ['*'], status: 'unsupported',
    limitations: L$('No authoritative values embedded. Use "Project-defined criteria" with values from the governing document.', 'مقادیر مرجع داخلی وجود ندارد. از «معیارهای پروژه» استفاده کنید.'),
    criteria: () => [{ id: 'r-all', label: L$('Network-specific walkway / emergency lighting requirements', 'الزامات پیاده‌رو / اضطراری'), ref: 'jurisdiction-specific', origin: 'none', status: 'unsupported' }],
  },
];
export const standardById = (id: string) => STANDARDS.find((s) => s.id === id) ?? STANDARDS[0];
export const standardsFor = (t: TunnelType) => STANDARDS.filter((s) => s.types.includes(t));

export interface CriterionResult extends Criterion { actual?: number; verdict: Verdict }
export interface StdEvaluation { standardId: string; results: CriterionResult[]; verdict: Verdict | 'none'; hardPass: boolean; evaluated: number; unsupported: number; failed: string[] }
export function evaluateCriteria(std: StandardDef, p: Project, m: { eAvgM: number; eMinM: number; u0: number } | null): StdEvaluation {
  const results: CriterionResult[] = std.criteria(p).map((c) => {
    if (c.status === 'unsupported' || !c.metric) return { ...c, verdict: 'unsupported' as Verdict };
    if (!m || c.value === undefined || !Number.isFinite(c.value)) return { ...c, verdict: 'indeterminate' as Verdict };
    const actual = m[c.metric];
    return { ...c, actual, verdict: (actual >= c.value - 1e-9 ? 'pass' : 'fail') as Verdict };
  });
  const evaluated = results.filter((r) => r.verdict === 'pass' || r.verdict === 'fail').length;
  const unsupported = results.filter((r) => r.verdict === 'unsupported').length;
  const failed = results.filter((r) => r.verdict === 'fail').map((r) => r.id);
  const indet = results.some((r) => r.verdict === 'indeterminate');
  const hardPass = results.length > 0 && failed.length === 0 && !indet && evaluated > 0;
  let verdict: StdEvaluation['verdict'] = 'none';
  if (results.length) verdict = failed.length ? 'fail' : indet || unsupported || !evaluated ? 'indeterminate' : 'pass';
  return { standardId: std.id, results, verdict, hardPass, evaluated, unsupported, failed };
}
