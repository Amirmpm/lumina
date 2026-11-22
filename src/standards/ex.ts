// Optional explosion-protection screening. This is a DATA-COMPATIBILITY SCREEN, never a suitability or compliance statement.
import type { ExProtection, HazardRequirement, Luminaire } from '../domain/types';

export type ExStatus = 'not-required' | 'no-data' | 'incompatible' | 'declared-needs-verification';
export interface ExScreen { status: ExStatus; reasons: string[] } // reasons are i18n keys
const gasZ = ['0', '1', '2'], dustZ = ['20', '21', '22'];
const grpRank: Record<string, number> = { IIA: 1, IIB: 2, IIC: 3, IIIA: 1, IIIB: 2, IIIC: 3 };

export function screenEx(h: HazardRequirement, lum: Pick<Luminaire, 'ex'>): ExScreen {
  if (!h.required) return { status: 'not-required', reasons: [] };
  const ex: ExProtection | undefined = lum.ex;
  if (!ex) return { status: 'no-data', reasons: ['ex.noData'] };
  const reasons: string[] = [];
  if (!ex.certificateId.trim()) reasons.push('ex.noCert');
  if (ex.hazardType !== h.hazardType) reasons.push('ex.typeMismatch');
  else {
    const fam = h.hazardType === 'gas' ? gasZ : dustZ;
    if (!ex.zone) reasons.push('ex.noZone');
    else if (fam.indexOf(ex.zone) < 0 || fam.indexOf(ex.zone) > fam.indexOf(h.zone)) reasons.push('ex.zoneInsufficient');
    if (!ex.group) reasons.push('ex.noGroup');
    else if ((grpRank[ex.group] ?? 0) < (grpRank[h.group] ?? 99)) reasons.push('ex.groupInsufficient');
    if (h.hazardType === 'gas') {
      if (!ex.tempClass) reasons.push('ex.noTemp');
      else if (Number(ex.tempClass.slice(1)) < Number(h.tempClass.slice(1))) reasons.push('ex.tempInsufficient');
    }
  }
  if (!ex.marking.trim()) reasons.push('ex.noMarking');
  const hard = reasons.filter((r) => ['ex.typeMismatch', 'ex.zoneInsufficient', 'ex.groupInsufficient', 'ex.tempInsufficient'].includes(r));
  if (hard.length) return { status: 'incompatible', reasons };
  if (reasons.length) return { status: 'no-data', reasons };
  return { status: 'declared-needs-verification', reasons: ['ex.verifyCert'] };
}
