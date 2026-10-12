import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { type JsonNumber } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  CallKey,
  DispatchGuardPhase,
  ReconcileInput,
  ReconcileResult,
  RuntimeRecoveryAccess,
  RuntimeRecoveryScope,
  RuntimeSessionAccess,
  SessionModelReconciler,
  SessionModelRecoveryInput,
  SessionRuntimeBinding,
  SettlementContention,
  SettlementCoordinator,
  SettlementLogBinding,
  SettlementOwner,
  SettlementPrefix,
  SettlementRegistration,
  SettlementRequest,
  SettlementTask,
  SettleReplyInput,
  SettleReplyResult,
} from '@omne-harness-lite/model-request-runtime'
import {
  acknowledgedFactsFromHistory,
  constructAnchoredInterruption,
  drainDiagnosticThenable,
  inspectSettlementPrefixEntries,
  interpretCallHistory,
  modelLogJsonEqual,
  operationDiagnostics,
  readSettlementPrefix,
  rejectAcknowledgedHistory,
  requestStopAndWait,
  UnknownAppendTracker,
  type ModelLogSettlementTarget,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendResult } from '@omne-harness-lite/session-log'
import { randomUUID } from 'node:crypto'
import { appendControlRecord } from './model-control-append.ts'

interface RecoveryRead {
  readonly registration: SettlementRegistration
  readonly tasks: Set<SettlementTask<unknown>>
}

interface RecoverySettlement {
  readonly coordinator: SettlementCoordinator
  task: ReturnType<SettlementCoordinator['settle']> | undefined
  readonly target: ModelLogSettlementTarget
}

interface RecoveryEntry {
  readonly session: ReconcileInput['session']
  readonly reads: Set<RecoveryRead>
  readonly settlements: Set<RecoverySettlement>
  readonly unknownControl: UnknownAppendTracker
  readonly pendingControl: Set<CallKey['callId']>
  readonly controlTasks: Set<SettlementTask<AppendResult>>
  /**
   * S-86: a recovery batch whose append may have been written. A later reconcile settles this
   * exact request again instead of constructing another interruption with a new end time.
   */
  readonly originals: Map<string, SettlementRequest>
  entered?: Promise<Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>>
  scope?: RuntimeRecoveryScope
  active: Promise<ReconcileResult> | undefined
  releasing: { readonly finalize: boolean; readonly promise: Promise<boolean> } | undefined
  exitAttempted: boolean
}

export async function recognizeSessionModelReply(
  request: SettleReplyInput,
  input: {
    readonly sessions: RuntimeSessionAccess
    readonly contention: SettlementContention
  },
  boundSession?: SessionRuntimeBinding,
): Promise<SettleReplyResult> {
  try {
    // S-49 repeats only read an authoritative completed batch. They neither stop
    // the session nor acquire the S-33 authority to reconstruct missing results.
    let session: SessionRuntimeBinding
    if (boundSession === undefined) {
      const bound = await input.sessions.bind(request.session)
      if ('failure' in bound) return { unavailable: true }
      session = bound.binding
    } else {
      session = boundSession
    }
    const { log, selection } = session
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
    const history = rejectAcknowledgedHistory(
      interpretCallHistory({ prefix: read.prefix, callId: request.callId }),
    )
    const classifySettledHistory = (): SettleReplyResult => {
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
    }
    return classifySettledHistory()
  } finally {
    await Promise.all(tasks.map(requestStopAndWait))
    admitted.registration.release()
  }
}

export function createSessionModelReconciler(
  input: SessionModelRecoveryInput,
): SessionModelReconciler {
  return buildRuntimeReconcile(input)
}

class RuntimeReconcileState {
  readonly entries = new Map<ReconcileInput['session'], RecoveryEntry>()
  closed = false
  closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined
}

function needsEnteredScope(
  entry: RecoveryEntry,
): entry is RecoveryEntry & { entered: NonNullable<RecoveryEntry['entered']> } {
  return entry.entered !== undefined && entry.scope === undefined
}

function retainEnteredScope(
  entry: RecoveryEntry,
  entered: Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>,
): void {
  if ('scope' in entered) entry.scope = entered.scope
}

function controlReleaseDecision(
  entry: RecoveryEntry,
  previousSafe: boolean,
  control: Awaited<ReturnType<UnknownAppendTracker['close']>>,
):
  | { readonly safe: false; readonly readPrefix: false }
  | { readonly safe: true; readonly readPrefix: boolean } {
  if ('unavailable' in control) return { safe: false, readPrefix: false }
  return previousSafe
    ? { safe: true, readPrefix: entry.pendingControl.size !== 0 }
    : { safe: false, readPrefix: false }
}

function recognizePendingControl(
  entry: RecoveryEntry,
  read: Awaited<ReturnType<typeof readRecoveryPrefix>>,
): boolean {
  if ('unavailable' in read) return false
  let recognized = true
  for (const callId of entry.pendingControl) {
    const history = interpretCallHistory({ prefix: read.prefix, callId })
    if (!('known' in history) || history.known.intent === null) recognized = false
    else if (
      history.known.ending === null ||
      (history.known.ending.ending === 'interrupted' &&
        history.known.ending.initiator === history.known.intent.initiator)
    )
      entry.pendingControl.delete(callId)
    else recognized = false
  }
  return recognized
}

function recognizeStoppedSettlement(
  entry: RecoveryEntry,
  read: Awaited<ReturnType<typeof readRecoveryPrefix>>,
  settlement: RecoverySettlement,
  previousSafe: boolean,
): boolean {
  if ('unavailable' in read) return false
  const history = interpretCallHistory({ prefix: read.prefix, callId: settlement.target.call })
  const last = 'known' in history ? history.known.dispatches.at(-1) : undefined
  if (
    last === undefined ||
    !modelLogJsonEqual(last.record.dispatch, settlement.target.dispatch) ||
    last.record.response !== settlement.target.response
  )
    return false
  entry.settlements.delete(settlement)
  return previousSafe
}

function releaseExitResult(
  entry: RecoveryEntry,
  safe: boolean,
  finalize: boolean,
): boolean | undefined {
  if (!safe || entry.reads.size !== 0 || entry.settlements.size !== 0) return false
  if (!finalize) return true
  return undefined
}

function buildRuntimeReconcile(
  input: SessionModelRecoveryInput,
  physical: RuntimeReconcileState = new RuntimeReconcileState(),
): SessionModelReconciler {
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
    if (needsEnteredScope(entry)) {
      try {
        const entered = await entry.entered
        retainEnteredScope(entry, entered)
      } catch {
        physical.entries.delete(entry.session)
        return true
      }
    }
    const scope = entry.scope
    if (scope === undefined) {
      physical.entries.delete(entry.session)
      return true
    }
    let safe = true
    for (const owned of [...entry.reads]) {
      if (!(await releaseRead(entry, owned))) safe = false
    }
    const control = await entry.unknownControl.close()
    const decision = controlReleaseDecision(entry, safe, control)
    safe = decision.safe
    if (decision.readPrefix) {
      const read = await readRecoveryPrefix(entry, input.contention)
      safe = recognizePendingControl(entry, read)
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
      safe = recognizeStoppedSettlement(entry, read, settlement, safe)
    }
    const exit = releaseExitResult(entry, safe, finalize)
    if (exit !== undefined) return exit
    entry.exitAttempted = true
    try {
      await scope.close()
      physical.entries.delete(entry.session)
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
    const requestRejected = (): ReconcileResult | undefined => {
      if (typeof request.session !== 'string' || request.session.length === 0)
        return { invalidInput: { reason: 'malformed' } }
      if (physical.closed) return { unavailable: true }
      return undefined
    }
    const rejected = requestRejected()
    if (rejected !== undefined) return rejected
    try {
      const authorization = await input.recovery.authorize(request)
      if (!('authorized' in authorization) || physical.closed) return { unavailable: true }
    } catch {
      return { unavailable: true }
    }
    const previous = physical.entries.get(request.session)
    let entry: RecoveryEntry
    if (previous !== undefined) {
      if (previous.active !== undefined) return { unavailable: true }
      const ready = await releaseEntry(previous, previous.exitAttempted)
      const retainedEntryReusable = (): boolean => {
        if (!ready) return false
        if (physical.closed) return false
        if (previous.exitAttempted) {
          if (physical.entries.has(request.session)) return false
        } else if (
          previous.active !== undefined ||
          physical.entries.get(request.session) !== previous
        ) {
          return false
        }
        return true
      }
      if (!retainedEntryReusable()) return { unavailable: true }
    }
    const retainEntry = (): RecoveryEntry => {
      const retained: RecoveryEntry =
        previous !== undefined && physical.entries.get(request.session) === previous
          ? previous
          : {
              session: request.session,
              reads: new Set(),
              settlements: new Set(),
              unknownControl: new UnknownAppendTracker(),
              pendingControl: new Set(),
              controlTasks: new Set(),
              originals: new Map(),
              active: undefined,
              releasing: undefined,
              exitAttempted: false,
            }
      if (physical.entries.get(request.session) !== retained)
        physical.entries.set(request.session, retained)
      return retained
    }
    entry = retainEntry()
    const entering = entry.entered ?? Promise.resolve().then(() => input.recovery.enter(request))
    entry.entered = entering
    const recoverEnteredScope = async (): Promise<ReconcileResult> => {
      let observer: ReturnType<typeof operationDiagnostics> | undefined
      let terminalRecorded = false
      let diagnosticReportEnabled = true
      const reportDiagnosticFailure = (): void => {
        if (!diagnosticReportEnabled) return
        try {
          const result: unknown = input.onDiagnosticFailure?.()
          if (drainDiagnosticThenable(result)) diagnosticReportEnabled = false
        } catch {
          diagnosticReportEnabled = false
        }
      }
      try {
        const entered = await entering
        if ('unavailable' in entered) return { unavailable: true }
        entry.scope = entered.scope
        const observeRecoveryScope = (): void => {
          if (entered.scope.binding.log.session === request.session) {
            try {
              observer = operationDiagnostics(
                input.diagnosticCollector,
                entered.scope.binding.log.tenant,
                { executionId: randomUUID(), session: request.session },
                reportDiagnosticFailure,
              )
              observer.record({
                source: 'runtime',
                stage: 'recovery',
                outcome: 'started',
                facts: { kind: 'progress' },
              })
            } catch {
              reportDiagnosticFailure()
            }
          }
        }
        observeRecoveryScope()
        if (physical.closed) return { unavailable: true }
        const observeAnchor = (
          anchor: Parameters<Parameters<typeof readRecoveredCalls>[4]>[0],
        ): void => {
          let recovered: ReturnType<typeof operationDiagnostics> | undefined
          try {
            recovered = operationDiagnostics(
              input.diagnosticCollector,
              entered.scope.binding.log.tenant,
              {
                executionId: randomUUID(),
                session: request.session,
                call: anchor.call,
                dispatch: anchor.dispatch,
                response: anchor.response,
              },
              reportDiagnosticFailure,
            )
            for (const [kind, position] of [
              ['dispatched', anchor.dispatchedPosition],
              ['opened', anchor.openedPosition],
            ] as const) {
              if (position === undefined) continue
              recovered.record({
                source: 'runtime',
                stage: 'recovery',
                outcome: 'started',
                facts: {
                  kind: 'progress',
                  anchor: kind,
                  anchorId: ExactDecimal.from(position).toString(),
                },
              })
            }
          } catch {
            reportDiagnosticFailure()
          } finally {
            try {
              recovered?.close()
            } catch {
              reportDiagnosticFailure()
            }
          }
        }
        const result = await readRecoveredCalls(
          request,
          entry,
          input,
          () => physical.closed,
          observeAnchor,
        )
        if (physical.closed) return { unavailable: true }
        if ('unavailable' in result) {
          observer?.record({
            source: 'runtime',
            stage: 'recovery',
            outcome: 'unavailable',
            facts: { kind: 'progress' },
          })
          terminalRecorded = true
          return result
        }
        const released = await releaseEntry(entry, true)
        const releasedRecoveryResult = (): ReconcileResult => {
          observer?.record({
            source: 'runtime',
            stage: 'recovery',
            outcome: released ? 'completed' : 'unavailable',
            facts: { kind: 'progress', ...(released ? { retry: 'without_resend' } : {}) },
          })
          terminalRecorded = true
          return released ? result : { unavailable: true }
        }
        return releasedRecoveryResult()
      } catch {
        observer?.record({
          source: 'runtime',
          stage: 'recovery',
          outcome: 'unavailable',
          facts: { kind: 'progress' },
        })
        terminalRecorded = true
        return { unavailable: true }
      } finally {
        if (observer && !terminalRecorded)
          observer.record({
            source: 'runtime',
            stage: 'recovery',
            outcome: 'unavailable',
            facts: { kind: 'progress' },
          })
        try {
          observer?.close()
        } catch {
          reportDiagnosticFailure()
        }
      }
    }
    const active = recoverEnteredScope()
    entry.active = active
    const result = await active
    if (entry.active === active) entry.active = undefined
    return result
  }

  function close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (physical.closing !== undefined) return physical.closing
    physical.closed = true
    const attempt = (async () => {
      const requestEntryStops = (): void => {
        for (const entry of physical.entries.values()) {
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
      }
      requestEntryStops()
      const active = [...physical.entries.values()].some(entry => entry.active !== undefined)
      const outcomes = await Promise.allSettled(
        [...physical.entries.values()]
          .filter(entry => entry.active === undefined)
          .map(entry => releaseEntry(entry, true)),
      )
      return !active && outcomes.every(outcome => outcome.status === 'fulfilled' && outcome.value)
        ? ({ released: true } as const)
        : ({ unavailable: true } as const)
    })()
    physical.closing = attempt
    const finish = () => {
      if (physical.closing === attempt) physical.closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  return Object.freeze({
    reconcile,
    close,
    project: (next: SessionModelRecoveryInput) => buildRuntimeReconcile(next, physical),
  })
}

async function readRecoveredCalls(
  request: ReconcileInput,
  entry: RecoveryEntry,
  input: Pick<
    SessionModelRecoveryInput,
    | 'contention'
    | 'scheduler'
    | 'now'
    | 'diagnostic'
    | 'run'
    | 'custody'
    | 'settlementWork'
    | 'settlementFactory'
    | 'readCall'
  >,
  closed: () => boolean,
  onAnchor: (anchor: {
    readonly call: CallKey['callId']
    readonly dispatch: ModelLogSettlementTarget['dispatch']
    readonly response: ModelLogSettlementTarget['response']
    readonly dispatchedPosition?: JsonNumber
    readonly openedPosition?: JsonNumber
  }) => void,
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
  const inspected = inspectSettlementPrefixEntries({ prefix: firstRead.prefix })
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
    const rowInspected = inspectSettlementPrefixEntries({
      prefix: read.prefix,
      selector: { kind: 'call', call: callId },
    })
    if (!('ok' in rowInspected)) return { unavailable: true }
    const raw = interpretCallHistory({ prefix: read.prefix, callId })
    if ('known' in raw && raw.known.acknowledged !== null) {
      // RT12 S-100: an acknowledged call is reported by its S-97 branch; released content never
      // makes the whole session unavailable, and no ACK or disposition is triggered here.
      const facts = acknowledgedFactsFromHistory({ session: request.session, callId }, raw.known, {
        generation: binding.generation,
        progress: read.prefix.tail,
      })
      if (facts === undefined) return { unavailable: true }
      const small = await input.custody.view(binding, facts)
      // A contradicted ACK record is a broken source for this call, never a small answer.
      if ('unavailable' in small) return { unavailable: true }
      calls.push({ callId, acknowledged: small })
      if (facts.record.target.kind === 'response' && input.settlementWork !== undefined)
        await input.settlementFactory.recoverWork({
          key: { session: request.session, callId },
          response: facts.record.target.response,
          prefix: read.prefix,
          scope,
          binding,
          work: input.settlementWork,
          custody: input.custody,
          diagnostic: input.diagnostic,
        })
      continue
    }
    const history = rejectAcknowledgedHistory(raw)
    if (!('known' in history)) return { unavailable: true }
    const previous = history.known.dispatches.slice(0, -1)
    if (previous.some(item => item.response === null)) return { unavailable: true }
    const last = history.known.dispatches.at(-1)
    if (last === undefined && history.known.intent !== null && history.known.ending === null) {
      const intentEntry = rowInspected.ok.find(
        item =>
          item.captured.record?.kind === 'model_call_interrupt_intent' &&
          item.captured.record.call === callId,
      )?.entry
      if (
        intentEntry === undefined ||
        (intentEntry.run === undefined) !== (request.attempt === undefined)
      )
        return { unavailable: true }
      if (closed()) return { unavailable: true }
      const appended = await appendControlRecord({
        binding,
        owner: scope.owner,
        concurrent: input.contention.limits.concurrent,
        ...(intentEntry.run === undefined
          ? {}
          : { run: intentEntry.run, attempt: request.attempt }),
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
            (prefix, callId) => interpretCallHistory({ prefix, callId }),
            input.readCall,
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
      const after = rejectAcknowledgedHistory(
        interpretCallHistory({ prefix: reread.prefix, callId }),
      )
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
      const dispatchedPosition = rowInspected.ok.find(item =>
        modelLogJsonEqual(item.captured.record, last.record),
      )?.entry.position
      const openedPosition =
        last.opened === null
          ? undefined
          : rowInspected.ok.find(item => modelLogJsonEqual(item.entry, last.opened))?.entry.position
      onAnchor({
        call: callId,
        dispatch: last.record.dispatch,
        response: last.record.response,
        ...(dispatchedPosition === undefined ? {} : { dispatchedPosition }),
        ...(openedPosition === undefined ? {} : { openedPosition }),
      })
      const originalKey = JSON.stringify([
        target.call,
        ExactDecimal.from(target.dispatch).toString(),
        target.response,
      ])
      let original = entry.originals.get(originalKey)
      if (original === undefined) {
        const originalFacts =
          observed === null
            ? ({ observed: null, sendState: 'send_unknown' } as const)
            : ({ observed: observed.facts } as const)
        const candidate = constructAnchoredInterruption({
          dispatched: last.record,
          ...(last.dispatched.run === undefined
            ? {}
            : { run: last.dispatched.run, attempt: last.dispatched.attempt }),
          ...originalFacts,
          firstTokenAt: firstTokenAt === null ? null : firstTokenAt.firstTokenAt,
          endedAt: await input.now(),
          initiator: history.known.intent?.initiator ?? 'runtime_lost',
        })
        if ('rejected' in candidate) return { unavailable: true }
        original = {
          target,
          current: { messageId: null, disposition: null },
          response: candidate.response,
        }
      }
      const coordinator = input.settlementFactory.create({
        binding,
        owner: scope.owner,
        ...(input.run === undefined ? {} : { run: input.run }),
        settlementContention: input.contention,
        settlementScheduler: input.scheduler,
        diagnostic: input.diagnostic,
      })
      const held: RecoverySettlement = { coordinator, target, task: undefined }
      entry.settlements.add(held)
      try {
        if (closed()) return { unavailable: true }
        const task = coordinator.settle(original)
        held.task = task
        const settled = await task.completion
        if ('unavailable' in settled && settled.reason === 'write_unknown')
          entry.originals.set(originalKey, original)
        await requestStopAndWait(task)
        if (!('settled' in settled)) return { unavailable: true }
        entry.originals.delete(originalKey)
      } catch {
        return { unavailable: true }
      }
      // The entry retains the original coordinator until a stopped writer and full
      // same-binding prefix determine the whole batch or its absence.
      const reread = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in reread) return { unavailable: true }
      const after = rejectAcknowledgedHistory(
        interpretCallHistory({ prefix: reread.prefix, callId }),
      )
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
): state is NonNullable<
  Extract<ReconcileResult, { readonly calls: unknown }>['calls'][number]['state']
> {
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
