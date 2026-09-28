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
} from './log-codec-v2.ts'
import type { OwnedLogEntry, AppendResult } from '@omne-harness-lite/session-log-jsonl'
import {
  readSettlementPrefix,
  interpretSettlementPrefix,
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
  SettlementUnavailableReason,
} from './settlement-types.ts'

const unavailable = (reason: SettlementUnavailableReason): SettlementResult =>
  Object.freeze({ unavailable: true, reason })
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
    const grant = owner.acquire(policy.limits.concurrent)
    if ('unavailable' in grant) return failedHandle('concurrent')
    const acquired = grant.registration
    const tasks: SettlementTask<unknown>[] = []
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
      for (const task of tasks) task.requestStop()
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
        if (finished !== 'elapsed') return 'cancelled'
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
        const shell = { tenant: binding.tenant }
        const prepared = prepareModelLogEntry({
          session: binding.session,
          shell,
          captured: candidate,
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
            purpose: { kind: 'persistedMessage', response: candidate },
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
            { kind: 'unconditional' },
          )
        })
        try {
          appended = await task.completion
        } catch {
          unknownWrites.add(task)
          diagnostic('settlement.unknown_retained')
          return unavailable('write_unknown')
        }
        if (!('failure' in appended)) {
          diagnostic('settlement.committed')
          return { settled: verified.completeMembers, origin: 'appended' }
        }
        if (appended.failure === 'unavailable') {
          unknownWrites.add(task)
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
    const stopped = new Promise<void>(resolve => {
      finishStopped = resolve
    })
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
      for (const task of tasks) await task.stopped
      acquired.release()
      live.delete(handle)
      finishStopped?.()
    }
    drain().catch(() => {
      diagnostic('settlement.stop_unconfirmed')
    })
    return handle
  }
  return Object.freeze({
    settle,
    async close() {
      closed = true
      for (const task of live) task.requestStop()
      await Promise.all([...live].map(task => task.stopped))
    },
  })
}
