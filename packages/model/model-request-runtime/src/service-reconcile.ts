import {
  judgePendingModelResponse,
  validate as validateModelResponse,
} from '@omne-harness-lite/model-response'
import type { PendingModelResponse, ReplyDisposition } from '@omne-harness-lite/model-response'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  CallContainerStore,
  ReconcileInput,
  ReconcileResult,
  RuntimeRecoveryAccess,
  RuntimeRecoveryScope,
  RuntimeSessionAccess,
  SettleReplyInput,
  SettleReplyResult,
  ReservationWaitPolicy,
  CallKey,
} from './service-types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import {
  inspectCurrentModelLogPrefix,
  type ModelLogSettlementTarget,
} from './log-codec-settlement.ts'
import { interpretCallHistory } from './call-history.ts'
import { readSettlementPrefix } from './settlement-prefix.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import { modelLogJsonEqual } from './log-codec.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { constructAnchoredInterruption } from './response-construction.ts'
import { appendControlRecord } from './service-control.ts'
import { UnknownAppendTracker } from './service-calls.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import type { PlannedSemantics } from './types.ts'
import type {
  SettlementContention,
  SettlementDiagnostic,
  SettlementRegistration,
  SettlementScheduler,
  SettlementTask,
  SettlementLogBinding,
  SettlementOwner,
} from './settlement-types.ts'

interface RecoveryRead {
  readonly registration: SettlementRegistration
  readonly tasks: Set<SettlementTask<unknown>>
}

interface RecoverySettlement {
  readonly coordinator: ReturnType<typeof createSettlementCoordinator>
  task: ReturnType<ReturnType<typeof createSettlementCoordinator>['settle']> | undefined
  readonly target: ModelLogSettlementTarget
}

interface RecoveryEntry {
  readonly session: ReconcileInput['session']
  readonly reads: Set<RecoveryRead>
  readonly settlements: Set<RecoverySettlement>
  readonly unknownControl: UnknownAppendTracker
  readonly pendingControl: Set<CallKey['callId']>
  readonly controlTasks: Set<SettlementTask<AppendResult>>
  entered?: Promise<Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>>
  scope?: RuntimeRecoveryScope
  active: Promise<ReconcileResult> | undefined
  releasing: { readonly finalize: boolean; readonly promise: Promise<boolean> } | undefined
  exitAttempted: boolean
}

function isServiceDisposition(value: unknown): value is Exclude<ReplyDisposition, 'persisted'> {
  if (value === 'persisted') return false
  try {
    return validateModelResponse('ReplyDisposition', value).valid
  } catch {
    return false
  }
}

/** S-49/S-75: a caller's explicit veto/consumption completes the already fixed reply. */
export async function settlePendingReply(input: {
  readonly request: SettleReplyInput
  readonly pending: PendingModelResponse
  readonly invocation: Pick<AnchoredInvocationHandle, 'settleReply'>
}): Promise<SettleReplyResult> {
  const { request, pending, invocation } = input
  if (
    !isServiceDisposition(request.disposition) ||
    request.session.length === 0 ||
    request.callId.length === 0 ||
    'rejected' in judgePendingModelResponse(pending)
  )
    return { invalidInput: { reason: 'malformed' } }
  if (pending.call.callId !== request.callId) return { callNotFound: true }
  // G-28: a Run's late predicate still requires its real owner and one full prefix.
  if (pending.call.runId !== undefined) return { unavailable: true }
  try {
    const result = await invocation.settleReply(request.disposition)
    if ('unavailable' in result) return { unavailable: true }
    if (result.settled.disposition === 'firstWinner') return { alreadyEnded: true }
    const original = result.settled.response.response
    if (original === null) return { unavailable: true }
    if (
      original.outcome !== 'interrupted' &&
      original.outcome !== 'complete' &&
      original.outcome !== 'truncated'
    )
      return { unavailable: true }
    return {
      callId: request.callId,
      state: original.outcome === 'interrupted' ? 'interrupted' : 'complete',
    }
  } catch {
    // The original invocation retains any unresolved writer after this return.
    return { unavailable: true }
  }
}

/** The original invocation is the only owner that can submit this handed-off reply. */
export function createRuntimeSettleReply<P extends PlannedSemantics, R>(input: {
  readonly calls: CallContainerStore<P, R>
  readonly sessions: RuntimeSessionAccess
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly reservationWaitPolicy: ReservationWaitPolicy
}): (request: SettleReplyInput) => Promise<SettleReplyResult> {
  return async request => {
    if (
      !isServiceDisposition(request.disposition) ||
      typeof request.session !== 'string' ||
      request.session.length === 0 ||
      typeof request.callId !== 'string' ||
      request.callId.length === 0
    )
      return { invalidInput: { reason: 'malformed' } }
    const admitted = await input.calls.waitReserve(request, {
      policy: input.reservationWaitPolicy,
      scheduler: input.scheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in admitted) return { unavailable: true }
    const { reservation } = admitted
    try {
      const container = input.calls.find(request)
      if (container === undefined) return await recognizeSettledReply(request, input)
      const view = container.view()
      if (view.operation.phase !== 'reply_pending' || view.invocation === undefined) {
        if (view.operation.phase === 'ready') return await recognizeSettledReply(request, input)
        return { unavailable: true }
      }
      reservation.publish({ phase: 'settling' })
      const result = await settlePendingReply({
        request,
        pending: view.operation.pending,
        invocation: view.invocation,
      })
      if ('callId' in result || 'alreadyEnded' in result) {
        reservation.publish({ phase: 'ready' })
        // Durable success does not depend on whether optional resource cleanup completes now.
        const stopped = await container.close()
        if ('released' in stopped && stopped.released === true) input.calls.remove(reservation)
      } else {
        reservation.publish(view.operation)
      }
      return result
    } catch {
      return { unavailable: true }
    } finally {
      reservation.release()
    }
  }
}

async function recognizeSettledReply(
  request: SettleReplyInput,
  input: {
    readonly sessions: RuntimeSessionAccess
    readonly contention: SettlementContention
  },
): Promise<SettleReplyResult> {
  try {
    // S-49 repeats only read an authoritative completed batch. They neither stop
    // the session nor acquire the S-33 authority to reconstruct missing results.
    const bound = await input.sessions.bind(request.session)
    if ('failure' in bound) return { unavailable: true }
    const { log, selection } = bound.binding
    if (
      log.session !== request.session ||
      selection.binding.session !== request.session ||
      log.log !== selection.binding.log ||
      log.generation !== selection.binding.generation ||
      !tenantIdEquals(log.tenant, selection.binding.tenant)
    )
      return { unavailable: true }
    return await readSettledReply(request, log, selection.owner, input.contention)
  } catch {
    return { unavailable: true }
  }
}

async function readSettledReply(
  request: SettleReplyInput,
  log: SettlementLogBinding,
  owner: SettlementOwner,
  contention: SettlementContention,
): Promise<SettleReplyResult> {
  if (log.session !== request.session) return { unavailable: true }
  if (
    owner.admission() !== 'open' ||
    'unknown' in owner.opened() ||
    owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const admitted = owner.acquire(contention.limits.concurrent)
  if ('unavailable' in admitted) return { unavailable: true }
  const tasks: SettlementTask<unknown>[] = []
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = admitted.registration.start(kind, operation)
      tasks.push(task)
      return task
    },
    release: admitted.registration.release,
  }
  try {
    const read = await readSettlementPrefix({ binding: log, registration })
    if ('unavailable' in read) return { unavailable: true }
    const history = interpretCallHistory({ prefix: read.prefix, callId: request.callId })
    if ('absent' in history) return { callNotFound: true }
    if (!('known' in history)) return { unavailable: true }
    const response = history.known.dispatches.at(-1)?.response?.projection
    if (response === undefined) {
      const phase = history.known.phase
      return phase === null ? { unavailable: true } : { wrongPhase: { phase } }
    }
    if (!modelLogJsonEqual(response.replyDisposition, request.disposition))
      return { alreadyEnded: true }
    if (
      response.outcome !== 'interrupted' &&
      response.outcome !== 'complete' &&
      response.outcome !== 'truncated'
    )
      return { unavailable: true }
    return {
      callId: request.callId,
      state: response.outcome === 'interrupted' ? 'interrupted' : 'complete',
    }
  } finally {
    await Promise.all(tasks.map(task => task.stopped))
    admitted.registration.release()
  }
}

/** S-33 recovery owns every entered scope until its original work and full-prefix read are settled. */
export function createRuntimeReconcile(input: {
  readonly recovery: RuntimeRecoveryAccess
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly now: () => string
  readonly diagnostic: (event: SettlementDiagnostic) => void
}): {
  readonly reconcile: (request: ReconcileInput) => Promise<ReconcileResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
} {
  const entries = new Map<ReconcileInput['session'], RecoveryEntry>()
  let closed = false
  let closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined

  async function releaseRead(entry: RecoveryEntry, owned: RecoveryRead): Promise<boolean> {
    const tasks = [...owned.tasks]
    for (const task of tasks) {
      try {
        task.requestStop()
      } catch {
        // Actual stopped remains authoritative.
      }
    }
    const stopped = await Promise.allSettled(tasks.map(task => task.stopped))
    if (stopped.some(result => result.status === 'rejected')) return false
    try {
      owned.registration.release()
      entry.reads.delete(owned)
      return true
    } catch {
      return false
    }
  }

  async function releaseEntryOnce(entry: RecoveryEntry, finalize: boolean): Promise<boolean> {
    if (entry.entered !== undefined && entry.scope === undefined) {
      try {
        const entered = await entry.entered
        if ('scope' in entered) entry.scope = entered.scope
      } catch {
        entries.delete(entry.session)
        return true
      }
    }
    const scope = entry.scope
    if (scope === undefined) {
      entries.delete(entry.session)
      return true
    }
    let safe = true
    for (const owned of [...entry.reads]) {
      if (!(await releaseRead(entry, owned))) safe = false
    }
    const control = await entry.unknownControl.close({
      concurrent: input.contention.limits.concurrent,
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
    })
    if ('unavailable' in control) safe = false
    if (safe && entry.pendingControl.size !== 0) {
      const read = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in read) safe = false
      else {
        for (const callId of entry.pendingControl) {
          const history = interpretCallHistory({ prefix: read.prefix, callId })
          if (!('known' in history) || history.known.intent === null) safe = false
          else if (
            history.known.ending === null ||
            (history.known.ending.ending === 'interrupted' &&
              history.known.ending.initiator === history.known.intent.initiator)
          )
            entry.pendingControl.delete(callId)
          else safe = false
        }
      }
    }
    for (const settlement of [...entry.settlements]) {
      try {
        settlement.task?.requestStop()
        if (settlement.task !== undefined) await settlement.task.stopped
        await settlement.coordinator.close()
      } catch {
        safe = false
        continue
      }
      const read = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in read) {
        safe = false
        continue
      }
      const history = interpretCallHistory({ prefix: read.prefix, callId: settlement.target.call })
      const last = 'known' in history ? history.known.dispatches.at(-1) : undefined
      if (
        last === undefined ||
        !modelLogJsonEqual(last.record.dispatch, settlement.target.dispatch) ||
        last.record.response !== settlement.target.response
      ) {
        safe = false
        continue
      }
      // The original writer has stopped. Either the complete original batch or its
      // authoritative absence ends this physical responsibility; absence is not success.
      entry.settlements.delete(settlement)
    }
    if (!safe || entry.reads.size !== 0 || entry.settlements.size !== 0) return false
    if (!finalize) return true
    entry.exitAttempted = true
    try {
      await scope.close()
      entries.delete(entry.session)
      return true
    } catch {
      return false
    }
  }

  function releaseEntry(entry: RecoveryEntry, finalize: boolean): Promise<boolean> {
    if (entry.releasing !== undefined) {
      if (entry.releasing.finalize === finalize) return entry.releasing.promise
      return entry.releasing.promise.then(() => releaseEntry(entry, finalize))
    }
    const attempt = releaseEntryOnce(entry, finalize)
    entry.releasing = { finalize, promise: attempt }
    const finish = () => {
      if (entry.releasing?.promise === attempt) entry.releasing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async function reconcile(request: ReconcileInput): Promise<ReconcileResult> {
    if (typeof request.session !== 'string' || request.session.length === 0)
      return { invalidInput: { reason: 'malformed' } }
    if (closed) return { unavailable: true }
    const previous = entries.get(request.session)
    let entry: RecoveryEntry
    if (previous !== undefined) {
      if (previous.active !== undefined) return { unavailable: true }
      const ready = await releaseEntry(previous, previous.exitAttempted)
      if (!ready) return { unavailable: true }
      if (closed) return { unavailable: true }
      if (previous.exitAttempted) {
        if (entries.has(request.session)) return { unavailable: true }
      } else if (previous.active !== undefined || entries.get(request.session) !== previous) {
        return { unavailable: true }
      }
    }
    entry =
      previous !== undefined && entries.get(request.session) === previous
        ? previous
        : {
            session: request.session,
            reads: new Set(),
            settlements: new Set(),
            unknownControl: new UnknownAppendTracker(),
            pendingControl: new Set(),
            controlTasks: new Set(),
            active: undefined,
            releasing: undefined,
            exitAttempted: false,
          }
    if (entries.get(request.session) !== entry) entries.set(request.session, entry)
    const entering = entry.entered ?? Promise.resolve().then(() => input.recovery.enter(request))
    entry.entered = entering
    const active = (async (): Promise<ReconcileResult> => {
      try {
        const entered = await entering
        if ('unavailable' in entered) return { unavailable: true }
        entry.scope = entered.scope
        if (closed) return { unavailable: true }
        const result = await readRecoveredCalls(request, entry, input, () => closed)
        if (closed) return { unavailable: true }
        if ('unavailable' in result) return result
        return (await releaseEntry(entry, true)) ? result : { unavailable: true }
      } catch {
        return { unavailable: true }
      }
    })()
    entry.active = active
    const result = await active
    if (entry.active === active) entry.active = undefined
    return result
  }

  function close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (closing !== undefined) return closing
    closed = true
    const attempt = (async () => {
      for (const entry of entries.values()) {
        for (const read of entry.reads)
          for (const task of read.tasks) {
            try {
              task.requestStop()
            } catch {
              // Await stopped below.
            }
          }
        for (const settlement of entry.settlements) {
          try {
            settlement.task?.requestStop()
          } catch {
            // Actual stopped remains authoritative.
          }
        }
        for (const task of entry.controlTasks) {
          try {
            task.requestStop()
          } catch {
            // Actual stopped remains authoritative.
          }
        }
      }
      // A held task keeps its own scope, but does not prevent an independent
      // session's stopped scope from leaving recovery admission.
      const active = [...entries.values()].some(entry => entry.active !== undefined)
      const outcomes = await Promise.allSettled(
        [...entries.values()]
          .filter(entry => entry.active === undefined)
          .map(entry => releaseEntry(entry, true)),
      )
      return !active && outcomes.every(outcome => outcome.status === 'fulfilled' && outcome.value)
        ? ({ released: true } as const)
        : ({ unavailable: true } as const)
    })()
    closing = attempt
    const finish = () => {
      if (closing === attempt) closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  return { reconcile, close }
}

async function readRecoveredCalls(
  request: ReconcileInput,
  entry: RecoveryEntry,
  input: {
    readonly contention: SettlementContention
    readonly scheduler: SettlementScheduler
    readonly now: () => string
    readonly diagnostic: (event: SettlementDiagnostic) => void
  },
  closed: () => boolean,
): Promise<ReconcileResult> {
  const scope = entry.scope
  if (scope === undefined || closed()) return { unavailable: true }
  const binding = scope.binding.log
  if (
    binding.session !== request.session ||
    scope.owner.admission() !== 'open' ||
    'unknown' in scope.owner.opened() ||
    scope.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const firstRead = await readRecoveryPrefix(entry, input.contention)
  if ('unavailable' in firstRead) return { unavailable: true }
  const inspected = inspectCurrentModelLogPrefix({
    session: binding.session,
    tenant: binding.tenant,
    prefix: firstRead.prefix,
  })
  if (!('ok' in inspected)) return { unavailable: true }
  const callIds = new Set<string>()
  for (const item of inspected.ok) {
    const record = item.captured.record
    if (record !== null && 'call' in record) callIds.add(record.call)
    if (item.captured.response !== null) callIds.add(item.captured.response.call.callId)
  }
  const calls: Extract<ReconcileResult, { readonly calls: unknown }>['calls'][number][] = []
  for (const callId of callIds) {
    if (closed()) return { unavailable: true }
    const read = await readRecoveryPrefix(entry, input.contention)
    if ('unavailable' in read) return { unavailable: true }
    const rowInspected = inspectCurrentModelLogPrefix({
      session: binding.session,
      tenant: binding.tenant,
      prefix: read.prefix,
    })
    if (!('ok' in rowInspected)) return { unavailable: true }
    const history = interpretCallHistory({ prefix: read.prefix, callId })
    if (!('known' in history)) return { unavailable: true }
    const previous = history.known.dispatches.slice(0, -1)
    if (previous.some(item => item.response === null)) return { unavailable: true }
    const last = history.known.dispatches.at(-1)
    if (last === undefined && history.known.intent !== null && history.known.ending === null) {
      if (closed()) return { unavailable: true }
      const appended = await appendControlRecord({
        binding,
        owner: scope.owner,
        concurrent: input.contention.limits.concurrent,
        record: {
          kind: 'model_call_ended',
          call: callId,
          ending: 'interrupted',
          initiator: history.known.intent.initiator,
        },
        retainUnknown(registration, task) {
          entry.pendingControl.add(callId)
          entry.unknownControl.keep(
            { session: request.session, callId },
            binding,
            scope.owner,
            registration,
            task,
          )
        },
        trackTask(task) {
          entry.controlTasks.add(task)
          if (closed()) {
            try {
              task.requestStop()
            } catch {
              // The original task remains tracked until actual stop.
            }
          }
          return () => entry.controlTasks.delete(task)
        },
      })
      if ('unavailable' in appended) return { unavailable: true }
      const reread = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in reread) return { unavailable: true }
      const after = interpretCallHistory({ prefix: reread.prefix, callId })
      if (!('known' in after) || after.known.phase !== 'interrupted') return { unavailable: true }
      calls.push({ callId, state: 'interrupted' })
      continue
    }
    if (last !== undefined && last.response === null) {
      const target = {
        call: callId,
        dispatch: last.record.dispatch,
        response: last.record.response,
      }
      const association = scope.originalInvocation({ session: request.session, callId }, target)
      if ('unavailable' in association) return { unavailable: true }
      const observed = 'absent' in association ? null : association.original.observedFacts(target)
      if (observed !== null && 'unavailable' in observed) return { unavailable: true }
      const firstTokenAt =
        last.opened === null
          ? null
          : rowInspected.ok.find(item => modelLogJsonEqual(item.entry, last.opened))?.captured
              .record
      if (firstTokenAt !== null && firstTokenAt?.kind !== 'model_call_opened')
        return { unavailable: true }
      const candidate = constructAnchoredInterruption({
        dispatched: last.record,
        observed: observed === null ? null : observed.facts,
        firstTokenAt: firstTokenAt === null ? null : firstTokenAt.firstTokenAt,
        endedAt: input.now(),
        initiator: history.known.intent?.initiator ?? 'runtime_lost',
      })
      if ('rejected' in candidate) return { unavailable: true }
      const coordinator = createSettlementCoordinator({
        binding,
        owner: scope.owner,
        settlementContention: input.contention,
        settlementScheduler: input.scheduler,
        diagnostic: input.diagnostic,
      })
      const held: RecoverySettlement = { coordinator, target, task: undefined }
      entry.settlements.add(held)
      try {
        if (closed()) return { unavailable: true }
        const task = coordinator.settle({
          target,
          current: { messageId: null, disposition: null },
          response: candidate.response,
        })
        held.task = task
        const settled = await task.completion
        await task.stopped
        if (!('settled' in settled)) return { unavailable: true }
      } catch {
        return { unavailable: true }
      }
      // The entry retains the original coordinator until a stopped writer and full
      // same-binding prefix determine the whole batch or its absence.
      const reread = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in reread) return { unavailable: true }
      const after = interpretCallHistory({ prefix: reread.prefix, callId })
      if (!('known' in after)) return { unavailable: true }
      const state = after.known.phase
      if (!recoveredState(state)) return { unavailable: true }
      calls.push({ callId, state })
      continue
    }
    const state = history.known.phase
    if (!recoveredState(state)) return { unavailable: true }
    calls.push({ callId, state })
  }
  return { calls: Object.freeze(calls) }
}

function recoveredState(
  state: DispatchGuardPhase | null,
): state is Extract<ReconcileResult, { readonly calls: unknown }>['calls'][number]['state'] {
  return (
    state === 'resumable' ||
    state === 'awaiting_decision' ||
    state === 'interrupted' ||
    state === 'complete' ||
    state === 'handed_up'
  )
}

async function readRecoveryPrefix(
  entry: RecoveryEntry,
  contention: SettlementContention,
): Promise<{ readonly prefix: SettlementPrefix } | { readonly unavailable: true }> {
  const scope = entry.scope
  if (scope === undefined) return { unavailable: true }
  if (
    scope.owner.admission() !== 'open' ||
    'unknown' in scope.owner.opened() ||
    scope.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const admitted = scope.owner.acquire(contention.limits.concurrent)
  if ('unavailable' in admitted) return { unavailable: true }
  const owned: RecoveryRead = { registration: admitted.registration, tasks: new Set() }
  entry.reads.add(owned)
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = admitted.registration.start(kind, operation)
      owned.tasks.add(task)
      return task
    },
    release: admitted.registration.release,
  }
  let read: Awaited<ReturnType<typeof readSettlementPrefix>>
  try {
    read = await readSettlementPrefix({ binding: scope.binding.log, registration })
  } catch {
    read = { unavailable: true, reason: 'log' }
  }
  for (const task of owned.tasks) {
    try {
      task.requestStop()
    } catch {
      // Actual stopped is checked below.
    }
  }
  const stopped = await Promise.allSettled([...owned.tasks].map(task => task.stopped))
  if (stopped.some(result => result.status === 'rejected')) return { unavailable: true }
  try {
    admitted.registration.release()
    entry.reads.delete(owned)
  } catch {
    return { unavailable: true }
  }
  return 'prefix' in read ? read : { unavailable: true }
}
