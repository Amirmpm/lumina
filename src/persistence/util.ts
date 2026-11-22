import type { Project } from '../domain/types';
export function activeScenarioSummary(p: Project) {
  const s = p.scenarios.find((x) => x.id === p.activeScenarioId) ?? p.scenarios[0];
  return { name: p.name, tunnelType: p.tunnelType, standardId: p.standardId, scenario: s.name, result: s.result ?? null, scenarios: p.scenarios.length };
}
