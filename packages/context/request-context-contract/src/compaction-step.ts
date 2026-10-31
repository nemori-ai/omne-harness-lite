import { tenantEquals } from '@omne-harness/legal-identity'
import { judgeCompaction } from '@omne-harness/message'
import type {
  AssemblyFailure,
  CompactionPlan,
  DeriveInput,
  PlanProgress,
  SelectedModel,
  StepInput,
  StepResult,
} from './values.js'
import type { OperationContext } from './operation-context.js'
import { invalid, materialOfPlan, summaryStep } from './compaction-request.js'
import { basisDigest } from './plan.js'
import { measureCompactionCandidate, projectedOf } from './compaction-context.js'
import { canonical, digest, messageId, measuredAmount } from './internal.js'

const INDEX = /^(0|[1-9][0-9]*)$/u

/** Checks plan, progress, basis and step index; nothing here creates new progress. */
export function validatePlan<P>(
  input: DeriveInput<P>,
  context: OperationContext<P>,
): AssemblyFailure | null {
  const { plan, progress, step, material } = input
  const { policies } = context
  if (plan.planId !== progress.planId || plan.candidate !== input.call.candidate)
    return invalid('plan-mismatch')
  if (
    canonical(plan.policy.identity) !== canonical(policies.compaction.identity) ||
    plan.policy.configDigest !== policies.compaction.configDigest()
  )
    return invalid('policy-mismatch')
  const { digest: recorded, ...unsigned } = plan.basis
  if (basisDigest(unsigned) !== recorded) return invalid('plan-mismatch', 'plan.basis')
  if (!tenantEquals(plan.basis.target.tenant, context.target.tenant))
    return invalid('tenant-mismatch', 'plan.basis.target')
  if (plan.basis.target.scope.ref !== context.target.scope.ref)
    return invalid('plan-mismatch', 'plan.basis.target')
  if (canonical(plan.basis.representation) !== canonical(policies.representation.identity))
    return invalid('policy-mismatch', 'plan.basis.representation')
  if (!INDEX.test(progress.completed) || BigInt(progress.completed) >= BigInt(plan.bound))
    return invalid('progress-mismatch')
  if (
    BigInt(progress.completed) !== BigInt(progress.consumed.length) ||
    progress.consumed.some(
      (item, index) => !INDEX.test(item.index) || BigInt(item.index) !== BigInt(index),
    )
  )
    return invalid('progress-mismatch')
  if (step.index !== progress.completed) return invalid('progress-mismatch', 'step.index')
  if (!materialOfPlan(plan, material)) return invalid('plan-mismatch', 'material')
  return null
}

function advance(plan: CompactionPlan, progress: PlanProgress, step: StepInput): PlanProgress {
  return {
    planId: plan.planId,
    completed: (BigInt(progress.completed) + 1n).toString(),
    consumed: [
      ...progress.consumed,
      {
        index: progress.completed,
        evidence: step.kind === 'summary' ? step.consumed : step.evidence,
      },
    ],
  }
}

/** Derives the next step or the transition from one summarize result (RQ-06). */
export async function deriveFrom<P>(
  input: DeriveInput<P>,
  selection: SelectedModel,
  context: OperationContext<P>,
): Promise<StepResult> {
  const failure = validatePlan(input, context)
  if (failure !== null) return failure
  const { plan, progress, step, material } = input
  if (canonical(selection) !== canonical(plan.basis.selection))
    return invalid('plan-mismatch', 'model')
  const next = advance(plan, progress, step)
  const fail = (cause: 'bound-exhausted' | 'step-vetoed' | 'summary-illegal'): StepResult => ({
    kind: 'cannot-fit',
    reason: 'after-compaction',
    cause,
    progress: next,
    diagnostic: cause,
  })
  if (step.kind === 'vetoed') return fail('step-vetoed')
  const derivation = {
    owner: 'request-context-contract',
    record: plan.planId,
    revision: next.completed,
    digest: digest({ plan: plan.planId, material, produced: step.produced }),
  }
  const message = {
    role: 'compaction' as const,
    id: messageId({ layer: 'compaction', plan: plan.planId, step: progress.completed }),
    blocks: step.produced,
    covers: plan.covers,
    retained: plan.retained,
    derivation,
  }
  const legal = judgeCompaction(message, plan.basis.context)
  if ('rejected' in legal && legal.rejected === 'source-evidence')
    return invalid('source-evidence-conflict', 'compaction.context')
  const retained = projectedOf(plan.basis.projected, plan.retained)
  const after = projectedOf(
    plan.basis.projected,
    plan.basis.context.after.map(entry => entry.ref),
  )
  const budget = await measureCompactionCandidate(
    context,
    {
      selection: plan.basis.selection,
      representation: plan.basis.representation,
      source: plan.policy.identity,
    },
    [...retained, ...after],
    [...retained.map(item => item.message), message, ...after.map(item => item.message)],
  )
  if (budget.kind !== 'complete' && budget.kind !== 'deferred-media') return budget
  const fits = budget.checks.every(c => measuredAmount(c) <= BigInt(c.limit))
  if ('ok' in legal && fits)
    return {
      kind: 'transition',
      progress: next,
      value: {
        planId: plan.planId,
        candidate: plan.candidate,
        message: legal.ok,
        derivation,
        commitment: {
          preparation: plan.candidate,
          steps: next.consumed.map(x => ({ index: x.index, consumed: x.evidence })),
          digest: digest({ plan: plan.planId, steps: next.consumed }),
        },
      },
    }
  if (BigInt(next.completed) >= BigInt(plan.bound)) return fail('bound-exhausted')
  return {
    kind: 'next',
    progress: next,
    step: summaryStep(plan, next.completed, material, context.policies),
  }
}
