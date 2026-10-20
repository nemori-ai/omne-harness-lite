import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type CallAccess,
  type DurableEvidence,
  type FixedToolRequest,
  type PreparationProgress,
  type PreparationRecord,
  type StartProgress,
  type ToolCallId,
  type ToolDriver,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolOperationId,
  type ToolRecovery,
  type ToolStartRecord,
  type ToolTask,
  type WriteContext,
} from '@omne-harness/tool-contract'
import { tenantKey } from './boundary.ts'
import type { ToolDependencies } from './construction.ts'
import { createBindingInvoker } from './driver-binding.ts'
import { isExcludedFailure } from './ledger-exclusion.ts'
import { queueKeyOf } from './ledger-start.ts'
import type { TenantId } from './ledger-store.ts'

/**
 * The coordination generation of every execution reference this driver records. `claim` of the
 * recovery increment mints real generations; until then one instance holds one fixed generation.
 */
export const PLACEHOLDER_GENERATION = '1'

/** Where a run stopped, for the driver's own bookkeeping; the host sees only the promise. */
export type DriverStop =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'waiting'; key: string }>
  | Readonly<{ kind: 'failed'; failure: ToolFailure }>
  | Readonly<{ kind: 'blocked'; diagnostic: string }>
  /**
   * The step budget ran out with work left. `progressed` is true only when a step of the run
   * committed or recalled a commit: an excluded, stale or unknown answer moves nothing.
   */
  | Readonly<{ kind: 'yielded'; progressed: boolean }>

/** The policy of a driver: how many steps one run takes, and how long a failed run waits. */
export type DriverPolicy = Readonly<{ stepsPerRun: number; retryDelayMs: number }>

type Step<P> = CallAccess<P> & Readonly<{ signal: AbortSignal }>
/**
 * The run goes on. `progressed` is true when the step committed, or recalled a commit of its own
 * operation. A step that was excluded, found its revision stale or could not learn whether it
 * committed goes on too, but nothing is known to have moved: a run of such steps only is no
 * progress, however many steps it took.
 */
type Continue = Readonly<{ kind: 'continue'; progressed: boolean }>
type StepResult = Continue | DriverStop
const CONTINUE: Continue = { kind: 'continue', progressed: true }
const STALLED: Continue = { kind: 'continue', progressed: false }
const IDLE: DriverStop = { kind: 'idle' }

/** The suffixes of the operations the driver derives from the admission operation. */
type Suffix =
  | 'plan'
  | 'prepared'
  | 'enqueue'
  | 'start'
  | 'started'
  | 'start-failed'
  | 'exclude'
  | 'reject'

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

/**
 * Whether a failure asks the driver to read again rather than to stop. None of them is progress
 * (`STALLED`). An excluded command (SPEC 14) is resubmitted with the same identity: the redo
 * recalls the queue step the excluded one left. When the redo does not finish in the same run
 * (the step budget ends, a read fails, the run is aborted), the held slot waits for one of the
 * triggers of SPEC 22 and 23.
 */
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

/**
 * Whether a run that ended on this failure is run again later: the store or a port could not
 * answer, which says nothing about the call. Every other failure is a verdict, and running the
 * call again would repeat it.
 */
function transient(failure: ToolFailure): boolean {
  return failure.kind === 'unavailable'
}

export type ToolDriverHandle<P> = ToolDriver<P> &
  Readonly<{
    /** Runs the call and tells where it stopped. `run` is this, without the answer. */
    advance(input: Step<P>): Promise<DriverStop>
  }>

export function createToolDriver<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  policy: DriverPolicy,
): ToolDriverHandle<P> {
  const { commands, queues, environments, authority, instances } = dependencies
  const environmentsPrepared = new Map<string, E>()
  // The calls whose environment the provider answered `pending` or `unknown` in this process: the
  // next run re-reads the provider's record (P03 `inspectPreparation`) instead of asking again.
  const environmentsAsked = new Set<string>()
  const unconfirmedBindingFailures = new Set<string>()
  const waiting = new Map<string, Map<string, Readonly<{ tenant: TenantId; call: ToolCallId }>>>()
  const runs = new Map<string, Promise<unknown>>()
  // The timers of the runs that wait out a failure, one per call. They are unreferenced, so they
  // never keep the process alive; the drain (`quiesce` and `handover`) owns their release, like
  // the install.
  const retrying = new Map<string, ReturnType<typeof setTimeout>>()

  const executionOf = (tenant: TenantId, call: ToolCallId): ToolExecutionRef => ({
    tenant,
    call,
    instance: dependencies.instance,
    generation: PLACEHOLDER_GENERATION,
  })

  const context = (
    step: Step<P>,
    recovery: ToolRecovery<B>,
    suffix: Suffix,
  ): Outcome<WriteContext & Readonly<{ principal: P }>, ToolFailure> => {
    const operation = derivedOperation(recovery.admission, suffix)
    if ('failure' in operation) return operation
    return succeed({
      ...executionOf(step.tenant, step.call),
      principal: step.principal,
      operation: operation.ok,
      expected: recovery.state.revision,
    })
  }

  const after = (reply: Outcome<unknown, ToolFailure>): StepResult => {
    if ('ok' in reply) return CONTINUE
    return retryable(reply.failure) ? STALLED : { kind: 'failed', failure: reply.failure }
  }

  /** Asks the host to run the call; false when the host could not take the request. */
  const scheduleNow = async (tenant: TenantId, call: ToolCallId): Promise<boolean> => {
    try {
      return 'ok' in (await instances.schedule({ tenant, call }))
    } catch {
      return false
    }
  }

  /** Asks the host to run the call after `policy.retryDelayMs`; a refused request is asked again. */
  const scheduleLater = (tenant: TenantId, call: ToolCallId): void => {
    const key = callKey(tenant, call)
    if (retrying.has(key)) return
    const timer = setTimeout(() => {
      retrying.delete(key)
      void scheduleNow(tenant, call).then(accepted => {
        if (!accepted) scheduleLater(tenant, call)
      })
    }, policy.retryDelayMs)
    timer.unref()
    retrying.set(key, timer)
  }

  /**
   * What follows a run (SPEC 23): nothing else runs a call that a stop left with work, so the
   * driver does. A run that used its whole step budget goes on at once, if at least one of its
   * steps committed or recalled a commit. A run that used its budget with no such step (every
   * answer was excluded, stale or an unknown commit), one that ended because the store or a
   * port could not answer, and one whose environment the provider answered `pending` or
   * `unknown` (mapped to `unavailable`), go on after the retry delay, so a store that never answers, or a
   * reader that keeps excluding the step, is not spun on. A run that ends waiting, idle or
   * aborted, or on a verdict, is left: the wake-up of a released slot, the waiter's reconcile
   * and the queue pass of the recovery scan (`scanPending`) own those.
   */
  const retrigger = async (step: Step<P>, stop: DriverStop): Promise<void> => {
    if (step.signal.aborted) return
    if (stop.kind === 'yielded' && stop.progressed) {
      if (!(await scheduleNow(step.tenant, step.call))) scheduleLater(step.tenant, step.call)
    } else if (stop.kind === 'yielded' || (stop.kind === 'failed' && transient(stop.failure))) {
      scheduleLater(step.tenant, step.call)
    }
  }

  const wake = async (tenant: TenantId, request: FixedToolRequest): Promise<void> => {
    const key = `${tenantKey(tenant)}\u0000${queueKeyOf(request)}`
    const waiters = waiting.get(key)
    if (waiters === undefined) return
    waiting.delete(key)
    for (const waiter of waiters.values()) {
      try {
        await instances.schedule(waiter)
      } catch {
        // A wake-up is a hint; a lost hint is compensated by the recovery scan (`scanPending`).
      }
    }
  }

  const noteWaiting = (step: Step<P>, request: FixedToolRequest): DriverStop => {
    const key = `${tenantKey(step.tenant)}\u0000${queueKeyOf(request)}`
    const waiters = waiting.get(key) ?? new Map()
    waiters.set(callKey(step.tenant, step.call), { tenant: step.tenant, call: step.call })
    waiting.set(key, waiters)
    return { kind: 'waiting', key }
  }

  /**
   * A call that waits for its place asks the queue domain once to reconcile its key (SPEC 22),
   * because the call in its way may be one that nothing runs any more: an entry whose call holds
   * a release basis is gone after the reconcile, and the waiters of the key are woken; a call
   * ahead or holding a slot that still owes the queue a step is run. The waiter changes no
   * other call's entry. A refused request to run a call is a store-like failure of this run.
   */
  const awaitPlace = async (step: Step<P>, recovery: ToolRecovery<B>): Promise<StepResult> => {
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

  /** Settles a pending call whose invocation the host excluded (P04 rejectPending). */
  const rejectPending = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
    reason: string,
    exclusion: DurableEvidence,
  ): Promise<StepResult> => {
    const write = context(step, recovery, 'reject')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const settled = await commands.rejectPending({ ...write.ok, reason, exclusion })
    if ('ok' in settled) await wake(step.tenant, recovery.request)
    return after(settled)
  }

  /** The host excludes the whole pending invocation, then the call settles (P04). */
  const excludeAndReject = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
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

  const plan = async (step: Step<P>, recovery: ToolRecovery<B>): Promise<StepResult> => {
    if (recovery.request.availability.kind !== 'available')
      return blocked('an accepted call of an unavailable tool has nothing to prepare')
    const write = context(step, recovery, 'plan')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    return after(
      await commands.planPreparation({
        ...write.ok,
        request: recovery.request,
        purpose: 'initial',
      }),
    )
  }

  /**
   * Asks the provider for the environment of the call: the first time it is asked to prepare it;
   * after it answered `pending` or `unknown`, its record is read instead (P03).
   */
  const askEnvironment = async (
    step: Step<P>,
    task: Extract<ToolTask, { kind: 'prepare' }>,
  ): Promise<Outcome<PreparationProgress<E>, ToolFailure>> => {
    const key = callKey(step.tenant, step.call)
    const request = {
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      preparation: task.preparation,
    }
    const progress = await (environmentsAsked.has(key)
      ? environments.inspectPreparation(request)
      : environments.prepare(request))
    if ('ok' in progress) {
      const undecided = progress.ok.kind === 'pending' || progress.ok.kind === 'unknown'
      if (undecided) environmentsAsked.add(key)
      else environmentsAsked.delete(key)
    }
    return progress
  }

  const prepare = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
    task: Extract<ToolTask, { kind: 'prepare' }>,
  ): Promise<StepResult> => {
    const progress = await askEnvironment(step, task)
    if ('failure' in progress) return { kind: 'failed', failure: progress.failure }
    const prepared = progress.ok
    switch (prepared.kind) {
      case 'prepared': {
        environmentsPrepared.set(callKey(step.tenant, step.call), prepared.environment.value)
        const write = context(step, recovery, 'prepared')
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
        // The environment cannot be satisfied: the call never starts and never falls back to a
        // looser host (P03). The environment's evidence proves that no environment exists, not
        // that no start can follow, so the start authority excludes the invocation first (P04).
        return excludeAndReject(step, recovery, `environment: ${prepared.reason}`)
      case 'excluded':
        return blocked(
          'the preparation was excluded; the driver does not request it again (P03 reading pending)',
        )
      case 'pending':
      case 'unknown':
        // The provider has not decided: the task stays, and the call is run again after the
        // retry delay to read the provider's record, like a provider that could not answer.
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

  const enqueue = async (step: Step<P>, recovery: ToolRecovery<B>): Promise<StepResult> => {
    const write = context(step, recovery, 'enqueue')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    return after(await commands.enqueue(write.ok))
  }

  const prepareStart = async (step: Step<P>, recovery: ToolRecovery<B>): Promise<StepResult> => {
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
    recovery: ToolRecovery<B>,
    invocation: ToolStartRecord,
    outcome: StartProgress,
  ): Promise<StepResult> => {
    const write = context(step, recovery, 'started')
    if ('failure' in write) return { kind: 'failed', failure: write.failure }
    const recorded = await commands.recordStart({ ...write.ok, invocation, outcome })
    if ('ok' in recorded && (outcome.kind === 'started' || outcome.kind === 'rejected'))
      unconfirmedBindingFailures.delete(callKey(step.tenant, step.call))
    if ('ok' in recorded && outcome.kind === 'rejected') await wake(step.tenant, recovery.request)
    return after(recorded)
  }

  /** The environment of the call: the value prepared in this process, or the provider's record. */
  const environmentOf = async (
    step: CallAccess<P>,
    preparation: PreparationRecord,
  ): Promise<Outcome<E, ToolFailure>> => {
    const cached = environmentsPrepared.get(callKey(step.tenant, step.call))
    if (cached !== undefined) return succeed(cached)
    const progress = await environments.inspectPreparation({
      principal: step.principal,
      tenant: step.tenant,
      call: step.call,
      preparation,
    })
    if ('failure' in progress) return progress
    if (progress.ok.kind !== 'prepared')
      return fail({
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: `the prepared environment cannot be reconnected: ${progress.ok.kind}`,
      })
    return succeed(progress.ok.environment.value)
  }

  const binding = createBindingInvoker(dependencies, environmentOf)

  const unknownStart = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
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
    recovery: ToolRecovery<B>,
    start: ToolStartRecord,
  ): Promise<StepResult> => {
    const found = await binding.inspect(step, recovery, start)
    if ('failure' in found) return { kind: 'failed', failure: found.failure }
    if (found.ok.kind !== 'not-started' || binding.hasLive(step))
      return blocked(`the start exclusion conflicts with the binding: ${found.ok.kind}`)
    const write = context(step, recovery, 'exclude')
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

  const fence = async (
    step: Step<P>,
    recovery: ToolRecovery<B>,
    start: Extract<ToolStartRecord, { kind: 'start' }>,
  ): Promise<StepResult> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const marker = context(step, recovery, 'start-failed')
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
    if (binding.hasLive(step))
      return blocked('the authority excludes a start with a known live execution')
    const invoked = await binding.invoke(step, recovery, start)
    if (invoked.kind === 'port-failed') return { kind: 'failed', failure: invoked.failure }
    if (invoked.kind === 'binding-failed' || invoked.kind === 'binding-threw')
      unconfirmedBindingFailures.add(callKey(step.tenant, step.call))
    const afterStart = await authority.inspect({ ...access, start })
    if (
      'ok' in afterStart &&
      (afterStart.ok.kind === 'started' || afterStart.ok.kind === 'rejected')
    )
      return recordStart(step, recovery, start, afterStart.ok)
    if (invoked.kind === 'binding-failed' || invoked.kind === 'binding-threw') {
      return recordBindingFailureMarker()
    }
    if ('failure' in afterStart) return { kind: 'failed', failure: afterStart.failure }
    return afterStart.ok.kind === 'unknown'
      ? unknownStart(step, recovery, start, afterStart.ok.diagnostic)
      : blocked('the authority excludes a start with a known live execution')
  }

  /** A settled call with a `queue` task still owes the queue domain its release (crash repair). */
  const repairRelease = async (step: Step<P>, recovery: ToolRecovery<B>): Promise<StepResult> => {
    const rejection = recovery.startRejection
    if (rejection === null) return blocked('a settled call owes a queue step without a rejection')
    if (recovery.start !== null)
      return recordStart(step, recovery, recovery.start, { kind: 'rejected', ...rejection })
    return rejectPending(step, recovery, rejection.reason, rejection.exclusion)
  }

  type Action = (step: Step<P>, recovery: ToolRecovery<B>) => Promise<StepResult>

  /**
   * The step of each phase while the call domain owes the queue domain a step (a `queue` task).
   * A running or suspended call has none here: its facts and its settlement are not driven yet.
   */
  const queueSteps: Readonly<Partial<Record<ToolRecovery<B>['state']['phase'], Action>>> = {
    accepted: plan,
    preparing: enqueue,
    queued: prepareStart,
    settled: repairRelease,
  }

  /** A `starting` call with its `start` task goes through the start fence. */
  const startStep: Action = async (step, recovery) => {
    const owesStart = recovery.tasks.some(task => task.kind === 'start')
    return owesStart && recovery.start?.kind === 'start'
      ? fence(step, recovery, recovery.start)
      : IDLE
  }

  const stepOf: Action = async (step, recovery) => {
    const { phase } = recovery.state
    const preparation = recovery.tasks.find(task => task.kind === 'prepare')
    if (phase === 'preparing' && preparation?.kind === 'prepare')
      return prepare(step, recovery, preparation)
    if (phase === 'starting') return startStep(step, recovery)
    const queueStep = queueSteps[phase]
    const owesQueue = recovery.tasks.some(task => task.kind === 'queue')
    return queueStep !== undefined && owesQueue ? queueStep(step, recovery) : IDLE
  }

  const advance = async (step: Step<P>): Promise<DriverStop> => {
    let progressed = false
    for (let steps = 0; steps < policy.stepsPerRun; steps += 1) {
      if (step.signal.aborted) return blocked('the run was aborted')
      const recovery = await commands.loadRecovery({
        principal: step.principal,
        tenant: step.tenant,
        call: step.call,
      })
      if ('failure' in recovery) return { kind: 'failed', failure: recovery.failure }
      const result = await stepOf(step, recovery.ok)
      if (result.kind !== 'continue') return result
      progressed ||= result.progressed
    }
    return { kind: 'yielded', progressed }
  }

  /** One run, then what its stop asks for. */
  const runOnce = async (step: Step<P>): Promise<DriverStop> => {
    const stop = await advance(step)
    await retrigger(step, stop)
    return stop
  }

  /** Runs of the same call do not overlap in this process; the ledger orders them across it. */
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
    run: async step => {
      await serialized(step)
    },
  }
  return Object.freeze(handle)
}
