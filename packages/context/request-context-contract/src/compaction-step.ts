import { judgeCompaction, type CompactionContext } from '@omne-harness/message'
import type {
  DeriveInput,
  StepResult,
  CompactionPlan,
  PlanProgress,
  StepInput,
  SummaryMaterial,
  AssemblyFailure,
} from './values.js'
import type { AssemblyPorts, AssemblyPolicies } from './ports.js'
import { invalid, request, summary } from './compaction-request.js'
import { measure } from './measurement.js'
import { canonical, digest, messageId, measuredAmount } from './internal.js'
export async function deriveStep<P>(
  input: DeriveInput,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<StepResult> {
  const { plan, progress, step, material } = input
  const identity = validatePlanIdentity(plan, progress, policies)
  if (identity !== null) return identity
  if (material === null) return invalid('unsupported-format')
  const position = validateStepPosition(plan, progress, step)
  if (position !== null) return position
  const next = advanceProgress(plan, progress, step, material)
  const fail = (cause: 'bound-exhausted' | 'step-vetoed' | 'summary-illegal'): StepResult => ({
    kind: 'cannot-fit',
    reason: 'after-compaction',
    cause,
    progress: next,
    diagnostic: cause,
  })
  if (step.kind === 'vetoed') return fail('step-vetoed')
  if (step.kind === 'trim') {
    const trimmed = policies.compaction.trim(material, { maxBlockBytes: '65536' })
    return {
      kind: 'next',
      progress: next,
      step: request(plan, next.completed, trimmed, 'summarize', policies),
    }
  }
  const derivation = {
    owner: 'request-context-contract',
    record: plan.planId,
    revision: next.completed,
    digest: digest({ plan, material, produced: step.produced }),
  }
  const message = {
    role: 'compaction' as const,
    id: messageId({ layer: 'compaction', plan: plan.planId, step: progress.completed }),
    blocks: step.produced,
    covers: plan.covers,
    retained: plan.retained,
    derivation,
  }
  const context: CompactionContext = {
    covered: material.covered,
    after: plan.after,
    open: plan.floor,
  }
  const legal = judgeCompaction(message, context)
  const budget = measure(
    { selection: input.selection },
    ports,
    {
      ...summary(material, policies),
      system: [],
      messages: [
        ...material.covered.flatMap(e =>
          e.message !== null && plan.retained.includes(e.ref) ? [e.message] : [],
        ),
        message,
        ...plan.after,
      ],
    },
    [],
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
    step: request(plan, next.completed, material, 'summarize', policies),
  }
}

function validatePlanIdentity(
  plan: CompactionPlan,
  progress: PlanProgress,
  policies: AssemblyPolicies,
): AssemblyFailure | null {
  if (plan.planId !== progress.planId) return invalid('plan-mismatch')
  if (
    canonical(plan.policy.identity) !== canonical(policies.compaction.identity) ||
    plan.policy.configDigest !== policies.compaction.configDigest()
  )
    return invalid('policy-mismatch')
  if (
    !/^(0|[1-9][0-9]*)$/u.test(progress.completed) ||
    BigInt(progress.completed) >= BigInt(plan.bound)
  )
    return invalid('progress-mismatch')
  return null
}

function validateStepPosition(
  plan: CompactionPlan,
  progress: PlanProgress,
  step: StepInput,
): AssemblyFailure | null {
  const trim = plan.shape === 'trim-then-summarize' && progress.completed === '0'
  if (step.kind !== 'vetoed' && (step.kind === 'trim') !== trim) return invalid('progress-mismatch')
  if (
    BigInt(progress.completed) !== BigInt(progress.consumed.length) ||
    progress.consumed.some(
      (step, index) =>
        !/^(0|[1-9][0-9]*)$/u.test(step.index) || BigInt(step.index) !== BigInt(index),
    )
  )
    return invalid('progress-mismatch')
  return null
}

function advanceProgress(
  plan: CompactionPlan,
  progress: PlanProgress,
  step: StepInput,
  material: SummaryMaterial,
): PlanProgress {
  return {
    planId: plan.planId,
    completed: (BigInt(progress.completed) + 1n).toString(),
    consumed:
      step.kind === 'summary'
        ? [...progress.consumed, { index: progress.completed, evidence: step.consumed }]
        : [
            ...progress.consumed,
            {
              index: progress.completed,
              evidence: {
                owner: 'request-context-contract',
                record: plan.planId,
                revision: progress.completed,
                digest: digest(material),
              },
            },
          ],
  }
}
