import { judgeCompaction, type CompactionContext, type RecordEntryRef } from '@omne-harness/message'
import type {
  AssemblyInput,
  CompactionBasis,
  CompactionPlan,
  PlanResult,
  ProjectedHistory,
} from './values.js'
import type { CompactionPlanDraft, RetentionMeasurement } from './ports.js'
import type { OperationContext } from './operation-context.js'
import { invalid, planMaterial, summaryStep } from './compaction-request.js'
import { validateInput } from './input-validation.js'
import { project } from './projection.js'
import { decodePlanId } from './refs.js'
import { digest, messageId, textBlock } from './internal.js'
import { projectWindow, retentionLimit, retentionMeasure } from './compaction-context.js'

/** The window cut at the plan's end: covered to `coverTo`, the rest of covered joins `after`. */
export function planWindow(window: CompactionContext, coverTo: RecordEntryRef): CompactionContext {
  const end = window.covered.findIndex(entry => entry.ref === coverTo)
  return {
    ...window,
    covered: window.covered.slice(0, end + 1),
    after: [...window.covered.slice(end + 1), ...window.after],
  }
}
export function basisDigest(basis: Omit<CompactionBasis, 'digest'>): string {
  return digest(basis)
}

/** Plans a compaction from stably read groups and the CM-02 window of the same evidence. */
export async function planInputs<P>(
  input: AssemblyInput<P>,
  rows: readonly import('./ports.js').HistoryRow[],
  window: CompactionContext,
  context: OperationContext<P>,
): Promise<PlanResult> {
  const checked = validateInput(input)
  if (checked !== null) return checked
  if (
    input.previous?.candidate === input.identity.candidate &&
    input.previous.enteredCompaction !== null
  )
    return invalid('plan-mismatch')
  const view = project(rows, input.history.epoch)
  const projected = projectWindow(view, window)
  const { policies } = context
  const candidate = {
    selection: input.selection,
    representation: policies.representation.identity,
    source: policies.compaction.identity,
  }
  const measure = retentionMeasure(context, candidate, projected)
  const limit = retentionLimit(policies.compaction.config.retainBudget, input.selection)
  const floor: RetentionMeasurement = window.open.length
    ? await measure(window.open)
    : { kind: 'measured', tokens: '0' }
  if (floor.kind !== 'measured') return measuredFailure(floor)
  if (BigInt(floor.tokens) > limit)
    return {
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
      floor: window.open,
      budget: limit.toString(),
      diagnostic: 'Open-work floor exceeds retention budget',
    }
  const draft = await policies.compaction.plan({
    view,
    context: window,
    measure,
    windowTokens: input.selection.profile.definition.context.window.provided,
  })
  if (draft.kind !== 'draft' && draft.kind !== 'floor-exceeds-budget') return draft
  if (draft.kind === 'floor-exceeds-budget')
    return {
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
      floor: draft.floor,
      budget: draft.budget,
      diagnostic: 'Open-work floor exceeds retention budget',
    }
  return acceptDraft(input, window, projected, draft, measure, limit, context)
}

function measuredFailure(measured: Exclude<RetentionMeasurement, { kind: 'measured' }>) {
  return measured.kind === 'unknown'
    ? { kind: 'unknown' as const, source: 'read' as const, diagnostic: measured.diagnostic }
    : measured
}

async function acceptDraft<P>(
  input: AssemblyInput<P>,
  window: CompactionContext,
  projected: ProjectedHistory,
  draft: Extract<CompactionPlanDraft, { kind: 'draft' }>,
  measure: (entries: readonly RecordEntryRef[]) => Promise<RetentionMeasurement>,
  limit: bigint,
  context: OperationContext<P>,
): Promise<PlanResult> {
  const { policies } = context
  const end = window.covered.findIndex(e => e.ref === draft.coverTo)
  if (end < 0) return invalid('unsupported-format')
  const covered = window.covered.slice(0, end + 1)
  const floor = window.open.filter(ref => covered.some(e => e.ref === ref))
  const selected = new Set([...draft.retained, ...floor])
  const retained = covered.filter(e => selected.has(e.ref)).map(e => e.ref)
  const kept = await measure(retained)
  if (kept.kind !== 'measured') return measuredFailure(kept)
  if (BigInt(kept.tokens) > limit) return invalid('unsupported-format')
  const bound = draft.bound
  if (
    bound !== policies.compaction.config.stepBound ||
    !/^[1-9][0-9]*$/u.test(bound) ||
    draft.shape.kind !== 'summarize' ||
    draft.shape.trimFirst !== policies.compaction.config.trimFirst
  )
    return invalid('progress-mismatch')
  const cut = planWindow(window, draft.coverTo)
  const covers = { from: window.origin, to: draft.coverTo }
  const proof = {
    role: 'compaction',
    id: messageId({ covers, retained, validation: true }),
    blocks: [textBlock('validation', { covers, retained })],
    covers,
    retained,
    derivation: {
      owner: 'request-context-contract',
      record: 'validation',
      revision: '1',
      digest: digest({ covers, retained }),
    },
  }
  const legal = judgeCompaction(proof, cut)
  if ('rejected' in legal)
    return legal.rejected === 'source-evidence'
      ? invalid('source-evidence-conflict', 'compaction.context')
      : invalid('unsupported-format')
  const unsigned: Omit<CompactionBasis, 'digest'> = {
    target: context.target,
    history: input.history,
    context: cut,
    projected,
    selection: input.selection,
    representation: policies.representation.identity,
    continuation: input.adopted?.continuation ?? null,
    retainedBudget: limit.toString(),
  }
  const basis: CompactionBasis = { ...unsigned, digest: basisDigest(unsigned) }
  const policy = {
    identity: policies.compaction.identity,
    configDigest: policies.compaction.configDigest(),
  }
  const parsed = decodePlanId(
    `plan_${digest({ candidate: input.identity.candidate, policy, covers, retained, bound, shape: draft.shape, basis: basis.digest })}`,
  )
  if ('failure' in parsed) return invalid('plan-mismatch')
  const plan: CompactionPlan = {
    planId: parsed.ok,
    candidate: input.identity.candidate,
    bound,
    policy,
    covers,
    retained,
    shape: draft.shape,
    basis,
  }
  return {
    kind: 'planned',
    plan,
    progress: { planId: plan.planId, completed: '0', consumed: [] },
    first: summaryStep(plan, '0', planMaterial(plan, policies), policies),
  }
}
