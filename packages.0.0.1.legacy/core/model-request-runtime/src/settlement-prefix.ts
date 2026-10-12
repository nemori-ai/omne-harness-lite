import {
  ModelLogHistory,
  captureModelLogHistory,
  type ModelHistorySelector,
} from './model-log-history.ts'
import { encodeModelLogKey } from './log-codec-key.ts'
import type { InspectedModelLogEntry } from './log-codec-entry.ts'
import {
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
import { type LoggedMessage } from '@omne-harness-lite/messages'
import { checkSourceToken, type SourceToken, type LogEntry } from '@omne-harness-lite/session-log'
import {
  createModelLogReadInspector,
  type ModelLogReadInspector,
  type ModelLogSettlementTarget,
  type ModelLogSettlementCurrent,
  type ModelLogSettlementAnchors,
  type SettlementMembersResult,
} from './log-codec-settlement.ts'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementUnavailableReason,
  RunHistoryReader,
} from './index.ts'

function object(value: unknown): value is { readonly [key: string]: unknown } {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
const prefixToken = Object.freeze({})
type PrefixAccessFailure = {
  readonly unavailable: true
  readonly reason: 'prefix' | 'generation'
}
type PrefixModelRead =
  | {
      readonly inspector: ModelLogReadInspector
      readonly messagePrefix: readonly LoggedMessage[]
    }
  | { readonly unavailable: true; readonly reason: 'unknown_format' | 'members' }
class OwnedPrefix {
  readonly #owned = true
  readonly #generation: object
  readonly #currentGeneration: SettlementLogBinding['currentGeneration']
  #modelRead: PrefixModelRead | undefined
  constructor(
    token: unknown,
    readonly binding: SettlementLogBinding,
    readonly history: ModelLogHistory,
    readonly raw: boolean,
  ) {
    if (token !== prefixToken) throw new TypeError('Use readSettlementPrefix')
    this.#generation = binding.generation
    this.#currentGeneration = binding.currentGeneration
    Object.freeze(this)
  }
  get entries(): readonly LogEntry[] {
    return this.history.entries
  }
  get tail(): JsonNumber {
    return this.history.tail
  }
  get source(): SourceToken {
    return this.history.source
  }
  static owns(value: unknown): value is OwnedPrefix {
    return value !== null && typeof value === 'object' && #owned in value
  }
  static access(value: unknown): OwnedPrefix | PrefixAccessFailure {
    if (!OwnedPrefix.owns(value)) return { unavailable: true, reason: 'prefix' }
    if (!sourceMatchesBinding(value.source, value.binding, value.tail))
      return { unavailable: true, reason: 'prefix' }
    if (
      value.binding.generation !== value.#generation ||
      value.binding.currentGeneration !== value.#currentGeneration ||
      !settlementGenerationCurrent(value.binding)
    )
      return { unavailable: true, reason: 'generation' }
    return value
  }
  static modelRead(value: unknown): PrefixModelRead | PrefixAccessFailure {
    const prefix = OwnedPrefix.access(value)
    if ('unavailable' in prefix) return prefix
    if (prefix.#modelRead === undefined) {
      const inspected = prefix.raw
        ? createModelLogReadInspector({
            session: prefix.source.session,
            tenant: prefix.source.tenant,
            prefix: { entries: prefix.entries, tail: prefix.tail },
          })
        : prefix.history.inspect()
      if ('ok' in inspected) {
        let messages: readonly LoggedMessage[] | undefined
        prefix.#modelRead = Object.freeze({
          inspector: inspected.ok,
          get messagePrefix() {
            const values =
              messages ??
              Object.freeze(
                inspected.ok.entries.flatMap(({ captured }) =>
                  captured.message !== null && captured.message.type !== 'system'
                    ? [captured.message]
                    : [],
                ),
              )
            if (prefix.raw) messages = values
            return values
          },
        })
      } else {
        prefix.#modelRead = Object.freeze<PrefixModelRead>({
          unavailable: true,
          reason:
            'reason' in inspected && inspected.reason === 'unknown_format'
              ? 'unknown_format'
              : 'members',
        })
      }
      const current = OwnedPrefix.access(prefix)
      if ('unavailable' in current) return current
    }
    return prefix.#modelRead
  }
}
export type SettlementPrefix = OwnedPrefix
export type SettlementPrefixEntriesResult =
  | { readonly ok: readonly InspectedModelLogEntry[] }
  | {
      readonly unavailable: true
      readonly reason: 'prefix' | 'generation' | 'unknown_format' | 'members'
    }
/** Fixed content interpretation. Each use checks the original owner and current generation. */
export function inspectSettlementPrefixEntries(input: {
  readonly prefix: SettlementPrefix
  readonly selector?: ModelHistorySelector
}): SettlementPrefixEntriesResult {
  const read = OwnedPrefix.modelRead(input.prefix)
  return 'unavailable' in read
    ? read
    : {
        ok:
          input.selector === undefined
            ? read.inspector.entries
            : read.inspector.select(input.selector),
      }
}
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
/** Read one complete raw or Session-owned cut through the current binding. */
export async function readSettlementPrefix(input: {
  readonly binding: SettlementLogBinding
  readonly registration: SettlementRegistration
}): Promise<SettlementPrefixResult> {
  const { binding, registration } = input
  if (!settlementGenerationCurrent(binding)) return { unavailable: true, reason: 'generation' }
  if (binding.readPrefix === undefined) return { unavailable: true, reason: 'dependency' }
  let received: unknown
  try {
    const task = registration.start('read', async () => await binding.readPrefix!())
    received = await task.completion
  } catch {
    return { unavailable: true, reason: 'log' }
  }
  if (!settlementGenerationCurrent(binding)) return { unavailable: true, reason: 'generation' }
  return ownPrefix(received, binding)
}
function captureRawPrefix(
  received: unknown,
): { readonly history: ModelLogHistory } | PrefixAccessFailure {
  if (
    !object(received) ||
    Object.keys(received).length !== 3 ||
    !['entries', 'tail', 'source'].every(key => Object.hasOwn(received, key))
  )
    return { unavailable: true, reason: 'prefix' }
  const captured = captureModelLogHistory(null, received)
  return 'failure' in captured ? { unavailable: true, reason: 'prefix' } : captured
}
function receivedPrefixContent(
  received: unknown,
): { readonly history: ModelLogHistory; readonly raw: boolean } | PrefixAccessFailure {
  const descriptor = object(received)
    ? Object.getOwnPropertyDescriptor(received, 'history')
    : undefined
  const held: unknown =
    descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined
  if (ModelLogHistory.owns(held)) return { history: held, raw: false }
  const captured = captureRawPrefix(received)
  return 'unavailable' in captured ? captured : { history: captured.history, raw: true }
}
function ownPrefix(received: unknown, binding: SettlementLogBinding): SettlementPrefixResult {
  if (object(received) && 'failure' in received) return { unavailable: true, reason: 'log' }
  const captured = receivedPrefixContent(received)
  if ('unavailable' in captured) return captured
  const { history, raw } = captured
  if (!sourceMatchesBinding(history.source, binding, history.tail))
    return { unavailable: true, reason: 'prefix' }
  return { prefix: new OwnedPrefix(prefixToken, binding, history, raw) }
}
/** Fixed content suffix, independent of Model interpretation. */
export function settlementPrefixContent(input: {
  readonly prefix: SettlementPrefix
  readonly after?: number
}): { readonly ok: readonly LogEntry[] } | PrefixAccessFailure {
  const prefix = OwnedPrefix.access(input.prefix)
  if ('unavailable' in prefix) return prefix
  const after = input.after ?? 0
  if (!Number.isSafeInteger(after) || after < 0 || after > prefix.history.length)
    return { unavailable: true, reason: 'prefix' }
  return { ok: prefix.history.entriesSince(after) }
}
/** Counts the complete canonical prefix without introducing a lifecycle check before the caller's guard. */
export function settlementPrefixBytes(prefix: SettlementPrefix): number {
  if (!OwnedPrefix.owns(prefix)) throw new TypeError('owned settlement prefix required')
  return prefix.history.retainedBytes
}
export function selectSettlementPrefixContent(
  prefix: SettlementPrefix,
  selector: Exclude<ModelHistorySelector, { kind: 'message' | 'response' | 'dispatchResponse' }>,
): { readonly ok: readonly LogEntry[] } | PrefixAccessFailure {
  const accessed = OwnedPrefix.access(prefix)
  return 'unavailable' in accessed ? accessed : { ok: accessed.history.select(selector) }
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

function startedAttempts(prefix: SettlementPrefix, run: RunId): readonly AttemptId[] | null {
  const starts: AttemptId[] = []
  const seen = new Set<string>()
  const read = prefix.history.sessionFacts({ run, kind: 'attempt_started' })
  if (read.invalid) return null
  for (const { fact } of read.entries) {
    if (fact.kind !== 'attempt_started') continue
    const key = ExactDecimal.from(fact.attempt).toCanonicalString()
    if (seen.has(key)) return null
    seen.add(key)
    starts.push(fact.attempt)
  }
  return starts.length === 0 ? null : starts
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
  const accessed = OwnedPrefix.access(input.prefix)
  if ('unavailable' in accessed) return accessed
  const { prefix, target, current } = input
  function record(key: Parameters<typeof encodeModelLogKey>[0]): LogEntry | null {
    const encoded = encodeModelLogKey(key)
    if (!('ok' in encoded)) return null
    const found = prefix.history.select({ kind: 'dedupe', key: encoded.ok })
    if (found.length !== 1 || found[0] === undefined) return null
    const item = prefix.history.recordAt(
      Number(ExactDecimal.from(found[0].position).toCanonicalString()) - 1,
    )
    return item?.entry ?? null
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
  const read = OwnedPrefix.modelRead(prefix)
  if ('unavailable' in read)
    return { unavailable: true, reason: read.reason === 'unknown_format' ? 'members' : read.reason }
  const members = read.inspector.inspectSettlementMembers({
    target,
    anchors,
    current,
  })
  if ('inconsistent' in members || 'undetermined' in members)
    return {
      unavailable: true,
      reason: members.reason === 'run_history_unavailable' ? 'run_history_unavailable' : 'members',
    }
  return {
    facts: {
      anchors,
      ended: record({ kind: 'ended', call: target.call }),
      get messagePrefix() {
        return read.messagePrefix
      },
      members,
    },
  }
}

function sourceMatchesBinding(
  source: SourceToken,
  binding: SettlementLogBinding,
  tail: JsonNumber,
): boolean {
  return (
    source.session === binding.session &&
    tenantIdEquals(source.tenant, binding.tenant) &&
    ExactDecimal.from(source.tail).compare(ExactDecimal.from(tail)) === 0
  )
}
