import type {
  ModelCallEndedRecord,
  ModelCallInterruptIntentRecord,
} from '@omne-harness-lite/messages'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { AppendFence, AppendResult } from '@omne-harness-lite/session-log-jsonl'
import { captureModelLogValue, prepareModelLogEntry } from './log-codec.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import { readSettlementPrefix } from './settlement-prefix.ts'
import type { CallHistoryResult } from './call-history.ts'
import type {
  CallKey,
  CallOperationState,
  SystemStopControl,
  RuntimeCloseResult,
  InterruptInput,
  InterruptResult,
  ReleaseCallResult,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from './service-types.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import type { PlannedSemantics } from './types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'

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
      await Promise.all(scope.tasks.map(task => task.stopped))
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
        readonly phase: Exclude<DispatchGuardPhase, 'open' | 'reply_pending'>
        readonly intentExists: boolean
      }
    | { readonly absent: true }
    | { readonly noDispatch: true; readonly intentExists: boolean }
    | { readonly unavailable: true }
  readonly operation?: Pick<CallOperationState, 'phase'>
  readonly localCall: boolean
}

/** Project only already-validated history; this does not authorize a raw log or infer a Run. */
export function controlFactsFromHistory(
  history: CallHistoryResult,
  localCall: boolean,
  operation?: CallOperationState,
): ControlFacts {
  let durable: ControlFacts['durable']
  if ('unavailable' in history) durable = { unavailable: true }
  else if ('absent' in history) durable = { absent: true }
  else if (history.known.phase === null)
    durable = { noDispatch: true, intentExists: history.known.intent !== null }
  else durable = { phase: history.known.phase, intentExists: history.known.intent !== null }
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
  let started = false
  let task: SettlementTask<AppendResult>
  try {
    task = registration.start('append', async () => {
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
  try {
    let raw: unknown
    try {
      raw = await task.completion
    } catch {
      if (started) {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        await task.stopped
        registration.release()
      } catch {
        input.retainUnknown(registration, task)
      }
      return { unavailable: true }
    }
    const receipt = settlementAppendReceipt(raw, 1)
    if (
      started &&
      (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
    ) {
      input.retainUnknown(registration, task)
      return { unavailable: true }
    }
    try {
      await task.stopped
    } catch {
      input.retainUnknown(registration, task)
      return { unavailable: true }
    }
    try {
      registration.release()
    } catch {
      return { unavailable: true }
    }
    return started && receipt !== null && !('failure' in receipt)
      ? { appended: true }
      : { unavailable: true }
  } finally {
    untrack?.()
  }
}

interface UnknownControlWrite {
  readonly key: CallKey
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  stopped: boolean
  stopFailed: boolean
  released: boolean
}
export interface ServiceControl {
  readonly releaseCall: (key: CallKey) => Promise<ReleaseCallResult>
  readonly interrupt: (input: InterruptInput) => Promise<InterruptResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
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
        if (view.invocation !== undefined && 'unavailable' in (await view.invocation.close()))
          return { unavailable: true }
        const received = await withOwnedReads(
          view.owner,
          runtime.settlementContention.limits.concurrent,
          reads,
          async registration => {
            const result = await readSettlementPrefix({ binding: view.session.log, registration })
            return 'unavailable' in result
              ? ({ unavailable: true } as const)
              : runtime.history.call(result.prefix, key.callId)
          },
        )
        if ('unavailable' in received || 'unavailable' in received.ok) return { unavailable: true }
        const history = received.ok
        if (
          'known' in history &&
          (history.known.phase === 'complete' ||
            history.known.phase === 'interrupted' ||
            history.known.phase === 'handed_up')
        ) {
          control.publishStopped()
          return { released: true }
        }
        if (
          'known' in history &&
          history.known.phase !== null &&
          history.known.phase !== 'awaiting_decision' &&
          history.known.phase !== 'resumable'
        )
          return { unavailable: true }
        if ('unknown' in view.owner.opened() || view.owner.unresolvedWrites().length !== 0)
          return { unavailable: true }
        const appended = await appendControlRecord({
          binding: view.session.log,
          owner: view.owner,
          concurrent: runtime.settlementContention.limits.concurrent,
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
      } catch {
        return { unavailable: true }
      }
    }
    const result = await attempt()
    const drained = await reads.drain()
    return 'unavailable' in drained ? { unavailable: true } : result
  }
}

/** The service instance retains uncertain append owners across calls. A later complete read is
 * needed even after actual stop; completion alone cannot decide whether the record committed. */
export function createServiceControl<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): ServiceControl {
  const unknown = new Map<string, UnknownControlWrite[]>()
  const reads = new OwnedReadTracker()
  const reconcileReads = new OwnedReadTracker()
  const appends = new OwnedAppendTracker()
  const backgroundEnds = new Map<string, Promise<void>>()
  const backgroundFailed = new Map<
    string,
    {
      readonly key: CallKey
      readonly binding: SettlementLogBinding
      readonly owner: SettlementOwner
    }
  >()
  let closing = false
  const keyOf = (key: CallKey) => JSON.stringify([key.session, key.callId])
  const markEndUnavailable = (
    key: CallKey,
    binding: SettlementLogBinding,
    owner: SettlementOwner,
  ) => {
    backgroundFailed.set(keyOf(key), { key, binding, owner })
  }

  function retain(
    key: CallKey,
    binding: SettlementLogBinding,
    owner: SettlementOwner,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ): void {
    const token = keyOf(key)
    let writes = unknown.get(token)
    if (writes === undefined) {
      writes = []
      unknown.set(token, writes)
    }
    const write: UnknownControlWrite = {
      key,
      binding,
      owner,
      registration,
      task,
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

  async function read(
    session: SessionRuntimeBinding,
    owner: SettlementOwner,
    key: CallKey,
  ): Promise<CallHistoryResult> {
    const waiting = unknown.get(keyOf(key))
    if (waiting?.some(write => !write.stopped || write.stopFailed))
      return { unavailable: true, reason: 'history' }
    const received = await withOwnedReads(
      owner,
      runtime.settlementContention.limits.concurrent,
      reads,
      async registration => await readSettlementPrefix({ binding: session.log, registration }),
    )
    if ('unavailable' in received) return { unavailable: true, reason: 'prefix' }
    const result = received.ok
    if ('unavailable' in result) return { unavailable: true, reason: 'prefix' }
    if (waiting !== undefined) {
      try {
        for (const write of waiting) {
          if (write.released) continue
          write.registration.release()
          write.released = true
        }
      } catch {
        return { unavailable: true, reason: 'history' }
      }
      unknown.delete(keyOf(key))
    }
    try {
      return runtime.history.call(result.prefix, key.callId)
    } catch {
      return { unavailable: true, reason: 'history' }
    }
  }

  const releaseCall = async (key: CallKey): Promise<ReleaseCallResult> => {
    if (closing) return { unavailable: true }
    if (
      key === null ||
      typeof key !== 'object' ||
      !('ok' in parseOpaqueIdentifier(key.session, 'SessionRef')) ||
      !('ok' in judgeAccountValue('ModelCallId', key.callId))
    )
      return { invalidInput: { reason: 'malformed' } }
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(key.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound)
      return bound.failure === 'invalidInput'
        ? { invalidInput: { reason: 'malformed' } }
        : { unavailable: true }
    const session = bound.binding
    if (
      session.log.session !== key.session ||
      session.selection.binding.session !== key.session ||
      !tenantIdEquals(session.log.tenant, session.selection.binding.tenant) ||
      session.log.generation !== session.selection.binding.generation
    )
      return { unavailable: true }
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
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log))
        return { unavailable: true }
      const history = await read(session, owner, key)
      const facts = controlFactsFromHistory(history, local !== undefined, local?.operation)
      const admission = classifyRelease(facts)
      if ('rejected' in admission) {
        if (admission.rejected === 'callNotFound') return { callNotFound: true }
        if (admission.rejected === 'alreadyEnded') return { alreadyEnded: true }
        return { unavailable: true }
      }
      if ('wrongPhase' in admission) return { wrongPhase: { phase: admission.wrongPhase } }
      if (closing) return { unavailable: true }
      if ('unknown' in owner.opened() || owner.unresolvedWrites().length !== 0)
        return { unavailable: true }
      const appended = await appendControlRecord({
        trackTask: task => appends.track(task),
        binding: session.log,
        owner,
        concurrent: runtime.settlementContention.limits.concurrent,
        record: { kind: 'model_call_ended', call: key.callId, ending: 'released' },
        retainUnknown: (registration, task) => retain(key, session.log, owner, registration, task),
      })
      if ('appended' in appended && local !== undefined) {
        const container = runtime.calls.find(key)
        if (container !== undefined) {
          const closed = await container.close()
          if ('released' in closed) runtime.calls.remove(reservation)
        }
      }
      return 'appended' in appended
        ? { callId: key.callId, state: 'handed_up' }
        : { unavailable: true }
    } finally {
      reservation.release()
    }
  }
  const interrupt = async (input: InterruptInput): Promise<InterruptResult> => {
    if (closing) return { unavailable: true }
    if (
      input === null ||
      typeof input !== 'object' ||
      !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
      !('ok' in judgeAccountValue('ModelCallId', input.callId)) ||
      (input.initiator !== 'user' && input.initiator !== 'run_cancelled')
    )
      return { invalidInput: { reason: 'malformed' } }
    const key: CallKey = { session: input.session, callId: input.callId }
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(key.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound)
      return bound.failure === 'invalidInput'
        ? { invalidInput: { reason: 'malformed' } }
        : { unavailable: true }
    const session = bound.binding
    if (
      session.log.session !== key.session ||
      session.selection.binding.session !== key.session ||
      !tenantIdEquals(session.log.tenant, session.selection.binding.tenant) ||
      session.log.generation !== session.selection.binding.generation
    )
      return { unavailable: true }
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
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log))
        return { unavailable: true }
      if (local?.operation.phase === 'dispatching') {
        const access = local.invocation?.borrowControl()
        if (access === undefined || 'unavailable' in access) return { unavailable: true }
        borrowed = access
      }
      const controlOwner = borrowed?.owner ?? owner
      const history = await read(session, controlOwner, key)
      const admission = classifyInterrupt(
        controlFactsFromHistory(history, local !== undefined, local?.operation),
      )
      if ('rejected' in admission) {
        if (admission.rejected === 'callNotFound') return { callNotFound: true }
        if (admission.rejected === 'alreadyEnded') return { alreadyEnded: true }
        return { unavailable: true }
      }
      // A durable in-flight call needs its original local abort port. A detached old producer
      // belongs to reconcile; merely writing an intent here would falsely promise a signal.
      const signalInterrupt =
        local?.operation.phase === 'dispatching' ? local.operation.interrupt : undefined
      if (admission.stage !== 'before_dispatch' && signalInterrupt === undefined)
        return { unavailable: true }
      if (closing) return { unavailable: true }
      if (!admission.intentExists) {
        const appended = await appendControlRecord({
          trackTask: task => appends.track(task),
          binding: session.log,
          owner: controlOwner,
          concurrent: runtime.settlementContention.limits.concurrent,
          record: {
            kind: 'model_call_interrupt_intent',
            call: key.callId,
            initiator: input.initiator,
          },
          retainUnknown: (registration, task) =>
            retain(key, session.log, controlOwner, registration, task),
        })
        if ('unavailable' in appended) return { unavailable: true }
      }
      if (admission.stage === 'before_dispatch') {
        // The local anchor may still be committing its dispatched record. Once the
        // intent is durable, stop that path before it can start a network request.
        if (local?.operation.phase === 'dispatching')
          signalInterrupt?.(
            'known' in history && history.known.intent !== null
              ? history.known.intent.initiator
              : input.initiator,
          )
        if (!backgroundEnds.has(keyOf(key))) {
          let committed = false
          const ending = appendControlRecord({
            trackTask: task => appends.track(task),
            binding: session.log,
            owner: controlOwner,
            concurrent: runtime.settlementContention.limits.concurrent,
            record: {
              kind: 'model_call_ended',
              call: key.callId,
              ending: 'interrupted',
              initiator:
                'known' in history && history.known.intent !== null
                  ? history.known.intent.initiator
                  : input.initiator,
            },
            retainUnknown: (registration, task) =>
              retain(key, session.log, controlOwner, registration, task),
          })
            .then(result => {
              if ('appended' in result) committed = true
              else {
                markEndUnavailable(key, session.log, owner)
                runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
              }
            })
            .catch(() => {
              markEndUnavailable(key, session.log, owner)
              try {
                runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
              } catch {
                // Diagnostics cannot settle or release the original effect.
              }
            })
          const cleanup = ending
            .then(async () => {
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
            })
            .catch(() => {
              markEndUnavailable(key, session.log, owner)
            })
            .finally(() => {
              backgroundEnds.delete(keyOf(key))
            })
          if (borrowed !== undefined) {
            const controlBorrow = borrowed
            borrowedTransferred = true
            void ending.then(
              () => controlBorrow.release(),
              () => controlBorrow.release(),
            )
          }
          backgroundEnds.set(keyOf(key), cleanup)
          if (local !== undefined) runtime.calls.find(key)?.retainStopped(ending)
        }
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
    } finally {
      if (!borrowedTransferred) borrowed?.release()
      reservation.release()
      releaseReservation?.()
    }
  }
  const close = async (): Promise<{ readonly released: true } | { readonly unavailable: true }> => {
    closing = true
    const [readResult, appendResult] = await Promise.all([reads.close(), appends.close()])
    try {
      await Promise.all(backgroundEnds.values())
    } catch {
      return { unavailable: true }
    }
    const writes = [...unknown.values()].flat()
    for (const write of writes) {
      try {
        write.task.requestStop()
      } catch {
        // The stopped promise, not a requested cancellation, is authoritative.
      }
    }
    await Promise.allSettled(writes.map(write => write.task.stopped))
    for (const [token, group] of unknown) {
      if (group.some(write => !write.stopped || write.stopFailed)) continue
      const first = group[0]
      if (first === undefined) continue
      const received = await withOwnedReads(
        first.owner,
        runtime.settlementContention.limits.concurrent,
        reconcileReads,
        async registration => {
          const result = await readSettlementPrefix({ binding: first.binding, registration })
          return 'unavailable' in result
            ? ({ unavailable: true } as const)
            : runtime.history.call(result.prefix, first.key.callId)
        },
      )
      if ('unavailable' in received || 'unavailable' in received.ok) continue
      try {
        for (const write of group) {
          if (write.released) continue
          write.registration.release()
          write.released = true
        }
        unknown.delete(token)
      } catch {
        // A failed release keeps the original owner reachable for another close attempt.
      }
    }
    const recoveryReads = await reconcileReads.drain()
    for (const [token, failed] of backgroundFailed) {
      if (unknown.has(token)) continue
      const received = await withOwnedReads(
        failed.owner,
        runtime.settlementContention.limits.concurrent,
        reconcileReads,
        async registration => {
          const result = await readSettlementPrefix({ binding: failed.binding, registration })
          return 'unavailable' in result
            ? ({ unavailable: true } as const)
            : runtime.history.call(result.prefix, failed.key.callId)
        },
      )
      if (
        'unavailable' in received ||
        'unavailable' in received.ok ||
        !('known' in received.ok) ||
        received.ok.known.phase !== 'interrupted'
      )
        continue
      const container = runtime.calls.find(failed.key)
      if (container !== undefined && 'unavailable' in (await container.close())) continue
      backgroundFailed.delete(token)
    }
    const finalRecoveryReads = await reconcileReads.drain()
    if (
      unknown.size !== 0 ||
      'unavailable' in readResult ||
      'unavailable' in appendResult ||
      'unavailable' in recoveryReads ||
      'unavailable' in finalRecoveryReads ||
      backgroundFailed.size !== 0
    )
      return { unavailable: true }
    return { released: true }
  }
  return Object.freeze({ releaseCall, interrupt, close })
}
