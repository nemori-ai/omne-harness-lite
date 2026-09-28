import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeMessage, type LoggedMessage } from '@omne-harness-lite/messages'
import { checkAppendInput, type LogEntry } from '@omne-harness-lite/session-log-jsonl'
import {
  encodeModelLogKey,
  inspectModelLogEntry,
  inspectSettlementMembers,
  type ModelLogSettlementTarget,
  type ModelLogSettlementCurrent,
  type ModelLogSettlementAnchors,
  type SettlementMembersResult,
} from './log-codec-v2.ts'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementUnavailableReason,
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
  const copied = copyJsonValue(received)
  if ('failed' in copied || !object(copied.ok)) return { unavailable: true, reason: 'prefix' }
  const value = copied.ok
  if ('failure' in value) return { unavailable: true, reason: 'log' }
  if (
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.entries) ||
    !isNonNegativeJsonInteger(value.tail) ||
    ExactDecimal.from(value.tail).compare(ExactDecimal.from(value.entries.length)) !== 0
  )
    return { unavailable: true, reason: 'prefix' }
  const entries: LogEntry[] = []
  for (const [index, entry] of value.entries.entries()) {
    if (
      !object(entry) ||
      entry.session !== binding.session ||
      !isNonNegativeJsonInteger(entry.position) ||
      ExactDecimal.from(entry.position).compare(ExactDecimal.from(index + 1)) !== 0
    )
      return { unavailable: true, reason: 'prefix' }
    const { session: _session, position, ...shell } = entry
    const checked = checkAppendInput(
      binding.session,
      [shell],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
    if (owned === undefined || !tenantIdEquals(owned.tenant, binding.tenant))
      return { unavailable: true, reason: 'prefix' }
    entries.push(Object.freeze({ ...owned, session: binding.session, position }))
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
/** Pure interpretation. It does not certify source/permission or invent a Run owner. */
export function interpretSettlementPrefix(input: {
  readonly prefix: SettlementPrefix
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
}): SettlementInterpretation {
  if (!OwnedPrefix.owns(input.prefix)) return { unavailable: true, reason: 'prefix' }
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
  if (dispatched.run !== undefined || dispatched.attempt !== undefined)
    return { unavailable: true, reason: 'run_history_unavailable' }
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
