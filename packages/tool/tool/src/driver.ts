import { checkedPreparationProgress, matchEnvironmentAdoption } from './environment-adoption.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type DurableEvidence,
  type FixedToolRequest,
  type ToolCallId,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import { type CallAccess } from '@omne-harness/tool-contract/provider'
import {
  type PreparationProgress,
  type PreparationRecord,
  type StartProgress,
  type ToolDriver,
  type ToolRecovery,
  type ToolTask,
  type WriteContext,
} from '@omne-harness/tool-contract/provider'
import { tenantKey } from './boundary.ts'
import type { ToolDependencies } from './construction.ts'
import { createFactDriver } from './driver-facts.ts'
import { createBindingInvoker } from './driver-binding.ts'
import { createControlDriver } from './driver-control.ts'
import { preserveSavedFinal } from './driver-settlement.ts'
import { createResumptionDriver } from './driver-resumption.ts'
import { createSuspensionDriver } from './driver-suspension.ts'
import { isExcludedFailure } from './ledger-exclusion.ts'
import { resumePreparationOperation } from './ledger-resumption.ts'
import { LEDGER_REJECTED_DIAGNOSTIC, queueKeyOf } from './ledger-start.ts'
import type { TenantId } from './ledger-store.ts'

export const COORDINATION_GENERATION = '1'

export type DriverStop =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'waiting'; key: string }>
  | Readonly<{ kind: 'failed'; failure: ToolFailure }>
  | Readonly<{ kind: 'blocked'; diagnostic: string }>
  | Readonly<{ kind: 'yielded'; progressed: boolean }>

export type DriverPolicy = Readonly<{ stepsPerRun: number; retryDelayMs: number }>

const MAX_RETRY_DELAY_MS = 60_000

export function laterRunDelayMs(retryDelayMs: number, level: number): number {
  const cap = Math.max(retryDelayMs, MAX_RETRY_DELAY_MS)
  return Math.min(retryDelayMs * 2 ** Math.min(level, 32), cap)
}

function runsAgainLater(stop: DriverStop): boolean {
  return (
    stop.kind === 'blocked' ||
    (stop.kind === 'yielded' && !stop.progressed) ||
    (stop.kind === 'failed' && transient(stop.failure))
  )
}

type Step<P> = CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>
type Continue = Readonly<{ kind: 'continue'; progressed: boolean }>
type StepResult = Continue | DriverStop
type RunFailures = {
  skipped: Set<string>
  first: DriverStop | null
  retry: boolean
  progressed: boolean
}
const UNSTARTED: readonly ToolRecovery['state']['phase'][] = ['accepted', 'preparing', 'queued']
const CONTINUE: Continue = { kind: 'continue', progressed: true }
const STALLED: Continue = { kind: 'continue', progressed: false }
const IDLE: DriverStop = { kind: 'idle' }

type Suffix =
  | 'plan'
  | 'prepared'
  | 'enqueue'
  | 'start'
  | 'started'
  | 'start-failed'
  | 'exclude'
  | 'reject'
  | 'ledger-rejected'

function derivedOperation(
  admission: ToolOperationId,
  suffix: Suffix,
): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(`${admission}/${suffix}`)
  if ('ok' in decoded) return decoded
  return fail({ kind: 'invalid', field: 'operation', reason: decoded.failure.reason })
}

function callKey(tenant: TenantId, call: ToolCallId): string {
  return `${tenantKey(tenant)}\u0000${call}`
}

function retryable(failure: ToolFailure): boolean {
  return (
    failure.kind === 'commit-unknown' ||
    failure.kind === 'stale-revision' ||
    isExcludedFailure(failure)
  )
}

function blocked(diagnostic: string): DriverStop {
  return { kind: 'blocked', diagnostic }
}

function transient(failure: ToolFailure): boolean {
  return failure.kind === 'unavailable'
}

export type ToolDriverHandle<P> = ToolDriver<P> &
  Readonly<{
    advance(input: Step<P>): Promise<DriverStop>
    later(input: Step<P>): void
  }>

export function createToolDriver<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  policy: DriverPolicy,
): ToolDriverHandle<P> {
  const { commands, queues, rejections, environments, authority, instances } = dependencies
  const environmentsPrepared = new Map<string, E>()
  const environmentsAsked = new Set<string>()
  const unconfirmedBindingFailures = new Set<string>()
  const waiting = new Map<string, Map<string, Readonly<{ tenant: TenantId; call: ToolCallId }>>>()
  const runs = new Map<string, Promise<unknown>>()
  const backoff = new Map<string, number>()
  const retrying = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; signals: readonly AbortSignal[] }
  >()

  const executionOf = (step: Step<P>): ToolExecutionRef => ({
    tenant: step.tenant,
    call: step.call,
    instance: step.instance,
    generation: COORDINATION_GENERATION,
  })

  const context = (
    step: Step<P>,
    recovery: ToolRecovery,
    suffix: Suffix,
    base: ToolOperationId = recovery.admission,
  ): Outcome<WriteContext & Readonly<{ principal: P }>, ToolFailure> => {
    const operation = derivedOperation(base, suffix)
    if ('failure' in operation) return operation
    return succeed({
      ...executionOf(step),
      principal: step.principal,
      operation: operation.ok,
      expected: recovery.state.revision,
    })
  }

  const startContext = (
    step: Step<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
    suffix: Suffix,
  ) =>
    context(step, recovery, suffix, start.kind === 'start' ? recovery.admission : start.operation)

  const after = (reply: Outcome<unknown, ToolFailure>): StepResult => {
    if ('ok' in reply) return CONTINUE
    return retryable(reply.failure) ? STALLED : { kind: 'failed', failure: reply.failure }
  }

  const scheduleNow = async (tenant: TenantId, call: ToolCallId): Promise<boolean> => {
    try {
      return 'ok' in (await instances.schedule({ tenant, call }))
    } catch {
      return false
    }
  }

  const scheduleLater = (
    tenant: TenantId,
    call: ToolCallId,
    signals: readonly AbortSignal[] = [],
  ): void => {
    if (signals.some(signal => signal.aborted)) return
    const key = callKey(tenant, call)
    const old = retrying.get(key)
    if (old !== undefined) {
      if (!old.signals.some(signal => signal.aborted)) return
      clearTimeout(old.timer)
      retrying.delete(key)
    }
    const level = backoff.get(key) ?? 0
    backoff.set(key, level + 1)
    const timer = setTimeout(
      () => {
        retrying.delete(key)
        if (signals.some(signal => signal.aborted)) return
        void scheduleNow(tenant, call).then(accepted => {
          if (!accepted) scheduleLater(tenant, call, signals)
        })
      },
      laterRunDelayMs(policy.retryDelayMs, level),
    )
    timer.unref()
    retrying.set(key, { timer, signals })
  }

  const retrigger = async (
    step: Step<P>,
    stop: DriverStop,
    signals: readonly AbortSignal[],
    progressed: boolean,
  ): Promise<void> => {
    if (signals.some(signal => signal.aborted)) return
    if (progressed || !runsAgainLater(stop)) backoff.delete(callKey(step.tenant, step.call))
    if (stop.kind === 'yielded' && stop.progressed) {
      if (!(await scheduleNow(step.tenant, step.call)))
        scheduleLater(step.tenant, step.call, signals)
    } else if (runsAgainLater(stop)) scheduleLater(step.tenant, step.call, signals)
  }

  const wake = async (tenant: TenantId, request: FixedToolRequest): Promise<void> => {
    const key = `${tenantKey(tenant)}\u0000${queueKeyOf(request)}`
    const waiters = waiting.get(key)
    if (waiters === undefined) return
    waiting.delete(key)
    for (const waiter of waiters.values()) {
      try {
        await instances.schedule(waiter)
      } catch {}
    }
  }

  const noteWaiting = (step: Step<P>, request: FixedToolRequest): DriverStop => {
    const key = `${tenantKey(step.tenant)}\u0000${queueKeyOf(request)}`
    const waiters = waiting.get(key) ?? new Map()
    waiters.set(callKey(step.tenant, step.call), { tenant: step.tenant, call: step.call })
    waiting.set(key, waiters)
    return { kind: 'waiting', key }
  }

  const awaitPlace = async (step: Step<P>, recovery: ToolRecovery): Promise<StepResult> => {
    const stop = noteWaiting(step, recovery.request)
    const reconciled = await queues.reconcile({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
    })
    if ('failure' in reconciled) return { kind: 'failed', failure: reconciled.failure }
    const { released, redrive } = reconciled.ok
    if (released.length > 0) await wake(step.tenant, recovery.request)
    for (const call of redrive)
      if (!(await scheduleNow(step.tenant, call)))
        return {
          kind: 'failed',
          failure: {
            kind: 'unavailable',
            dependency: 'instance-host',
            diagnostic: `the host did not take the request to run call ${call}`,
          },
        }
    return stop
  }

  const rejectPending = async (
    step: Step<P>,
    recovery: ToolRecovery,
    reason: string,
    exclusion: DurableEvidence,
  ): Promise<StepResult> => {
    const write = context(step, recovery, 'reject')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const settled = await commands.rejectPending({ ...write.ok, reason, exclusion })
    if ('ok' in settled) await wake(step.tenant, recovery.request)
    return after(settled)
  }

  const settleRejected = async (
    step: Step<P>,
    recovery: ToolRecovery,
    reason: string,
  ): Promise<StepResult> => {
    const write = context(step, recovery, 'ledger-rejected')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const settled = await rejections.settle({ ...write.ok, reason })
    if ('failure' in settled) return after(settled)
    const current = await commands.loadRecovery(step)
    if ('failure' in current) return { kind: 'failed', failure: current.failure }
    const { operation } = write.ok
    if (current.ok.tasks.some(task => task.kind === 'queue' && task.operation === operation))
      return blocked('the queue release of the minimal failure terminal is still unconfirmed')
    await wake(step.tenant, recovery.request)
    return CONTINUE
  }

  const afterRejected = async (
    step: Step<P>,
    recovery: ToolRecovery,
    result: StepResult,
  ): Promise<StepResult> => {
    if (result.kind !== 'failed') return result
    const { failure } = result
    if (failure.kind !== 'invalid' || failure.field !== 'storage') return result
    if (recovery.start !== null || !UNSTARTED.includes(recovery.state.phase)) return result
    return settleRejected(step, recovery, failure.reason)
  }

  const ledgerRejectedReason = (recovery: ToolRecovery, task: ToolOperationId): string | null => {
    const operation = derivedOperation(recovery.admission, 'ledger-rejected')
    const { state } = recovery
    if (!('ok' in operation) || task !== operation.ok) return null
    if (state.phase !== 'settled' || state.terminal.kind !== 'failed') return null
    const { diagnostic } = state.terminal
    return diagnostic.startsWith(LEDGER_REJECTED_DIAGNOSTIC)
      ? diagnostic.slice(LEDGER_REJECTED_DIAGNOSTIC.length)
      : null
  }

  const excludeAndReject = async (
    step: Step<P>,
    recovery: ToolRecovery,
    reason: string,
  ): Promise<StepResult> => {
    const write = context(step, recovery, 'exclude')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const exclusion = await authority.exclude({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      operation: write.ok.operation,
      reason,
    })
    if ('failure' in exclusion) return { kind: 'failed', failure: exclusion.failure }
    return rejectPending(step, recovery, reason, exclusion.ok)
  }

  const plan = async (step: Step<P>, recovery: ToolRecovery): Promise<StepResult> => {
    if (recovery.request.availability.kind !== 'available')
      return blocked('an accepted call of an unavailable tool has nothing to prepare')
    const write = context(step, recovery, 'plan')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    return after(
      await commands.planPreparation({
        ...write.ok,
        request: recovery.request,
        environmentAdoption: environments.adoption,
        purpose: 'initial',
      }),
    )
  }

  const continueAllocation = async (
    step: Step<P>,
    request: CallAccess<P> &
      Readonly<{ preparation: PreparationRecord; request: FixedToolRequest }>,
    read: Outcome<PreparationProgress<E>, ToolFailure>,
  ): Promise<Outcome<PreparationProgress<E>, ToolFailure>> => {
    if ('failure' in read) return read
    const checked = checkedPreparationProgress(read.ok, request.preparation)
    if ('failure' in checked || checked.ok.kind !== 'allocated' || step.signal.aborted)
      return checked
    const current = matchEnvironmentAdoption(environments, request.preparation.adoption)
    if ('failure' in current) return current
    const adopted = await environments.prepare(request)
    return 'failure' in adopted
      ? adopted
      : checkedPreparationProgress(adopted.ok, request.preparation)
  }

  const askEnvironment = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: Extract<ToolTask, { kind: 'prepare' }>,
  ): Promise<Outcome<PreparationProgress<E>, ToolFailure>> => {
    const matching = matchEnvironmentAdoption(environments, task.preparation.adoption)
    if ('failure' in matching) return matching
    const key = `${callKey(step.tenant, step.call)}\u0000${task.preparation.operation}`
    const request = {
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      preparation: task.preparation,
      request: recovery.request,
    }
    const inspect = environmentsAsked.has(key)
    const read = await (inspect
      ? environments.inspectPreparation(request)
      : environments.prepare(request))
    if ('ok' in read) environmentsAsked.add(key)
    const progress = await continueAllocation(step, request, read)
    if ('ok' in progress && ['prepared', 'excluded', 'rejected', 'lost'].includes(progress.ok.kind))
      environmentsAsked.delete(key)
    return progress
  }

  const replanResume = async (
    step: Step<P>,
    recovery: ToolRecovery,
    lost: PreparationRecord,
  ): Promise<StepResult> => {
    environmentsPrepared.delete(callKey(step.tenant, step.call))
    const accepted = recovery.waits.find(wait => wait.phase === 'responding')
    if (accepted === undefined)
      return blocked('the lost environment of the resume segment has no accepted decision')
    const operation = resumePreparationOperation(recovery.preparations, accepted.intent.wait)
    if ('failure' in operation) return { kind: 'failed', failure: operation.failure }
    const write = {
      ...executionOf(step),
      principal: step.principal,
      operation: operation.ok,
      expected: recovery.state.revision,
    }
    return after(
      await commands.planPreparation({
        ...write,
        request: recovery.request,
        purpose: 'resume',
        environmentAdoption: lost.adoption,
      }),
    )
  }

  const resumeEnvironment = async (
    step: Step<P>,
    recovery: ToolRecovery,
  ): Promise<StepResult | null> => {
    const preparation = recovery.preparations.at(-1)
    if (preparation?.purpose !== 'resume') return null
    if (environmentsPrepared.has(callKey(step.tenant, step.call))) return null
    const matching = matchEnvironmentAdoption(environments, preparation.adoption)
    if ('failure' in matching) return { kind: 'failed', failure: matching.failure }
    const read = await environments.inspectPreparation({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      preparation,
      request: recovery.request,
    })
    if ('failure' in read) return { kind: 'failed', failure: read.failure }
    if (read.ok.kind === 'lost') return replanResume(step, recovery, preparation)
    const checked = checkedPreparationProgress(read.ok, preparation)
    if ('failure' in checked) return { kind: 'failed', failure: checked.failure }
    if (checked.ok.kind === 'prepared')
      environmentsPrepared.set(callKey(step.tenant, step.call), checked.ok.environment.value)
    return null
  }

  const prepare = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: Extract<ToolTask, { kind: 'prepare' }>,
  ): Promise<StepResult> => {
    const progress = await askEnvironment(step, recovery, task)
    if ('failure' in progress) return { kind: 'failed', failure: progress.failure }
    const prepared = progress.ok
    switch (prepared.kind) {
      case 'prepared': {
        environmentsPrepared.set(callKey(step.tenant, step.call), prepared.environment.value)
        const base = task.preparation.purpose === 'resume' ? task.preparation.operation : undefined
        const write = context(step, recovery, 'prepared', base)
        if ('failure' in write) return { kind: 'failed', failure: write.failure }
        return after(
          await commands.prepared({
            ...write.ok,
            preparation: task.preparation,
            resources: prepared.environment.evidence,
          }),
        )
      }
      case 'rejected':
        if (task.preparation.purpose === 'resume')
          return blocked(`the environment of the resume segment was rejected: ${prepared.reason}`)
        return excludeAndReject(step, recovery, `environment: ${prepared.reason}`)
      case 'excluded':
        return blocked(
          'the preparation was excluded; the driver does not request it again (P03 reading pending)',
        )
      case 'lost':
        if (task.preparation.purpose === 'resume')
          return replanResume(step, recovery, task.preparation)
        return excludeAndReject(step, recovery, `environment: ${prepared.diagnostic}`)
      case 'allocated':
        return {
          kind: 'failed',
          failure: {
            kind: 'unavailable',
            dependency: 'tool-environment',
            diagnostic: 'the original allocation awaits first adoption',
          },
        }
      case 'pending':
      case 'unknown':
        return {
          kind: 'failed',
          failure: {
            kind: 'unavailable',
            dependency: 'tool-environment',
            diagnostic: `the preparation is ${prepared.kind}: ${prepared.diagnostic}`,
          },
        }
      default: {
        const exhaustive: never = prepared
        return exhaustive
      }
    }
  }

  const enqueue = async (step: Step<P>, recovery: ToolRecovery): Promise<StepResult> => {
    const write = context(step, recovery, 'enqueue')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    return after(await commands.enqueue(write.ok))
  }

  const prepareStart = async (step: Step<P>, recovery: ToolRecovery): Promise<StepResult> => {
    const write = context(step, recovery, 'start')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const intent = await commands.prepareStart(write.ok)
    if ('ok' in intent) return CONTINUE
    const { failure } = intent
    if (failure.kind === 'unavailable' && failure.dependency === 'tool-queue')
      return awaitPlace(step, recovery)
    if (failure.kind === 'unsupported') return excludeAndReject(step, recovery, failure.reason)
    return after(intent)
  }

  const recordStart = async (
    step: Step<P>,
    recovery: ToolRecovery,
    invocation: ToolStartRecord,
    outcome: StartProgress,
  ): Promise<StepResult> => {
    const write = startContext(step, recovery, invocation, 'started')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const recorded = await commands.recordStart({ ...write.ok, invocation, outcome })
    if ('ok' in recorded && (outcome.kind === 'started' || outcome.kind === 'rejected'))
      unconfirmedBindingFailures.delete(callKey(step.tenant, step.call))
    if ('ok' in recorded && outcome.kind === 'rejected') await wake(step.tenant, recovery.request)
    return after(recorded)
  }

  const environmentOf = async (
    step: CallAccess<P>,
    recovery: ToolRecovery,
    preparation: PreparationRecord,
  ): Promise<Outcome<E, ToolFailure>> => {
    const matching = matchEnvironmentAdoption(environments, preparation.adoption)
    if ('failure' in matching) return matching
    const cached = environmentsPrepared.get(callKey(step.tenant, step.call))
    if (cached !== undefined) return succeed(cached)
    const progress = await environments.inspectPreparation({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      preparation,
      request: recovery.request,
    })
    if ('failure' in progress) return progress
    const checked = checkedPreparationProgress(progress.ok, preparation)
    if ('failure' in checked) return checked
    if (checked.ok.kind !== 'prepared')
      return fail({
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: `the prepared environment cannot be reconnected: ${progress.ok.kind}`,
      })
    return succeed(checked.ok.environment.value)
  }

  const binding = createBindingInvoker(dependencies, environmentOf)
  const controls = createControlDriver(dependencies)
  const suspensions = createSuspensionDriver(dependencies, executionOf, wake)
  const resumptions = createResumptionDriver(dependencies, executionOf)
  const facts = createFactDriver(dependencies, binding, (step, delayed) => {
    if (step.signal.aborted) return
    if (delayed) scheduleLater(step.tenant, step.call, [step.signal])
    else
      void scheduleNow(step.tenant, step.call).then(accepted => {
        if (!accepted) scheduleLater(step.tenant, step.call, [step.signal])
      })
  })

  const unknownStart = async (
    step: Step<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
    diagnostic: string,
  ): Promise<StepResult> => {
    const found = await binding.inspect(step, recovery, start)
    return 'failure' in found
      ? { kind: 'failed', failure: found.failure }
      : blocked(`the start is unknown: ${diagnostic}; binding: ${found.ok.kind}`)
  }

  const rejectFailedStart = async (
    step: Step<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
  ): Promise<StepResult> => {
    const found = await binding.inspect(step, recovery, start)
    if ('failure' in found) return { kind: 'failed', failure: found.failure }
    if (found.ok.kind !== 'not-started' || binding.hasLive(step, start))
      return blocked(`the start exclusion conflicts with the binding: ${found.ok.kind}`)
    const write = startContext(step, recovery, start, 'exclude')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const reason = 'the executor binding failed to start'
    const excluded = await authority.exclude({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      operation: write.ok.operation,
      reason,
    })
    if ('failure' in excluded) return { kind: 'failed', failure: excluded.failure }
    return recordStart(step, recovery, start, { kind: 'rejected', reason, exclusion: excluded.ok })
  }

  const reconcileInvocation = async (
    step: Step<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
    invoked: Exclude<Awaited<ReturnType<typeof binding.invoke>>, { kind: 'port-failed' }>,
    recordBindingFailureMarker: () => Promise<StepResult>,
  ): Promise<StepResult> => {
    const afterStart = await authority.inspect({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      start,
    })
    if (
      'ok' in afterStart &&
      (afterStart.ok.kind === 'started' || afterStart.ok.kind === 'rejected')
    )
      return recordStart(step, recovery, start, afterStart.ok)
    if (invoked.kind === 'binding-failed' || invoked.kind === 'binding-threw')
      return recordBindingFailureMarker()
    if ('failure' in afterStart) return { kind: 'failed', failure: afterStart.failure }
    if (afterStart.ok.kind === 'unknown')
      return unknownStart(step, recovery, start, afterStart.ok.diagnostic)
    if (invoked.kind === 'binding-unanswered')
      return {
        kind: 'failed',
        failure: {
          kind: 'unavailable',
          dependency: 'toolBindings',
          diagnostic: `the start was not accepted: the binding answered ${invoked.failure.kind}`,
        },
      }
    return blocked('the authority excludes a start with a known live execution')
  }

  const fence = async (
    step: Step<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
  ): Promise<StepResult> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const marker = startContext(step, recovery, start, 'start-failed')
    if ('failure' in marker) return { kind: 'failed', failure: marker.failure }
    const failed = await dependencies.reads.operation({
      ...access,
      operation: marker.ok.operation,
    })
    if ('failure' in failed) return { kind: 'failed', failure: failed.failure }
    if (failed.ok.kind === 'unknown') return blocked('the binding failure receipt is unknown')
    const before = await authority.inspect({ ...access, start })
    if ('failure' in before) return { kind: 'failed', failure: before.failure }
    if (before.ok.kind === 'started' || before.ok.kind === 'rejected')
      return recordStart(step, recovery, start, before.ok)
    if (before.ok.kind === 'unknown')
      return unknownStart(step, recovery, start, before.ok.diagnostic)
    if (failed.ok.kind === 'committed') {
      unconfirmedBindingFailures.delete(callKey(step.tenant, step.call))
      return rejectFailedStart(step, recovery, start)
    }
    const recordBindingFailureMarker = async () =>
      after(
        await commands.recordStart({
          ...marker.ok,
          invocation: start,
          outcome: {
            kind: 'unknown',
            diagnostic: 'the executor binding failed to start. Reconciliation required',
          },
        }),
      )
    if (unconfirmedBindingFailures.has(callKey(step.tenant, step.call)))
      return recordBindingFailureMarker()
    if (binding.hasLive(step, start))
      return blocked('the authority excludes a start with a known live execution')
    const invoked = await binding.invoke(step, recovery, start)
    if (invoked.kind === 'port-failed') return { kind: 'failed', failure: invoked.failure }
    if (invoked.kind === 'binding-failed' || invoked.kind === 'binding-threw')
      unconfirmedBindingFailures.add(callKey(step.tenant, step.call))
    return reconcileInvocation(step, recovery, start, invoked, recordBindingFailureMarker)
  }

  const repairRelease = async (
    step: Step<P>,
    recovery: ToolRecovery,
    cancelled: () => boolean,
  ): Promise<StepResult> => {
    const rejection = recovery.startRejection
    if (rejection === null) {
      const task = recovery.tasks.find(task => task.kind === 'queue')
      if (task?.kind !== 'queue') return IDLE
      const reason = ledgerRejectedReason(recovery, task.operation)
      if (reason !== null) return settleRejected(step, recovery, reason)
      return ['suspended', 'lost'].includes(recovery.state.execution.kind)
        ? releaseSuspended(step, recovery, task)
        : settle(step, recovery, task, cancelled)
    }
    if (recovery.start !== null)
      return recordStart(step, recovery, recovery.start, { kind: 'rejected', ...rejection })
    return rejectPending(step, recovery, rejection.reason, rejection.exclusion)
  }

  const releaseSuspended = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: Extract<ToolTask, { basis: DurableEvidence }>,
  ): Promise<StepResult> => {
    const released = await queues.release({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      operation: task.operation,
    })
    if ('failure' in released) return after(released)
    await wake(step.tenant, recovery.request)
    return CONTINUE
  }

  const settle = async (
    step: Step<P>,
    recovery: ToolRecovery,
    task: Extract<ToolTask, { basis: DurableEvidence }>,
    cancelled: () => boolean,
  ): Promise<StepResult> => {
    const result = await preserveSavedFinal(dependencies, step, recovery, task, cancelled)
    if (result === null) return blocked('the run was aborted')
    if ('failure' in result) return after(result)
    if (cancelled()) return blocked('the run was aborted')
    const current = await commands.loadRecovery(step)
    if (cancelled()) return blocked('the run was aborted')
    if ('failure' in current) return { kind: 'failed', failure: current.failure }
    if (current.ok.tasks.some(item => item.kind === 'queue' && item.operation === task.operation))
      return blocked('the original queue release is still unconfirmed')
    await wake(step.tenant, recovery.request)
    return CONTINUE
  }

  type Action = (step: Step<P>, recovery: ToolRecovery) => Promise<StepResult>

  const owesQueue = (recovery: ToolRecovery) => recovery.tasks.some(task => task.kind === 'queue')
  const owing =
    (action: Action): Action =>
    (step, recovery) =>
      owesQueue(recovery) ? action(step, recovery) : Promise.resolve(IDLE)

  const startStep: Action = async (step, recovery) => {
    const owesStart = recovery.tasks.some(task => task.kind === 'start')
    return owesStart && recovery.start !== null ? fence(step, recovery, recovery.start) : IDLE
  }

  const resumeStep: Action = async (step, recovery) => {
    const resumed = await resumptions.resume(step, recovery)
    return resumed === 'waiting' ? awaitPlace(step, recovery) : resumed
  }

  const phaseSteps: Readonly<Partial<Record<ToolRecovery['state']['phase'], Action>>> = {
    accepted: owing(plan),
    preparing: (step, recovery) => {
      const task = recovery.tasks.find(item => item.kind === 'prepare')
      return task?.kind === 'prepare'
        ? prepare(step, recovery, task)
        : owing(enqueue)(step, recovery)
    },
    queued: owing(prepareStart),
    starting: startStep,
    suspended: async (step, recovery) => {
      const task = recovery.tasks.find(item => item.kind === 'prepare')
      if (task?.kind === 'prepare') return prepare(step, recovery, task)
      if (!owesQueue(recovery)) return resumptions.decide(step, recovery)
      return (await resumeEnvironment(step, recovery)) ?? resumeStep(step, recovery)
    },
  }

  type Duty = Readonly<{ key: string; run: () => Promise<StepResult> }>
  type DutyRule = (
    step: Step<P>,
    recovery: ToolRecovery,
    cancelled: () => boolean,
  ) => readonly Duty[]

  const duties: readonly DutyRule[] = [
    (step, recovery, cancelled) =>
      recovery.state.phase === 'settled' && owesQueue(recovery)
        ? [{ key: 'queue', run: () => repairRelease(step, recovery, cancelled) }]
        : [],
    (step, recovery) =>
      recovery.tasks.flatMap(task =>
        ((task.kind === 'stop' && recovery.state.execution.kind !== 'starting') ||
          task.kind === 'release') &&
        task.state !== 'blocked'
          ? [
              {
                key: `${task.kind}:${task.operation}`,
                run: async () =>
                  after(
                    task.kind === 'stop'
                      ? await controls.stop(step, recovery, task)
                      : await controls.release(step, task),
                  ),
              },
            ]
          : [],
      ),
    (step, recovery) =>
      resumptions.continued(recovery).map(wait => ({
        key: `close:${wait.intent.wait}`,
        run: () => resumptions.close(step, recovery, wait),
      })),
    (step, recovery, cancelled) => {
      const task = recovery.tasks.find(item => item.kind === 'settle')
      return recovery.state.phase !== 'settled' && task?.kind === 'settle'
        ? [{ key: 'settle', run: () => settle(step, recovery, task, cancelled) }]
        : []
    },
    (step, recovery, cancelled) =>
      recovery.tasks.flatMap(task =>
        task.kind === 'fact-ack'
          ? [{ key: `ack:${task.operation}`, run: () => facts.acknowledge(step, task, cancelled) }]
          : [],
      ),
    (step, recovery) =>
      recovery.tasks.flatMap(task => {
        const run =
          task.kind === 'suspend'
            ? suspensions.suspension(step, recovery, task)
            : task.kind === 'wait-registration'
              ? suspensions.registration(step, recovery, task)
              : null
        return run === null ? [] : [{ key: `${task.kind}:${task.operation}`, run }]
      }),
    (step, recovery, cancelled) =>
      !recovery.tasks.some(task => task.kind === 'fact-ack') &&
      recovery.tasks.some(task => task.kind === 'facts' && task.state !== 'blocked')
        ? [
            {
              key: 'facts',
              run: () =>
                facts.receive(step, recovery, cancelled, () => suspensions.plan(step, recovery)),
            },
          ]
        : [],
  ]

  const stepOf = async (
    step: Step<P>,
    recovery: ToolRecovery,
    cancelled: () => boolean,
    failures: RunFailures,
  ): Promise<StepResult> => {
    if (cancelled()) return blocked('the run was aborted')
    facts.closeFinished(step, recovery)
    let stalled = false
    for (const rule of duties)
      for (const duty of rule(step, recovery, cancelled)) {
        if (failures.skipped.has(duty.key)) continue
        const result = await duty.run()
        if (result.kind === 'continue') {
          if (result.progressed) return result
          stalled = true
        } else {
          failures.skipped.add(duty.key)
          failures.first ??= result
          failures.retry ||= result.kind === 'failed' && transient(result.failure)
        }
        if (cancelled()) return blocked('the run was aborted')
      }
    if (stalled) return STALLED
    if (failures.first !== null) return failures.first
    return phaseSteps[recovery.state.phase]?.(step, recovery) ?? IDLE
  }

  const advance = async (
    step: Step<P>,
    cancelled: () => boolean,
    failures: RunFailures,
  ): Promise<DriverStop> => {
    for (let steps = 0; steps < policy.stepsPerRun; steps += 1) {
      if (cancelled()) return blocked('the run was aborted')
      const recovery = await commands.loadRecovery({
        principal: step.principal,
        tenant: step.tenant,
        call: step.call,
      })
      if ('failure' in recovery) return { kind: 'failed', failure: recovery.failure }
      const result = await afterRejected(
        step,
        recovery.ok,
        await stepOf(step, recovery.ok, cancelled, failures),
      )
      if (result.kind !== 'continue') return result
      failures.progressed ||= result.progressed
    }
    return { kind: 'yielded', progressed: failures.progressed }
  }

  const runOnce = async (step: Step<P>): Promise<DriverStop> => {
    const signals = facts.signalsForRun(step)
    const cancelled = () => signals.some(signal => signal.aborted)
    const failures: RunFailures = {
      skipped: new Set(),
      first: null,
      retry: false,
      progressed: false,
    }
    const stop = await advance(step, cancelled, failures)
    await retrigger(step, stop, signals, failures.progressed)
    if (failures.retry) scheduleLater(step.tenant, step.call, signals)
    return stop
  }

  const serialized = (step: Step<P>): Promise<DriverStop> => {
    const key = callKey(step.tenant, step.call)
    const previous = runs.get(key) ?? Promise.resolve()
    const next = previous.then(
      () => runOnce(step),
      () => runOnce(step),
    )
    runs.set(key, next)
    const clearRun = () => {
      if (runs.get(key) === next) runs.delete(key)
    }
    void next.then(clearRun, clearRun)
    return next
  }

  const handle: ToolDriverHandle<P> = {
    advance: serialized,
    later: step => scheduleLater(step.tenant, step.call, [step.signal]),
    run: async step => {
      await serialized(step)
    },
  }
  return Object.freeze(handle)
}
