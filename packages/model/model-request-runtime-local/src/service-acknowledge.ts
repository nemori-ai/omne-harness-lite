import type {
  AckTarget,
  AcknowledgeCallInput,
  AcknowledgeCallResult,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { LosslessNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  createModelCallSemanticDigest,
  judgeModelInvocationRecord,
  type CallKey,
  type ModelCallAccountingWitness,
  type ModelCallAcknowledgedRecord,
  type ModelCallPayloadRef,
  type ModelCallReplyReadyRecord,
  type ModelInvocationRecord,
  type ModelCallEndedRecord,
} from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { AppendResult, LogEntry } from '@omne-harness-lite/session-log'
import { acknowledgementSummary, originOfEntry } from '@omne-harness-lite/model-request-runtime'
import { runtimeCustody, type AcknowledgementCustody } from './acknowledgement-custody.ts'
import type { CallHistoryKnown } from '@omne-harness-lite/model-request-runtime'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import {
  captureModelLogValue,
  modelLogJsonEqual,
  prepareModelLogEntry,
  type ModelLogShell,
} from '@omne-harness-lite/model-request-runtime'
import { inspectCurrentModelLogPrefix } from '@omne-harness-lite/model-request-runtime'
import { OwnedReadTracker, withOwnedReads } from './service-control.ts'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import type { ModelCallContentValue } from './reference-types.ts'
import type { CallAccessEvidence } from '@omne-harness-lite/model-request-runtime'
import type { RuntimeConstruction } from './service-types.ts'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementTask,
  SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { requestStopAndWait } from './settlement-stop.ts'

const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
const notFound = Object.freeze({ callNotFound: true } as const)
function negative(value: JsonNumber): JsonNumber {
  const source = ExactDecimal.from(value).toString()
  return new LosslessNumber(source.startsWith('-') ? source.slice(1) : `-${source}`)
}

function ownInput(input: AcknowledgeCallInput): AcknowledgeCallInput | typeof malformed {
  if (!validInputShape(input) || !validInputRef(input)) return malformed
  const target = input.expectedResult
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return malformed
  const owned = ownedTarget(target)
  if (owned === undefined) return malformed
  return Object.freeze({
    ref: Object.freeze({ session: input.ref.session, callId: input.ref.callId }),
    expectedResult: owned,
  })
}

function validInputShape(input: AcknowledgeCallInput): boolean {
  return !(
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2
  )
}

function validInputRef(input: AcknowledgeCallInput): boolean {
  return !(
    input.ref === null ||
    typeof input.ref !== 'object' ||
    Array.isArray(input.ref) ||
    Object.keys(input.ref).length !== 2 ||
    !('ok' in parseOpaqueIdentifier(input.ref.session, 'SessionRef')) ||
    !('ok' in judgeAccountValue('ModelCallId', input.ref.callId))
  )
}

function ownedTarget(target: AckTarget): AckTarget | undefined {
  if (
    target.kind === 'response' &&
    Object.keys(target).length === 2 &&
    'ok' in parseOpaqueIdentifier(target.response, 'ResponseId')
  )
    return Object.freeze({ kind: 'response', response: target.response })
  else if (
    target.kind === 'ended' &&
    Object.keys(target).length === 2 &&
    (target.ending === 'undispatched' ||
      target.ending === 'released' ||
      target.ending === 'interrupted')
  )
    return Object.freeze({ kind: 'ended', ending: target.ending })
  else return undefined
}

/** The model-owned copies and entries of one call, read from the same owned full prefix. */
interface CallSources {
  readonly creation: LogEntry
  readonly creationPayload: ModelCallPayloadRef & { readonly kind: 'created' }
  readonly ready: readonly {
    readonly entry: LogEntry
    readonly record: ModelCallReplyReadyRecord
  }[]
}
function sourcesOf(prefix: SettlementPrefix, callId: string): CallSources | undefined {
  const inspected = inspectCurrentModelLogPrefix({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
  })
  if (!('ok' in inspected)) return undefined
  let creation: CallSources['creation'] | undefined
  let creationPayload: CallSources['creationPayload'] | undefined
  const ready: { entry: LogEntry; record: ModelCallReplyReadyRecord }[] = []
  for (const { entry, captured } of inspected.ok) {
    const record = captured.record
    if (record === null || !('call' in record) || record.call !== callId) continue
    if (record.kind === 'model_call_created') {
      creation = entry
      creationPayload = record.payload
    } else if (hasCreationPayload(record)) {
      creation = entry
      creationPayload = record.payload
    } else if (record.kind === 'model_call_reply_ready') {
      ready.push({ entry, record })
    }
  }
  return creation === undefined || creationPayload === undefined
    ? undefined
    : { creation, creationPayload, ready }
}

function hasCreationPayload(record: ModelInvocationRecord): record is ModelCallEndedRecord & {
  readonly creationKey: string
  readonly payload: ModelCallPayloadRef & { readonly kind: 'created' }
} {
  return (
    record.kind === 'model_call_ended' &&
    record.creationKey !== undefined &&
    record.payload !== undefined
  )
}

/** RT12 S-95: the one real terminal target, or the non-terminal phase. */
type Terminal =
  | {
      readonly target: AckTarget
      /** Present when only the ready marker (no durable final) carries the terminal reply. */
      readonly ready?: { readonly entry: LogEntry; readonly record: ModelCallReplyReadyRecord }
      readonly state?: 'complete' | 'handed_up' | 'interrupted'
    }
  | { readonly nonTerminal: NonNullable<CallHistoryKnown['phase']> | 'in_flight' }
function terminalOf(known: CallHistoryKnown, sources: CallSources): Terminal {
  const last = known.dispatches.at(-1)
  const phase = known.phase
  const final = last?.response?.projection
  if (last !== undefined && final !== undefined && final.outcome !== 'failed') {
    if (!isTerminalPhase(phase)) return { nonTerminal: phase ?? 'in_flight' }
    return { target: { kind: 'response', response: last.record.response }, state: phase }
  }
  if (last !== undefined && final === undefined) {
    const ready = readyTerminal(known, sources, last, phase)
    if (ready !== undefined) return ready
  }
  if (known.ending !== null && (phase === 'handed_up' || phase === 'interrupted'))
    return { target: { kind: 'ended', ending: known.ending.ending }, state: phase }
  return { nonTerminal: phase ?? 'in_flight' }
}

function isTerminalPhase(
  phase: CallHistoryKnown['phase'],
): phase is 'complete' | 'interrupted' | 'handed_up' {
  return !(phase !== 'complete' && phase !== 'interrupted' && phase !== 'handed_up')
}

function readyTerminal(
  known: CallHistoryKnown,
  sources: CallSources,
  last: CallHistoryKnown['dispatches'][number],
  phase: CallHistoryKnown['phase'],
): Terminal | undefined {
  const ready = sources.ready.find(item => item.record.response === last.record.response)
  // A ready reply is terminal; a later ending fixes the call's state, else the reply does.
  if (ready !== undefined && phase === 'reply_pending')
    return { target: { kind: 'response', response: last.record.response }, ready }
  if (ready !== undefined && known.ending !== null && phase === 'interrupted')
    return {
      target: { kind: 'response', response: last.record.response },
      ready,
      state: 'interrupted',
    }
  return undefined
}

/** MS8 S-57: the minimal original accounting witness of a ready reply. */
function witnessOf(
  pending: PendingModelResponse,
  ready: { readonly entry: LogEntry; readonly record: ModelCallReplyReadyRecord },
): ModelCallAccountingWitness {
  const base = {
    response: pending.id,
    dispatch: pending.dispatch,
    readyPosition: ready.entry.position,
    payload: ready.record.payload,
    origin: originOfEntry(ready.entry),
    usage: pending.usage,
    cost: pending.cost,
    credentialScope: pending.route.credentialScope,
    provider: pending.route.provider,
    ...(pending.route.upstreamRequestId === undefined
      ? {}
      : { upstreamRequestId: pending.route.upstreamRequestId }),
    timing: {
      sentAt: pending.timing.sentAt,
      firstTokenAt: pending.timing.firstTokenAt,
      endedAt: pending.timing.endedAt,
    },
  }
  return pending.outcome === 'interrupted'
    ? { ...base, outcome: 'interrupted', initiator: pending.initiator }
    : { ...base, outcome: pending.outcome }
}

interface RetainedAck {
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
}

/**
 * RT12 S-96 acknowledgeCall. The log ACK is the confirmation fact; the Storage retention row
 * fixes the one original batch before any append and closes new model-copy reads/writes.
 */
export function createServiceAcknowledge<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  sharedCustody?: AcknowledgementCustody,
): ProjectedComponent<
  {
    readonly acknowledgeCall: (input: AcknowledgeCallInput) => Promise<AcknowledgeCallResult>
    readonly close: () => Promise<RuntimeCloseResult>
  },
  RuntimeConstruction<P, R>
> {
  return buildServiceAcknowledge(runtime, sharedCustody)
}

class ServiceAcknowledgeState {
  readonly reads = new OwnedReadTracker()
  readonly retained = new Map<string, RetainedAck>()
  readonly busy = new Map<string, Promise<unknown>>()
  closed = false
}

function buildServiceAcknowledge<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  sharedCustody?: AcknowledgementCustody,
  physical: ServiceAcknowledgeState = new ServiceAcknowledgeState(),
): ProjectedComponent<
  {
    readonly acknowledgeCall: (input: AcknowledgeCallInput) => Promise<AcknowledgeCallResult>
    readonly close: () => Promise<RuntimeCloseResult>
  },
  RuntimeConstruction<P, R>
> {
  const ownCustody = sharedCustody === undefined ? runtimeCustody(runtime) : undefined
  const custody = sharedCustody ?? ownCustody

  /** Unknown ACK appends keep their original writer until it actually stops. */

  const keyOf = (ref: CallKey): string => JSON.stringify([ref.session, ref.callId])

  function report(stage: string, ref: CallKey, detail: Record<string, string>): void {
    try {
      drainDiagnosticThenable(
        runtime.policy.diagnostic({
          kind: 'model_ack.confirm',
          detail: { stage, session: ref.session, call: ref.callId, ...detail },
        }),
      )
    } catch {
      // A diagnostic failure is not an ACK fact.
    }
  }

  async function readPrefix(session: SessionRuntimeBinding): Promise<SettlementPrefix | undefined> {
    const read = await withOwnedReads(
      session.selection.owner,
      runtime.settlementContention.limits.concurrent,
      physical.reads,
      async registration => await readSettlementPrefix({ binding: session.log, registration }),
    )
    return 'ok' in read && 'prefix' in read.ok ? read.ok.prefix : undefined
  }

  /** Stop a retained unknown writer for real before any recognition or resend. */
  async function settleRetained(key: string): Promise<boolean> {
    const prior = physical.retained.get(key)
    if (prior === undefined) return true
    try {
      prior.task.requestStop()
    } catch {
      // Actual stopped remains authoritative.
    }
    try {
      await prior.task.stopped
      prior.registration.release()
    } catch {
      return false
    }
    physical.retained.delete(key)
    return true
  }

  async function append(
    session: SessionRuntimeBinding,
    ref: CallKey,
    record: ModelCallAcknowledgedRecord,
    shell: ModelLogShell,
    prefix: SettlementPrefix,
  ): Promise<'appended' | 'present' | 'unavailable' | 'conflict' | 'withdrawn'> {
    const binding = session.log
    const owner = session.selection.owner
    const prepared = prepareAcknowledgementEntry(binding, shell, record)
    if (prepared === undefined || !('ok' in prepared)) return 'unavailable'
    let current = prefix
    let submissions = 0
    let tailConflicts = 0
    let previousWaitMs: JsonNumber = 0
    const started = runtime.settlementScheduler.nowMonotonicMs()
    for (;;) {
      if (appendUnavailable(physical.closed, owner, binding)) return 'unavailable'
      const found = recognizeAcknowledgement(current, ref.callId, record)
      if (found !== undefined) return found
      const grant = owner.acquire(runtime.settlementContention.limits.concurrent)
      if (!('registration' in grant)) return 'unavailable'
      const registration = grant.registration
      const tail = current.tail
      let attempted = false
      let task: SettlementTask<AppendResult>
      try {
        task = registration.start('controlAppend', async () => {
          if (appendUnavailable(physical.closed, owner, binding))
            return { failure: 'unavailable' } as const
          attempted = true
          // RT12 S-96④: unfenced, conditioned on the same full prefix just checked.
          return await binding.log.append(
            binding.session,
            [prepared.ok],
            { kind: 'unfenced' },
            { kind: 'tailEquals', tail },
          )
        })
      } catch {
        registration.release()
        return 'unavailable'
      }
      submissions++
      let receipt: ReturnType<typeof settlementAppendReceipt>
      try {
        receipt = settlementAppendReceipt(await task.completion, 1)
      } catch {
        receipt = null
      }
      if (unknownAcknowledgement(attempted, receipt)) {
        // The original batch may land later: keep its writer, never rebuild the batch.
        physical.retained.set(keyOf(ref), { registration, task })
        report('append', ref, { receipt: 'unknown' })
        return 'unavailable'
      }
      try {
        await requestStopAndWait(task)
      } catch {
        physical.retained.set(keyOf(ref), { registration, task })
        return 'unavailable'
      }
      registration.release()
      if (receipt !== null && !('failure' in receipt)) return 'appended'
      if (receipt === null || !attempted) return 'unavailable'
      if (receipt.failure === 'alreadyRecorded' || receipt.failure === 'tailChanged') {
        if (receipt.failure === 'tailChanged') tailConflicts++
        const decision = runtime.settlementContention.decide({
          stage: receipt.failure === 'tailChanged' ? 'tailChanged' : 'collision',
          submissions,
          tailConflicts,
          elapsedMs: ExactDecimal.from(runtime.settlementScheduler.nowMonotonicMs())
            .add(ExactDecimal.from(negative(started)))
            .toJsonNumber(),
          retainedBytes: 0,
          previousWaitMs,
        })
        const reread = await readPrefix(session)
        if (reread === undefined) return 'unavailable'
        current = reread
        // Re-reading may recognize the original batch; only the same batch is ever resent.
        const again = recognizeAcknowledgement(current, ref.callId, record)
        if (again !== undefined) return again
        // This batch wrote nothing (tailChanged/alreadyRecorded), its writer stopped, the fresh
        // complete prefix has no ACK, and the explicit policy ends: the preparation may retreat.
        if ('stop' in decision) return 'withdrawn'
        previousWaitMs = decision.proceed.waitMs
        const waited = runtime.settlementScheduler.wait(
          decision.proceed.waitMs,
          new AbortController().signal,
        )
        try {
          if ((await waited.completion) !== 'elapsed') return 'unavailable'
          await requestStopAndWait(waited)
        } catch {
          return 'unavailable'
        }
        continue
      }
      return 'unavailable'
    }
  }

  async function acknowledge(input: AcknowledgeCallInput): Promise<AcknowledgeCallResult> {
    const owned = ownInput(input)
    if ('invalidInput' in owned) return owned
    const { ref, expectedResult } = owned
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(ref.session)
    } catch {
      return unavailable
    }
    if ('failure' in bound) return bound.failure === 'invalidInput' ? malformed : unavailable
    const session = bound.binding
    const binding = session.log
    if (!validAcknowledgementBinding(binding, session, ref, custody)) return unavailable
    const first = await runtime.callFacts.lookup({ binding, ref })
    let origin = acknowledgementOrigin(first)
    if (origin === undefined && !('callNotFound' in first)) {
      // RT12 S-96⑧/S-98: a batch fixed before an unconfirmed append closed the copy reads, so the
      // facts view is unavailable; the original creation shell in the log still names the
      // origin, and the retry below resends or recognizes the same fixed batch only.
      const retention = await runtime.callFacts.content.retention({ binding, call: ref.callId })
      if (!('phase' in retention) || retention.phase !== 'retiring') return unavailable
      const prefix = await readPrefix(session)
      const sources = prefix === undefined ? undefined : sourcesOf(prefix, ref.callId)
      if (sources === undefined) return unavailable
      origin = originOfEntry(sources.creation)
    }
    const admitted = await runtime.callAccess.check(
      { binding, ref, action: 'ack', ...(origin === undefined ? {} : { origin }) },
      async (evidence: CallAccessEvidence): Promise<AcknowledgeCallResult> => {
        const current = (): boolean =>
          evidence.action === 'ack' &&
          evidence.ref.session === ref.session &&
          evidence.ref.callId === ref.callId &&
          evidence.source.generation === binding.generation &&
          !evidence.revoked.aborted &&
          settlementGenerationCurrent(binding)
        if (!current()) return unavailable
        const recognize = async (
          record: ModelCallAcknowledgedRecord,
        ): Promise<AcknowledgeCallResult> => {
          // RT12 S-96⑦: the same target recognizes the original ACK and its current progress.
          if (!modelLogJsonEqual(record.target, expectedResult))
            return { wrongPhase: { phase: record.terminalState } }
          const cleanup = await custody.cleanup({ binding, ref, record })
          // A durable record that contradicts the retained originals is no lawful ACK.
          if (!('cleanup' in cleanup)) return unavailable
          return current()
            ? { acknowledged: acknowledgementSummary(ref, record, cleanup) }
            : unavailable
        }
        if (physical.closed) {
          // RT12 S-96⑧/S-100: a stopped host still recognizes a readable durable ACK and its
          // cleanup progress, but starts no new ACK work.
          const durable = await runtime.callFacts.lookup({ binding, ref })
          if ('acknowledged' in durable) return await recognize(durable.acknowledged.record)
          return 'callNotFound' in durable ? notFound : unavailable
        }
        const key = keyOf(ref)
        if (!(await settleRetained(key))) return unavailable
        const prefix = await readPrefix(session)
        if (prefix === undefined || !current()) return unavailable
        let history: ReturnType<typeof runtime.history.call>
        try {
          history = runtime.history.call(prefix, ref.callId)
        } catch {
          return unavailable
        }
        if ('absent' in history) return notFound
        if (!('known' in history)) return unavailable
        const known = history.known
        if (known.acknowledged !== null) return await recognize(known.acknowledged.record)
        const sources = sourcesOf(prefix, ref.callId)
        if (sources === undefined) return unavailable
        const terminal = terminalOf(known, sources)
        if ('nonTerminal' in terminal) return { wrongPhase: { phase: terminal.nonTerminal } }
        if (!modelLogJsonEqual(terminal.target, expectedResult)) {
          const phase =
            terminal.state ??
            (await readyState(binding, ref, terminal.ready?.record.payload)) ??
            'reply_pending'
          return { wrongPhase: { phase } }
        }
        const readyRef = terminal.ready?.record.payload
        const payloads = [
          sources.creationPayload,
          ...sources.ready.map(item => item.record.payload),
        ]
        const acknowledgedAt = runtime.policy.now()
        const prepared = await runtime.callFacts.content.prepareAcknowledgement({
          binding,
          call: ref.callId,
          payloads,
          build: contents =>
            buildAcknowledgement({
              ref,
              contents,
              payloads,
              target: terminal.target,
              state: terminal.state,
              ready: terminal.ready,
              readyRef,
              acknowledgedAt,
            }),
        })
        if (!('record' in prepared)) return 'invalidInput' in prepared ? malformed : unavailable
        const record = prepared.record
        // A fixed batch always names this call's one real target; anything else is broken.
        if (!modelLogJsonEqual(record.target, terminal.target)) return unavailable
        if (!current()) return unavailable
        const shell: ModelLogShell = {
          tenant: sources.creation.tenant,
          ...(sources.creation.run === undefined ? {} : { run: sources.creation.run }),
          ...(sources.creation.attempt === undefined ? {} : { attempt: sources.creation.attempt }),
        }
        const written = await append(session, ref, record, shell, prefix)
        if (written === 'conflict') return unavailable
        if (written === 'withdrawn') {
          // RT12 S-96 (the one retreat): back to retained on the same row; nothing is deleted.
          const withdrawn = await runtime.callFacts.content.withdrawAcknowledgement({
            binding,
            call: ref.callId,
            record,
          })
          report('withdrawn', ref, {
            result: 'phase' in withdrawn ? withdrawn.phase : 'unavailable',
          })
          return unavailable
        }
        if (written === 'unavailable') return unavailable
        // R-J/MS8 S-58: the log deduplicates by key only, so neither a receipt nor a key
        // collision recognizes this batch. Read the durable value back and compare it whole.
        const readBack = await readPrefix(session)
        if (readBack === undefined || !current()) return unavailable
        let after: ReturnType<typeof runtime.history.call>
        try {
          after = runtime.history.call(readBack, ref.callId)
        } catch {
          return unavailable
        }
        const durable = 'known' in after ? after.known.acknowledged : null
        if (
          durable === null ||
          !modelLogJsonEqual(durable.record, record) ||
          !modelLogJsonEqual(shellOf(durable.entry), shell) ||
          durable.entry.session !== binding.session
        )
          return unavailable
        report('confirmed', ref, { via: written })
        return await recognize(durable.record)
      },
    )
    if ('allowed' in admitted) return admitted.allowed
    return 'invalidInput' in admitted ? admitted : unavailable
  }

  async function readyState(
    binding: SettlementLogBinding,
    ref: CallKey,
    payload: ModelCallPayloadRef | undefined,
  ): Promise<'complete' | 'interrupted' | undefined> {
    if (payload === undefined) return undefined
    const read = await runtime.callFacts.content.read({ binding, call: ref.callId, ref: payload })
    if (!('content' in read) || read.content.kind !== 'reply_ready') return undefined
    return read.content.value.outcome === 'interrupted' ? 'interrupted' : 'complete'
  }

  async function acknowledgeCall(input: AcknowledgeCallInput): Promise<AcknowledgeCallResult> {
    // One original ACK task per CallKey; concurrent repeats recognize its result.
    const key =
      input !== null &&
      typeof input === 'object' &&
      input.ref !== null &&
      typeof input.ref === 'object'
        ? JSON.stringify([input.ref.session, input.ref.callId])
        : undefined
    const prior = key === undefined ? undefined : physical.busy.get(key)
    if (prior !== undefined) await prior.catch(() => undefined)
    const task = acknowledge(input).catch((): AcknowledgeCallResult => unavailable)
    if (key !== undefined) physical.busy.set(key, task)
    try {
      return await task
    } finally {
      if (key !== undefined && physical.busy.get(key) === task) physical.busy.delete(key)
    }
  }

  return retainRuntimeProjection(
    Object.freeze({
      acknowledgeCall,
      async close(): Promise<RuntimeCloseResult> {
        physical.closed = true
        await Promise.allSettled([...physical.busy.values()])
        const stops = await Promise.all([...physical.retained.keys()].map(settleRetained))
        const readResult = await physical.reads.close()
        const custodyResult =
          ownCustody === undefined ? { released: true } : await ownCustody.close()
        return stops.every(Boolean) && 'released' in readResult && 'released' in custodyResult
          ? { released: true }
          : unavailable
      },
    }),
    (next: RuntimeConstruction<P, R>) => buildServiceAcknowledge(next, sharedCustody, physical),
  )
}

/** The model log shell of an entry, in the same conditional form the writer builds. */
function shellOf(entry: LogEntry): ModelLogShell {
  return {
    tenant: entry.tenant,
    ...(entry.run === undefined ? {} : { run: entry.run }),
    ...(entry.attempt === undefined ? {} : { attempt: entry.attempt }),
  }
}

/** The original ACK record kept in this prefix, if any; two differing records are a conflict. */
function recordedAcknowledgement(
  prefix: SettlementPrefix,
  callId: string,
): ModelCallAcknowledgedRecord | 'conflict' | 'unavailable' | undefined {
  const inspected = inspectCurrentModelLogPrefix({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
  })
  if (!('ok' in inspected)) return 'unavailable'
  let found: ModelCallAcknowledgedRecord | undefined
  for (const { captured } of inspected.ok) {
    const record = captured.record
    if (record?.kind !== 'model_call_acknowledged' || record.call !== callId) continue
    if (found !== undefined && !modelLogJsonEqual(found, record)) return 'conflict'
    found = record
  }
  return found
}

/**
 * MS8 S-56～S-58: the one ACK batch, built under the retention lock from the exact original
 * contents. Digests come only from the messages package; the witness from the ready marker.
 */
interface AcknowledgementInput {
  readonly ref: CallKey
  readonly contents: readonly ModelCallContentValue[]
  readonly payloads: readonly ModelCallPayloadRef[]
  readonly target: AckTarget
  readonly state: 'complete' | 'handed_up' | 'interrupted' | undefined
  readonly ready:
    { readonly entry: LogEntry; readonly record: ModelCallReplyReadyRecord } | undefined
  readonly readyRef: ModelCallPayloadRef | undefined
  readonly acknowledgedAt: string
}

function buildAcknowledgement(
  input: AcknowledgementInput,
): { readonly record: ModelCallAcknowledgedRecord } | typeof malformed | typeof unavailable {
  const base = acknowledgementBase(input)
  if ('invalidInput' in base) return base
  const record = acknowledgementRecord(input, base)
  if ('invalidInput' in record || 'unavailable' in record) return record
  const judged = judgeModelInvocationRecord(record)
  return 'ok' in judged && judged.ok.kind === 'model_call_acknowledged'
    ? { record: judged.ok }
    : malformed
}

function acknowledgementBase(input: AcknowledgementInput) {
  const created = input.contents[0]
  if (
    created?.kind !== 'created' ||
    created.value.ref.session !== input.ref.session ||
    created.value.ref.callId !== input.ref.callId
  )
    return malformed
  const creation = createModelCallSemanticDigest(
    'model-call-creation-semantic-sha256/v1',
    created.value.input,
  )
  if (!('ok' in creation) || creation.ok.role !== 'model-call-creation-semantic-sha256/v1')
    return malformed
  return {
    kind: 'model_call_acknowledged' as const,
    call: input.ref.callId,
    creationKey: created.value.creationKey,
    creationInput: { role: creation.ok.role, hex: creation.ok.hex },
    acknowledgedAt: input.acknowledgedAt,
    releasablePayloads: input.payloads,
  }
}

type AcknowledgementBase = Exclude<ReturnType<typeof acknowledgementBase>, typeof malformed>

function acknowledgementRecord(input: AcknowledgementInput, base: AcknowledgementBase) {
  if (input.target.kind === 'ended') {
    return {
      ...base,
      target: input.target,
      terminalState: input.target.ending === 'interrupted' ? 'interrupted' : 'handed_up',
    }
  } else if (input.ready === undefined) {
    // A durable final is independently readable: no witness is fixed.
    if (input.state === undefined) return unavailable
    return { ...base, target: input.target, terminalState: input.state }
  } else {
    // Both fields are narrowed above. TS does not narrow the containing object; preserve
    // that object instead of reading its fields again to construct a narrowed copy.
    return readyAcknowledgement(input as ReadyAcknowledgementInput, base)
  }
}

type ReadyAcknowledgementInput = AcknowledgementInput & {
  readonly target: Extract<AckTarget, { readonly kind: 'response' }>
  readonly ready: NonNullable<AcknowledgementInput['ready']>
}

function readyAcknowledgement(input: ReadyAcknowledgementInput, base: AcknowledgementBase) {
  const index = input.payloads.findIndex(item => modelLogJsonEqual(item, input.readyRef))
  const content = index < 0 ? undefined : input.contents[index]
  if (content?.kind !== 'reply_ready') return malformed
  const pending = content.value
  if (
    pending.id !== input.target.response ||
    pending.call.callId !== input.ref.callId ||
    ExactDecimal.from(pending.dispatch).compare(ExactDecimal.from(input.ready.record.dispatch)) !==
      0
  )
    return malformed
  const retained = createModelCallSemanticDigest(
    'model-call-retained-result-semantic-sha256/v1',
    pending,
  )
  if (!('ok' in retained) || retained.ok.role !== 'model-call-retained-result-semantic-sha256/v1')
    return malformed
  return {
    ...base,
    target: input.target,
    terminalState: input.state ?? (pending.outcome === 'interrupted' ? 'interrupted' : 'complete'),
    retainedResultDigest: { role: retained.ok.role, hex: retained.ok.hex },
    accountingWitness: witnessOf(pending, input.ready),
  }
}

function prepareAcknowledgementEntry(
  binding: SettlementLogBinding,
  shell: ModelLogShell,
  record: ModelCallAcknowledgedRecord,
): ReturnType<typeof prepareModelLogEntry> | undefined {
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: record },
  })
  if (!('ok' in captured)) return undefined
  return prepareModelLogEntry({
    session: binding.session,
    shell,
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
}

function appendUnavailable(
  closed: boolean,
  owner: SettlementOwner,
  binding: SettlementLogBinding,
): boolean {
  return closed || owner.admission() !== 'open' || !settlementGenerationCurrent(binding)
}

function recognizeAcknowledgement(
  prefix: SettlementPrefix,
  callId: string,
  record: ModelCallAcknowledgedRecord,
): 'present' | 'conflict' | 'unavailable' | undefined {
  const found = recordedAcknowledgement(prefix, callId)
  if (found === 'conflict' || found === 'unavailable') return found
  if (found !== undefined) return modelLogJsonEqual(found, record) ? 'present' : 'conflict'
  return undefined
}

function unknownAcknowledgement(
  attempted: boolean,
  receipt: ReturnType<typeof settlementAppendReceipt>,
): boolean {
  return (
    attempted && (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
  )
}

function validAcknowledgementBinding(
  binding: SettlementLogBinding,
  session: SessionRuntimeBinding,
  ref: CallKey,
  custody: AcknowledgementCustody | undefined,
): custody is AcknowledgementCustody {
  return !(
    binding.session !== ref.session ||
    session.selection.binding.session !== ref.session ||
    !tenantIdEquals(binding.tenant, session.selection.binding.tenant) ||
    binding.generation !== session.selection.binding.generation ||
    !settlementGenerationCurrent(binding) ||
    custody === undefined
  )
}

function acknowledgementOrigin(
  first: Awaited<ReturnType<RuntimeConstruction<PlannedSemantics, unknown>['callFacts']['lookup']>>,
) {
  return 'view' in first
    ? first.view.origin
    : 'acknowledged' in first
      ? first.acknowledged.origin
      : undefined
}
