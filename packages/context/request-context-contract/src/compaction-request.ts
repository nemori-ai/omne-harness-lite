import type {
  AssemblyFailure,
  CompactionPlan,
  InvalidReason,
  StepRequest,
  SummaryMaterial,
} from './values.js'
import type { AssemblyPolicies } from './ports.js'
import { buildModelInput } from './model-input.js'
import { materialOf } from './compaction-context.js'
export function invalid(reason: InvalidReason, field = 'plan'): AssemblyFailure {
  return { kind: 'invalid', field, reason }
}
/** The material of a plan: rebuilt from its basis, trimmed once when the plan says so (J12). */
export function planMaterial(plan: CompactionPlan, policies: AssemblyPolicies): SummaryMaterial {
  const end = plan.basis.context.covered.findIndex(entry => entry.ref === plan.covers.to)
  const material = materialOf(
    plan.basis.projected,
    plan.basis.context.covered.slice(0, end + 1),
    plan.retained,
  )
  return plan.shape.trimFirst
    ? policies.compaction.trim(material, { maxBlockBytes: '65536' })
    : material
}
/** One summarize step: the fixed instruction and the material messages that are not retained. */
export function summaryStep(
  plan: CompactionPlan,
  index: string,
  material: SummaryMaterial,
  policies: AssemblyPolicies,
): StepRequest {
  const retained = new Set(material.retained)
  return {
    planId: plan.planId,
    index,
    kind: 'summarize',
    material,
    assembled: buildModelInput(plan.basis.selection, {
      system: policies.compaction.summaryInstruction(material),
      messages: material.covered.flatMap(entry =>
        entry.message === null || retained.has(entry.ref) ? [] : [entry.message],
      ),
      tools: [],
      toolChoice: 'auto',
      representation: plan.basis.representation,
      source: plan.policy.identity,
    }),
  }
}
