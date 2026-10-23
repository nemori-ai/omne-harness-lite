import { runGovernance, type GovernanceInputs } from './governance.ts'
import { runModel, type ModelInputs } from './model.ts'
import { aggregatePath, observeHops, type PathReport } from './path-report.ts'
import { GOVERNANCE_SCENARIOS, type ScenarioResult } from './scenarios.ts'

export async function runContractSkeleton(
  inputs: Readonly<{ governance?: GovernanceInputs; model?: ModelInputs }> = {},
): Promise<PathReport> {
  let governance: readonly ScenarioResult[]
  try {
    governance = runGovernance(inputs.governance)
  } catch {
    governance = GOVERNANCE_SCENARIOS.map(scenarioId => ({
      scenarioId,
      status: 'exception',
      matchesExpected: false,
      evidence: 'governance-input-unavailable',
    }))
  }
  const model = await runModel(inputs.model)
  return aggregatePath({
    hops: observeHops(governance, model.fragments),
    scenarios: [...governance, model.scenario],
    structureErrors: model.structureErrors,
  })
}
