import { ExactDecimal, type ModelCallId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  ModelCallAcknowledgedRecord,
  ModelCallCreatedRecord,
  ModelCallDispatchedRecord,
  ModelCallEndedRecord,
  ModelCallInterruptIntentRecord,
  ModelCallOpenedRecord,
  ModelCallReplyReadyRecord,
  SessionRef,
} from '@omne-harness-lite/messages'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import type { ModelLogResponseProjection } from './log-codec.ts'
import { modelLogJsonEqual } from './log-codec-key.ts'
import {
  interpretSettlementPrefix,
  isOwnedSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from './settlement-prefix.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'

export interface CallHistoryDispatch {
  readonly ordinal: JsonNumber
  readonly dispatched: LogEntry
  readonly record: ModelCallDispatchedRecord
  readonly opened: LogEntry | null
  readonly response: {
    /** Original complete validated response, including raw usage and billing facts. */
    readonly value: JsonValue
    readonly projection: ModelLogResponseProjection
    readonly entry: LogEntry
  } | null
}

/**
 * `acknowledged` names a consumer that met a durable RT12 S-97 acknowledgement it does not yet
 * project. It is never produced by the interpreter itself.
 */
export type CallHistoryUnavailableReason =
  'prefix' | 'history' | 'unknown_format' | 'run_history_unavailable' | 'acknowledged'

export interface CallHistoryKnown {
  readonly session: SessionRef
  readonly callId: ModelCallId
  /** Null means an intent exists, but no durable call phase can yet be concluded. */
  readonly phase: DispatchGuardPhase | null
  readonly dispatches: readonly CallHistoryDispatch[]
  readonly intent: ModelCallInterruptIntentRecord | null
  readonly ending: ModelCallEndedRecord | null
  /**
   * RT12 S-95/S-97: the one durable acknowledgement fact of this CallKey, checked against the
   * creation source, terminal target and ordering in this prefix. After it, released payloads
   * may be absent; a consumer without the S-97 small view must not read full content.
   */
  readonly acknowledged: CallHistoryAcknowledgement | null
}

/** The ACK record and its entry; the entry shell is the original creation shell (MS8 S-58). */
export interface CallHistoryAcknowledgement {
  readonly record: ModelCallAcknowledgedRecord
  readonly entry: LogEntry
}

/** A complete log prefix can establish durable facts, but cannot establish an in-memory reply. */
export type CallHistoryResult =
  | { readonly absent: true }
  | { readonly unavailable: true; readonly reason: CallHistoryUnavailableReason }
  | { readonly known: CallHistoryKnown }

/** A history on which pre-acknowledgement full-content paths may still act. */
export type UnacknowledgedCallHistory =
  | { readonly absent: true }
  | { readonly unavailable: true; readonly reason: CallHistoryUnavailableReason }
  | { readonly known: CallHistoryKnown & { readonly acknowledged: null } }

type RecordEntry = {
  readonly entry: LogEntry
  readonly record:
    | ModelCallCreatedRecord
    | ModelCallReplyReadyRecord
    | ModelCallDispatchedRecord
    | ModelCallOpenedRecord
    | ModelCallInterruptIntentRecord
    | ModelCallEndedRecord
    | ModelCallAcknowledgedRecord
}

const unavailable = (reason: CallHistoryUnavailableReason) =>
  ({ unavailable: true, reason }) as const

/**
 * RT12 S-97/S-100 fail-closed gate for paths that read full pre-acknowledgement content or can
 * only act before a terminal state. A durable acknowledgement makes them unavailable; it never
 * treats the call as absent or reads released full content from caches or payload stores.
 */
export function rejectAcknowledgedHistory(history: CallHistoryResult): UnacknowledgedCallHistory {
  if (!('known' in history)) return history
  const known = history.known
  if (known.acknowledged !== null) return unavailable('acknowledged')
  return { known: { ...known, acknowledged: null } }
}

/**
 * RT12 S-100 for control and new-work entries (dispatch, dispatchAgain, canDispatchAgain,
 * interrupt, releaseCall): an acknowledged call is its real terminal state, so these paths
 * reach their existing terminal refusal without reading content. The phase is the ACK's
 * `terminalState`, which a ready-only log prefix alone cannot conclude.
 */
export function acknowledgedAsTerminal(history: CallHistoryResult): UnacknowledgedCallHistory {
  if (!('known' in history)) return history
  const known = history.known
  if (known.acknowledged === null) return { known: { ...known, acknowledged: null } }
  return { known: { ...known, phase: known.acknowledged.record.terminalState, acknowledged: null } }
}

/**
 * RT5 S-6/S-8/S-34: read one call from the owned, complete SL3 prefix.
 * No current process phase, diagnostic sink, cached projection, or Run guess is an input.
 * The return is a durable frontier; an unconfirmed writer may still change the log.
 */
export function interpretCallHistory(input: {
  readonly prefix: SettlementPrefix
  readonly callId: ModelCallId
}): CallHistoryResult {
  const { prefix, callId } = input
  if (!isOwnedSettlementPrefix(prefix) || !settlementGenerationCurrent(prefix.binding))
    return unavailable('prefix')
  const inspectedPrefix = inspectCurrentModelLogPrefix({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
  })
  if (!('ok' in inspectedPrefix))
    return unavailable(
      'reason' in inspectedPrefix && inspectedPrefix.reason === 'unknown_format'
        ? 'unknown_format'
        : 'history',
    )
  const records: RecordEntry[] = []
  const responses: { readonly entry: LogEntry; readonly response: ModelLogResponseProjection }[] =
    []
  for (const { entry, captured } of inspectedPrefix.ok) {
    if (captured.record !== null && 'call' in captured.record && captured.record.call === callId) {
      records.push({ entry, record: captured.record })
    }
    if (captured.response !== null && captured.response.call.callId === callId)
      responses.push({ entry, response: captured.response })
  }
  if (records.length === 0 && responses.length === 0) return { absent: true }
  const originalRun =
    records.find(item => item.record.kind === 'model_call_created')?.entry.run ??
    records.find(item => item.record.kind === 'model_call_dispatched')?.entry.run ??
    records[0]?.entry.run
  if (
    records.some(item => item.entry.run !== originalRun) ||
    responses.some(item => item.entry.run !== originalRun)
  )
    return unavailable('history')

  const dispatched = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallDispatchedRecord } =>
      item.record.kind === 'model_call_dispatched',
  )
  const created = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallCreatedRecord } =>
      item.record.kind === 'model_call_created',
  )
  const ready = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallReplyReadyRecord } =>
      item.record.kind === 'model_call_reply_ready',
  )
  const opened = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallOpenedRecord } =>
      item.record.kind === 'model_call_opened',
  )
  const intents = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallInterruptIntentRecord } =>
      item.record.kind === 'model_call_interrupt_intent',
  )
  const endings = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallEndedRecord } =>
      item.record.kind === 'model_call_ended',
  )
  const acknowledgements = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallAcknowledgedRecord } =>
      item.record.kind === 'model_call_acknowledged',
  )
  if (
    created.length > 1 ||
    intents.length > 1 ||
    endings.length > 1 ||
    opened.length > dispatched.length
  )
    return unavailable('history')
  if (
    ready.some(
      item =>
        !dispatched.some(
          candidate =>
            candidate.record.response === item.record.response &&
            ExactDecimal.from(candidate.record.dispatch).compare(
              ExactDecimal.from(item.record.dispatch),
            ) === 0,
        ),
    )
  )
    return unavailable('history')
  const dispatches: CallHistoryDispatch[] = []
  for (const [index, item] of dispatched.entries()) {
    if (ExactDecimal.from(item.record.dispatch).compare(ExactDecimal.from(index + 1)) !== 0)
      return unavailable('history')
    const anchor = opened.filter(
      candidate =>
        ExactDecimal.from(candidate.record.dispatch).compare(
          ExactDecimal.from(item.record.dispatch),
        ) === 0,
    )
    const body = responses.filter(candidate => candidate.response.id === item.record.response)
    if (
      anchor.length > 1 ||
      body.length > 1 ||
      (anchor[0] !== undefined &&
        (anchor[0].entry.run !== item.entry.run ||
          ExactDecimal.from(anchor[0].entry.attempt ?? 0).compare(
            ExactDecimal.from(item.entry.attempt ?? 0),
          ) !== 0)) ||
      (anchor[0] !== undefined &&
        ExactDecimal.from(anchor[0].entry.position).compare(
          ExactDecimal.from(item.entry.position),
        ) <= 0)
    )
      return unavailable('history')
    const interpreted = interpretSettlementPrefix({
      prefix,
      target: {
        call: callId,
        dispatch: item.record.dispatch,
        response: item.record.response,
      },
      current: null,
    })
    if (!('facts' in interpreted)) return unavailable('history')
    const members = interpreted.facts.members
    if ('inconsistent' in members || 'undetermined' in members) return unavailable('history')
    if ((body.length === 0) !== 'absent' in members) return unavailable('history')
    const complete = 'completeMembers' in members ? members.completeMembers : null
    const responseCapture = complete?.response ?? null
    const responseEntry = body[0]?.entry ?? null
    if (complete !== null && (responseCapture?.response === null || responseEntry === null))
      return unavailable('history')
    dispatches.push({
      ordinal: item.record.dispatch,
      dispatched: item.entry,
      record: item.record,
      opened: anchor[0]?.entry ?? null,
      response:
        responseCapture?.response !== null && responseCapture !== null && responseEntry !== null
          ? {
              value: responseCapture.value,
              projection: responseCapture.response,
              entry: responseEntry,
            }
          : null,
    })
  }
  if (
    opened.some(
      item =>
        !dispatched.some(
          candidate =>
            ExactDecimal.from(candidate.record.dispatch).compare(
              ExactDecimal.from(item.record.dispatch),
            ) === 0,
        ),
    ) ||
    responses.some(
      item => !dispatched.some(candidate => candidate.record.response === item.response.id),
    )
  )
    return unavailable('history')
  const last = dispatches.at(-1)
  const intent = intents[0]?.record ?? null
  const ending = endings[0]?.record ?? null
  if (
    (ending?.ending === 'undispatched' && last !== undefined) ||
    (ending === null && intent === null && last === undefined && created.length === 0) ||
    (last !== undefined &&
      ending !== null &&
      last.response === null &&
      ending.ending !== 'interrupted')
  )
    return unavailable('history')
  let phase: DispatchGuardPhase | null
  if (ending !== null) {
    phase = ending.ending === 'interrupted' ? 'interrupted' : 'handed_up'
  } else if (last === undefined) {
    phase = created.length === 1 && intent === null ? 'open' : null
  } else if (last?.response !== null && last?.response !== undefined) {
    const response = last.response.projection
    phase =
      response.outcome === 'complete' || response.outcome === 'truncated'
        ? 'complete'
        : response.outcome === 'failed'
          ? 'awaiting_decision'
          : response.outcome === 'interrupted' &&
              response.initiator === 'runtime_lost' &&
              last.opened === null
            ? 'resumable'
            : 'interrupted'
  } else if (ready.some(item => item.record.response === last.record.response)) {
    // The marker proves durable content exists, but its outcome is read from the
    // immutable content row by the facts owner rather than guessed from this log.
    phase = 'reply_pending'
  } else {
    phase = last?.opened === null ? 'in_flight' : 'speaking'
  }
  let acknowledged: CallHistoryAcknowledgement | null = null
  const acknowledgement = acknowledgements[0]
  if (acknowledgement !== undefined) {
    // RT12 S-96⑦/MS8 S-58: one business fact per CallKey. The same original batch may be
    // recognized again; any differing record is a rebuilt or conflicting batch, not a repeat.
    if (acknowledgements.some(item => !modelLogJsonEqual(item.record, acknowledgement.record)))
      return unavailable('history')
    // A rejected creation is carried by its undispatched ending with the original creation key.
    const creation = created[0] ?? endings.find(item => item.record.creationKey !== undefined)
    if (
      creation === undefined ||
      !acknowledgementConsistent({
        prefix,
        acknowledgement,
        creation,
        ready,
        ending: endings[0] ?? null,
        last,
        phase,
      })
    )
      return unavailable('history')
    acknowledged = { record: acknowledgement.record, entry: acknowledgement.entry }
  }
  return {
    known: {
      session: prefix.binding.session,
      callId,
      phase,
      dispatches: Object.freeze(dispatches),
      intent,
      ending,
      acknowledged,
    },
  }
}

function after(later: LogEntry, earlier: LogEntry): boolean {
  return ExactDecimal.from(later.position).compare(ExactDecimal.from(earlier.position)) > 0
}

function sameAttempt(left: LogEntry['attempt'], right: LogEntry['attempt']): boolean {
  if (left === undefined || right === undefined) return left === right
  return ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
}

/**
 * RT12 S-95/S-101 and MS8 S-58/S-59 cross-record checks that this log prefix alone can decide:
 * creation source, releasable payload ownership, terminal target and ordering. Semantic digest
 * and full accounting value comparison belong to the S-97/CA4 S-43 readers, which do not yet
 * exist; consumers therefore stay fail-closed through rejectAcknowledgedHistory.
 */
function acknowledgementConsistent(input: {
  readonly prefix: SettlementPrefix
  readonly acknowledgement: RecordEntry & { readonly record: ModelCallAcknowledgedRecord }
  readonly creation: RecordEntry & {
    readonly record: ModelCallCreatedRecord | ModelCallEndedRecord
  }
  readonly ready: readonly (RecordEntry & { readonly record: ModelCallReplyReadyRecord })[]
  readonly ending: (RecordEntry & { readonly record: ModelCallEndedRecord }) | null
  readonly last: CallHistoryDispatch | undefined
  readonly phase: DispatchGuardPhase | null
}): boolean {
  const { prefix, acknowledgement, creation, ready, ending, last, phase } = input
  const record = acknowledgement.record
  const entry = acknowledgement.entry
  // The ACK shell is the original creation shell, never the acknowledging consumer's Run.
  if (
    creation.record.creationKey !== record.creationKey ||
    creation.entry.run !== entry.run ||
    !sameAttempt(creation.entry.attempt, entry.attempt) ||
    !after(entry, creation.entry)
  )
    return false
  const owned = [
    ...(creation.record.payload === undefined ? [] : [creation.record.payload]),
    ...ready.map(item => item.record.payload),
  ]
  if (
    !record.releasablePayloads.every(payload =>
      owned.some(candidate => modelLogJsonEqual(candidate, payload)),
    )
  )
    return false
  const endedState =
    ending === null ? null : ending.record.ending === 'interrupted' ? 'interrupted' : 'handed_up'
  if (ending !== null && !after(entry, ending.entry)) return false
  const target = record.target
  if (target.kind === 'ended')
    return (
      ending !== null &&
      ending.record.ending === target.ending &&
      endedState === record.terminalState
    )
  // A response target is the last dispatch's terminal response, never an earlier failed one.
  if (last === undefined || last.record.response !== target.response) return false
  if (!after(entry, last.dispatched)) return false
  const marker = ready.find(item => item.record.response === target.response)
  const witness = record.accountingWitness
  if (witness !== undefined) {
    const origin = witness.origin
    if (
      marker === undefined ||
      witness.response !== target.response ||
      ExactDecimal.from(witness.dispatch).compare(ExactDecimal.from(last.ordinal)) !== 0 ||
      ExactDecimal.from(witness.readyPosition).compare(ExactDecimal.from(marker.entry.position)) !==
        0 ||
      !modelLogJsonEqual(witness.payload, marker.record.payload) ||
      !tenantIdEquals(origin.tenant, prefix.binding.tenant) ||
      origin.session !== prefix.binding.session ||
      origin.run !== marker.entry.run ||
      !sameAttempt(origin.attempt, marker.entry.attempt)
    )
      return false
    const body = last.response?.projection
    if (
      body !== undefined &&
      (body.outcome !== witness.outcome || body.initiator !== witness.initiator)
    )
      return false
  }
  if (last.response?.projection.outcome === 'failed') return false
  // A final committed after the ACK was not independently readable when it was fixed.
  if (last.response !== null && after(last.response.entry, entry) && witness === undefined)
    return false
  if (endedState !== null) {
    if (endedState !== record.terminalState) return false
    if (last.response !== null)
      return marker !== undefined ? after(entry, marker.entry) : after(entry, last.response.entry)
    return marker !== undefined && witness !== undefined && after(entry, marker.entry)
  }
  if (last.response !== null) {
    // A durable final (or a body without ready marker) decides the terminal state itself.
    if ((phase !== 'complete' && phase !== 'interrupted') || phase !== record.terminalState)
      return false
    return marker !== undefined ? after(entry, marker.entry) : after(entry, last.response.entry)
  }
  // Only a ready marker: the ACK must carry the witness of the complete original Pending.
  if (marker === undefined || witness === undefined || !after(entry, marker.entry)) return false
  const witnessed =
    witness.outcome === 'interrupted'
      ? witness.initiator === 'runtime_lost' && last.opened === null
        ? null
        : 'interrupted'
      : 'complete'
  return witnessed !== null && witnessed === record.terminalState
}
