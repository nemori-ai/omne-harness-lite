import { judgeCompaction, type CompactionContext } from '@omne-harness/message'
import type { AssemblyInput, PlanResult, CompactionPlan, SummaryMaterial } from './values.js'
import type { AssemblyPorts, AssemblyPolicies, CompactionPlanDraft } from './ports.js'
import type { EpochId } from './refs.js'
import { invalid, request } from './compaction-request.js'
import { validateInput } from './input-validation.js'
import { readHistory } from './history-read.js'
import { readCompactionContext, measureRetention } from './compaction-context.js'
import { project } from './projection.js'
import { decodePlanId } from './refs.js'
import { digest, messageId, textBlock } from './internal.js'
export async function planCompaction<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<PlanResult> {
  const checked = validateInput(input)
  if (checked !== null) return checked
  if (
    input.previous?.candidate === input.identity.candidate &&
    input.previous.enteredCompaction !== null
  )
    return invalid('plan-mismatch')
  const read = await readHistory(input, ports)
  if (read.kind !== 'history') return read
  const context = await readCompactionContext(input, ports, read)
  if (context.kind !== 'context') return context
  const measured = measureRetention(input, ports, policies, context)
  if (measured.kind !== 'measured') return measured
  const { measureEntries, limit } = measured
  const draft = policies.compaction.plan({
    view: project(read.rows, read.evidence.epoch),
    context: context.value,
    measure: measureEntries,
    windowTokens: input.selection.profile.definition.context.window.provided,
  })
  if (draft.kind === 'floor-exceeds-budget')
    return {
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
      floor: draft.floor,
      budget: draft.budget,
      diagnostic: 'Open-work floor exceeds retention budget',
    }
  const accepted = acceptDraft(
    input,
    policies,
    context.epoch,
    context.value,
    draft,
    measureEntries,
    limit,
  )
  if (accepted.kind !== 'accepted') return accepted
  const { plan, material } = accepted
  return {
    kind: 'planned',
    plan,
    progress: { planId: plan.planId, completed: '0', consumed: [] },
    first: request(
      plan,
      '0',
      material,
      plan.shape === 'trim-then-summarize' ? 'trim' : 'summarize',
      policies,
    ),
  }
}

function acceptDraft<P>(
  input: AssemblyInput<P>,
  policies: AssemblyPolicies,
  epoch: EpochId,
  context: CompactionContext,
  draft: Extract<CompactionPlanDraft, { kind: 'draft' }>,
  measureEntries: (refs: readonly import('@omne-harness/message').RecordEntryRef[]) => string,
  limit: bigint,
) {
  const end = context.covered.findIndex(e => e.ref === draft.coverTo)
  const covered = context.covered.slice(0, end + 1)
  const first = covered[0]
  if (end < 0 || first === undefined) return invalid('unsupported-format')
  const floor = context.open.filter(ref => covered.some(e => e.ref === ref))
  const selected = new Set([...draft.retained, ...floor])
  const retained = covered.filter(e => selected.has(e.ref)).map(e => e.ref)
  if (BigInt(measureEntries(retained)) > limit) return invalid('unsupported-format')
  const bound = draft.bound
  if (
    bound !== policies.compaction.config.stepBound ||
    !/^[1-9][0-9]*$/u.test(bound) ||
    (draft.shape === 'trim-then-summarize' && BigInt(bound) < 2n)
  )
    return invalid('progress-mismatch')
  const parsed = decodePlanId(
    `plan_${digest({ candidate: input.identity.candidate, epoch: epoch, policy: policies.compaction.identity, config: policies.compaction.configDigest() })}`,
  )
  if ('failure' in parsed) return invalid('plan-mismatch')
  const plan: CompactionPlan = {
    planId: parsed.ok,
    candidate: input.identity.candidate,
    epoch: epoch,
    bound,
    policy: {
      identity: policies.compaction.identity,
      configDigest: policies.compaction.configDigest(),
    },
    covers: { from: first.ref, to: draft.coverTo },
    retained,
    floor,
    after: [
      ...context.covered.slice(end + 1).flatMap(e => (e.message === null ? [] : [e.message])),
      ...context.after,
    ],
    shape: draft.shape,
  }
  const material: SummaryMaterial = { covered, retained, trimmed: [] }
  const proof = {
    role: 'compaction',
    id: messageId({ plan: plan.planId, validation: true }),
    blocks: [textBlock('validation', { plan: plan.planId })],
    covers: plan.covers,
    retained,
    derivation: {
      owner: 'request-context-contract',
      record: plan.planId,
      revision: '1',
      digest: digest(plan),
    },
  }
  const legal = judgeCompaction(proof, {
    covered,
    after: [
      ...context.covered.slice(end + 1).flatMap(e => (e.message === null ? [] : [e.message])),
      ...context.after,
    ],
    open: context.open,
  })
  if ('rejected' in legal) return invalid('unsupported-format')
  return { kind: 'accepted' as const, plan, material }
}
