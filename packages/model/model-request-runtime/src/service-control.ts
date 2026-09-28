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
}

interface UnknownControlWrite {
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  stopped: boolean
  stopFailed: boolean
}
interface UnstoppedRead {
  readonly registration: SettlementRegistration
  readonly tasks: readonly SettlementTask<unknown>[]
}

export interface ServiceControl {
  readonly releaseCall: (key: CallKey) => Promise<ReleaseCallResult>
  readonly interrupt: (input: InterruptInput) => Promise<InterruptResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** The service instance retains uncertain append owners across calls. A later complete read is
 * needed even after actual stop; completion alone cannot decide whether the record committed. */
export function createServiceControl<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): ServiceControl {
  const unknown = new Map<string, UnknownControlWrite[]>()
  const unstoppedReads = new Set<UnstoppedRead>()
  const backgroundEnds = new Map<string, Promise<void>>()
  const keyOf = (key: CallKey) => JSON.stringify([key.session, key.callId])

  function retain(
    key: CallKey,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
  ): void {
    const token = keyOf(key)
    let writes = unknown.get(token)
    if (writes === undefined) {
      writes = []
      unknown.set(token, writes)
    }
    const write: UnknownControlWrite = { registration, task, stopped: false, stopFailed: false }
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
    const grant = owner.acquire(runtime.settlementContention.limits.concurrent)
    if ('unavailable' in grant) return { unavailable: true, reason: 'history' }
    const tasks: SettlementTask<unknown>[] = []
    const registration: SettlementRegistration = {
      start(kind, work) {
        const task = grant.registration.start(kind, work)
        tasks.push(task)
        return task
      },
      release: grant.registration.release,
    }
    let result: Awaited<ReturnType<typeof readSettlementPrefix>>
    try {
      result = await readSettlementPrefix({ binding: session.log, registration })
      await Promise.all(tasks.map(task => task.stopped))
      grant.registration.release()
    } catch {
      // A read can still own real backend work after its completion rejects. Retain the
      // registration until every task actually stops; a failed stop remains owned.
      const retained: UnstoppedRead = { registration: grant.registration, tasks }
      unstoppedReads.add(retained)
      const stopped = Promise.all(tasks.map(task => task.stopped))
      stopped
        .then(() => {
          try {
            grant.registration.release()
            unstoppedReads.delete(retained)
          } catch {
            // Keep the owner if release itself is uncertain.
          }
        })
        .catch(() => {
          // Keep the owner when actual stop cannot be established.
        })
      return { unavailable: true, reason: 'prefix' }
    }
    if ('unavailable' in result) return { unavailable: true, reason: 'prefix' }
    if (waiting !== undefined) {
      try {
        for (const write of waiting) write.registration.release()
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
      if ('unknown' in owner.opened() || owner.unresolvedWrites().length !== 0)
        return { unavailable: true }
      const appended = await appendControlRecord({
        binding: session.log,
        owner,
        concurrent: runtime.settlementContention.limits.concurrent,
        record: { kind: 'model_call_ended', call: key.callId, ending: 'released' },
        retainUnknown: (registration, task) => retain(key, registration, task),
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
    try {
      const local = reservation.view()
      const owner = local?.owner ?? session.selection.owner
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log))
        return { unavailable: true }
      const history = await read(session, owner, key)
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
      const abort = local?.operation.phase === 'dispatching' ? local.operation.abort : undefined
      if (admission.stage !== 'before_dispatch' && abort === undefined) return { unavailable: true }
      if (!admission.intentExists) {
        const appended = await appendControlRecord({
          binding: session.log,
          owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          record: {
            kind: 'model_call_interrupt_intent',
            call: key.callId,
            initiator: input.initiator,
          },
          retainUnknown: (registration, task) => retain(key, registration, task),
        })
        if ('unavailable' in appended) return { unavailable: true }
      }
      if (admission.stage === 'before_dispatch') {
        if (!backgroundEnds.has(keyOf(key))) {
          const ending = appendControlRecord({
            binding: session.log,
            owner,
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
            retainUnknown: (registration, task) => retain(key, registration, task),
          })
            .then(result => {
              if ('unavailable' in result)
                runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
            })
            .catch(() => {
              try {
                runtime.policy.diagnostic({ kind: 'model_control.end_unavailable' })
              } catch {
                // Diagnostics cannot settle or release the original effect.
              }
            })
            .finally(() => {
              backgroundEnds.delete(keyOf(key))
            })
          backgroundEnds.set(keyOf(key), ending)
          if (local !== undefined) runtime.calls.find(key)?.retainStopped(ending)
        }
      } else {
        try {
          abort?.()
        } catch {
          return { unavailable: true }
        }
      }
      return { stage: admission.stage }
    } finally {
      reservation.release()
    }
  }
  const close = async (): Promise<{ readonly released: true } | { readonly unavailable: true }> => {
    try {
      await Promise.all(backgroundEnds.values())
    } catch {
      return { unavailable: true }
    }
    if (unknown.size !== 0 || unstoppedReads.size !== 0) return { unavailable: true }
    return { released: true }
  }
  return Object.freeze({ releaseCall, interrupt, close })
}
