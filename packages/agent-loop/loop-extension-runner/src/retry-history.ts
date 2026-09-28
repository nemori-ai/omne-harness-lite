import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { Conclusion, ModelRetryConclusion } from '@omne-harness-lite/loop-extension'
import { checkAppendInput, type LogEntry } from '@omne-harness-lite/session-log-jsonl'
import { inspectRunnerConclusion } from './conclusion-codec.ts'

export interface ReadRunnerRetryConclusionsInput {
  readonly session: string
  readonly tenant: TenantId
  readonly callId: string
  readonly entries: readonly LogEntry[]
  readonly tail: JsonNumber
}

const unavailable = Object.freeze({ unavailable: true } as const)

function isEffectiveRetry(value: Conclusion): value is ModelRetryConclusion {
  return (
    value.position === 'after_model_call' &&
    value.dimension.ending === 'failure' &&
    value.output?.kind === 'retry' &&
    value.skipped === undefined
  )
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Expects one already-authorized complete prefix. Array shape is not a read authority. */
export function readRunnerRetryConclusions(
  input: ReadRunnerRetryConclusionsInput,
): { readonly conclusions: readonly ModelRetryConclusion[] } | typeof unavailable {
  const copied = copyJsonValue(input)
  if (!('ok' in copied) || !object(copied.ok)) return unavailable
  const source = copied.ok
  const session = parseOpaqueIdentifier(source.session, 'SessionRef')
  const callId = parseOpaqueIdentifier(source.callId, 'ModelCallId')
  const tenant = parseTenantId(source.tenant)
  if (
    !('ok' in session) ||
    !('ok' in callId) ||
    !('ok' in tenant) ||
    !Array.isArray(source.entries) ||
    !isNonNegativeJsonInteger(source.tail)
  )
    return unavailable
  if (ExactDecimal.from(source.tail).compare(ExactDecimal.from(source.entries.length)) !== 0)
    return unavailable
  const conclusions: ModelRetryConclusion[] = []
  const dedupe = new Set<string>()
  for (const [index, raw] of source.entries.entries()) {
    if (
      !object(raw) ||
      raw.session !== session.ok ||
      !isNonNegativeJsonInteger(raw.position) ||
      ExactDecimal.from(raw.position).compare(ExactDecimal.from(index + 1)) !== 0
    )
      return unavailable
    const { session: _session, position: _position, ...shell } = raw
    const checked = checkAppendInput(
      session.ok,
      [shell],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if (!('ok' in checked)) return unavailable
    const owned = checked.ok.entries[0]
    if (owned === undefined || !tenantIdEquals(owned.tenant, tenant.ok)) return unavailable
    const entry: LogEntry = { ...owned, session: session.ok, position: raw.position }
    const inspected = inspectRunnerConclusion({ session: session.ok, tenant: tenant.ok, entry })
    if ('invalid' in inspected) return unavailable
    if ('unrelated' in inspected) continue
    if (entry.dedupeKey === undefined || dedupe.has(entry.dedupeKey)) return unavailable
    dedupe.add(entry.dedupeKey)
    const value = inspected.conclusion
    if (isEffectiveRetry(value) && value.modelCallId === callId.ok) conclusions.push(value)
  }
  return Object.freeze({ conclusions: Object.freeze(conclusions) })
}
