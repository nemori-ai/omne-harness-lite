import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  CallKey,
  ModelCallAccountingWitness,
  ModelCallAcknowledgedRecord,
} from '@omne-harness-lite/messages'
import {
  judgeModelResponse,
  type ModelResponse,
  type ResponseId,
} from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { modelLogJsonEqual } from './log-codec-key.ts'
import type { CallHistoryKnown } from './call-history.ts'
import type {
  AcknowledgedAttempt,
  AcknowledgedCallFacts,
  AcknowledgedCallView,
  CallAcknowledgement,
  CallOrigin,
  CallSource,
  ModelCallCleanupResult,
} from './reference-types.ts'

function isModelResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

/** The original entry shell as a call origin; a noRun entry never gains a Run. */
export function originOfEntry(entry: LogEntry): CallOrigin {
  return Object.freeze({
    tenant: entry.tenant,
    session: entry.session,
    ...(entry.run === undefined || entry.attempt === undefined
      ? {}
      : { run: entry.run, attempt: entry.attempt }),
  })
}

function smallFacts(
  source: Pick<ModelResponse, 'usage' | 'cost' | 'timing'> & {
    readonly credentialScope: ModelResponse['route']['credentialScope']
    readonly provider: ModelResponse['route']['provider']
    readonly upstreamRequestId?: string
  },
) {
  return {
    usage: source.usage,
    cost: source.cost,
    credentialScope: source.credentialScope,
    provider: source.provider,
    ...(source.upstreamRequestId === undefined
      ? {}
      : { upstreamRequestId: source.upstreamRequestId }),
    timing: source.timing,
  }
}

/** RT12 S-97: the small accounting result of one durable final; content is never copied. */
export function attemptFromFinal(value: ModelResponse, entry: LogEntry): AcknowledgedAttempt {
  const base = {
    response: value.id,
    dispatch: value.dispatch,
    origin: originOfEntry(entry),
    ...smallFacts({
      usage: value.usage,
      cost: value.cost,
      timing: value.timing,
      credentialScope: value.route.credentialScope,
      provider: value.route.provider,
      ...(value.route.upstreamRequestId === undefined
        ? {}
        : { upstreamRequestId: value.route.upstreamRequestId }),
    }),
    disposition: 'final' as const,
    ...(value.replyDisposition === undefined ? {} : { replyDisposition: value.replyDisposition }),
    ...(value.late === true ? { late: true as const } : {}),
  }
  return Object.freeze(
    value.outcome === 'interrupted'
      ? { ...base, outcome: 'interrupted' as const, initiator: value.initiator }
      : { ...base, outcome: value.outcome },
  )
}

/** RT12 S-97/MS8 S-57: an ACK witness stands for a ready reply whose disposition is pending. */
export function attemptFromWitness(witness: ModelCallAccountingWitness): AcknowledgedAttempt {
  const base = {
    response: witness.response,
    dispatch: witness.dispatch,
    origin: witness.origin,
    ...smallFacts({
      usage: witness.usage,
      cost: witness.cost,
      timing: witness.timing,
      credentialScope: witness.credentialScope,
      provider: witness.provider,
      ...(witness.upstreamRequestId === undefined
        ? {}
        : { upstreamRequestId: witness.upstreamRequestId }),
    }),
    disposition: 'disposition_pending' as const,
  }
  return Object.freeze(
    witness.outcome === 'interrupted'
      ? { ...base, outcome: 'interrupted' as const, initiator: witness.initiator }
      : { ...base, outcome: witness.outcome },
  )
}

/** The accounting identity of an attempt, without its current disposition. */
/**
 * The account facts one ResponseId must agree on across final, witness and ready (CA4 S-43,
 * MS8 S-58). The entry shell is excluded: a ready and its later final may carry different
 * legal shells, each checked against its own record.
 */
function accountingOf(attempt: AcknowledgedAttempt): unknown {
  const {
    disposition: _disposition,
    replyDisposition: _replyDisposition,
    late: _late,
    origin: _origin,
    ...accounting
  } = attempt
  return accounting
}

/** A final and an ACK witness of the same ResponseId agree on every account fact. */
export function finalMatchesWitness(
  final: ModelResponse,
  finalEntry: LogEntry,
  witness: ModelCallAccountingWitness,
): boolean {
  return modelLogJsonEqual(
    accountingOf(attemptFromFinal(final, finalEntry)),
    accountingOf(attemptFromWitness(witness)),
  )
}

export interface AcknowledgedDispatch {
  readonly response: ResponseId
  readonly dispatch: JsonNumber
  readonly final: AcknowledgedAttempt | null
}

function acknowledgedAttempt(
  item: AcknowledgedDispatch,
  witness: AcknowledgedAttempt | undefined,
): AcknowledgedAttempt | undefined {
  const witnessed =
    witness !== undefined &&
    witness.response === item.response &&
    ExactDecimal.from(witness.dispatch).compare(ExactDecimal.from(item.dispatch)) === 0
      ? witness
      : undefined
  if (item.final !== null) {
    if (
      item.final.response !== item.response ||
      ExactDecimal.from(item.final.dispatch).compare(ExactDecimal.from(item.dispatch)) !== 0 ||
      (witnessed !== undefined &&
        !modelLogJsonEqual(accountingOf(witnessed), accountingOf(item.final)))
    )
      return undefined
    return item.final
  } else if (witnessed !== undefined) {
    return witnessed
  } else {
    return undefined
  }
}

/**
 * RT12 S-97 with CA4 S-43 selection: per dispatch, the durable final, else the ACK witness of
 * the same ResponseId. A contradiction between them, or a dispatch with neither, is not
 * silently resolved: the whole sequence is unavailable.
 */
export function acknowledgedAttempts(
  record: ModelCallAcknowledgedRecord,
  dispatches: readonly AcknowledgedDispatch[],
): readonly AcknowledgedAttempt[] | undefined {
  const witness =
    record.accountingWitness === undefined
      ? undefined
      : attemptFromWitness(record.accountingWitness)
  const attempts: AcknowledgedAttempt[] = []
  for (const item of dispatches) {
    const attempt = acknowledgedAttempt(item, witness)
    if (attempt === undefined) return undefined
    attempts.push(attempt)
  }
  if (
    witness !== undefined &&
    !attempts.some(
      attempt =>
        attempt.response === witness.response &&
        ExactDecimal.from(attempt.dispatch).compare(ExactDecimal.from(witness.dispatch)) === 0,
    )
  )
    return undefined
  return Object.freeze(attempts)
}

/**
 * RT12 S-97 facts from an owned full-prefix history (readAttempts, reconcile): the same small
 * branch as the index, never the full dispatch records or payloads.
 */
export function acknowledgedFactsFromHistory(
  ref: CallKey,
  known: CallHistoryKnown,
  source: CallSource,
): AcknowledgedCallFacts | undefined {
  const acknowledged = known.acknowledged
  if (acknowledged === null) return undefined
  const dispatches: AcknowledgedDispatch[] = []
  for (const item of known.dispatches) {
    let final: AcknowledgedAttempt | null = null
    if (item.response !== null) {
      const value = item.response.value
      if (!isModelResponse(value)) return undefined
      final = attemptFromFinal(value, item.response.entry)
    }
    dispatches.push({ response: item.record.response, dispatch: item.record.dispatch, final })
  }
  const attempts = acknowledgedAttempts(acknowledged.record, dispatches)
  if (attempts === undefined) return undefined
  return Object.freeze({
    ref: Object.freeze({ session: ref.session, callId: ref.callId }),
    record: acknowledged.record,
    origin: originOfEntry(acknowledged.entry),
    terminalState: acknowledged.record.terminalState,
    source,
    attempts,
  })
}

/** RT12 S-96⑤: the confirmation summary with the current, closed cleanup progress. */
export function acknowledgementSummary(
  ref: CallKey,
  record: ModelCallAcknowledgedRecord,
  cleanup: ModelCallCleanupResult,
): CallAcknowledgement {
  const base = {
    ref: Object.freeze({ session: ref.session, callId: ref.callId }),
    target: record.target,
    acknowledgedAt: record.acknowledgedAt,
  }
  if (cleanup.cleanup === 'released') return Object.freeze({ ...base, cleanup: 'released' })
  const reasons = [...new Set(cleanup.pendingReasons)]
  const [first, ...rest] = reasons
  // A pending result always names a real obstacle; an empty list is a caller defect.
  if (first === undefined) throw new TypeError('pending cleanup without a reason')
  return Object.freeze({
    ...base,
    cleanup: 'pending',
    pendingReasons: Object.freeze([first, ...rest] as const),
  })
}

/** Complete durable acknowledged facts with the runtime's current cleanup progress. */
export function completeAcknowledgedView(
  facts: AcknowledgedCallFacts,
  cleanup: ModelCallCleanupResult,
): AcknowledgedCallView {
  return Object.freeze({
    ref: facts.ref,
    acknowledged: acknowledgementSummary(facts.ref, facts.record, cleanup),
    origin: facts.origin,
    terminalState: facts.terminalState,
    source: facts.source,
    attempts: facts.attempts,
  })
}
