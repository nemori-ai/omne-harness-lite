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
} from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { AppendResult, LogEntry } from '@omne-harness-lite/session-log-jsonl'
import { acknowledgementSummary, originOfEntry } from './acknowledged-view.ts'
import { runtimeCustody, type AcknowledgementCustody } from './acknowledgement-custody.ts'
import type { CallHistoryKnown } from './call-history.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import {
  captureModelLogValue,
  modelLogJsonEqual,
  prepareModelLogEntry,
  type ModelLogShell,
} from './log-codec.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'
import { OwnedReadTracker, withOwnedReads } from './service-control.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import type { AckTarget, CallAccessEvidence, ModelCallContentValue } from './reference-types.ts'
import type {
  AcknowledgeCallInput,
  AcknowledgeCallResult,
  RuntimeCloseResult,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'
import { requestStopAndWait } from './settlement-stop.ts'

const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
const notFound = Object.freeze({ callNotFound: true } as const)
function negative(value: JsonNumber): JsonNumber {
  const source = ExactDecimal.from(value).toString()
  return new LosslessNumber(source.startsWith('-') ? source.slice(1) : `-${source}`)
}

function ownInput(input: AcknowledgeCallInput): AcknowledgeCallInput | typeof malformed {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2 ||
    input.ref === null ||
    typeof input.ref !== 'object' ||
    Array.isArray(input.ref) ||
    Object.keys(input.ref).length !== 2 ||
    !('ok' in parseOpaqueIdentifier(input.ref.session, 'SessionRef')) ||
    !('ok' in judgeAccountValue('ModelCallId', input.ref.callId))
  )
    return malformed
  const target = input.expectedResult
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return malformed
  let owned: AckTarget
  if (
    target.kind === 'response' &&
    Object.keys(target).length === 2 &&
    'ok' in parseOpaqueIdentifier(target.response, 'ResponseId')
  )
    owned = Object.freeze({ kind: 'response', response: target.response })
  else if (
    target.kind === 'ended' &&
    Object.keys(target).length === 2 &&
    (target.ending === 'undispatched' ||
      target.ending === 'released' ||
      target.ending === 'interrupted')
  )
    owned = Object.freeze({ kind: 'ended', ending: target.ending })
  else return malformed
  return Object.freeze({
    ref: Object.freeze({ session: input.ref.session, callId: input.ref.callId }),
    expectedResult: owned,
  })
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
    } else if (
      record.kind === 'model_call_ended' &&
      record.creationKey !== undefined &&
      record.payload !== undefined
    ) {
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
    if (phase !== 'complete' && phase !== 'interrupted' && phase !== 'handed_up')
      return { nonTerminal: phase ?? 'in_flight' }
    return { target: { kind: 'response', response: last.record.response }, state: phase }
  }
  if (last !== undefined && final === undefined) {
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
  }
  if (known.ending !== null && (phase === 'handed_up' || phase === 'interrupted'))
    return { target: { kind: 'ended', ending: known.ending.ending }, state: phase }
  return { nonTerminal: phase ?? 'in_flight' }
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
): {
  readonly acknowledgeCall: (input: AcknowledgeCallInput) => Promise<AcknowledgeCallResult>
  readonly close: () => Promise<RuntimeCloseResult>
} {
  const ownCustody = sharedCustody === undefined ? runtimeCustody(runtime) : undefined
  const custody = sharedCustody ?? ownCustody
  const reads = new OwnedReadTracker()
  /** Unknown ACK appends keep their original writer until it actually stops. */
  const retained = new Map<string, RetainedAck>()
  const busy = new Map<string, Promise<unknown>>()
  let closed = false
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
      reads,
      async registration => await readSettlementPrefix({ binding: session.log, registration }),
    )
    return 'ok' in read && 'prefix' in read.ok ? read.ok.prefix : undefined
  }

  /** Stop a retained unknown writer for real before any recognition or resend. */
  async function settleRetained(key: string): Promise<boolean> {
    const prior = retained.get(key)
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
    retained.delete(key)
    return true
  }

  async function append(
    session: SessionRuntimeBinding,
    ref: CallKey,
    record: ModelCallAcknowledgedRecord,
    shell: ModelLogShell,
    prefix: SettlementPrefix,
  ): Promise<'appended' | 'present' | 'unavailable' | 'conflict'> {
    const binding = session.log
    const owner = session.selection.owner
    const captured = captureModelLogValue({
      category: 'record',
      input: { kind: 'value', value: record },
    })
    if (!('ok' in captured)) return 'unavailable'
    const prepared = prepareModelLogEntry({
      session: binding.session,
      shell,
      captured: captured.ok,
      purpose: { kind: 'record' },
      messagePrefix: null,
    })
    if (!('ok' in prepared)) return 'unavailable'
    let current = prefix
    let submissions = 0
    let tailConflicts = 0
    let previousWaitMs: JsonNumber = 0
    const started = runtime.settlementScheduler.nowMonotonicMs()
    for (;;) {
      if (closed || owner.admission() !== 'open' || !settlementGenerationCurrent(binding))
        return 'unavailable'
      const found = recordedAcknowledgement(current, ref.callId)
      if (found === 'conflict' || found === 'unavailable') return found
      if (found !== undefined) return modelLogJsonEqual(found, record) ? 'present' : 'conflict'
      const grant = owner.acquire(runtime.settlementContention.limits.concurrent)
      if (!('registration' in grant)) return 'unavailable'
      const registration = grant.registration
      const tail = current.tail
      let attempted = false
      let task: SettlementTask<AppendResult>
      try {
        task = registration.start('controlAppend', async () => {
          if (closed || owner.admission() !== 'open' || !settlementGenerationCurrent(binding))
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
      if (
        attempted &&
        (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
      ) {
        // The original batch may land later: keep its writer, never rebuild the batch.
        retained.set(keyOf(ref), { registration, task })
        report('append', ref, { receipt: 'unknown' })
        return 'unavailable'
      }
      try {
        await requestStopAndWait(task)
      } catch {
        retained.set(keyOf(ref), { registration, task })
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
        const again = recordedAcknowledgement(current, ref.callId)
        if (again === 'conflict' || again === 'unavailable') return again
        if (again !== undefined) return modelLogJsonEqual(again, record) ? 'present' : 'conflict'
        if ('stop' in decision) return 'unavailable'
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
    if (
      binding.session !== ref.session ||
      session.selection.binding.session !== ref.session ||
      !tenantIdEquals(binding.tenant, session.selection.binding.tenant) ||
      binding.generation !== session.selection.binding.generation ||
      !settlementGenerationCurrent(binding) ||
      custody === undefined
    )
      return unavailable
    const first = await runtime.callFacts.lookup({ binding, ref })
    if (!('view' in first) && !('acknowledged' in first) && !('callNotFound' in first))
      return unavailable
    const origin =
      'view' in first
        ? first.view.origin
        : 'acknowledged' in first
          ? first.acknowledged.origin
          : undefined
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
          return current()
            ? { acknowledged: acknowledgementSummary(ref, record, cleanup) }
            : unavailable
        }
        if (closed) {
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
    const prior = key === undefined ? undefined : busy.get(key)
    if (prior !== undefined) await prior.catch(() => undefined)
    const task = acknowledge(input).catch((): AcknowledgeCallResult => unavailable)
    if (key !== undefined) busy.set(key, task)
    try {
      return await task
    } finally {
      if (key !== undefined && busy.get(key) === task) busy.delete(key)
    }
  }

  return Object.freeze({
    acknowledgeCall,
    async close(): Promise<RuntimeCloseResult> {
      closed = true
      await Promise.allSettled([...busy.values()])
      const stops = await Promise.all([...retained.keys()].map(settleRetained))
      const readResult = await reads.close()
      const custodyResult = ownCustody === undefined ? { released: true } : await ownCustody.close()
      return stops.every(Boolean) && 'released' in readResult && 'released' in custodyResult
        ? { released: true }
        : unavailable
    },
  })
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
function buildAcknowledgement(input: {
  readonly ref: CallKey
  readonly contents: readonly ModelCallContentValue[]
  readonly payloads: readonly ModelCallPayloadRef[]
  readonly target: AckTarget
  readonly state: 'complete' | 'handed_up' | 'interrupted' | undefined
  readonly ready:
    { readonly entry: LogEntry; readonly record: ModelCallReplyReadyRecord } | undefined
  readonly readyRef: ModelCallPayloadRef | undefined
  readonly acknowledgedAt: string
}): { readonly record: ModelCallAcknowledgedRecord } | typeof malformed | typeof unavailable {
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
  const base = {
    kind: 'model_call_acknowledged' as const,
    call: input.ref.callId,
    creationKey: created.value.creationKey,
    creationInput: { role: creation.ok.role, hex: creation.ok.hex },
    acknowledgedAt: input.acknowledgedAt,
    releasablePayloads: input.payloads,
  }
  let record: unknown
  if (input.target.kind === 'ended') {
    record = {
      ...base,
      target: input.target,
      terminalState: input.target.ending === 'interrupted' ? 'interrupted' : 'handed_up',
    }
  } else if (input.ready === undefined) {
    // A durable final is independently readable: no witness is fixed.
    if (input.state === undefined) return unavailable
    record = { ...base, target: input.target, terminalState: input.state }
  } else {
    const index = input.payloads.findIndex(item => modelLogJsonEqual(item, input.readyRef))
    const content = index < 0 ? undefined : input.contents[index]
    if (content?.kind !== 'reply_ready') return malformed
    const pending = content.value
    if (
      pending.id !== input.target.response ||
      pending.call.callId !== input.ref.callId ||
      ExactDecimal.from(pending.dispatch).compare(
        ExactDecimal.from(input.ready.record.dispatch),
      ) !== 0
    )
      return malformed
    const retained = createModelCallSemanticDigest(
      'model-call-retained-result-semantic-sha256/v1',
      pending,
    )
    if (!('ok' in retained) || retained.ok.role !== 'model-call-retained-result-semantic-sha256/v1')
      return malformed
    record = {
      ...base,
      target: input.target,
      terminalState:
        input.state ?? (pending.outcome === 'interrupted' ? 'interrupted' : 'complete'),
      retainedResultDigest: { role: retained.ok.role, hex: retained.ok.hex },
      accountingWitness: witnessOf(pending, input.ready),
    }
  }
  const judged = judgeModelInvocationRecord(record)
  return 'ok' in judged && judged.ok.kind === 'model_call_acknowledged'
    ? { record: judged.ok }
    : malformed
}
