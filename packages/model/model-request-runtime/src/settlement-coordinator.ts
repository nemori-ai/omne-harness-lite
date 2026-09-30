import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  LosslessNumber,
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  captureModelLogValue,
  inspectSettlementMembers,
  prepareModelLogEntry,
  type ModelLogSettlementCurrent,
  type ModelLogSettlementTarget,
} from './log-codec.ts'
import type {
  AppendCondition,
  AppendResult,
  OwnedLogEntry,
} from '@omne-harness-lite/session-log-jsonl'
import {
  readSettlementPrefix,
  interpretSettlementPrefix,
  interpretRunAtPrefix,
  settlementGenerationCurrent,
} from './settlement-prefix.ts'
import type {
  SettlementContention,
  SettlementCoordinator,
  SettlementCoordinatorInput,
  SettlementHandle,
  SettlementRegistration,
  SettlementRequest,
  SettlementResult,
  SettlementScheduler,
  SettlementTask,
  SettlementTaskKind,
  SettlementComplete,
  SettlementUnavailableReason,
} from './settlement-types.ts'

import { settlementAppendReceipt } from './settlement-receipt.ts'

const unavailable = (reason: SettlementUnavailableReason): SettlementResult =>
  Object.freeze({ unavailable: true, reason })
interface RetainedUnknown {
  readonly handle: SettlementHandle
  readonly registration: SettlementRegistration
  readonly writes: ReadonlySet<SettlementTask<AppendResult>>
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
  /** Exact members and append condition fixed before the first possible write. */
  readonly batch: readonly OwnedLogEntry[]
  readonly condition: AppendCondition
  readonly reads: Set<SettlementTask<unknown>>
  resolving: Promise<RetainedResolution> | undefined
  stopUnconfirmed: boolean
}
type RetainedResolution =
  | { readonly settled: SettlementComplete }
  | { readonly absent: true }
  | { readonly unavailable: true }
function stopAll(tasks: Iterable<SettlementTask<unknown>>): void {
  for (const task of tasks) {
    try {
      task.requestStop()
    } catch {
      // The actual stopped receipt remains authoritative.
    }
  }
}
function failedHandle(reason: SettlementUnavailableReason): SettlementHandle {
  return Object.freeze({
    completion: Promise.resolve(unavailable(reason)),
    requestStop() {},
    stopped: Promise.resolve(),
  })
}
function nonnegative(value: unknown): value is JsonNumber {
  return isJsonNumber(value) && ExactDecimal.from(value).compare(ExactDecimal.from(0)) >= 0
}
function negative(value: JsonNumber): JsonNumber {
  const source = ExactDecimal.from(value).toString()
  return new LosslessNumber(source.startsWith('-') ? source.slice(1) : `-${source}`)
}
function counter(value: bigint): JsonNumber {
  return new LosslessNumber(String(value))
}
function bytes(value: unknown): number {
  return Buffer.byteLength(writeJsonLossless(value), 'utf8')
}
function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function capturePolicy(
  input: SettlementCoordinatorInput,
): { readonly policy: SettlementContention; readonly scheduler: SettlementScheduler } | null {
  const raw = input.settlementContention,
    scheduler = input.settlementScheduler
  if (raw === undefined || scheduler === undefined) return null
  const copied = copyJsonValue(raw.limits)
  if ('failed' in copied || !object(copied.ok))
    throw new TypeError('Invalid settlementContention limits')
  const limits = copied.ok
  if (
    Object.keys(limits).length !== 4 ||
    !isNonNegativeJsonInteger(limits.submissions) ||
    !nonnegative(limits.elapsedMs) ||
    !isNonNegativeJsonInteger(limits.retainedBytes) ||
    !isNonNegativeJsonInteger(limits.concurrent) ||
    ExactDecimal.from(limits.concurrent).compare(ExactDecimal.from(0)) === 0 ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    typeof raw.decide !== 'function' ||
    typeof scheduler.nowMonotonicMs !== 'function' ||
    typeof scheduler.wait !== 'function'
  )
    throw new TypeError('Invalid settlement policy/scheduler')
  return {
    policy: Object.freeze({
      name: raw.name,
      limits: Object.freeze({
        submissions: limits.submissions,
        elapsedMs: limits.elapsedMs,
        retainedBytes: limits.retainedBytes,
        concurrent: limits.concurrent,
      }),
      decide: raw.decide,
    }),
    scheduler: Object.freeze({ nowMonotonicMs: scheduler.nowMonotonicMs, wait: scheduler.wait }),
  }
}
/** One durable settlement algorithm, shared by runtime and external persisted-reply owners. */
export function createSettlementCoordinator(
  input: SettlementCoordinatorInput,
): SettlementCoordinator {
  const binding = Object.freeze({ ...input.binding })
  const owner = input.owner
  if (
    typeof owner.name !== 'string' ||
    !owner.name.trim() ||
    typeof owner.admission !== 'function' ||
    typeof owner.acquire !== 'function' ||
    typeof owner.opened !== 'function' ||
    typeof owner.unresolvedWrites !== 'function' ||
    typeof input.diagnostic !== 'function'
  )
    throw new TypeError('Invalid settlement owner/diagnostic')
  // Validate at construction, capture at each explicitly started progression.
  capturePolicy(input)
  let closed = false
  const live = new Set<SettlementHandle>()
  const unknownWrites = new Set<SettlementTask<AppendResult>>()
  /**
   * S-70.5/S-86: an original handle whose writer actually stopped with an unknown receipt. Its
   * registration, exact submitted batch and commit condition stay here until a same-source full
   * prefix recognizes the batch's business identity or proves it absent. Only then is exactly
   * this registration released; a later request never replaces it with a new batch.
   */
  const retainedUnknowns = new Set<RetainedUnknown>()
  /** One shared attempt per original handle; close and repeated settle do not race it. */
  function resolveRetained(entry: RetainedUnknown): Promise<RetainedResolution> {
    if (entry.resolving !== undefined) return entry.resolving
    const attempt = (async (): Promise<RetainedResolution> => {
      if (entry.stopUnconfirmed) return { unavailable: true }
      const reads = entry.reads
      let read: Awaited<ReturnType<typeof readSettlementPrefix>>
      try {
        read = await readSettlementPrefix({
          binding,
          registration: {
            start(kind, operation) {
              const task = entry.registration.start(kind, operation)
              reads.add(task)
              if (closed) task.requestStop()
              return task
            },
            release: entry.registration.release,
          },
        })
      } catch {
        read = { unavailable: true, reason: 'log' }
      }
      stopAll(reads)
      const readsStopped = await Promise.allSettled([...reads].map(task => task.stopped))
      reads.clear()
      if (readsStopped.some(result => result.status === 'rejected')) {
        // This registration now holds a read whose stop is unproven; it can never be released.
        entry.stopUnconfirmed = true
        return { unavailable: true }
      }
      if ('unavailable' in read) return { unavailable: true }
      const interpretation = interpretSettlementPrefix({
        prefix: read.prefix,
        target: entry.target,
        current: entry.current,
      })
      if ('unavailable' in interpretation) return { unavailable: true }
      const members = interpretation.facts.members
      // Every writer of this business identity shares its dedupe keys (S-70.1). A complete batch
      // therefore either is the original or permanently excludes it; either way it is decided.
      const decided: RetainedResolution | undefined =
        'completeMembers' in members
          ? { settled: members.completeMembers }
          : 'absent' in members
            ? { absent: true }
            : undefined
      if (decided === undefined) return { unavailable: true }
      try {
        entry.registration.release()
      } catch {
        return { unavailable: true }
      }
      retainedUnknowns.delete(entry)
      live.delete(entry.handle)
      for (const task of entry.writes) unknownWrites.delete(task)
      return decided
    })()
    entry.resolving = attempt
    const finish = () => {
      if (entry.resolving === attempt) entry.resolving = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }
  function sameTarget(left: ModelLogSettlementTarget, right: ModelLogSettlementTarget): boolean {
    return (
      left.call === right.call &&
      left.response === right.response &&
      ExactDecimal.from(left.dispatch).compare(ExactDecimal.from(right.dispatch)) === 0
    )
  }
  /** A repeated settle for a retained target resolves that original handle and writes nothing. */
  function resolutionHandle(entry: RetainedUnknown, policyName: string): SettlementHandle {
    const emit = (kind: string) => {
      try {
        input.diagnostic({
          kind,
          tenant: binding.tenant,
          session: binding.session,
          call: entry.target.call,
          dispatch: entry.target.dispatch,
          response: entry.target.response,
          owner: owner.name,
          policy: policyName,
          submissions: 0,
          tailConflicts: 0,
        })
      } catch {
        /* diagnostic sink is never recovery authority */
      }
    }
    emit('settlement.unknown_recognition')
    const resolution = resolveRetained(entry)
    const completion = resolution.then((result): SettlementResult => {
      if ('settled' in result) {
        emit('settlement.unknown_recognized')
        return { settled: result.settled, origin: 'recognized' }
      }
      emit('absent' in result ? 'settlement.unknown_absent' : 'settlement.unknown_retained')
      // This attempt wrote nothing. After proven absence a later settle may submit again.
      return unavailable('write_unknown')
    })
    const stopped = resolution.then(() => {
      if (entry.stopUnconfirmed) throw new Error('Settlement recognition stop unconfirmed')
    })
    void stopped.catch(() => {})
    const handle: SettlementHandle = Object.freeze({
      completion,
      stopped,
      requestStop: () => stopAll(entry.reads),
    })
    live.add(handle)
    void stopped.then(
      () => live.delete(handle),
      () => undefined,
    )
    return handle
  }
  function settle(request: SettlementRequest): SettlementHandle {
    if (closed || owner.admission() !== 'open') return failedHandle('closed')
    const selected = capturePolicy(input)
    if (selected === null) return failedHandle('dependency')
    const { policy, scheduler } = selected
    const captured = captureModelLogValue({
      category: 'response',
      input: { kind: 'value', value: request.response },
    })
    const target = copyJsonValue(request.target),
      current = copyJsonValue(request.current)
    if (
      'invalidValue' in captured ||
      'failed' in target ||
      'failed' in current ||
      !object(target.ok) ||
      Object.keys(target.ok).length !== 3 ||
      (current.ok !== null && (!object(current.ok) || Object.keys(current.ok).length !== 2))
    )
      return failedHandle('candidate')
    // Candidate metadata cannot change while IO waits.
    const candidate = captured.ok
    const response = candidate.response
    if (
      response === null ||
      response.id !== request.target.response ||
      response.call.callId !== request.target.call
    )
      return failedHandle('candidate')
    const projection = response
    const stableTarget = Object.freeze({
      call: request.target.call,
      dispatch: request.target.dispatch,
      response: request.target.response,
    })
    const stableCurrent =
      request.current === null
        ? null
        : Object.freeze({
            messageId: request.current.messageId,
            disposition: request.current.disposition,
          })
    // Resolve the original retained handle instead of starting a competing writer for it.
    for (const entry of retainedUnknowns)
      if (sameTarget(entry.target, stableTarget)) return resolutionHandle(entry, policy.name)
    const grant = owner.acquire(policy.limits.concurrent)
    if ('unavailable' in grant) return failedHandle('concurrent')
    const acquired = grant.registration
    const tasks: SettlementTask<unknown>[] = []
    const ownUnknownWrites = new Set<SettlementTask<AppendResult>>()
    let originalBatch:
      { readonly batch: readonly OwnedLogEntry[]; readonly condition: AppendCondition } | undefined
    const controller = new AbortController()
    let submissions = 0n,
      conflicts = 0n,
      previousWait: JsonNumber = 0,
      retained = bytes(candidate.value)
    let initial: JsonNumber | undefined, last: JsonNumber | undefined
    const registration: SettlementRegistration = {
      start<T>(
        kind: SettlementTaskKind,
        operation: (signal: AbortSignal) => Promise<T>,
      ): SettlementTask<T> {
        const task = acquired.start(kind, operation)
        tasks.push(task)
        return task
      },
      release: acquired.release,
    }
    function stop() {
      controller.abort()
      for (const task of tasks) {
        try {
          task.requestStop()
        } catch {
          diagnostic('settlement.stop_request_failed')
        }
      }
    }
    function diagnostic(kind: string) {
      try {
        input.diagnostic({
          kind,
          tenant: binding.tenant,
          session: binding.session,
          call: stableTarget.call,
          dispatch: stableTarget.dispatch,
          response: stableTarget.response,
          owner: owner.name,
          policy: policy.name,
          submissions: counter(submissions),
          tailConflicts: counter(conflicts),
        })
      } catch {
        /* diagnostic sink is never recovery authority */
      }
    }
    function elapsed(): JsonNumber {
      const now = scheduler.nowMonotonicMs()
      if (
        !nonnegative(now) ||
        (last !== undefined && ExactDecimal.from(now).compare(ExactDecimal.from(last)) < 0)
      )
        throw new Error('Invalid settlement monotonic time')
      initial ??= now
      last = now
      return ExactDecimal.from(now)
        .add(ExactDecimal.from(negative(initial)))
        .toJsonNumber()
    }
    function guard(append = false): SettlementUnavailableReason | null {
      if (closed || owner.admission() !== 'open') return 'closed'
      if (controller.signal.aborted) return 'cancelled'
      if (!settlementGenerationCurrent(binding)) return 'generation'
      if ('unknown' in owner.opened()) return 'opened_unknown'
      if (append && (unknownWrites.size !== 0 || owner.unresolvedWrites().length !== 0))
        return 'write_unknown'
      try {
        if (
          ExactDecimal.from(elapsed()).compare(ExactDecimal.from(policy.limits.elapsedMs)) >= 0 ||
          ExactDecimal.from(retained).compare(ExactDecimal.from(policy.limits.retainedBytes)) > 0 ||
          (append &&
            ExactDecimal.from(counter(submissions)).compare(
              ExactDecimal.from(policy.limits.submissions),
            ) >= 0)
        )
          return 'budget'
      } catch {
        return 'policy'
      }
      return null
    }
    async function decide(
      stage: 'initial' | 'tailChanged' | 'collision',
    ): Promise<SettlementUnavailableReason | null> {
      const denied = guard()
      if (denied !== null) return denied
      let decision: ReturnType<SettlementContention['decide']>
      try {
        decision = policy.decide(
          Object.freeze({
            stage,
            submissions: counter(submissions),
            tailConflicts: counter(conflicts),
            elapsedMs: elapsed(),
            retainedBytes: retained,
            previousWaitMs: previousWait,
          }),
        )
      } catch {
        return 'policy'
      }
      const copied = copyJsonValue(decision)
      if ('failed' in copied || !object(copied.ok)) return 'policy'
      const value = copied.ok
      if (Object.keys(value).length === 1 && value.stop === true) return 'policy'
      const proceed = value.proceed
      if (
        Object.keys(value).length !== 1 ||
        !object(proceed) ||
        Object.keys(proceed).length !== 1 ||
        !nonnegative(proceed.waitMs)
      )
        return 'policy'
      const waitMs = proceed.waitMs
      previousWait = waitMs
      if (ExactDecimal.from(waitMs).compare(ExactDecimal.from(0)) === 0) return guard()
      diagnostic('settlement.wait')
      try {
        const waiting = registration.start('wait', async signal => {
          const wait = scheduler.wait(waitMs, signal)
          try {
            return await wait.completion
          } finally {
            wait.requestStop()
            await wait.stopped
          }
        })
        const finished = await waiting.completion
        await waiting.stopped
        if (finished === 'cancelled') return 'cancelled'
        if (finished !== 'elapsed') return 'policy'
      } catch {
        return 'policy'
      }
      return guard()
    }
    async function advance(): Promise<SettlementResult> {
      diagnostic('settlement.enter')
      let stage: 'initial' | 'tailChanged' | 'collision' = 'initial'
      for (;;) {
        const denied = await decide(stage)
        if (denied !== null) return unavailable(denied)
        const beforeRead = guard()
        if (beforeRead !== null) return unavailable(beforeRead)
        const read = await readSettlementPrefix({ binding, registration })
        if ('unavailable' in read) return unavailable(read.reason)
        retained =
          bytes(candidate.value) + bytes({ entries: read.prefix.entries, tail: read.prefix.tail })
        const afterRead = guard()
        if (afterRead !== null) return unavailable(afterRead)
        const interpreted = interpretSettlementPrefix({
          prefix: read.prefix,
          target: stableTarget,
          current: stableCurrent,
        })
        if ('unavailable' in interpreted) return unavailable(interpreted.reason)
        const facts = interpreted.facts
        if ('completeMembers' in facts.members) {
          diagnostic('settlement.recognized')
          return { settled: facts.members.completeMembers, origin: 'recognized' }
        }
        if (unknownWrites.size !== 0 || owner.unresolvedWrites().length !== 0) {
          diagnostic('settlement.unknown_retained')
          return unavailable('write_unknown')
        }
        if (facts.ended !== null) return unavailable('anchor')
        const beforePrepare = guard(true)
        if (beforePrepare !== null) return unavailable(beforePrepare)
        let settlementCandidate = candidate
        let shell: {
          readonly tenant: typeof binding.tenant
          readonly run?: string
          readonly attempt?: JsonNumber
        } = { tenant: binding.tenant }
        if (facts.anchors.dispatched.run !== undefined) {
          const originalAttempt = facts.anchors.dispatched.attempt
          if (
            originalAttempt === undefined ||
            projection.call.runId !== facts.anchors.dispatched.run ||
            !isJsonNumber(projection.attemptId) ||
            ExactDecimal.from(projection.attemptId).compare(ExactDecimal.from(originalAttempt)) !==
              0
          )
            return unavailable('candidate')
          const run = interpretRunAtPrefix({
            prefix: read.prefix,
            run: facts.anchors.dispatched.run,
            attempt: originalAttempt,
            source: input.run,
          })
          if ('unavailable' in run) return unavailable('run_history_unavailable')
          const { late: _originalLate, ...original } = projection
          const revised = captureModelLogValue({
            category: 'response',
            input: {
              kind: 'value',
              value: { ...original, ...(run.known.late ? { late: true } : {}) },
            },
          })
          if (!('ok' in revised)) return unavailable('candidate')
          settlementCandidate = revised.ok
          shell = { tenant: binding.tenant, run: run.known.run, attempt: run.known.latestAttempt }
        } else if (
          projection.call.runId !== undefined ||
          projection.attemptId !== undefined ||
          projection.late !== undefined
        )
          return unavailable('candidate')
        const prepared = prepareModelLogEntry({
          session: binding.session,
          shell,
          captured: settlementCandidate,
          purpose: { kind: 'response' },
          messagePrefix: facts.messagePrefix,
        })
        if (!('ok' in prepared)) return unavailable('candidate')
        const batch: OwnedLogEntry[] = []
        if (projection.replyDisposition === 'persisted') {
          const reply = captureModelLogValue({
            category: 'message',
            input: { kind: 'value', value: projection.reply },
          })
          if (!('ok' in reply)) return unavailable('candidate')
          const message = prepareModelLogEntry({
            session: binding.session,
            shell,
            captured: reply.ok,
            purpose: { kind: 'persistedMessage', response: settlementCandidate },
            messagePrefix: facts.messagePrefix,
          })
          if (!('ok' in message)) return unavailable('candidate')
          batch.push(message.ok)
        }
        batch.push(prepared.ok)
        const verified = inspectSettlementMembers({
          mode: 'write',
          session: binding.session,
          tenant: binding.tenant,
          prefix: read.prefix,
          target: stableTarget,
          anchors: facts.anchors,
          current: stableCurrent,
          candidates: batch,
        })
        if (!('completeMembers' in verified)) return unavailable('members')
        retained += bytes(batch)
        const beforeAppend = guard(true)
        if (beforeAppend !== null) return unavailable(beforeAppend)
        const condition: AppendCondition =
          facts.anchors.dispatched.run === undefined
            ? { kind: 'unconditional' }
            : { kind: 'tailEquals', tail: read.prefix.tail }
        // Keep the exact submitted members, late shell and condition before the first IO.
        originalBatch = Object.freeze({ batch: Object.freeze([...batch]), condition })
        submissions++
        diagnostic('settlement.append')
        let appended: AppendResult
        const task = registration.start('append', async (signal): Promise<AppendResult> => {
          if (
            signal.aborted ||
            guard() !== null ||
            unknownWrites.size !== 0 ||
            owner.unresolvedWrites().length !== 0
          )
            return { failure: 'unavailable' }
          return await binding.log.append(
            binding.session,
            Object.freeze(batch),
            { kind: 'unfenced' },
            condition,
          )
        })
        try {
          const receipt = settlementAppendReceipt(await task.completion, batch.length)
          if (receipt === null) {
            unknownWrites.add(task)
            ownUnknownWrites.add(task)
            diagnostic('settlement.receipt_unconfirmed')
            return unavailable('write_unknown')
          }
          appended = receipt
        } catch {
          unknownWrites.add(task)
          ownUnknownWrites.add(task)
          diagnostic('settlement.unknown_retained')
          return unavailable('write_unknown')
        }
        if (!('failure' in appended)) {
          diagnostic('settlement.committed')
          return { settled: verified.completeMembers, origin: 'appended' }
        }
        if (appended.failure === 'unavailable') {
          unknownWrites.add(task)
          ownUnknownWrites.add(task)
          diagnostic('settlement.unknown_retained')
          return unavailable('write_unknown')
        }
        if (appended.failure === 'alreadyRecorded' || appended.failure === 'tailChanged') {
          if (appended.failure === 'tailChanged') conflicts++
          diagnostic(
            appended.failure === 'tailChanged'
              ? 'settlement.tail_changed_this'
              : 'settlement.collision',
          )
          stage = appended.failure === 'tailChanged' ? 'tailChanged' : 'collision'
          retained = bytes(candidate.value)
          continue
        }
        return unavailable('log')
      }
    }
    let finishStopped: (() => void) | undefined
    let failStopped: ((reason: unknown) => void) | undefined
    const stopped = new Promise<void>((resolve, reject) => {
      finishStopped = resolve
      failStopped = reject
    })
    // The owner observes this promise too; attach a handler before any task can reject.
    void stopped.catch(() => {})
    // Parent ownership must be established by acquire before the first asynchronous IO.
    const completion = advance().then(result => {
      if ('unavailable' in result) {
        diagnostic(`settlement.unavailable.${result.reason}`)
        stop()
      }
      return result
    })
    const handle = Object.freeze({ completion, requestStop: stop, stopped })
    live.add(handle)
    // Both branches are owned; a rejected stopped promise prevents release and remains visible.
    async function drain() {
      try {
        await completion
      } catch {
        stop()
      }
      // completion and actual stop are independent; some owners stop only on request.
      stop()
      for (const task of tasks) await task.stopped
      if (ownUnknownWrites.size !== 0 && originalBatch !== undefined) {
        // Actually stopped with an unknown receipt: keep this exact registration and batch.
        retainedUnknowns.add({
          handle,
          registration: acquired,
          writes: ownUnknownWrites,
          target: stableTarget,
          current: stableCurrent,
          batch: originalBatch.batch,
          condition: originalBatch.condition,
          reads: new Set(),
          resolving: undefined,
          stopUnconfirmed: false,
        })
        finishStopped?.()
        return
      }
      acquired.release()
      live.delete(handle)
      finishStopped?.()
    }
    drain().catch(error => {
      diagnostic('settlement.stop_unconfirmed')
      failStopped?.(error)
    })
    return handle
  }
  return Object.freeze({
    settle,
    async close() {
      closed = true
      for (const task of live) task.requestStop()
      const stopped = await Promise.allSettled([...live].map(task => task.stopped))
      // Actively resolve every retained original; unreadable or unproven stop stays owned.
      await Promise.allSettled([...retainedUnknowns].map(entry => resolveRetained(entry)))
      if (stopped.some(result => result.status === 'rejected') || retainedUnknowns.size !== 0)
        throw new Error('Settlement work remains owned')
    },
  })
}
