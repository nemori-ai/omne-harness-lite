import type { AssembledModelInput } from '@omne-harness/model-contract'
import { judgeCompaction, type CompactionContext } from '@omne-harness/message'
import type {
  AssemblyInput,
  AssemblyResult,
  AssemblyFailure,
  CompactionPlan,
  PlanProgress,
  StepInput,
  StepRequest,
  SummaryMaterial,
  TransitionEvidence,
  PlanResult,
  StepResult,
} from './values.js'
import type { AssemblyPolicies, AssemblyPorts } from './assembly.js'
import { assemble, readHistory, validateInput, measure } from './assembly.js'
import { project } from './projection.js'
import { decodePlanId } from './refs.js'
import {
  canonical,
  digest,
  messageId,
  textBlock,
  measuredAmount,
  decimalParts,
} from './internal.js'
export type DeriveInput = Readonly<{
  plan: CompactionPlan
  progress: PlanProgress
  step: StepInput
  material: SummaryMaterial | null
  selection: import('./values.js').SelectedModel
}>
function invalid(
  reason: 'plan-mismatch' | 'progress-mismatch' | 'policy-mismatch' | 'unsupported-format',
): AssemblyFailure {
  return { kind: 'invalid', field: 'plan', reason }
}
function summary(material: SummaryMaterial, policies: AssemblyPolicies): AssembledModelInput {
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
function request(
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
  const last = read.rows.at(-1)
  if (last === undefined) return invalid('unsupported-format')
  const context = await ports.history.compactionContext(
    read.evidence,
    input.identity.access,
    last.entry,
  )
  if (context.kind === 'epoch-changed')
    return {
      kind: 'unavailable',
      owner: 'history-source',
      diagnostic: 'Compaction epoch changed; retry with current evidence',
    }
  if (context.kind === 'denied')
    return { kind: 'denied', action: 'read-history', diagnostic: 'Compaction context refused' }
  if (context.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: 'Compaction context unknown' }
  if (context.kind === 'invalid') return invalid('unsupported-format')
  if (context.kind === 'unavailable')
    return { kind: 'unavailable', owner: 'history-source', diagnostic: context.diagnostic }
  if (context.epoch !== read.evidence.epoch) return invalid('plan-mismatch')
  const measured = new Map<string, bigint>()
  for (const entry of context.value.covered) {
    const assembled = {
      ...summary({ covered: [], retained: [], trimmed: [] }, policies),
      system: [],
      messages: entry.message === null ? [] : [entry.message],
    }
    const budget = measure(input, ports, assembled, [])
    if (budget.kind !== 'complete' && budget.kind !== 'deferred-media') return budget
    const check = budget.checks.filter(c => c.metric === 'input-tokens').map(measuredAmount)
    measured.set(
      entry.ref,
      check.reduce((a, b) => (a > b ? a : b), 0n),
    )
  }
  const measureEntries = (entries: readonly import('@omne-harness/message').RecordEntryRef[]) =>
    entries.reduce((sum, ref) => sum + (measured.get(ref) ?? 0n), 0n).toString()
  // The holder's complete open-work floor applies before policy coverage is shortened.
  if (context.value.open.some(ref => !measured.has(ref))) return invalid('unsupported-format')
  const retain = policies.compaction.config.retainBudget
  const limit =
    retain.kind === 'tokens'
      ? BigInt(retain.retainTokens)
      : (BigInt(input.selection.profile.definition.context.window.provided) *
          decimalParts(retain.retainRatio).n) /
        decimalParts(retain.retainRatio).scale
  if (BigInt(measureEntries(context.value.open)) > limit)
    return {
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
      floor: context.value.open,
      budget: limit.toString(),
      diagnostic: 'Open-work floor exceeds retention budget',
    }
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
  const end = context.value.covered.findIndex(e => e.ref === draft.coverTo)
  const covered = context.value.covered.slice(0, end + 1)
  const first = covered[0]
  if (end < 0 || first === undefined) return invalid('unsupported-format')
  const floor = context.value.open.filter(ref => covered.some(e => e.ref === ref))
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
    `plan_${digest({ candidate: input.identity.candidate, epoch: context.epoch, policy: policies.compaction.identity, config: policies.compaction.configDigest() })}`,
  )
  if ('failure' in parsed) return invalid('plan-mismatch')
  const plan: CompactionPlan = {
    planId: parsed.ok,
    candidate: input.identity.candidate,
    epoch: context.epoch,
    bound,
    policy: {
      identity: policies.compaction.identity,
      configDigest: policies.compaction.configDigest(),
    },
    covers: { from: first.ref, to: draft.coverTo },
    retained,
    floor,
    after: [
      ...context.value.covered.slice(end + 1).flatMap(e => (e.message === null ? [] : [e.message])),
      ...context.value.after,
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
      ...context.value.covered.slice(end + 1).flatMap(e => (e.message === null ? [] : [e.message])),
      ...context.value.after,
    ],
    open: context.value.open,
  })
  if ('rejected' in legal) return invalid('unsupported-format')
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
export async function deriveStep<P>(
  input: DeriveInput,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<StepResult> {
  const { plan, progress, step, material } = input
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
  if (material === null) return invalid('unsupported-format')
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
  const next = {
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
export async function resume<P>(
  input: AssemblyInput<P> & Readonly<{ transition: TransitionEvidence }>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<AssemblyResult> {
  if (
    input.contextRead.read.kind !== 'success' ||
    !('viewRevision' in input.contextRead.read.value)
  )
    return { kind: 'invalid', field: 'contextRead', reason: 'resume-without-full-snapshot' }
  if (
    input.transition.candidate !== input.identity.candidate ||
    input.transition.epoch !== input.history.epoch
  )
    return invalid('plan-mismatch')
  return assemble(input, ports, policies)
}
