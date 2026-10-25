export const GOVERNANCE_SCENARIOS = [
  'G1-register',
  'G1-login',
  'G1-create',
  'G2-duplicate-version',
  'G2-unsupported-version',
  'G2-unknown-operation',
  'G2-extra-field',
  'G2-unmatched',
  'G3-unknown',
  'G3-denied',
  'G3-not-visible',
  'G3-basis-unavailable',
  'G3-missing-proof',
  'G3-empty-proof',
  'G3-disable-subject',
  'G3-restore-subject',
  'G3-end-subject',
  'G3-reopen-after-media-loss',
] as const

export const REQUIRED_SCENARIOS = [...GOVERNANCE_SCENARIOS, 'M-conformance'] as const
export type ScenarioId = (typeof REQUIRED_SCENARIOS)[number]
export type ScenarioResult = Readonly<{
  scenarioId: ScenarioId
  status: 'executed' | 'exception'
  matchesExpected: boolean
  evidence: string
}>

export function executeScenario(scenarioId: ScenarioId, check: () => boolean): ScenarioResult {
  try {
    const matchesExpected = check()
    return {
      scenarioId,
      status: 'executed',
      matchesExpected,
      evidence: matchesExpected ? 'expected-result-observed' : 'unexpected-result',
    }
  } catch {
    return {
      scenarioId,
      status: 'exception',
      matchesExpected: false,
      evidence: 'public-call-threw',
    }
  }
}
