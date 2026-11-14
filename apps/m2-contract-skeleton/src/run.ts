import { runGovernance, type GovernanceInputs } from './governance.ts'
import { runModel, type ModelInputs } from './model.ts'
import {
  PathStepError,
  runFirstTenantPath,
  type FirstPathObservation,
  type PathDependencies,
} from './path.ts'
import {
  aggregatePath,
  observeHops,
  type PathReport,
  type RealizationTable,
} from './path-report.ts'
import { GOVERNANCE_SCENARIOS, type ScenarioResult } from './scenarios.ts'

export type ContractSkeletonInputs<P> = Readonly<{
  path: PathDependencies
  model: ModelInputs<P>
  realization: RealizationTable
  governance?: GovernanceInputs
}>

export async function runContractSkeleton<P>(
  inputs: ContractSkeletonInputs<P>,
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
  const structureErrors: string[] = []
  let path: FirstPathObservation | null
  try {
    path = await runFirstTenantPath(inputs.path)
  } catch (error) {
    path = null
    structureErrors.push(
      error instanceof PathStepError
        ? `first-path-threw:${error.step}:${error.kind}`
        : 'first-path-threw:unknown',
    )
  }
  const model = await runModel(inputs.model)
  return aggregatePath({
    hops: observeHops(path, governance, model.fragments, inputs.realization),
    scenarios: [...governance, model.scenario],
    structureErrors: [...structureErrors, ...model.structureErrors],
  })
}
