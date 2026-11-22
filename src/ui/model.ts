import { useMemo } from 'react';
import { buildGeometry, geometryIssues, layoutIssues, layoutPositions } from '../geometry/tunnel';
import { activeScenario, validateInputs } from '../domain/project';
import { inputsHash } from '../calc/evaluate';
import { getCachedEval, useS } from './store';
import type { L } from '../domain/types';
import type { FieldDef } from '../domain/fields';

export type CalcStatus = 'none' | 'stale' | 'fresh' | 'blocked';
export function useModel() {
  const p = useS((s) => s.project)!; useS((s) => s.evalV);
  const sc = activeScenario(p); const lum = p.luminaires.find((l) => l.id === sc.layout.luminaireId);
  const geom = useMemo(() => buildGeometry(p.inputs, p.tunnelType), [p.inputs, p.tunnelType]);
  const pos = useMemo(() => layoutPositions(geom, sc.layout, lum), [geom, sc.layout, lum]);
  const hash = useMemo(() => inputsHash(p, sc.layout), [p, sc.layout]);
  const issues = useMemo(() => [...validateInputs(p), ...geometryIssues(geom, p.inputs, p.tunnelType), ...layoutIssues(geom, sc.layout, lum, pos)], [p, geom, sc.layout, lum, pos]);
  const ev = getCachedEval(hash);
  const blocked = issues.some((i) => i.severity === 'error');
  const status: CalcStatus = blocked ? 'blocked' : ev ? 'fresh' : sc.result ? 'stale' : 'none';
  return { p, sc, lum, geom, pos, hash, issues, ev, status, blocked };
}
const L$ = (en: string, fa: string): L => ({ en, fa });
const NOWHY = L$('', '');
export const LAYOUT_FIELDS: Record<string, FieldDef> = {
  count: { key: 'count', type: 'number', group: 'geometry', label: L$('Luminaires per row', 'تعداد چراغ در هر ردیف'), min: 1, max: 5000, step: 1, def: 10, defProv: 'default', why: L$('Auto spacing distributes the count in equal cells over the tunnel length (first/last luminaire half a cell from the portals).', 'در حالت خودکار چراغ‌ها در سلول‌های مساوی در طول تونل پخش می‌شوند.') },
  spacing: { key: 'spacing', type: 'number', group: 'geometry', label: L$('Spacing (manual)', 'فاصله (دستی)'), unit: 'm', uk: 'length', min: 0.2, max: 500, step: 0.5, def: 10, defProv: 'default', why: NOWHY },
  startOffset: { key: 'startOffset', type: 'number', group: 'geometry', label: L$('Start offset (manual)', 'جابجایی شروع (دستی)'), unit: 'm', uk: 'length', min: 0, max: 500, step: 0.5, def: 5, defProv: 'default', why: NOWHY },
  wallInset: { key: 'wallInset', type: 'number', group: 'geometry', label: L$('Wall-row inset', 'فاصله ردیف دیواری از دیوار'), unit: 'm', uk: 'length', min: 0.1, max: 5, step: 0.05, def: 0.3, defProv: 'default', why: L$('Transverse distance from the wall to wall-mounted rows.', 'فاصله‌ی عرضی ردیف‌های دیواری تا دیوار.') },
  mountHeight: { key: 'mountHeight', type: 'number', group: 'geometry', label: L$('Mounting height', 'ارتفاع نصب'), unit: 'm', uk: 'length', min: 1, max: 30, step: 0.1, def: 4, defProv: 'default', why: L$('Height of the luminaire above the floor. Must fit under the ceiling at the row position.', 'ارتفاع چراغ از کف؛ باید زیر سقف جا شود.') },
};
