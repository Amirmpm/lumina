export type Lang = 'en' | 'fa';
export type L = { en: string; fa: string };
export type TunnelType = 'road' | 'mining' | 'railway';
export type Prov = 'user' | 'default' | 'estimate';
export type Verdict = 'pass' | 'fail' | 'indeterminate' | 'unsupported';

export const SCHEMA_VERSION = 1;

export interface ExProtection {
  hazardType: 'gas' | 'dust';
  zone?: '0' | '1' | '2' | '20' | '21' | '22';
  classDivision?: string; // e.g. "Class I Div 2" (NEC/CEC) — free text, recorded only
  group?: 'IIA' | 'IIB' | 'IIC' | 'IIIA' | 'IIIB' | 'IIIC';
  tempClass?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  marking: string; // full marking as printed, e.g. "II 2G Ex db IIB T4 Gb"
  scheme: string; // ATEX | IECEx | UL/NEC | other
  certificateId: string;
  scope: string;
  limitations: string;
}
export interface HazardRequirement {
  required: boolean;
  hazardType: 'gas' | 'dust';
  zone: '0' | '1' | '2' | '20' | '21' | '22';
  group: 'IIA' | 'IIB' | 'IIC' | 'IIIA' | 'IIIB' | 'IIIC';
  tempClass: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
}

export type PhotQuality = 'verified' | 'sample-synthetic' | 'approximate';
export interface Photometry {
  quality: PhotQuality;
  format: 'IES' | 'LDT' | 'synthetic' | 'beam-approx';
  C: number[]; // 0..360 deg, C0 = along tunnel axis (+x), C90 = transverse (+y)
  G: number[]; // gamma from nadir, 0..180
  cd: number[][]; // absolute candela [iC][iG]
  flux: number; // lm, integrated from table
  declaredFlux?: number;
  warnings: string[];
}
export interface Luminaire {
  id: string;
  manufacturer?: string;
  model: string;
  kind: 'sample' | 'imported' | 'custom';
  source: string; // provenance statement
  fileName?: string;
  fileHash?: string;
  power: number; // W
  length: number; width: number; height: number; // m
  mounting: string; // free text e.g. "ceiling / pendant"
  ip?: string; voltage?: number; pf?: number; priceEach?: number; lifeHours?: number; cct?: number; cri?: number;
  photometry: Photometry | null;
  ex?: ExProtection;
  notes?: string;
}

export type Arrangement = 'center' | 'left' | 'right' | 'both-walls' | 'two-rows' | 'three-rows';
export interface Layout {
  luminaireId: string;
  arrangement: Arrangement;
  count: number; // luminaires per row
  spacingMode: 'auto' | 'manual'; // auto: cell-centred over tunnel length
  spacing: number; // m (manual)
  startOffset: number; // m (manual)
  wallInset: number; // m, for wall rows
  mountHeight: number | null; // m above floor; null = follow ceiling
  staggered: boolean;
  yaw: number; // deg rotation of C0 about vertical
}
export interface ScenarioResult {
  hash: string; at: string;
  eAvg: number; eMin: number; eMax: number; u0: number; ud: number;
  eAvgM: number; eMinM: number;
  n: number; kW: number; kWhYear: number; lcc: number; initial: number;
  verdict: Verdict; photQuality: PhotQuality | 'none';
}
export interface Scenario {
  id: string; name: string; layout: Layout; notes: string; createdAt: string;
  source: 'manual' | 'optimizer'; result?: ScenarioResult;
}
export interface OptSettings {
  weights: { lcc: number; energy: number; count: number; uniformity: number; maintenance: number };
  maxCount: number; // per-row hard cap, 0 = none
  maxSpacing: number; // m hard cap, 0 = none
  libraryIds: string[]; // empty = all usable
  arrangements: Arrangement[];
}
export interface ProjectMeta { client: string; site: string; country: string; designer: string; notes: string }
export interface Project {
  schemaVersion: number;
  id: string; name: string; createdAt: string; updatedAt: string;
  tunnelType: TunnelType;
  meta: ProjectMeta;
  inputs: Record<string, number | string>;
  prov: Record<string, Prov>;
  standardId: string;
  hazard: HazardRequirement;
  luminaires: Luminaire[];
  scenarios: Scenario[];
  activeScenarioId: string;
  opt: OptSettings;
  wizardDone: boolean;
}
