import type {
  Access,
  AgentCheckpoint,
  AgentExecutionId,
  Authority,
  ExecutionSnapshot,
  Failure,
  FailureCandidate,
  HandoffChange,
  HandoffOutcome,
  PendingHandoff,
  RuntimeConditions,
  SelectedModel,
  CompactionProviderBinding,
  CompactionState,
  CompactionOutcome,
  ProducedResult,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentConfiguration } from '../construction.ts'
import { handoffStage } from './identities.ts'
import { canonical } from '../canonical.ts'
import { type LoopNode } from './nodes.ts'
import { beginCompaction, receiveCompaction } from './compaction.ts'
import {
  historyCaller,
  required,
  step,
  type Handler,
  type Iteration,
  type Step,
} from './coordinator-steps.ts'
import type { LoopPorts } from './coordinator.ts'
import { recordedOutcome } from './coordinator-helpers.ts'

// The compaction nodes C0..C4 of the execution coordinator. They see the coordinator only through
// the scope it hands them: its ports, its access, its saved position and the steps it shares.

export function invalidCompaction(reason: string): Failure {
  return { kind: 'invalid', field: 'compaction', reason }
}

export function originalCompactionOf(checkpoint: AgentCheckpoint | null) {
  const original = required(checkpoint, 'checkpoint').requestPreparation
  if (original?.kind !== 'needs-compaction')
    throw new Error('compaction has no original preparation')
  return original
}

export type CompactionNodeScope<P> = Readonly<{
  ports: LoopPorts<P>
  access: Access<P>
  execution: AgentExecutionId
  provider: CompactionProviderBinding
  jointCommits: NonNullable<AgentConfiguration['jointCommits']>
  authority: () => Authority | null
  checkpoint: () => AgentCheckpoint | null
  advancing: () => Promise<Outcome<ExecutionSnapshot, Failure>>
  waitFor: (
    node: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
    recheck: null,
  ) => Outcome<Step, Failure>
  saveHandoff: (
    node: LoopNode,
    to: string,
    value: Pick<PendingHandoff, 'position' | 'source' | 'candidate'>,
  ) => Promise<Outcome<PendingHandoff, Failure>>
  prepareHandoff: (request: PendingHandoff) => Promise<Outcome<HandoffOutcome, Failure>>
  select: (conditions: RuntimeConditions) => Promise<Outcome<SelectedModel, Failure>>
  restoredIteration: (at: AgentCheckpoint) => Outcome<Iteration, Failure>
}>

export function compactionNodes<P>(scope: CompactionNodeScope<P>) {
  function producedCompaction(task: CompactionState): ProducedResult {
    const result = required(task.result, 'compaction result')
    return {
      producer: { kind: 'compaction', task: task.task },
      version: result.version,
      delivery: null,
      source: result.evidence,
    }
  }

  async function compactionMaterial(
    task: CompactionState,
  ): Promise<Outcome<CompactionOutcome, Failure>> {
    const found = await scope.ports.materials.read({
      ...scope.access,
      source: required(task.received, 'compaction custody'),
    })
    if ('failure' in found) return found
    return found.ok.kind === 'compaction' &&
      canonical(found.ok.result) === canonical(producedCompaction(task))
      ? succeed(found.ok.outcome)
      : fail(invalidCompaction('received material does not match the task'))
  }

  async function failedCompaction(
    task: CompactionState,
    value: Exclude<CompactionOutcome, { kind: 'completed' }>,
    handoff?: HandoffChange,
  ): Promise<Outcome<Step, Failure>> {
    const instant = await scope.ports.clock.now()
    if ('failure' in instant) return instant
    const latest = await scope.advancing()
    if ('failure' in latest) return latest
    const conditions = await scope.ports.conditions.read({
      ...scope.access,
      advance: required(scope.authority(), 'authority'),
      previous: latest.ok.checkpoint.priorConditions,
    })
    if ('failure' in conditions) return conditions
    const source = required(task.result, 'result').evidence
    const common = { step: latest.ok.checkpoint.step, at: instant.ok, source, task: task.task }
    const failure: FailureCandidate =
      value.kind === 'cannot-fit'
        ? {
            ...common,
            kind: 'cannot-fit',
            reason: value.reason,
            context: originalCompactionOf(scope.checkpoint()).source,
          }
        : {
            ...common,
            kind: 'compaction-failed',
            reason: value.kind === 'failed' ? value.reason : 'cancelled',
            diagnostic:
              value.kind === 'failed' ? value.diagnostic : 'the compaction task was cancelled',
          }
    return step('try-finish', {
      checkpoint: {
        compaction: { ...task, ended: 'failed' },
        ...(handoff === undefined ? {} : { currentHandoff: null }),
      },
      state: { kind: 'settling' },
      ...(handoff === undefined ? {} : { handoff }),
      finish: {
        origin: latest.ok.history,
        conclusion: { kind: 'fail', cause: source },
        failure,
        inputWatermark: latest.ok.inputWatermark,
        conditions: conditions.ok.source,
      },
      caller: {
        kind: 'processed',
        result: producedCompaction(task),
        consumption: task.consumption,
        completion: source,
      },
    })
  }

  return {
    async C0() {
      const task = await beginCompaction(scope.ports.compactionInputs, {
        ...scope.access,
        preparation: originalCompactionOf(scope.checkpoint()),
        provider: scope.provider,
      })
      if ('failure' in task) return task
      return step('recorded', { checkpoint: { compaction: task.ok } })
    },
    async C1() {
      const latest = await scope.advancing()
      if ('failure' in latest) return latest
      const task = required(latest.ok.checkpoint.compaction, 'compaction task')
      const received = await receiveCompaction(scope.ports, {
        ...scope.access,
        execution: scope.execution,
        state: task,
        preparation: originalCompactionOf(scope.checkpoint()).id,
      })
      if ('failure' in received) return received
      if (received.ok.kind === 'pending')
        return scope.waitFor(
          'C1',
          {
            kind: 'unavailable',
            owner: task.task.authority,
            diagnostic: 'compaction task is pending',
          },
          null,
        )
      return step('received', {
        checkpoint: {
          compaction: { ...task, result: received.ok.result, received: received.ok.received },
        },
      })
    },
    async C2() {
      const latest = await scope.advancing()
      if ('failure' in latest) return latest
      const task = required(latest.ok.checkpoint.compaction, 'compaction task')
      const material = await compactionMaterial(task)
      if ('failure' in material) return material
      if (material.ok.kind !== 'completed') return failedCompaction(task, material.ok)
      const assessed = await scope.ports.requests.assessCompaction({
        ...scope.access,
        advance: required(scope.authority(), 'authority'),
        original: originalCompactionOf(scope.checkpoint()),
        task: task.task,
        consumption: task.consumption,
        result: required(task.result, 'result'),
        received: required(task.received, 'received'),
        message: material.ok.message,
      })
      if ('failure' in assessed) return assessed
      if (assessed.ok.kind === 'cannot-fit')
        return failedCompaction(task, {
          kind: 'cannot-fit',
          reason: 'after-compaction',
          diagnostic: assessed.ok.diagnostic,
        })
      const position = { step: latest.ok.checkpoint.step, node: 'C3', slot: null }
      const saved = await scope.saveHandoff('C2', 'C3', {
        position,
        source: { kind: 'context-transition', transition: assessed.ok.value },
        candidate: material.ok.message,
      })
      return 'failure' in saved ? saved : step('prepared', null)
    },
    async C3() {
      const latest = await scope.advancing()
      if ('failure' in latest) return latest
      const task = required(latest.ok.checkpoint.compaction, 'compaction task')
      const record = latest.ok.handoffs.find(
        item => canonical(item.handoff) === canonical(latest.ok.checkpoint.currentHandoff),
      )
      if (
        record?.request.kind !== 'execution' ||
        record.request.source.kind !== 'context-transition'
      )
        return fail(invalidCompaction('the original history handoff is missing'))
      const request = record.request
      const known = recordedOutcome(record.resolution)
      const prepared = known === undefined ? await scope.prepareHandoff(request) : succeed(known)
      if ('failure' in prepared) return prepared
      const fixed = prepared.ok
      if (fixed.decision.kind === 'rejected')
        return failedCompaction(
          task,
          { kind: 'failed', reason: 'invalid-output', diagnostic: fixed.decision.reason },
          { kind: 'resolve', outcome: fixed },
        )
      if (canonical(fixed.decision.message) !== canonical(request.candidate))
        return fail(invalidCompaction('a complete compaction message cannot be rewritten'))
      if (!scope.jointCommits.includes('context-transition'))
        return fail(invalidCompaction('atomic context adoption is unavailable'))
      return step('resolved', {
        checkpoint: {
          currentHandoff: null,
          compaction: { ...task, ended: 'committed', transition: fixed.record },
        },
        handoff: { kind: 'resolve', outcome: fixed },
        caller: historyCaller(scope.jointCommits, fixed),
        events: [
          { kind: 'message', message: fixed.decision.message, source: fixed.decision.admission },
        ],
        operation: handoffStage(request.reference.operation, 'resolve'),
      })
    },
    async C4() {
      const latest = await scope.advancing()
      if ('failure' in latest) return latest
      const task = required(latest.ok.checkpoint.compaction, 'compaction task')
      if (task.ended !== 'committed') return fail(invalidCompaction('history was not adopted'))
      const restored = scope.restoredIteration(latest.ok.checkpoint)
      if ('failure' in restored) return restored
      const current = restored.ok
      const advance = required(scope.authority(), 'authority')
      const conditions = await scope.ports.conditions.read({
        ...scope.access,
        advance,
        previous: latest.ok.checkpoint.priorConditions,
      })
      if ('failure' in conditions) return conditions
      const selected = await scope.select(conditions.ok)
      if ('failure' in selected) return selected
      const context = await scope.ports.modelContext.read({
        ...scope.access,
        advance,
        position: current.position,
        recipient: selected.ok.recipient,
        history: latest.ok.history,
        adopted: null,
        transition: required(task.transition, 'transition'),
      })
      if ('failure' in context) return context
      const resumed = await scope.ports.requests.resume({
        ...scope.access,
        advance,
        original: originalCompactionOf(scope.checkpoint()),
        transition: required(task.transition, 'transition'),
        selection: selected.ok,
        context: context.ok,
      })
      if ('failure' in resumed) return resumed
      current.conditions = conditions.ok
      current.selected = selected.ok
      current.context = context.ok
      current.preparation = resumed.ok
      if (resumed.ok.kind === 'ready') {
        current.ready = resumed.ok
        return step('ready')
      }
      return resumed.ok.kind === 'cannot-fit'
        ? step('try-finish', { checkpoint: { requestPreparation: resumed.ok } })
        : step('prepared')
    },
  } satisfies Partial<Record<LoopNode, Handler>>
}
