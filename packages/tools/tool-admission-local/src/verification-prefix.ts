import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  checkAppendInput,
  compareInteger,
  object,
  type CheckedPrefix,
  type LogEntry,
  type ReadResult,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

/** Owns a readSince(0) result and checks its full physical sequence before business interpretation. */
export function captureVerificationPrefix(
  scope: SessionScope,
  ownerGeneration: string,
  input: ReadResult,
): CheckedPrefix | undefined {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !object(copied.ok)) return undefined
  const value = copied.ok
  if (
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.entries) ||
    !isNonNegativeJsonInteger(value.tail)
  )
    return undefined
  if (compareInteger(value.tail, value.entries.length) !== 0) return undefined
  const entries: LogEntry[] = [],
    keys = new Set<string>()
  for (const [index, raw] of value.entries.entries()) {
    if (!object(raw)) return undefined
    const { session, position, ...shell } = raw
    if (
      session !== scope.session ||
      !isNonNegativeJsonInteger(position) ||
      compareInteger(position, index + 1) !== 0
    )
      return undefined
    const checked = checkAppendInput(
      scope.session,
      [shell],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if (!('ok' in checked)) return undefined
    const entry = checked.ok.entries[0]
    if (entry === undefined || !tenantIdEquals(entry.tenant, scope.tenant)) return undefined
    if (entry.dedupeKey !== undefined) {
      if (keys.has(entry.dedupeKey)) return undefined
      keys.add(entry.dedupeKey)
    }
    entries.push(Object.freeze({ ...entry, session: scope.session, position }))
  }
  return Object.freeze({
    scope,
    ownerGeneration,
    tail: value.tail,
    entries: Object.freeze(entries),
  })
}
