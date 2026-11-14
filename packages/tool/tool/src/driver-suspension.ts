import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type DurableEvidence,
  type FixedToolRequest,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolRecovery,
  ToolTask,
  WriteContext,
} from '@omne-harness/tool-contract/provider'
import { tenantKey } from './boundary.ts'
import { digestOf as canonicalDigest } from './evidence.ts'
import type { ToolDependencies } from './construction.ts'
import type { DriverStop } from './driver.ts'
import { isExcludedFailure } from './ledger-exclusion.ts'
import type { TenantId } from './ledger-store.ts'

type Step<P> = CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>
type Result = DriverStop | Readonly<{ kind: 'continue'; progressed: boolean }>
type SuspendTask = Extract<ToolTask, { kind: 'suspend' }>
type RegistrationTask = Extract<ToolTask, { kind: 'wait-registration' }>

const CONTINUE: Result = { kind: 'continue', progressed: true }
const STALLED: Result = { kind: 'continue', progressed: false }

function failed(failure: ToolFailure): Result {
  return { kind: 'failed', failure }
}

function after(reply: Outcome<unknown, ToolFailure>): Result {
  if ('ok' in reply) return CONTINUE
  const { failure } = reply
  return failure.kind === 'commit-unknown' ||
    failure.kind === 'stale-revision' ||
    isExcludedFailure(failure)
    ? STALLED
    : failed(failure)
}

function derived(base: string, suffix: string): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(`${base}/${suffix}`)
  return 'ok' in decoded
    ? decoded
    : fail({ kind: 'invalid', field: 'operation', reason: decoded.failure.reason })
}

export function suspensionOperations(
  start: ToolStartRecord,
): Outcome<Readonly<{ plan: ToolOperationId; commit: ToolOperationId }>, ToolFailure> {
  const plan = derived(start.operation, 'suspension')
  if ('failure' in plan) return plan
  const commit = derived(start.operation, 'suspended')
  return 'failure' in commit ? commit : succeed({ plan: plan.ok, commit: commit.ok })
}

export function createSuspensionDriver<P, B extends ContentBlock, E>(
  {
    commands,
    bindings,
    decisions,
    queues,
  }: Pick<ToolDependencies<P, B, E>, 'commands' | 'bindings' | 'decisions' | 'queues'>,
  executionOf: (step: Step<P>) => ToolExecutionRef,
  wake: (tenant: TenantId, request: FixedToolRequest) => Promise<void>,
) {
  const uncertain = new Set<string>()
  const uncertainKey = (step: CallAccess<P>, operation: ToolOperationId) =>
    JSON.stringify([tenantKey(step.tenant), step.call, operation])

  const access = (step: Step<P>) => ({
    principal: step.principal,
    tenant: step.tenant,
    call: step.call,
  })

  const write = (
    step: Step<P>,
    recovery: ToolRecovery,
    operation: ToolOperationId,
  ): WriteContext & Readonly<{ principal: P }> => ({
    ...executionOf(step),
    principal: step.principal,
    operation,
    expected: recovery.state.revision,
  })

  const checkpointed = async (step: Step<P>, recovery: ToolRecovery) => {
    const resolved = await bindings.resolve({ ...access(step), request: recovery.request })
    if ('failure' in resolved) return resolved
    return succeed(resolved.ok.kind === 'checkpointed' ? resolved.ok : null)
  }

  const plan = async (step: Step<P>, recovery: ToolRecovery): Promise<Result | null> => {
    if (recovery.state.phase !== 'running' || recovery.start === null) return null
    const start = canonicalDigest(recovery.start)
    if (recovery.suspensions.some(suspension => canonicalDigest(suspension.start) === start))
      return {
        kind: 'blocked',
        diagnostic: 'the suspension is planned; its checkpoint commit owes the next step',
      }
    const binding = await checkpointed(step, recovery)
    if ('failure' in binding) return failed(binding.failure)
    if (binding.ok === null) return null
    const operations = suspensionOperations(recovery.start)
    if ('failure' in operations) return failed(operations.failure)
    return after(
      await commands.planSuspension({
        ...write(step, recovery, operations.ok.plan),
        start: recovery.start,
        schema: binding.ok.checkpointSchema,
      }),
    )
  }

  const commit = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: SuspendTask,
  ): Promise<Result> => {
    const binding = await checkpointed(step, recovery)
    if ('failure' in binding) return failed(binding.failure)
    if (binding.ok === null)
      return failed({ kind: 'invalid', field: 'binding', reason: 'not-checkpointed' })
    const progress = await binding.ok.suspend(task.suspension)
    if ('failure' in progress) return failed(progress.failure)
    if (progress.ok.kind !== 'suspended') {
      const reason =
        progress.ok.kind === 'not-suspended'
          ? 'the binding proves that the segment did not suspend'
          : progress.ok.diagnostic
      return progress.ok.kind === 'unknown'
        ? failed({ kind: 'unavailable', dependency: 'tool-binding', diagnostic: reason })
        : { kind: 'blocked', diagnostic: `the suspension is ${progress.ok.kind}: ${reason}` }
    }
    const operations = suspensionOperations(task.suspension.start)
    if ('failure' in operations) return failed(operations.failure)
    return after(
      await commands.suspend({
        ...write(step, recovery, operations.ok.commit),
        suspension: task.suspension,
        checkpoint: progress.ok.checkpoint,
        state: progress.ok.state,
      }),
    )
  }

  const park = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: SuspendTask,
  ): Promise<Result> => {
    const parked = await queues.park({ ...access(step), operation: task.operation })
    if ('failure' in parked) return after(parked)
    if (parked.ok.parked) await wake(step.tenant, recovery.request)
    return CONTINUE
  }

  const suspension = (
    step: Step<P>,
    recovery: ToolRecovery,
    task: SuspendTask,
  ): (() => Promise<Result>) | null => {
    if (task.operation !== task.suspension.operation) return () => park(step, recovery, task)
    return recovery.state.phase === 'running' ? () => commit(step, recovery, task) : null
  }

  const attach = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: RegistrationTask,
    registration: DurableEvidence,
  ): Promise<Result> => {
    const operation = derived(task.operation, 'attach')
    if ('failure' in operation) return failed(operation.failure)
    const attached = await commands.attachRegistration({
      ...write(step, recovery, operation.ok),
      wait: task.wait,
      registration,
    })
    if ('ok' in attached) uncertain.delete(uncertainKey(step, task.operation))
    return after(attached)
  }

  const refuse = async (
    step: Step<P>,
    task: RegistrationTask,
    refusal: ToolFailure,
  ): Promise<Result> => {
    const operation = derived(task.operation, 'refused')
    if ('failure' in operation) return failed(operation.failure)
    const reason = `${task.action === 'invalidate' ? 'invalidation' : 'registration'}-refused: ${refusal.kind}`
    const blocked = await commands.recordTask({
      ...access(step),
      operation: operation.ok,
      task,
      resolution: { kind: 'blocked', reason },
    })
    return 'ok' in blocked ? { kind: 'blocked', diagnostic: reason } : after(blocked)
  }

  const recall = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: RegistrationTask,
  ): Promise<Result | 'ensure'> => {
    const inspected = await decisions.inspectOperation({
      ...access(step),
      operation: task.operation,
    })
    if ('failure' in inspected) return failed(inspected.failure)
    const resolution = inspected.ok
    if (resolution.kind === 'committed') return attach(step, recovery, task, resolution.receipt)
    if (resolution.kind === 'excluded') return 'ensure'
    return failed({
      kind: 'unavailable',
      dependency: 'tool-decisions',
      diagnostic: `the registration is ${resolution.kind}: ${resolution.diagnostic}`,
    })
  }

  const register = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: RegistrationTask,
  ): Promise<Result> => {
    const intent = recovery.waits.find(wait => wait.intent.wait === task.wait)?.intent
    if (intent?.kind !== 'ask')
      return { kind: 'blocked', diagnostic: 'the registration has no opening Ask wait' }
    const key = uncertainKey(step, task.operation)
    if (uncertain.has(key)) {
      const recalled = await recall(step, recovery, task)
      if (recalled !== 'ensure') return recalled
    }
    const ensured = await decisions.ensure({
      ...access(step),
      operation: task.operation,
      wait: task.wait,
      request: intent.request,
    })
    if ('ok' in ensured) return attach(step, recovery, task, ensured.ok)
    const { failure } = ensured
    if (failure.kind === 'unavailable') return failed(failure)
    if (failure.kind !== 'commit-unknown') return refuse(step, task, failure)
    uncertain.add(key)
    const recalled = await recall(step, recovery, task)
    return recalled === 'ensure'
      ? failed({
          kind: 'unavailable',
          dependency: 'tool-decisions',
          diagnostic: 'the registration was excluded; it is asked again with the same identity',
        })
      : recalled
  }

  const invalidated = async (
    step: Step<P>,
    task: RegistrationTask,
    receipt: DurableEvidence,
  ): Promise<Result> => {
    const operation = derived(task.operation, 'done')
    if ('failure' in operation) return failed(operation.failure)
    const done = await commands.recordTask({
      ...access(step),
      operation: operation.ok,
      task,
      resolution: { kind: 'done', evidence: receipt },
    })
    if ('ok' in done) uncertain.delete(uncertainKey(step, task.operation))
    return after(done)
  }

  const invalidate = async (
    step: Step<P>,
    task: RegistrationTask,
    cause: 'cancelled' | 'terminal',
  ): Promise<Result> => {
    const key = uncertainKey(step, task.operation)
    if (uncertain.has(key)) {
      const recalled = await recallInvalidation(step, task)
      if (recalled !== 'invalidate') return recalled
    }
    const answered = await decisions.invalidate({
      ...access(step),
      operation: task.operation,
      wait: task.wait,
      terminal: task.evidence,
      cause,
    })
    if ('ok' in answered) return invalidated(step, task, answered.ok)
    const { failure } = answered
    if (failure.kind === 'unavailable') return failed(failure)
    if (failure.kind !== 'commit-unknown') return refuse(step, task, failure)
    uncertain.add(key)
    const recalled = await recallInvalidation(step, task)
    return recalled === 'invalidate'
      ? failed({
          kind: 'unavailable',
          dependency: 'tool-decisions',
          diagnostic: 'the invalidation was excluded; it is asked again with the same identity',
        })
      : recalled
  }

  const recallInvalidation = async (
    step: Step<P>,
    task: RegistrationTask,
  ): Promise<Result | 'invalidate'> => {
    const inspected = await decisions.inspectOperation({
      ...access(step),
      operation: task.operation,
    })
    if ('failure' in inspected) return failed(inspected.failure)
    const resolution = inspected.ok
    if (resolution.kind === 'committed') return invalidated(step, task, resolution.receipt)
    if (resolution.kind === 'excluded') return 'invalidate'
    return failed({
      kind: 'unavailable',
      dependency: 'tool-decisions',
      diagnostic: `the invalidation is ${resolution.kind}: ${resolution.diagnostic}`,
    })
  }

  const registration = (
    step: Step<P>,
    recovery: ToolRecovery,
    task: RegistrationTask,
  ): (() => Promise<Result>) | null => {
    if (task.state !== 'pending') return null
    if (task.action === 'invalidate') {
      const closed = recovery.waits.find(wait => wait.intent.wait === task.wait)
      if (recovery.state.phase !== 'settled' || closed?.phase !== 'closed') return null
      const { cause } = closed
      return cause === 'continued' ? null : () => invalidate(step, task, cause)
    }
    return recovery.state.phase === 'suspended' ? () => register(step, recovery, task) : null
  }

  return { plan, suspension, registration }
}
