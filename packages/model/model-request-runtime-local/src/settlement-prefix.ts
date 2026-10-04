import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import {
  ExactDecimal,
  judgeAccountValue,
  type AttemptId,
  type RunId,
} from '@omne-harness-lite/call-accounts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeMessage, type LoggedMessage } from '@omne-harness-lite/messages'
import { checkAppendInput, type LogEntry } from '@omne-harness-lite/session-log'
import { encodeModelLogKey, inspectModelLogEntry, inspectSettlementMembers, type ModelLogSettlementTarget, type ModelLogSettlementCurrent, type ModelLogSettlementAnchors, type SettlementMembersResult } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementUnavailableReason,
  RunHistoryReader,
} from './settlement-types.ts'

function object(value: unknown): value is { readonly [key: string]: unknown } {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
const prefixToken = Object.freeze({})
class OwnedPrefix {
  readonly #owned = true
  constructor(
    token: unknown,
    readonly binding: SettlementLogBinding,
    readonly entries: readonly LogEntry[],
    readonly tail: JsonNumber,
  ) {
    if (token !== prefixToken) throw new TypeError('Use readSettlementPrefix')
    Object.freeze(this)
  }
  static owns(value: unknown): value is OwnedPrefix {
    return value !== null && typeof value === 'object' && #owned in value
  }
}
export type SettlementPrefix = OwnedPrefix
/** Internal ownership test shared with call history; never a substitute for generation validity. */
export function isOwnedSettlementPrefix(value: unknown): value is SettlementPrefix {
  return OwnedPrefix.owns(value)
}
export type SettlementPrefixResult =
  | { readonly prefix: SettlementPrefix }
  | { readonly unavailable: true; readonly reason: SettlementUnavailableReason }
export function settlementGenerationCurrent(binding: SettlementLogBinding): boolean {
  try {
    return binding.currentGeneration() === binding.generation
  } catch {
    return false
  }
}
/** Full re-read only. No cached/key-filtered input can be promoted to a complete prefix. */
export async function readSettlementPrefix(input: {
  readonly binding: SettlementLogBinding
  readonly registration: SettlementRegistration
}): Promise<SettlementPrefixResult> {
  const { binding, registration } = input
  if (!settlementGenerationCurrent(binding)) return { unavailable: true, reason: 'generation' }
  let received: unknown
  try {
    const task = registration.start(
      'read',
      async () => await binding.log.readSince(binding.session, 0),
    )
    received = await task.completion
  } catch {
    return { unavailable: true, reason: 'log' }
  }
  if (!settlementGenerationCurrent(binding)) return { unavailable: true, reason: 'generation' }
  return ownPrefix(received, binding)
}
function prefixEntry(
  entry: unknown,
  index: number,
  binding: SettlementLogBinding,
): LogEntry | null {
  if (
    !object(entry) ||
    entry.session !== binding.session ||
    !isNonNegativeJsonInteger(entry.position) ||
    ExactDecimal.from(entry.position).compare(ExactDecimal.from(index + 1)) !== 0
  )
    return null
  const { session: _session, position, ...shell } = entry
  const checked = checkAppendInput(
    binding.session,
    [shell],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
  if (owned === undefined || !tenantIdEquals(owned.tenant, binding.tenant)) return null
  return Object.freeze({ ...owned, session: binding.session, position })
}
function isPrefixEnvelope(value: {
  readonly [key: string]: unknown
}): value is { readonly entries: readonly unknown[]; readonly tail: JsonNumber } {
  return !(
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.entries) ||
    !isNonNegativeJsonInteger(value.tail) ||
    ExactDecimal.from(value.tail).compare(ExactDecimal.from(value.entries.length)) !== 0
  )
}
function ownPrefix(received: unknown, binding: SettlementLogBinding): SettlementPrefixResult {
  const copied = copyJsonValue(received)
  if ('failed' in copied || !object(copied.ok)) return { unavailable: true, reason: 'prefix' }
  const value = copied.ok
  if ('failure' in value) return { unavailable: true, reason: 'log' }
  if (!isPrefixEnvelope(value)) return { unavailable: true, reason: 'prefix' }
  const entries: LogEntry[] = []
  for (const [index, entry] of value.entries.entries()) {
    const owned = prefixEntry(entry, index, binding)
    if (owned === null) return { unavailable: true, reason: 'prefix' }
    entries.push(owned)
  }
  return { prefix: new OwnedPrefix(prefixToken, binding, Object.freeze(entries), value.tail) }
}
export type SettlementInterpretation =
  | {
      readonly facts: {
        readonly anchors: ModelLogSettlementAnchors
        readonly ended: LogEntry | null
        readonly messagePrefix: readonly LoggedMessage[]
        readonly members: SettlementMembersResult
      }
    }
  | { readonly unavailable: true; readonly reason: SettlementUnavailableReason }

function startedAttempt(entry: LogEntry) {
  const payload = entry.payload
  if (!object(payload) || payload.category !== 'message') return null
  const judged = judgeMessage(payload.value)
  if (
    'rejected' in judged ||
    judged.ok.type !== 'system_reminder' ||
    judged.ok.nature !== 'event' ||
    judged.ok.source.kind !== 'attempt_started'
  )
    return null
  return judged.ok.source
}
function startedAttempts(prefix: SettlementPrefix, run: RunId): readonly AttemptId[] | null {
  const starts: AttemptId[] = []
  for (const entry of prefix.entries) {
    if (entry.run !== run || entry.attempt === undefined) continue
    const started = startedAttempt(entry)
    if (started === null) continue
    if (ExactDecimal.from(started.attempt).compare(ExactDecimal.from(entry.attempt)) !== 0)
      return null
    starts.push(started.attempt)
  }
  if (
    starts.length === 0 ||
    starts.some(
      (value, index) =>
        starts.findIndex(
          other => ExactDecimal.from(other).compare(ExactDecimal.from(value)) === 0,
        ) !== index,
    )
  )
    return null
  return starts
}
type KnownRunResult = Extract<ReturnType<RunHistoryReader>, { readonly known: unknown }>
function hasKnownRun(result: ReturnType<RunHistoryReader>): result is KnownRunResult {
  return !(
    result === null ||
    typeof result !== 'object' ||
    'unavailable' in result ||
    !('known' in result)
  )
}
function matchesRunSource(
  result: KnownRunResult,
  prefix: SettlementPrefix,
  run: RunId,
  attempt: AttemptId,
  latest: AttemptId,
): boolean {
  return !(
    result.known.run !== run ||
    !('ok' in judgeAccountValue('AttemptId', result.known.originalAttempt)) ||
    !('ok' in judgeAccountValue('AttemptId', result.known.latestAttempt)) ||
    ExactDecimal.from(result.known.originalAttempt).compare(ExactDecimal.from(attempt)) !== 0 ||
    ExactDecimal.from(result.known.latestAttempt).compare(ExactDecimal.from(latest)) !== 0 ||
    ExactDecimal.from(latest).compare(ExactDecimal.from(attempt)) < 0 ||
    (result.known.terminal !== 'open' && result.known.terminal !== 'ended') ||
    !settlementGenerationCurrent(prefix.binding)
  )
}
function validRunInput(
  prefix: SettlementPrefix,
  run: RunId,
  attempt: AttemptId,
  source: RunHistoryReader | undefined,
): source is RunHistoryReader {
  return !(
    !isOwnedSettlementPrefix(prefix) ||
    !settlementGenerationCurrent(prefix.binding) ||
    source === undefined ||
    !('ok' in judgeAccountValue('RunId', run)) ||
    !('ok' in judgeAccountValue('AttemptId', attempt))
  )
}
/** Bind both G28 axes to the same owned prefix and independently check the MS6 attempt facts. */
export function interpretRunAtPrefix(input: {
  readonly prefix: SettlementPrefix
  readonly run: RunId
  readonly attempt: AttemptId
  readonly source: RunHistoryReader | undefined
}):
  | {
      readonly known: {
        readonly prefix: SettlementPrefix
        readonly run: RunId
        readonly originalAttempt: AttemptId
        readonly latestAttempt: AttemptId
        readonly late: boolean
      }
    }
  | { readonly unavailable: true } {
  const { prefix, run, attempt, source } = input
  if (!validRunInput(prefix, run, attempt, source)) return { unavailable: true }
  const starts = startedAttempts(prefix, run)
  if (starts === null) return { unavailable: true }
  const original = starts.some(
    value => ExactDecimal.from(value).compare(ExactDecimal.from(attempt)) === 0,
  )
  if (!original) return { unavailable: true }
  const latest = starts.reduce((highest, current) =>
    ExactDecimal.from(current).compare(ExactDecimal.from(highest)) > 0 ? current : highest,
  )
  let late: boolean
  try {
    const result = source(prefix, run, attempt)
    if (!hasKnownRun(result) || !matchesRunSource(result, prefix, run, attempt, latest))
      return { unavailable: true }
    late =
      ExactDecimal.from(latest).compare(ExactDecimal.from(attempt)) > 0 ||
      result.known.terminal === 'ended'
  } catch {
    return { unavailable: true }
  }
  return {
    known: Object.freeze({
      prefix,
      run,
      originalAttempt: attempt,
      latestAttempt: latest,
      late,
    }),
  }
}
/** Pure interpretation. It does not certify source/permission or invent a Run owner. */
export function interpretSettlementPrefix(input: {
  readonly prefix: SettlementPrefix
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
}): SettlementInterpretation {
  if (!isOwnedSettlementPrefix(input.prefix)) return { unavailable: true, reason: 'prefix' }
  const { prefix, target, current } = input
  function record(key: Parameters<typeof encodeModelLogKey>[0]): LogEntry | null {
    const encoded = encodeModelLogKey(key)
    if (!('ok' in encoded)) return null
    const found = prefix.entries.filter(entry => entry.dedupeKey === encoded.ok)
    if (found.length !== 1 || found[0] === undefined) return null
    const item = inspectModelLogEntry({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      entry: found[0],
      purpose: { kind: 'record' },
      messagePrefix: null,
    })
    return 'ok' in item ? item.ok.entry : null
  }
  const dispatched = record({ kind: 'dispatched', call: target.call, dispatch: target.dispatch })
  if (dispatched === null) return { unavailable: true, reason: 'anchor' }
  if ((dispatched.run === undefined) !== (dispatched.attempt === undefined))
    return { unavailable: true, reason: 'anchor' }
  const anchors = {
    dispatched,
    opened: record({ kind: 'opened', call: target.call, dispatch: target.dispatch }),
    intent: record({ kind: 'intent', call: target.call }),
  }
  const members = inspectSettlementMembers({
    mode: 'read',
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
    target,
    anchors,
    current,
  })
  if ('inconsistent' in members || 'undetermined' in members)
    return {
      unavailable: true,
      reason: members.reason === 'run_history_unavailable' ? 'run_history_unavailable' : 'members',
    }
  // The codec already checked every declared model entry in this full prefix.
  const messages: LoggedMessage[] = []
  for (const entry of prefix.entries) {
    if (!object(entry.payload) || entry.payload.category !== 'message') continue
    const recognized = judgeMessage(entry.payload.value)
    if ('ok' in recognized && recognized.ok.type !== 'system') messages.push(recognized.ok)
  }
  return {
    facts: {
      anchors,
      ended: record({ kind: 'ended', call: target.call }),
      messagePrefix: Object.freeze(messages),
      members,
    },
  }
}
