import type { L, TunnelType } from './types';
import type { UnitKind } from '../lib/units';

export type Group = 'geometry' | 'operating' | 'environment' | 'electrical' | 'economic' | 'criteria';
export interface FieldDef {
  key: string; type: 'number' | 'select'; group: Group;
  label: L; unit?: string; uk?: UnitKind;
  min?: number; max?: number; step?: number;
  def: number | string | Partial<Record<TunnelType, number | string>>;
  defProv: 'default' | 'estimate';
  why: L; // rationale / source of the default
  types?: TunnelType[]; required?: boolean; advanced?: boolean;
  options?: { v: string; label: L }[];
  visible?: (i: Record<string, number | string>) => boolean;
  recorded?: boolean; // stored for traceability, not yet used by a calculation
}
const L$ = (en: string, fa: string): L => ({ en, fa });
const ENG = L$('Engineering default chosen by Lumina; not taken from a standard. Replace with project data.', 'مقدار پیش‌فرض مهندسی لومینا؛ برگرفته از استاندارد نیست. با داده‌ی پروژه جایگزین کنید.');
const PLACE = L$('Placeholder so calculations can run; not from any regulation. Replace with the value required in your jurisdiction.', 'مقدار جایگزین برای اجرای محاسبه؛ از هیچ مقرراتی گرفته نشده است. با مقدار مورد نیاز در حوزه‌ی قضایی خود جایگزین کنید.');

export const FIELDS: FieldDef[] = [
  // ---- geometry
  { key: 'length', type: 'number', group: 'geometry', label: L$('Tunnel length', 'طول تونل'), unit: 'm', uk: 'length', min: 5, max: 20000, step: 5, def: { road: 500, mining: 300, railway: 800 }, defProv: 'default', required: true, why: ENG },
  { key: 'shape', type: 'select', group: 'geometry', label: L$('Cross-section shape', 'شکل مقطع'), def: { road: 'arched', mining: 'arched', railway: 'arched' }, defProv: 'default', required: true, why: ENG,
    options: [{ v: 'rect', label: L$('Rectangular', 'مستطیلی') }, { v: 'arched', label: L$('Arched (vertical walls + circular crown)', 'قوسی (دیوار قائم + تاج دایره‌ای)') }, { v: 'circular', label: L$('Circular (flat floor chord)', 'دایره‌ای (کف تخت)') }] },
  { key: 'width', type: 'number', group: 'geometry', label: L$('Clear floor width', 'عرض آزاد کف'), unit: 'm', uk: 'length', min: 1.5, max: 30, step: 0.1, def: { road: 10.5, mining: 4.5, railway: 8.5 }, defProv: 'default', required: true, why: ENG },
  { key: 'wallHeight', type: 'number', group: 'geometry', label: L$('Vertical wall height', 'ارتفاع دیوار قائم'), unit: 'm', uk: 'length', min: 1.5, max: 15, step: 0.1, def: { road: 4.5, mining: 2.2, railway: 4 }, defProv: 'default', required: true, why: ENG, visible: (i) => i.shape !== 'circular' },
  { key: 'crownRise', type: 'number', group: 'geometry', label: L$('Crown rise above walls', 'ارتفاع تاج بالای دیوار'), unit: 'm', uk: 'length', min: 0.2, max: 15, step: 0.1, def: { road: 2, mining: 1.2, railway: 2.5 }, defProv: 'default', required: true, why: ENG, visible: (i) => i.shape === 'arched' },
  { key: 'diameter', type: 'number', group: 'geometry', label: L$('Bore diameter', 'قطر مقطع'), unit: 'm', uk: 'length', min: 2, max: 30, step: 0.1, def: { road: 11, mining: 5, railway: 9 }, defProv: 'default', required: true, why: ENG, visible: (i) => i.shape === 'circular' },
  { key: 'lanes', type: 'number', group: 'geometry', label: L$('Traffic lanes', 'تعداد خط عبور'), min: 1, max: 4, step: 1, def: 2, defProv: 'default', required: true, why: ENG, types: ['road'] },
  { key: 'laneWidth', type: 'number', group: 'geometry', label: L$('Lane width', 'عرض خط عبور'), unit: 'm', uk: 'length', min: 2.5, max: 4.5, step: 0.05, def: 3.5, defProv: 'estimate', why: L$('Typical lane width; confirm with the road authority design standard.', 'عرض معمول خط عبور؛ با استاندارد طراحی مرجع راه تأیید شود.'), types: ['road'] },
  { key: 'calcZone', type: 'select', group: 'geometry', label: L$('Calculation zone', 'محدوده‌ی محاسبه'), def: 'floor', defProv: 'default', why: L$('Which part of the floor is evaluated. Full floor is the conservative default.', 'بخشی از کف که ارزیابی می‌شود. کف کامل پیش‌فرض محافظه‌کارانه است.'), types: ['mining', 'railway'],
    options: [{ v: 'floor', label: L$('Full floor', 'کل کف') }, { v: 'walkway', label: L$('Walkway strip (left side)', 'نوار پیاده‌رو (سمت چپ)') }] },
  { key: 'walkwayWidth', type: 'number', group: 'geometry', label: L$('Walkway width', 'عرض پیاده‌رو'), unit: 'm', uk: 'length', min: 0.5, max: 5, step: 0.05, def: 1.2, defProv: 'estimate', why: ENG, types: ['mining', 'railway'], visible: (i) => i.calcZone === 'walkway' },
  { key: 'workPlane', type: 'number', group: 'geometry', label: L$('Calculation plane height', 'ارتفاع صفحه‌ی محاسبه'), unit: 'm', uk: 'length', min: 0, max: 2, step: 0.05, def: 0, defProv: 'default', advanced: true, why: L$('Floor / road-surface level. Raise for task planes.', 'سطح کف یا روسازی. برای صفحه‌ی کار بالا ببرید.') },
  { key: 'gridSpacing', type: 'number', group: 'geometry', label: L$('Target grid spacing', 'گام شبکه‌ی محاسبه'), unit: 'm', uk: 'length', min: 0.1, max: 5, step: 0.1, def: 1, defProv: 'default', advanced: true, why: L$('Grid is automatically coarsened for very long tunnels; see calculation basis.', 'برای تونل‌های بلند شبکه به‌طور خودکار درشت‌تر می‌شود.') },
  // ---- operating
  { key: 'speed', type: 'number', group: 'operating', label: L$('Design speed', 'سرعت طرح'), unit: 'km/h', uk: 'speed', min: 5, max: 200, step: 5, def: { road: 80, railway: 80, mining: 20 }, defProv: 'default', why: L$('Recorded for traceability; required by luminance-based methods (CIE 88) that are not implemented yet.', 'برای ردیابی ثبت می‌شود؛ روش‌های مبتنی بر درخشندگی (CIE 88) به آن نیاز دارند و هنوز پیاده‌سازی نشده‌اند.'), recorded: true, types: ['road', 'railway'] },
  { key: 'hoursYear', type: 'number', group: 'operating', label: L$('Operating hours per year', 'ساعت کارکرد سالانه'), unit: 'h', min: 100, max: 8760, step: 100, def: { road: 8760, railway: 6000, mining: 6000 }, defProv: 'estimate', why: L$('Estimate of lit hours per year. Tunnels with daytime lighting often run 8 760 h.', 'برآورد ساعات روشن سالانه.'), required: true },
  // ---- environment
  { key: 'ambient', type: 'number', group: 'environment', label: L$('Ambient temperature', 'دمای محیط'), unit: '°C', uk: 'temperature', min: -40, max: 70, step: 1, def: 25, defProv: 'default', advanced: true, why: L$('Recorded; luminaire flux is NOT derated for temperature — use manufacturer data.', 'ثبت می‌شود؛ شار چراغ برای دما کاهش داده نمی‌شود — از داده‌ی سازنده استفاده کنید.'), recorded: true },
  { key: 'llmf', type: 'number', group: 'environment', label: L$('Lamp lumen maintenance (LLMF)', 'نگهداشت شار منبع (LLMF)'), min: 0.5, max: 1, step: 0.01, def: 0.9, defProv: 'estimate', advanced: true, why: L$('Engineering estimate for LED over the maintenance interval; replace with the manufacturer L-value at the interval.', 'برآورد مهندسی برای LED؛ با مقدار سازنده جایگزین شود.') },
  { key: 'lmf', type: 'number', group: 'environment', label: L$('Luminaire maintenance factor (LMF)', 'ضریب نگهداشت چراغ (LMF)'), min: 0.3, max: 1, step: 0.01, def: { road: 0.75, railway: 0.75, mining: 0.6 }, defProv: 'estimate', advanced: true, why: L$('Dirt-depreciation estimate for the environment and cleaning interval; not from a standard table. See CIE 154 for road tunnels.', 'برآورد کثیف‌شدگی؛ از جدول استاندارد نیست.') },
  { key: 'uf', type: 'number', group: 'environment', label: L$('Utilisation factor for lumen-method pre-sizing', 'ضریب بهره‌وری برای پیش‌طراحی روش لومن'), min: 0.05, max: 1, step: 0.01, def: 0.35, defProv: 'estimate', advanced: true, why: L$('Rough estimate used ONLY for the lumen-method cross-check and the optimiser seed. Point-by-point results do not use it.', 'برآورد تقریبی فقط برای بررسی روش لومن و آغاز بهینه‌ساز؛ محاسبه‌ی نقطه‌به‌نقطه از آن استفاده نمی‌کند.') },
  // ---- electrical
  { key: 'voltage', type: 'number', group: 'electrical', label: L$('Supply voltage', 'ولتاژ تغذیه'), unit: 'V', min: 12, max: 1000, step: 1, def: 230, defProv: 'default', why: L$('Single-phase nominal supply (indicative check only).', 'ولتاژ اسمی تک‌فاز (بررسی تقریبی).') },
  { key: 'pf', type: 'number', group: 'electrical', label: L$('Power factor', 'ضریب توان'), min: 0.3, max: 1, step: 0.01, def: 0.9, defProv: 'estimate', advanced: true, why: ENG },
  { key: 'feeder', type: 'number', group: 'electrical', label: L$('Feeder length', 'طول فیدر'), unit: 'm', uk: 'length', min: 0, max: 20000, step: 10, def: { road: 500, mining: 300, railway: 800 }, defProv: 'estimate', advanced: true, why: L$('Assumed equal to tunnel length (load lumped at the far end = conservative).', 'برابر طول تونل فرض شده (بار در انتها = محافظه‌کارانه).') },
  { key: 'maxVd', type: 'number', group: 'electrical', label: L$('Max voltage drop', 'حداکثر افت ولتاژ'), unit: '%', min: 1, max: 15, step: 0.5, def: 5, defProv: 'default', advanced: true, why: L$('Common design limit; confirm with local wiring rules.', 'حد طراحی رایج؛ با مقررات محلی تأیید شود.') },
  // ---- economic
  { key: 'energyPrice', type: 'number', group: 'economic', label: L$('Energy price', 'قیمت انرژی'), unit: 'cur/kWh', min: 0, max: 5, step: 0.01, def: 0.1, defProv: 'estimate', why: L$('Generic placeholder in currency units; enter your tariff.', 'مقدار جایگزین؛ تعرفه‌ی خود را وارد کنید.') },
  { key: 'years', type: 'number', group: 'economic', label: L$('Analysis period', 'دوره‌ی تحلیل'), unit: 'yr', min: 1, max: 40, step: 1, def: 10, defProv: 'default', why: ENG },
  { key: 'discount', type: 'number', group: 'economic', label: L$('Discount rate', 'نرخ تنزیل'), unit: '%', min: 0, max: 30, step: 0.5, def: 5, defProv: 'estimate', advanced: true, why: ENG },
  { key: 'defPrice', type: 'number', group: 'economic', label: L$('Price when luminaire has none', 'قیمت چراغ‌های بدون قیمت'), unit: 'cur', min: 0, max: 100000, step: 10, def: 150, defProv: 'estimate', advanced: true, why: L$('Used only when a catalogue record has no price; flagged in results.', 'فقط برای چراغ‌های بدون قیمت؛ در نتایج علامت‌گذاری می‌شود.') },
  { key: 'installFactor', type: 'number', group: 'economic', label: L$('Installation cost factor', 'ضریب هزینه‌ی نصب'), min: 0, max: 5, step: 0.05, def: 0.3, defProv: 'estimate', advanced: true, why: L$('Fraction of luminaire cost added for installation (carried over from the legacy app; unsourced).', 'کسری از قیمت چراغ برای نصب (از نسخه‌ی قبل؛ بدون منبع).') },
  { key: 'maintCost', type: 'number', group: 'economic', label: L$('Maintenance cost / luminaire / yr', 'هزینه‌ی نگهداری هر چراغ در سال'), unit: 'cur', min: 0, max: 5000, step: 1, def: 15, defProv: 'estimate', advanced: true, why: ENG },
  // ---- criteria (project-defined standard)
  { key: 'crit_eavg', type: 'number', group: 'criteria', label: L$('Min. maintained average illuminance', 'حداقل روشنایی متوسط نگهداری‌شده'), unit: 'lx', uk: 'illuminance', min: 0.1, max: 2000, step: 0.5, def: { road: 10, mining: 20, railway: 15 }, defProv: 'default', why: PLACE, visible: (i) => i.__std === 'user' },
  { key: 'crit_emin', type: 'number', group: 'criteria', label: L$('Min. maintained minimum illuminance', 'حداقل روشنایی کمینه‌ی نگهداری‌شده'), unit: 'lx', uk: 'illuminance', min: 0, max: 2000, step: 0.5, def: { road: 2, mining: 5, railway: 3 }, defProv: 'default', why: PLACE, visible: (i) => i.__std === 'user' },
  { key: 'crit_u0', type: 'number', group: 'criteria', label: L$('Min. overall uniformity U0 (Emin/Eavg)', 'حداقل یکنواختی کلی U0 (Emin/Eavg)'), min: 0, max: 1, step: 0.05, def: 0.2, defProv: 'default', why: PLACE, visible: (i) => i.__std === 'user' },
  { key: 'pclass', type: 'select', group: 'criteria', label: L$('EN 13201 P-class', 'کلاس P استاندارد EN 13201'), def: 'P4', defProv: 'default', why: L$('Select the class assigned by your lighting-class assessment.', 'کلاس تعیین‌شده در ارزیابی کلاس روشنایی را انتخاب کنید.'),
    options: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((v) => ({ v, label: L$(v, v) })), visible: (i) => i.__std === 'en13201-p' },
];
export const fieldDefault = (f: FieldDef, t: TunnelType): number | string =>
  typeof f.def === 'object' ? (f.def[t] ?? Object.values(f.def)[0]) : f.def;
export const fieldsFor = (t: TunnelType) => FIELDS.filter((f) => !f.types || f.types.includes(t));
export const TUNNEL_TYPES: { id: TunnelType; label: L; desc: L; arrangements: string[] }[] = [
  { id: 'road', label: L$('Road tunnel', 'تونل جاده‌ای'), desc: L$('Vehicular tunnels. Luminance-based methods (CIE 88) are listed but not yet implemented.', 'تونل‌های خودرویی. روش‌های مبتنی بر درخشندگی (CIE 88) فهرست شده‌اند اما هنوز پیاده‌سازی نشده‌اند.'), arrangements: ['both-walls', 'two-rows', 'center', 'three-rows'] },
  { id: 'mining', label: L$('Mining / underground', 'معدنی / زیرزمینی'), desc: L$('Haulage drifts and galleries. Hazard (Ex) data is optional and never auto-assumed.', 'گالری‌ها و مسیرهای باربری. داده‌ی Ex اختیاری است و هرگز خودکار فرض نمی‌شود.'), arrangements: ['center', 'left', 'right', 'both-walls', 'two-rows', 'three-rows'] },
  { id: 'railway', label: L$('Railway / metro', 'راه‌آهن / مترو'), desc: L$('Rail and metro bores. Walkway evaluation supported; no built-in rail thresholds.', 'تونل‌های ریلی و مترو. ارزیابی پیاده‌رو پشتیبانی می‌شود؛ آستانه‌ی ریلی داخلی ندارد.'), arrangements: ['both-walls', 'left', 'right', 'center', 'two-rows'] },
];
