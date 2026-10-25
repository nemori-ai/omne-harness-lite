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
import { canonical } from './internal.js'
export function invalid(reason: InvalidReason, field = 'plan'): AssemblyFailure {
  return { kind: 'invalid', field, reason }
}
/** The untrimmed material of a plan, rebuilt from its basis. */
export function baseMaterial(plan: CompactionPlan): SummaryMaterial {
  const end = plan.basis.context.covered.findIndex(entry => entry.ref === plan.covers.to)
  return materialOf(
    plan.basis.projected,
    plan.basis.context.covered.slice(0, end + 1),
    plan.retained,
  )
}
/** The material of a new plan, trimmed once when the plan says so (J12). Only `planCompaction` calls it. */
export function planMaterial(plan: CompactionPlan, policies: AssemblyPolicies): SummaryMaterial {
  const material = baseMaterial(plan)
  return plan.shape.trimFirst
    ? policies.compaction.trim(material, { maxBlockBytes: '65536' })
    : material
}
/**
 * Whether a carried material belongs to the plan without trimming again: untrimmed it must equal
 * the basis; trimmed it keeps the entry identities, message identities and retained set, and each
 * trimmed record names a covered message.
 */
export function materialOfPlan(plan: CompactionPlan, material: SummaryMaterial): boolean {
  const base = baseMaterial(plan)
  if (!plan.shape.trimFirst) return canonical(material) === canonical(base)
  const ids = (m: SummaryMaterial) =>
    m.covered.map(entry => [entry.ref, entry.message === null ? null : entry.message.id])
  const messages = new Set(
    base.covered.flatMap(entry => (entry.message === null ? [] : [entry.message.id])),
  )
  return (
    canonical(ids(material)) === canonical(ids(base)) &&
    canonical(material.retained) === canonical(base.retained) &&
    material.trimmed.every(item => messages.has(item.message))
  )
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
