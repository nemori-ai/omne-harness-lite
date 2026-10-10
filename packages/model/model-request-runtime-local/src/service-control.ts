import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type {
  CurrentHistoryReaders,
  SessionModelRequestPreparation,
} from '@omne-harness-lite/model-request-runtime'
import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import type {
  DispatchGuardPhase,
  InterruptInput,
  InterruptResult,
  ReleaseCallResult,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import type {
  ModelCallEndedRecord,
  ModelCallInterruptIntentRecord,
} from '@omne-harness-lite/messages'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { AppendFence, AppendResult } from '@omne-harness-lite/session-log'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { settlementAppendReceipt } from '@omne-harness-lite/model-request-runtime'
import { settlementGenerationCurrent } from '@omne-harness-lite/model-request-runtime'
import {
  acknowledgedAsTerminal,
  rejectAcknowledgedHistory,
  type CallHistoryResult,
  type UnacknowledgedCallHistory,
} from '@omne-harness-lite/model-request-runtime'
import type { CallContainerView } from './service-types.ts'
import type { CallOperationState, SystemStopControl, RuntimeConstruction } from './service-types.ts'
import type { CallKey, SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import { requestStopAndWait } from '@omne-harness-lite/model-request-runtime'

interface ReadScope {
  readonly registration: SettlementRegistration
  readonly tasks: SettlementTask<unknown>[]
  stopRequested: boolean
  finish?: Promise<void>
}

/** Own every admitted read from registration through actual stop, including rejected completions. */
export class OwnedReadTracker {
  readonly #scopes = new Set<ReadScope>()
  #closed = false

  get closed(): boolean {
    return this.#closed
  }

  add(registration: SettlementRegistration): ReadScope | undefined {
    if (this.#closed) return undefined
    const scope: ReadScope = { registration, tasks: [], stopRequested: false }
    this.#scopes.add(scope)
    return scope
  }

  stop(scope: ReadScope): void {
    scope.stopRequested = true
    for (const task of scope.tasks) {
      try {
        task.requestStop()
      } catch {
        // A failed stop request cannot certify the actual stopped promise.
      }
    }
  }

  finish(scope: ReadScope): Promise<void> {
    scope.finish ??= (async () => {
      await Promise.all(scope.tasks.map(requestStopAndWait))
      scope.registration.release()
      this.#scopes.delete(scope)
    })()
    return scope.finish
  }

  async drain(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    const scopes = [...this.#scopes]
    for (const scope of scopes) this.stop(scope)
    await Promise.allSettled(scopes.map(scope => this.finish(scope)))
    return this.#scopes.size === 0 ? { released: true } : { unavailable: true }
  }

  async close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    this.#closed = true
    return await this.drain()
  }
}

/** Append tasks stay visible to service close until their caller transfers or releases ownership. */
export class OwnedAppendTracker {
  readonly #tasks = new Map<SettlementTask<AppendResult>, Promise<void>>()
  #closed = false

  track(task: SettlementTask<AppendResult>): () => void {
    let done: (() => void) | undefined
    const completed = new Promise<void>(resolve => {
      done = resolve
    })
    this.#tasks.set(task, completed)
    if (this.#closed) this.stop(task)
    return () => {
      this.#tasks.delete(task)
      done?.()
    }
  }

  private stop(task: SettlementTask<AppendResult>): void {
    try {
      task.requestStop()
    } catch {
      // Only the actual stopped result can release the owner.
    }
  }

  async close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    this.#closed = true
    const tasks = [...this.#tasks]
    for (const [task] of tasks) this.stop(task)
    const settled = await Promise.allSettled(tasks.map(([task]) => task.stopped))
    await Promise.all(tasks.map(([, done]) => done))
    return settled.every(result => result.status === 'fulfilled')
      ? { released: true }
      : { unavailable: true }
  }
}

/** A read-only operation's backend tasks remain owned until actual stop. */
export async function withOwnedReads<T>(
  owner: SettlementOwner,
  concurrent: import('@omne-harness-lite/content-blocks').JsonNumber,
  tracker: OwnedReadTracker,
  work: (registration: SettlementRegistration) => Promise<T>,
): Promise<{ readonly ok: T } | { readonly unavailable: true }> {
  if (tracker.closed || owner.admission() !== 'open') return { unavailable: true }
  const grant = owner.acquire(concurrent)
  if ('unavailable' in grant) return { unavailable: true }
  const scope = tracker.add(grant.registration)
  if (scope === undefined) {
    grant.registration.release()
    return { unavailable: true }
  }
  const registration: SettlementRegistration = {
    start(kind, operation) {
      if (scope.stopRequested) throw new Error('read scope closing')
      const task = grant.registration.start(kind, operation)
      scope.tasks.push(task)
      return task
    },
    release: grant.registration.release,
  }
  let result: T
  try {
    result = await work(registration)
  } catch {
    tracker.stop(scope)
    tracker.finish(scope).catch(() => {
      // The scope remains owned if actual stop or release failed.
    })
    return { unavailable: true }
  }
  try {
    await tracker.finish(scope)
    return { ok: result }
  } catch {
    return { unavailable: true }
  }
}

/** A complete owned prefix is authoritative; local state only supplies a never-dispatched call
 * and the in-process unpersisted reply which the log cannot yet describe. */
export interface ControlFacts {
  readonly durable:
    | {
        readonly phase: Exclude<DispatchGuardPhase, 'open'>
        readonly intentExists: boolean
      }
    | { readonly absent: true }
    | { readonly noDispatch: true; readonly intentExists: boolean }
    | { readonly unavailable: true }
  readonly operation?: Pick<CallOperationState, 'phase'>
  readonly localCall: boolean
}

function durableControlFacts(history: UnacknowledgedCallHistory): ControlFacts['durable'] {
  let durable: ControlFacts['durable']
  if ('unavailable' in history) durable = { unavailable: true }
  else if ('absent' in history) durable = { absent: true }
  else if (history.known.phase === null || history.known.phase === 'open')
    durable = { noDispatch: true, intentExists: history.known.intent !== null }
  else durable = { phase: history.known.phase, intentExists: history.known.intent !== null }
  return durable
}

/** Project only already-validated history; this does not authorize a raw log or infer a Run. */
export function controlFactsFromHistory(
  history: UnacknowledgedCallHistory,
  localCall: boolean,
  operation?: CallOperationState,
): ControlFacts {
  const durable = durableControlFacts(history)
  const last = 'known' in history ? history.known.dispatches.at(-1) : undefined
  const pendingMatches =
    operation?.phase === 'reply_pending' &&
    'known' in history &&
    history.known.phase === 'speaking' &&
    last?.opened !== null &&
    last?.response === null &&
    last?.record.response === operation.pending.id
  return {
    durable,
    localCall,
    ...(operation === undefined || (operation.phase === 'reply_pending' && !pendingMatches)
      ? {}
      : { operation }),
  }
}

export type InterruptAdmission =
  | { readonly stage: 'before_dispatch' | 'in_flight' | 'speaking'; readonly intentExists: boolean }
  | { readonly rejected: 'callNotFound' | 'alreadyEnded' | 'unavailable' }

export type ReleaseAdmission =
  | { readonly allowed: true }
  | { readonly rejected: 'callNotFound' | 'alreadyEnded' | 'unavailable' }
  | { readonly wrongPhase: DispatchGuardPhase }

function phase(facts: ControlFacts): DispatchGuardPhase | 'absent' | 'unknown' {
  const durable = facts.durable
  if ('unavailable' in durable) return 'unknown'
  if ('absent' in durable) return facts.localCall ? 'open' : 'absent'
  if ('noDispatch' in durable) return facts.localCall ? 'open' : 'unknown'
  if (durable.phase === 'speaking' && facts.operation?.phase === 'reply_pending')
    return 'reply_pending'
  return durable.phase
}

/** RT7 S-31: terminal and reply-pending facts win before an existing intent. */
export function classifyInterrupt(facts: ControlFacts): InterruptAdmission {
  const current = phase(facts)
  if (current === 'absent') return { rejected: 'callNotFound' }
  if (current === 'unknown') return { rejected: 'unavailable' }
  if (
    current === 'complete' ||
    current === 'handed_up' ||
    current === 'interrupted' ||
    current === 'reply_pending'
  )
    return { rejected: 'alreadyEnded' }
  const intentExists = 'intentExists' in facts.durable && facts.durable.intentExists
  if (current === 'in_flight' || current === 'speaking') return { stage: current, intentExists }
  return { stage: 'before_dispatch', intentExists }
}

/** RT7 S-32: release only a settled failed or reconciled resumable call. */
export function classifyRelease(facts: ControlFacts): ReleaseAdmission {
  const current = phase(facts)
  if (current === 'absent') return { rejected: 'callNotFound' }
  if (current === 'unknown') return { rejected: 'unavailable' }
  if (current === 'complete' || current === 'handed_up' || current === 'interrupted')
    return { rejected: 'alreadyEnded' }
  // S-86: a durable ready is terminal; only a local, unconfirmed reply stays reply_pending.
  if ('phase' in facts.durable && facts.durable.phase === 'reply_pending')
    return { rejected: 'alreadyEnded' }
  if (current !== 'awaiting_decision' && current !== 'resumable') return { wrongPhase: current }
  if ('intentExists' in facts.durable && facts.durable.intentExists)
    return { rejected: 'unavailable' }
  return { allowed: true }
}

export interface ControlAppendInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly concurrent: import('@omne-harness-lite/content-blocks').JsonNumber
  readonly record: ModelCallInterruptIntentRecord | ModelCallEndedRecord
  /** Original Run/attempt only; no synthetic fence is permitted. */
  readonly run?: RunId
  readonly attempt?: AttemptId
  /** The caller owns this registration until actual stop and authoritative recognition. */
  readonly retainUnknown: (
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ) => void
  readonly trackTask?: (task: SettlementTask<AppendResult>) => () => void
}

/** S-68/S-70: one actual SL3 unconditional commit, with the original Run fence if present.
 * An unconfirmed effect is transferred to the caller's owner; it is never called absent. */
export async function appendControlRecord(
  input: ControlAppendInput,
): Promise<{ readonly appended: true } | { readonly unavailable: true }> {
  const { binding, owner, record } = input
  if (
    (input.run === undefined) !== (input.attempt === undefined) ||
    owner.admission() !== 'open' ||
    !settlementGenerationCurrent(binding)
  )
    return { unavailable: true }
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: record },
  })
  if ('invalidValue' in captured) return { unavailable: true }
  const prepared = prepareModelLogEntry({
    session: binding.session,
    shell: {
      tenant: binding.tenant,
      ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
    },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in prepared) return { unavailable: true }
  const grant = owner.acquire(input.concurrent)
  if ('unavailable' in grant) return { unavailable: true }
  const registration = grant.registration
  const fence: AppendFence =
    input.run !== undefined && input.attempt !== undefined
      ? { kind: 'fenced', run: input.run, attempt: input.attempt }
      : { kind: 'unfenced' }
  return runControlAppend(input, binding, owner, prepared, registration, fence)
}

type ControlAppendOutcome = { readonly appended: true } | { readonly unavailable: true }
type PreparedControlRecord = Extract<
  ReturnType<typeof prepareModelLogEntry>,
  { readonly ok: unknown }
>
type ControlReceipt = ReturnType<typeof settlementAppendReceipt>

async function runControlAppend(
  input: ControlAppendInput,
  binding: SettlementLogBinding,
  owner: SettlementOwner,
  prepared: PreparedControlRecord,
  registration: SettlementRegistration,
  fence: AppendFence,
): Promise<ControlAppendOutcome> {
  let started = false
  let task: SettlementTask<AppendResult>
  try {
    task = registration.start('controlAppend', async () => {
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(binding))
        return { failure: 'unavailable' } as const
      started = true
      return await binding.log.append(binding.session, [prepared.ok], fence, {
        kind: 'unconditional',
      })
    })
  } catch {
    registration.release()
    return { unavailable: true }
  }
  const untrack = input.trackTask?.(task)

  async function rejectedCompletion(): Promise<ControlAppendOutcome> {
    try {
      if (started) {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        await requestStopAndWait(task)
        registration.release()
      } catch {
        input.retainUnknown(registration, task)
      }
      return { unavailable: true }
    } finally {
      untrack?.()
    }
  }

  async function receivedCompletion(raw: unknown): Promise<ControlAppendOutcome> {
    try {
      const receipt = settlementAppendReceipt(raw, 1)
      if (
        started &&
        (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
      ) {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        await requestStopAndWait(task)
      } catch {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        registration.release()
      } catch {
        return { unavailable: true }
      }
      return completedControlAppend(started, receipt)
    } finally {
      untrack?.()
    }
  }

  let raw: unknown
  try {
    raw = await task.completion
  } catch {
    return rejectedCompletion()
  }
  return receivedCompletion(raw)
}

function completedControlAppend(started: boolean, receipt: ControlReceipt): ControlAppendOutcome {
  return started && receipt !== null && !('failure' in receipt)
    ? { appended: true }
    : { unavailable: true }
}

interface UnknownControlWrite {
  readonly call: CurrentHistoryReaders['call']
  readonly readCall: SessionModelRequestPreparation['readCall']
  readonly key: CallKey
  readonly binding: SettlementLogBinding
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  readonly readTasks: Set<SettlementTask<unknown>>
  recognizing: Promise<UnacknowledgedCallHistory> | undefined
  stopped: boolean
  stopFailed: boolean
  released: boolean
}
export interface ServiceControl {
  readonly releaseCall: (key: CallKey) => Promise<ReleaseCallResult>
  readonly interrupt: (input: InterruptInput) => Promise<InterruptResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

function controlAccount(
  history: UnacknowledgedCallHistory,
  run: RunId | undefined,
  requestAttempt: AttemptId | undefined,
  operation: CallOperationState | undefined,
): { readonly run?: RunId; readonly attempt?: AttemptId } | { readonly unavailable: true } {
  const latest = 'known' in history ? history.known.dispatches.at(-1)?.dispatched : undefined
  if (latest !== undefined && run !== undefined && latest.run !== run) return { unavailable: true }
  const actualRun = run ?? latest?.run
  const actualAttempt =
    operation?.phase === 'dispatching' ? operation.attempt : (latest?.attempt ?? requestAttempt)
  if ((actualRun === undefined) !== (actualAttempt === undefined)) return { unavailable: true }
  if (actualRun === undefined) return {}
  if (actualAttempt === undefined) return { unavailable: true }
  return { run: actualRun, attempt: actualAttempt }
}

/** The original call's S-36 system stop. It never manufactures a user interrupt intent. */
export function createOriginalSystemStop<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  retainUnknown: (
    binding: SettlementLogBinding,
    owner: SettlementOwner,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ) => void,
): (
  control: SystemStopControl<P, R>,
) => Promise<{ readonly released: true } | { readonly unavailable: true }> {
  const reads = new OwnedReadTracker()
  return async control => {
    const attempt = async (): Promise<RuntimeCloseResult> => {
      let view: ReturnType<SystemStopControl<P, R>['view']>
      try {
        view = control.view()
        if (view.key.session !== key.session || view.key.callId !== key.callId)
          return { unavailable: true }
        if (view.invocation !== undefined) {
          let closed: RuntimeCloseResult
          if (view.operation.phase === 'reply_pending') {
            const responseId = view.operation.pending.id
            const durable = await readOriginalStopHistory(runtime, key, reads, view)
            if (!originalReplyIsDurable(durable, responseId)) return { unavailable: true }
            closed = await view.invocation.finishReady()
          } else closed = await view.invocation.close()
          if ('unavailable' in closed) return { unavailable: true }
        }
        const received = await readOriginalStopHistory(runtime, key, reads, view)
        if ('unavailable' in received) return { unavailable: true }
        return await settleOriginalStopHistory(
          runtime,
          key,
          retainUnknown,
          control,
          view,
          received.ok,
        )
      } catch {
        return { unavailable: true }
      }
    }
    const result = await attempt()
    const drained = await reads.drain()
    return 'unavailable' in drained ? { unavailable: true } : result
  }
}

type StopView<P extends PlannedSemantics, R> = ReturnType<SystemStopControl<P, R>['view']>
type StopHistory = CallHistoryResult | { readonly unavailable: true }
type OwnedStopHistory = { readonly ok: StopHistory } | { readonly unavailable: true }
type OriginalWriteRetention = (
  binding: SettlementLogBinding,
  owner: SettlementOwner,
  registration: SettlementRegistration,
  task: SettlementTask<AppendResult>,
) => void
type PendingResponseId = Extract<
  CallOperationState,
  { readonly phase: 'reply_pending' }
>['pending']['id']

function readOriginalStopHistory<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  reads: OwnedReadTracker,
  view: StopView<P, R>,
): Promise<OwnedStopHistory> {
  return withOwnedReads(
    view.owner,
    runtime.settlementContention.limits.concurrent,
    reads,
    async registration => {
      return runtime.requestPreparation.readCall({
        binding: view.session.log,
        registration,
        callId: key.callId,
        interpret: runtime.history.call.bind(runtime.history),
      })
    },
  )
}

function originalReplyIsDurable(durable: OwnedStopHistory, responseId: PendingResponseId): boolean {
  if ('unavailable' in durable || !('known' in durable.ok)) return false
  const known = durable.ok.known
  const readyDurable =
    known.acknowledged !== null ||
    known.dispatches.some(
      item =>
        item.record.response === responseId && (item.ready !== null || item.response !== null),
    )
  return readyDurable
}

function settleOriginalStopHistory<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  retainUnknown: OriginalWriteRetention,
  control: SystemStopControl<P, R>,
  view: StopView<P, R>,
  durable: StopHistory,
): RuntimeCloseResult | Promise<RuntimeCloseResult> {
  if ('unavailable' in durable) return stopFromCallFacts(runtime, key, control, view)
  if (
    'known' in durable &&
    (durable.known.acknowledged !== null ||
      durable.known.phase === 'complete' ||
      durable.known.phase === 'interrupted' ||
      durable.known.phase === 'handed_up' ||
      durable.known.phase === 'reply_pending')
  ) {
    control.publishStopped()
    return { released: true }
  }
  const history = rejectAcknowledgedHistory(durable)
  return cancelOriginalHistory(runtime, key, retainUnknown, control, view, history)
}

async function stopFromCallFacts<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  control: SystemStopControl<P, R>,
  view: StopView<P, R>,
): Promise<RuntimeCloseResult> {
  const durable = await runtime.callFacts.lookup({ binding: view.session.log, ref: key })
  if (
    'acknowledged' in durable ||
    ('view' in durable &&
      durable.view.result !== undefined &&
      (durable.view.state === 'complete' || durable.view.state === 'interrupted'))
  ) {
    control.publishStopped()
    return { released: true }
  }
  return { unavailable: true }
}

function cancelOriginalHistory<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  retainUnknown: OriginalWriteRetention,
  control: SystemStopControl<P, R>,
  view: StopView<P, R>,
  history: UnacknowledgedCallHistory,
): RuntimeCloseResult | Promise<RuntimeCloseResult> {
  if (
    'known' in history &&
    history.known.phase !== null &&
    history.known.phase !== 'open' &&
    history.known.phase !== 'awaiting_decision' &&
    history.known.phase !== 'resumable'
  )
    return { unavailable: true }
  if ('unknown' in view.owner.opened() || view.owner.unresolvedWrites().length !== 0)
    return { unavailable: true }
  return appendOriginalCancellation(runtime, key, retainUnknown, control, view, history)
}

async function appendOriginalCancellation<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  key: CallKey,
  retainUnknown: OriginalWriteRetention,
  control: SystemStopControl<P, R>,
  view: StopView<P, R>,
  history: UnacknowledgedCallHistory,
): Promise<RuntimeCloseResult> {
  const account = controlAccount(history, view.request.run, view.request.attempt, view.operation)
  if ('unavailable' in account) return account
  const appended = await appendControlRecord({
    binding: view.session.log,
    owner: view.owner,
    concurrent: runtime.settlementContention.limits.concurrent,
    ...account,
    record: {
      kind: 'model_call_ended',
      call: key.callId,
      ending: 'interrupted',
      initiator:
        'known' in history && history.known.intent !== null
          ? history.known.intent.initiator
          : 'run_cancelled',
    },
    retainUnknown: (registration, task) =>
      retainUnknown(view.session.log, view.owner, registration, task),
  })
  if ('unavailable' in appended) return { unavailable: true }
  control.publishStopped()
  return { released: true }
}

/** The service instance retains uncertain append owners across calls. A later complete read is
 * needed even after actual stop; completion alone cannot decide whether the record committed. */
export function createServiceControl<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): ProjectedComponent<ServiceControl, RuntimeConstruction<P, R>> {
  return buildServiceControl(runtime)
}

class ServiceControlState {
  readonly unknown = new Map<string, UnknownControlWrite[]>()
  readonly reads = new OwnedReadTracker()
  readonly reconcileReads = new OwnedReadTracker()
  readonly appends = new OwnedAppendTracker()
  readonly backgroundEnds = new Map<string, Promise<void>>()
  readonly recoveries = new Set<Promise<void>>()
  readonly backgroundFailed = new Map<
    string,
    {
      readonly key: CallKey
      readonly binding: SettlementLogBinding
      readonly owner: SettlementOwner
      readonly call: CurrentHistoryReaders['call']
      readonly readCall: SessionModelRequestPreparation['readCall']
    }
  >()
  closing = false
}

function buildServiceControl<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  physical: ServiceControlState = new ServiceControlState(),
): ProjectedComponent<ServiceControl, RuntimeConstruction<P, R>> {
  const keyOf = (key: CallKey) => JSON.stringify([key.session, key.callId])
  const markEndUnavailable = (
    key: CallKey,
    binding: SettlementLogBinding,
    owner: SettlementOwner,
  ) => {
    physical.backgroundFailed.set(keyOf(key), {
      key,
      binding,
      owner,
      call: runtime.history.call.bind(runtime.history),
      readCall: runtime.requestPreparation.readCall.bind(runtime.requestPreparation),
    })
  }

  function retain(
    key: CallKey,
    binding: SettlementLogBinding,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ): void {
    const token = keyOf(key)
    let writes = physical.unknown.get(token)
    if (writes === undefined) {
      writes = []
      physical.unknown.set(token, writes)
    }
    const write: UnknownControlWrite = {
      call: runtime.history.call.bind(runtime.history),
      readCall: runtime.requestPreparation.readCall.bind(runtime.requestPreparation),
      key,
      binding,
      registration,
      task,
      readTasks: new Set(),
      recognizing: undefined,
      stopped: false,
      stopFailed: false,
      released: false,
    }
    writes.push(write)
    task.stopped.then(
      () => {
        write.stopped = true
      },
      () => {
        write.stopFailed = true
      },
    )
  }

  type InputFailure = Extract<
    InterruptResult,
    { readonly unavailable: true } | { readonly invalidInput: unknown }
  >
  type BoundSession = Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>

  function releaseInputFailure(key: CallKey): InputFailure | undefined {
    if (physical.closing) return { unavailable: true }
    if (
      key === null ||
      typeof key !== 'object' ||
      !('ok' in parseOpaqueIdentifier(key.session, 'SessionRef')) ||
      !('ok' in judgeAccountValue('ModelCallId', key.callId))
    )
      return { invalidInput: { reason: 'malformed' } }
    return undefined
  }

  function interruptInputFailure(input: InterruptInput): InputFailure | undefined {
    if (physical.closing) return { unavailable: true }
    if (
      input === null ||
      typeof input !== 'object' ||
      !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
      !('ok' in judgeAccountValue('ModelCallId', input.callId)) ||
      (input.initiator !== 'user' && input.initiator !== 'run_cancelled')
    )
      return { invalidInput: { reason: 'malformed' } }
    return undefined
  }

  function bindFailure(
    failure: Extract<BoundSession, { readonly failure: unknown }>['failure'],
  ): InputFailure {
    return failure === 'invalidInput'
      ? { invalidInput: { reason: 'malformed' } }
      : { unavailable: true }
  }

  function bindingMatches(session: SessionRuntimeBinding, key: CallKey): boolean {
    if (
      session.log.session !== key.session ||
      session.selection.binding.session !== key.session ||
      !tenantIdEquals(session.log.tenant, session.selection.binding.tenant) ||
      session.log.generation !== session.selection.binding.generation
    )
      return false
    return true
  }

  function localAccount(
    history: UnacknowledgedCallHistory,
    local: CallContainerView<P, R> | undefined,
  ): ReturnType<typeof controlAccount> {
    return controlAccount(history, local?.request.run, local?.request.attempt, local?.operation)
  }

  function releaseRefusal(
    admission: ReleaseAdmission,
  ): Exclude<ReleaseCallResult, { readonly callId: unknown }> | undefined {
    if ('rejected' in admission) {
      if (admission.rejected === 'callNotFound') return { callNotFound: true }
      if (admission.rejected === 'alreadyEnded') return { alreadyEnded: true }
      return { unavailable: true }
    }
    if ('wrongPhase' in admission) return { wrongPhase: { phase: admission.wrongPhase } }
    return undefined
  }

  function interruptRefusal(
    admission: Extract<InterruptAdmission, { readonly rejected: unknown }>,
  ): InterruptResult {
    if (admission.rejected === 'callNotFound') return { callNotFound: true }
    if (admission.rejected === 'alreadyEnded') return { alreadyEnded: true }
    return { unavailable: true }
  }

  async function recognizeUnknown(
    writes: readonly UnknownControlWrite[],
  ): Promise<UnacknowledgedCallHistory> {
    function releaseRecognized(
      first: UnknownControlWrite,
      history: Exclude<CallHistoryResult, { readonly unavailable: true }>,
    ): UnacknowledgedCallHistory {
      try {
        for (const write of writes) {
          if (write.released) continue
          write.registration.release()
          write.released = true
        }
      } catch {
        return { unavailable: true, reason: 'history' }
      }
      const token = keyOf(first.key)
      const remaining = physical.unknown.get(token)?.filter(write => !write.released)
      if (remaining?.length) physical.unknown.set(token, remaining)
      else physical.unknown.delete(token)
      // RT12 S-100: an acknowledged call is its real terminal state for control decisions.
      return acknowledgedAsTerminal(history)
    }

    const first = writes.find(write => !write.released)
    if (first === undefined) return { unavailable: true, reason: 'history' }
    if (first.recognizing !== undefined) return await first.recognizing
    const attempt = (async (): Promise<UnacknowledgedCallHistory> => {
      if (writes.some(write => !write.stopped || write.stopFailed))
        return { unavailable: true, reason: 'history' }
      const previous = await Promise.allSettled([...first.readTasks].map(requestStopAndWait))
      if (previous.some(result => result.status === 'rejected'))
        return { unavailable: true, reason: 'prefix' }
      first.readTasks.clear()
      let received: CallHistoryResult
      try {
        received = await first.readCall({
          binding: first.binding,
          callId: first.key.callId,
          interpret: first.call,
          additionalReaders: writes
            .filter(write => !write.released && write !== first)
            .map(write => ({ callId: write.key.callId, interpret: write.call })),
          registration: {
            start(kind, operation) {
              const task = first.registration.start(kind, operation)
              first.readTasks.add(task)
              return task
            },
            release: first.registration.release,
          },
        })
      } catch {
        return { unavailable: true, reason: 'prefix' }
      }
      const stopped = await Promise.allSettled([...first.readTasks].map(requestStopAndWait))
      if (stopped.some(result => result.status === 'rejected'))
        return { unavailable: true, reason: 'prefix' }
      first.readTasks.clear()
      if ('unavailable' in received) return received
      return releaseRecognized(first, received)
    })()
    first.recognizing = attempt
    try {
      return await attempt
    } finally {
      if (first.recognizing === attempt) first.recognizing = undefined
    }
  }

  async function read(
    session: SessionRuntimeBinding,
    owner: SettlementOwner,
    key: CallKey,
  ): Promise<UnacknowledgedCallHistory> {
    const waiting = physical.unknown.get(keyOf(key))
    if (waiting !== undefined) return await recognizeUnknown([...waiting])
    const received = await withOwnedReads(
      owner,
      runtime.settlementContention.limits.concurrent,
      physical.reads,
      registration =>
        runtime.requestPreparation.readCall({
          binding: session.log,
          registration,
          callId: key.callId,
          interpret: runtime.history.call.bind(runtime.history),
        }),
    )
    if ('unavailable' in received) return { unavailable: true, reason: 'prefix' }
    return acknowledgedAsTerminal(received.ok)
  }

  const releaseCall = async (key: CallKey): Promise<ReleaseCallResult> => {
    const inputFailure = releaseInputFailure(key)
    if (inputFailure !== undefined) return inputFailure
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(key.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound) return bindFailure(bound.failure)
    const session = bound.binding
    if (!bindingMatches(session, key)) return { unavailable: true }
    const gate = await runtime.calls.waitReserve(key, {
      policy: runtime.reservationWaitPolicy,
      scheduler: runtime.settlementScheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in gate) return { unavailable: true }
    const reservation = gate.reservation
    try {
      const local = reservation.view()
      const owner = local?.owner ?? session.selection.owner
      function ownerReadable(): boolean {
        if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log)) return false
        return true
      }
      function releaseWriteAllowed(): boolean {
        if (physical.closing) return false
        if ('unknown' in owner.opened() || owner.unresolvedWrites().length !== 0) return false
        return true
      }
      if (!ownerReadable()) return { unavailable: true }
      function prepareRelease(history: UnacknowledgedCallHistory):
        | {
            readonly account: Exclude<
              ReturnType<typeof controlAccount>,
              { readonly unavailable: true }
            >
          }
        | Exclude<ReleaseCallResult, { readonly callId: unknown }> {
        const facts = controlFactsFromHistory(history, local !== undefined, local?.operation)
        const admission = classifyRelease(facts)
        const refused = releaseRefusal(admission)
        if (refused !== undefined) return refused
        if (!releaseWriteAllowed()) return { unavailable: true }
        const account = localAccount(history, local)
        if ('unavailable' in account) return account
        return { account }
      }
      function releaseOutcome(
        appended: Awaited<ReturnType<typeof appendControlRecord>>,
      ): ReleaseCallResult {
        return 'appended' in appended
          ? { callId: key.callId, state: 'handed_up' }
          : { unavailable: true }
      }
      const history = await read(session, owner, key)
      const prepared = prepareRelease(history)
      if (!('account' in prepared)) return prepared
      const account = prepared.account
      const appended = await appendControlRecord({
        trackTask: task => physical.appends.track(task),
        binding: session.log,
        owner,
        concurrent: runtime.settlementContention.limits.concurrent,
        ...account,
        record: { kind: 'model_call_ended', call: key.callId, ending: 'released' },
        retainUnknown: (registration, task) => retain(key, session.log, registration, task),
      })
      if ('appended' in appended && local !== undefined) {
        const container = runtime.calls.find(key)
        if (container !== undefined) {
          const closed = await container.close()
          if ('released' in closed) runtime.calls.remove(reservation)
        }
      }
      return releaseOutcome(appended)
    } finally {
      reservation.release()
    }
  }
  const interrupt = async (input: InterruptInput): Promise<InterruptResult> => {
    const inputFailure = interruptInputFailure(input)
    if (inputFailure !== undefined) return inputFailure
    const key: CallKey = { session: input.session, callId: input.callId }
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(key.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound) return bindFailure(bound.failure)
    const session = bound.binding
    if (!bindingMatches(session, key)) return { unavailable: true }
    const gate = await runtime.calls.waitReserve(key, {
      policy: runtime.reservationWaitPolicy,
      scheduler: runtime.settlementScheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in gate) return { unavailable: true }
    const reservation = gate.reservation
    let releaseReservation: (() => void) | undefined
    const reservationReleased = new Promise<void>(resolve => {
      releaseReservation = resolve
    })
    let borrowed: { readonly owner: SettlementOwner; readonly release: () => void } | undefined
    let borrowedTransferred = false
    try {
      const local = reservation.view()
      const owner = local?.owner ?? session.selection.owner
      function prepareControlOwner(): boolean {
        if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log)) return false
        if (local?.operation.phase === 'dispatching') {
          const access = local.invocation?.borrowControl()
          if (access === undefined || 'unavailable' in access) return false
          borrowed = access
        }
        return true
      }
      if (!prepareControlOwner()) return { unavailable: true }
      const controlOwner = borrowed?.owner ?? owner
      const history = await read(session, controlOwner, key)
      const admission = classifyInterrupt(
        controlFactsFromHistory(history, local !== undefined, local?.operation),
      )
      if ('rejected' in admission) return interruptRefusal(admission)
      function originalSignal():
        Extract<CallOperationState, { readonly phase: 'dispatching' }>['interrupt'] | undefined {
        // A durable in-flight call needs its original local abort port. A detached old producer
        // belongs to reconcile; merely writing an intent here would falsely promise a signal.
        return local?.operation.phase === 'dispatching' ? local.operation.interrupt : undefined
      }
      const signalInterrupt = originalSignal()
      function permittedAccount(
        admission: Extract<InterruptAdmission, { readonly stage: unknown }>,
      ): ReturnType<typeof controlAccount> {
        if (admission.stage !== 'before_dispatch' && signalInterrupt === undefined)
          return { unavailable: true }
        if (physical.closing) return { unavailable: true }
        return localAccount(history, local)
      }
      const account = permittedAccount(admission)
      if ('unavailable' in account) return account
      function recoverUnknownIntent(): void {
        const pending = physical.unknown.get(keyOf(key))
        if (borrowed !== undefined && pending !== undefined) {
          // The failed receipt cannot authorize a stop. Once the actual writer stops,
          // reconcile its effect from a complete prefix without requiring a retry call.
          const recoveryOwner = borrowed.owner
          async function recover(pending: readonly UnknownControlWrite[]): Promise<void> {
            await reservationReleased
            // Asking for the stop is not assuming it: the actual stopped proof still gates
            // the recovery read, and an owner that stops only on request is not left waiting.
            await Promise.allSettled(pending.map(write => requestStopAndWait(write.task)))
            const next = await runtime.calls.waitReserve(key, {
              policy: runtime.reservationWaitPolicy,
              scheduler: runtime.settlementScheduler,
              signal: new AbortController().signal,
            })
            if ('unavailable' in next) return
            try {
              await read(session, recoveryOwner, key)
            } finally {
              next.reservation.release()
            }
          }
          const recovery = recover(pending)
          physical.recoveries.add(recovery)
          void recovery.then(
            () => physical.recoveries.delete(recovery),
            () => {
              physical.recoveries.delete(recovery)
              try {
                runtime.policy.diagnostic({ kind: 'model_control.unknown_recovery_failed' })
              } catch {
                // An observer cannot complete or erase the unresolved write.
              }
            },
          )
        }
      }
      if (!admission.intentExists) {
        const appended = await appendControlRecord({
          trackTask: task => physical.appends.track(task),
          binding: session.log,
          owner: controlOwner,
          concurrent: runtime.settlementContention.limits.concurrent,
          ...account,
          record: {
            kind: 'model_call_interrupt_intent',
            call: key.callId,
            initiator: input.initiator,
          },
          retainUnknown: (registration, task) => retain(key, session.log, registration, task),
        })
        if ('unavailable' in appended) {
          recoverUnknownIntent()
          return { unavailable: true }
        }
      }
      function startBackgroundEnding(): void {
        if (!physical.backgroundEnds.has(keyOf(key))) {
          let committed = false
          function endingReceived(result: Awaited<ReturnType<typeof appendControlRecord>>): void {
            if ('appended' in result) committed = true
            else {
              markEndUnavailable(key, session.log, owner)
              runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
            }
          }
          function endingRejected(): void {
            markEndUnavailable(key, session.log, owner)
            try {
              runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
            } catch {
              // Diagnostics cannot settle or release the original effect.
            }
          }
          async function cleanupEnding(): Promise<void> {
            await reservationReleased
            if (!committed || local === undefined) return
            const next = await runtime.calls.waitReserve(key, {
              policy: runtime.reservationWaitPolicy,
              scheduler: runtime.settlementScheduler,
              signal: new AbortController().signal,
            })
            if ('unavailable' in next) {
              markEndUnavailable(key, session.log, owner)
              return
            }
            try {
              const container = runtime.calls.find(key)
              if (container === undefined) return
              const closed = await container.close()
              if ('released' in closed) runtime.calls.remove(next.reservation)
              else markEndUnavailable(key, session.log, owner)
            } finally {
              next.reservation.release()
            }
          }
          const ending = appendControlRecord({
            trackTask: task => physical.appends.track(task),
            binding: session.log,
            owner: controlOwner,
            concurrent: runtime.settlementContention.limits.concurrent,
            ...account,
            record: {
              kind: 'model_call_ended',
              call: key.callId,
              ending: 'interrupted',
              initiator:
                'known' in history && history.known.intent !== null
                  ? history.known.intent.initiator
                  : input.initiator,
            },
            retainUnknown: (registration, task) => retain(key, session.log, registration, task),
          })
            .then(endingReceived)
            .catch(endingRejected)
          const cleanup = ending
            .then(cleanupEnding)
            .catch(() => {
              markEndUnavailable(key, session.log, owner)
            })
            .finally(() => {
              physical.backgroundEnds.delete(keyOf(key))
            })
          if (borrowed !== undefined) {
            const controlBorrow = borrowed
            borrowedTransferred = true
            void ending.then(
              () => controlBorrow.release(),
              () => controlBorrow.release(),
            )
          }
          physical.backgroundEnds.set(keyOf(key), cleanup)
          if (local !== undefined) runtime.calls.find(key)?.retainStopped(ending)
        }
      }
      function notifyAfterIntent(
        admission: Extract<InterruptAdmission, { readonly stage: unknown }>,
      ): InterruptResult {
        if (admission.stage === 'before_dispatch') {
          // The local anchor may still be committing its dispatched record. Once the
          // intent is durable, stop that path before it can start a network request.
          if (local?.operation.phase === 'dispatching')
            signalInterrupt?.(
              'known' in history && history.known.intent !== null
                ? history.known.intent.initiator
                : input.initiator,
            )
          startBackgroundEnding()
        } else {
          try {
            signalInterrupt?.(
              'known' in history && history.known.intent !== null
                ? history.known.intent.initiator
                : input.initiator,
            )
          } catch {
            return { unavailable: true }
          }
        }
        return { stage: admission.stage }
      }
      return notifyAfterIntent(admission)
    } finally {
      if (!borrowedTransferred) borrowed?.release()
      reservation.release()
      releaseReservation?.()
    }
  }
  const close = async (): Promise<{ readonly released: true } | { readonly unavailable: true }> => {
    function requestUnknownStops(writes: readonly UnknownControlWrite[]): void {
      for (const write of writes) {
        try {
          write.task.requestStop()
        } catch {
          // The stopped promise, not a requested cancellation, is authoritative.
        }
        for (const task of write.readTasks) {
          try {
            task.requestStop()
          } catch {
            // The retained read cannot be released until its actual stopped fact.
          }
        }
      }
    }
    function failedEndRecognized(
      received:
        | { readonly ok: CallHistoryResult | { readonly unavailable: true } }
        | { readonly unavailable: true },
    ): boolean {
      if (
        'unavailable' in received ||
        'unavailable' in received.ok ||
        !('known' in received.ok) ||
        received.ok.known.phase !== 'interrupted'
      )
        return false
      return true
    }
    function closeResult(
      readResult: RuntimeCloseResult,
      appendResult: RuntimeCloseResult,
      recoveryReads: RuntimeCloseResult,
      finalRecoveryReads: RuntimeCloseResult,
    ): RuntimeCloseResult {
      if (
        physical.unknown.size !== 0 ||
        'unavailable' in readResult ||
        'unavailable' in appendResult ||
        'unavailable' in recoveryReads ||
        'unavailable' in finalRecoveryReads ||
        physical.backgroundFailed.size !== 0
      )
        return { unavailable: true }
      return { released: true }
    }
    physical.closing = true
    const [readResult, appendResult] = await Promise.all([
      physical.reads.close(),
      physical.appends.close(),
    ])
    await Promise.allSettled(physical.recoveries)
    try {
      await Promise.all(physical.backgroundEnds.values())
    } catch {
      return { unavailable: true }
    }
    const writes = [...physical.unknown.values()].flat()
    requestUnknownStops(writes)
    await Promise.allSettled(writes.map(write => write.task.stopped))
    for (const group of [...physical.unknown.values()]) await recognizeUnknown([...group])
    const recoveryReads = await physical.reconcileReads.drain()
    for (const [token, failed] of physical.backgroundFailed) {
      if (physical.unknown.has(token)) continue
      const received = await withOwnedReads(
        failed.owner,
        runtime.settlementContention.limits.concurrent,
        physical.reconcileReads,
        registration =>
          failed.readCall({
            binding: failed.binding,
            registration,
            callId: failed.key.callId,
            interpret: failed.call,
          }),
      )
      if (!failedEndRecognized(received)) continue
      const container = runtime.calls.find(failed.key)
      if (container !== undefined && 'unavailable' in (await container.close())) continue
      physical.backgroundFailed.delete(token)
    }
    const finalRecoveryReads = await physical.reconcileReads.drain()
    return closeResult(readResult, appendResult, recoveryReads, finalRecoveryReads)
  }
  return retainRuntimeProjection(
    Object.freeze({ releaseCall, interrupt, close }),
    (next: RuntimeConstruction<P, R>) => buildServiceControl(next, physical),
  )
}
