import type { AssembledModelInput } from '@omne-harness/model-contract'
import type { AssemblyFailure, SummaryMaterial, CompactionPlan, StepRequest } from './values.js'
import type { AssemblyPolicies } from './ports.js'
export function invalid(
  reason: 'plan-mismatch' | 'progress-mismatch' | 'policy-mismatch' | 'unsupported-format',
): AssemblyFailure {
  return { kind: 'invalid', field: 'plan', reason }
}
export function summary(
  material: SummaryMaterial,
  policies: AssemblyPolicies,
): AssembledModelInput {
  return {
    system: policies.compaction.summaryInstruction(material),
    messages: material.covered.flatMap(e =>
      e.message === null || material.retained.includes(e.ref) ? [] : [e.message],
    ),
    tools: [],
    toolChoice: 'auto',
    parameters: [],
    representation: policies.representation.identity,
    source: policies.compaction.identity,
  }
}
export function request(
  plan: CompactionPlan,
  index: string,
  material: SummaryMaterial,
  kind: 'trim' | 'summarize',
  policies: AssemblyPolicies,
): StepRequest {
  return kind === 'trim'
    ? { planId: plan.planId, index, kind, material }
    : { planId: plan.planId, index, kind, material, assembled: summary(material, policies) }
}
