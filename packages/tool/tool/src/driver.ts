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

/**
 * 本驱动记下的每个执行引用的协调代次：固定为 `1`。账本不按代次拒绝旧写者，两个运行时推进同一
 * 调用时，由派生的固定操作身份与调用域的修订号条件提交裁定先后（SPEC 第 33 条）。
 */
export const COORDINATION_GENERATION = '1'

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

/** The cap of the delay of a later run: the same pair of numbers as the delivery pacing. */
const MAX_RETRY_DELAY_MS = 60_000

/**
 * The delay of the `level`-th later run in a row without progress: `retryDelayMs`, doubled each
 * time, at most max(retryDelayMs, 60000) ms (SPEC 23).
 */
export function laterRunDelayMs(retryDelayMs: number, level: number): number {
  const cap = Math.max(retryDelayMs, MAX_RETRY_DELAY_MS)
  return Math.min(retryDelayMs * 2 ** Math.min(level, 32), cap)
}

/**
 * Which stops the driver runs again later: no progress, a port that cannot answer, or a fact that
 * no wake-up announces. A run with progress goes on at once; idle and waiting are woken; a verdict
 * is not run again.
 */
function runsAgainLater(stop: DriverStop): boolean {
  return (
    stop.kind === 'blocked' ||
    (stop.kind === 'yielded' && !stop.progressed) ||
    (stop.kind === 'failed' && transient(stop.failure))
  )
}

type Step<P> = CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>
/**
 * The run goes on. `progressed` is true when the step committed, or recalled a commit of its own
 * operation. A step that was excluded, found its revision stale or could not learn whether it
 * committed goes on too, but nothing is known to have moved: a run of such steps only is no
 * progress, however many steps it took.
 */
type Continue = Readonly<{ kind: 'continue'; progressed: boolean }>
type StepResult = Continue | DriverStop
/** What a run met: duties skipped on a failure, the first such failure, and whether it moved. */
type RunFailures = {
  skipped: Set<string>
  first: DriverStop | null
  retry: boolean
  /** A step of the run committed or recalled a commit, whatever the run stopped on. */
  progressed: boolean
}
/** The phases of a call that holds no start record; nothing of it ever ran. */
const UNSTARTED: readonly ToolRecovery['state']['phase'][] = ['accepted', 'preparing', 'queued']
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
    /**
     * Runs the call again after its backoff, as after a run that a port could not answer. For a
     * host whose own read before a run could not answer: the later run stays the driver's.
     */
    later(input: Step<P>): void
  }>

export function createToolDriver<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  policy: DriverPolicy,
): ToolDriverHandle<P> {
  const { commands, queues, rejections, environments, authority, instances } = dependencies
  const environmentsPrepared = new Map<string, E>()
  // Original preparations already sent in this process. Unconfirmed answers retain their query
  // responsibility; only a matching allocated fact permits one bounded adoption attempt.
  const environmentsAsked = new Set<string>()
  // This driver's observations survive an unknown marker write, but not process loss.
  // Neither this set nor a committed marker grants or revokes another driver's permit.
  const unconfirmedBindingFailures = new Set<string>()
  const waiting = new Map<string, Map<string, Readonly<{ tenant: TenantId; call: ToolCallId }>>>()
  const runs = new Map<string, Promise<unknown>>()
  // How many later runs in a row a call had without progress: the level of its next delay.
  const backoff = new Map<string, number>()
  // One unreferenced retry per call. An aborted signal cannot initiate another wake.
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

  /**
   * The context of a step of the start fence of `start`. The first start derives its operations
   * from the admission; a resume derives them from its own operation, because one call may hold
   * several resumes and each records its own start, marker and exclusion (P07).
   */
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

  /** Asks the host to run the call; false when the host could not take the request. */
  const scheduleNow = async (tenant: TenantId, call: ToolCallId): Promise<boolean> => {
    try {
      return 'ok' in (await instances.schedule({ tenant, call }))
    } catch {
      return false
    }
  }

  /** Asks the host to run the call after `policy.retryDelayMs`; a refused request is asked again. */
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

  /**
   * What follows a run (SPEC 23): the driver is the one owner of a later run of a call. A run any
   * of whose steps made progress clears the delay; one that used its budget with progress goes on
   * at once. A run without progress, one that a port could
   * not answer, and one blocked on a fact that no wake-up announces, go on after the delay of the
   * call, which doubles each time up to its cap, so a store that keeps not answering is asked less
   * and less often. A run that ends waiting, idle or aborted, or on a verdict, clears the delay and
   * is left: the wake-up of a released slot, the waiter's reconcile and, after a restart, the
   * host's recovery scan (`scanPending`, SPEC 33) own those.
   */
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
      } catch {
        // 唤醒只是提示。丢失的提示由宿主的重调度补，进程重启后由宿主的恢复扫描补（SPEC 第 33 条）。
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

  /** Settles a pending call whose invocation the host excluded (P04 rejectPending). */
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

  /**
   * Writes, or recalls and finishes, the minimal failure terminal (SPEC 23). A recalled receipt
   * proves the call commit only, so the step counts as progress once its `queue` task is closed
   * (SPEC 26), and the waiters of the key are woken then.
   */
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

  /**
   * SPEC 23: a step whose commit the store rejected for good (`invalid`, `field: storage`) is not
   * repeated. A call that never started (no start record) settles with the minimal failure
   * terminal instead. A call with a start record keeps the failure: its execution may run, and
   * this increment writes no terminal for it.
   */
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

  /**
   * The store's reason when a settled call's open `queue` task belongs to its minimal failure
   * terminal, or null: the release of that terminal is redone by resending it.
   */
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

  /** The host excludes the whole pending invocation, then the call settles (P04). */
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

  /** One preparation step may continue first adoption once, always with the original input. */
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
    // A provider that answered holds the request; one that failed to answer is asked again (P03).
    if ('ok' in read) environmentsAsked.add(key)
    const progress = await continueAllocation(step, request, read)
    if ('ok' in progress && ['prepared', 'excluded', 'rejected', 'lost'].includes(progress.ok.kind))
      environmentsAsked.delete(key)
    return progress
  }

  /**
   * Plans the resume segment's environment again when the one planned for it is `lost`: its
   * environment lived in a process that is gone, and no process takes it over. The next resume
   * preparation of the accepted wait replaces it (P03 planPreparation, purpose `resume`).
   */
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
    // The write context carries the principal, as `context` does.
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

  /**
   * Before the resume segment takes its place again: an environment that this process did not
   * prepare may be lost with the process that did, and then the segment is planned again. An
   * environment that the provider still holds in this process is taken as prepared here.
   */
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
        // A resume segment confirms its own preparation under that preparation's operation.
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
        // The resume of a suspended call is not a first start: a refused environment does not
        // settle it as never started. The call stays suspended with the reason; a stop settles it.
        if (task.preparation.purpose === 'resume')
          return blocked(`the environment of the resume segment was rejected: ${prepared.reason}`)
        // Rejection does not prove zero allocation. The adapter retains original cleanup, while
        // the start authority excludes this Tool invocation before its failure is recorded.
        return excludeAndReject(step, recovery, `environment: ${prepared.reason}`)
      case 'excluded':
        return blocked(
          'the preparation was excluded; the driver does not request it again (P03 reading pending)',
        )
      case 'lost':
        // The environment went with a process that is gone. A resume segment is planned again; a
        // call that never started settles as not started, its original keeping its cleanup.
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

  /** The environment of the call: the value prepared in this process, or the provider's record. */
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

  /**
   * After the binding was asked to start: the fence tells what happened (P04). A refusal or a throw
   * that the fence did not settle is marked for reconciliation; a binding that could not answer,
   * for a start that the fence did not accept, ends the run unavailable, and the next run starts
   * the same start with a new permit (U2, U4). Nothing of that failure is kept.
   */
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

  /** A settled call with a `queue` task still owes the queue domain its release (crash repair). */
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
      // 暂停中收场的调用没有 final：释放依据是 suspended-exclusion，直接完成释放待办。
      return recovery.state.execution.kind === 'suspended'
        ? releaseSuspended(step, recovery, task)
        : settle(step, recovery, task, cancelled)
    }
    if (recovery.start !== null)
      return recordStart(step, recovery, recovery.start, { kind: 'rejected', ...rejection })
    return rejectPending(step, recovery, rejection.reason, rejection.exclusion)
  }

  /** 完成暂停中收场的调用的释放待办，再唤醒同一范围里等名额的调用（Tool SPEC 第 32 条）。 */
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
    // The immutable preserve receipt proves the call commit, not completion of its queue tail.
    if (current.ok.tasks.some(item => item.kind === 'queue' && item.operation === task.operation))
      return blocked('the original queue release is still unconfirmed')
    await wake(step.tenant, recovery.request)
    return CONTINUE
  }

  type Action = (step: Step<P>, recovery: ToolRecovery) => Promise<StepResult>

  /** The call domain still owes the queue domain a step (a `queue` task). */
  const owesQueue = (recovery: ToolRecovery) => recovery.tasks.some(task => task.kind === 'queue')
  const owing =
    (action: Action): Action =>
    (step, recovery) =>
      owesQueue(recovery) ? action(step, recovery) : Promise.resolve(IDLE)

  /** A `starting` call with its `start` task goes through the start fence, a resume as well. */
  const startStep: Action = async (step, recovery) => {
    const owesStart = recovery.tasks.some(task => task.kind === 'start')
    return owesStart && recovery.start !== null ? fence(step, recovery, recovery.start) : IDLE
  }

  /** A suspended call whose decision was accepted takes its place again, or waits for it. */
  const resumeStep: Action = async (step, recovery) => {
    const resumed = await resumptions.resume(step, recovery)
    return resumed === 'waiting' ? awaitPlace(step, recovery) : resumed
  }

  /**
   * The step of each phase once no duty of the call is left: the way to a start (P02, P03, P04),
   * and the way of a suspended call back to a start (P06, P07). A phase with no entry is idle.
   */
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
    // An accepted decision first prepares the environment of the resume segment, then takes its
    // place again; without a decision the call asks the decision owner.
    suspended: async (step, recovery) => {
      const task = recovery.tasks.find(item => item.kind === 'prepare')
      if (task?.kind === 'prepare') return prepare(step, recovery, task)
      if (!owesQueue(recovery)) return resumptions.decide(step, recovery)
      return (await resumeEnvironment(step, recovery)) ?? resumeStep(step, recovery)
    },
  }

  /** One duty of the call: a key that names it among a run's failures, and its step. */
  type Duty = Readonly<{ key: string; run: () => Promise<StepResult> }>
  type DutyRule = (
    step: Step<P>,
    recovery: ToolRecovery,
    cancelled: () => boolean,
  ) => readonly Duty[]

  /**
   * The duties of a call, in the order a run takes them. Each rule names the duties its records
   * owe; a new kind of duty is one more rule, not one more branch of the step.
   */
  const duties: readonly DutyRule[] = [
    // A settled call with a `queue` task still owes the queue domain its release (crash repair).
    (step, recovery, cancelled) =>
      recovery.state.phase === 'settled' && owesQueue(recovery)
        ? [{ key: 'queue', run: () => repairRelease(step, recovery, cancelled) }]
        : [],
    // The propagation of stops and the release of environments.
    // 恢复段还没有 live 时，停止待办等它 live 再送达：先走启动步骤，不让停止挡住启动。
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
    // A wait that its resume segment continued closes before the call settles (P06).
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
    // The wait of a checkpointed call: its checkpoint commit, its park and its registration.
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
    // An unconfirmed batch still owns the cursor barrier, even when settlement can proceed.
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

  /** One run, then what its stop asks for. */
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
    later: step => scheduleLater(step.tenant, step.call, [step.signal]),
    run: async step => {
      await serialized(step)
    },
  }
  return Object.freeze(handle)
}
