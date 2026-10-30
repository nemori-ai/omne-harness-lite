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
  /** The ports and doubles of the connected first tenant path. */
  path: PathDependencies
  /** The subject of the public Model obligation suite. */
  model: ModelInputs<P>
  /** What the caller wired in each plugin-tree row: the real member, a double, or nothing. */
  realization: RealizationTable
  governance?: GovernanceInputs
}>

/**
 * Runs the connected first tenant path, the governance protocol scenarios and the public Model
 * obligations, and aggregates the per-hop report. An exception in one part stays a failed or
 * unreached hop; it does not remove the other parts.
 */
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
