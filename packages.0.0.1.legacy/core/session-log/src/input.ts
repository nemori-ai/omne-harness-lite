import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  isOk,
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { compareInteger, positiveInteger } from './numbers.ts'
import type {
  AppendCondition,
  AppendFence,
  AppendRequest,
  InvalidInput,
  OwnedLogEntry,
  SessionRef,
} from './types.ts'

import { checkKey, checkSession, invalidInput, object } from './values.ts'
import { checkLogPayload } from './payload.ts'
export { checkKey, checkSession, invalidInput, object } from './values.ts'
function only(value: { readonly [key: string]: JsonValue }, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}
function fenceFrom(value: JsonValue): AppendFence | InvalidInput {
  if (!object(value)) return invalidInput
  if (value.kind === 'unfenced' && only(value, ['kind'])) return Object.freeze({ kind: 'unfenced' })
  if (value.kind !== 'fenced' || !only(value, ['kind', 'run', 'attempt'])) return invalidInput
  if (!checkKey(value.run) || !positiveInteger(value.attempt)) return invalidInput
  return Object.freeze({ kind: 'fenced', run: value.run, attempt: value.attempt })
}
function conditionFrom(value: JsonValue): AppendCondition | InvalidInput {
  if (!object(value)) return invalidInput
  if (value.kind === 'unconditional' && only(value, ['kind']))
    return Object.freeze({ kind: 'unconditional' })
  if (
    value.kind !== 'tailEquals' ||
    !only(value, ['kind', 'tail']) ||
    !isNonNegativeJsonInteger(value.tail)
  )
    return invalidInput
  return Object.freeze({ kind: 'tailEquals', tail: value.tail })
}
function validPayload(value: JsonValue | undefined): value is JsonValue {
  return value !== undefined && !('failure' in checkLogPayload(value))
}
function readKeysFrom(values: readonly JsonValue[]): readonly string[] | InvalidInput {
  const readKeys: string[] = []
  const seen = new Set<string>()
  for (const key of values) {
    if (!checkKey(key) || seen.has(key)) return invalidInput
    seen.add(key)
    readKeys.push(key)
  }
  return Object.freeze(readKeys)
}
function entryCoordinates(value: {
  readonly [key: string]: JsonValue
}): Pick<OwnedLogEntry, 'run' | 'attempt' | 'dedupeKey'> | InvalidInput {
  if (Object.hasOwn(value, 'run') !== Object.hasOwn(value, 'attempt')) return invalidInput
  const run = value.run
  const attempt = value.attempt
  if (run !== undefined && (!checkKey(run) || !positiveInteger(attempt))) return invalidInput
  const dedupeKey = value.dedupeKey
  if (dedupeKey !== undefined && !checkKey(dedupeKey)) return invalidInput
  return {
    ...(typeof run === 'string' && positiveInteger(attempt) ? { run, attempt } : {}),
    ...(typeof dedupeKey === 'string' ? { dedupeKey } : {}),
  }
}
function entryFrom(value: JsonValue): OwnedLogEntry | InvalidInput {
  if (
    !object(value) ||
    !only(value, ['tenant', 'run', 'attempt', 'dedupeKey', 'readKeys', 'payload'])
  )
    return invalidInput
  const tenant = parseTenantId(value.tenant)
  if (!isOk(tenant) || !Object.hasOwn(value, 'payload') || !Array.isArray(value.readKeys))
    return invalidInput
  const readKeys = readKeysFrom(value.readKeys)
  if ('failure' in readKeys) return invalidInput
  const coordinates = entryCoordinates(value)
  if ('failure' in coordinates) return invalidInput
  const payload = value.payload
  if (!validPayload(payload)) return invalidInput
  return Object.freeze({
    tenant: Object.freeze(tenant.ok),
    ...coordinates,
    readKeys,
    payload,
  })
}

function entryMatchesFence(entry: OwnedLogEntry, fence: AppendFence): boolean {
  return (
    fence.kind !== 'fenced' ||
    (entry.run === fence.run &&
      entry.attempt !== undefined &&
      compareInteger(entry.attempt, fence.attempt) === 0)
  )
}
function entriesFrom(
  raw: readonly JsonValue[],
  fence: AppendFence,
): readonly OwnedLogEntry[] | InvalidInput {
  const owned: OwnedLogEntry[] = []
  const keys = new Set<string>()
  for (const entry of raw) {
    const parsed = entryFrom(entry)
    if ('failure' in parsed) return invalidInput
    const first = owned[0]
    if (first !== undefined && !tenantIdEquals(first.tenant, parsed.tenant)) return invalidInput
    if (parsed.dedupeKey !== undefined) {
      if (keys.has(parsed.dedupeKey)) return invalidInput
      keys.add(parsed.dedupeKey)
    }
    if (!entryMatchesFence(parsed, fence)) return invalidInput
    owned.push(parsed)
  }
  return Object.freeze(owned)
}

/** S-17/S-32: representation only; copies all data before any IO or queue admission. */
export function checkAppendInput(
  session: unknown,
  entries: unknown,
  fence: unknown,
  condition: unknown,
): { readonly ok: AppendRequest } | InvalidInput {
  const parsedSession = checkSession(session)
  if ('failure' in parsedSession) return invalidInput
  const copied = copyJsonValue({ entries, fence, condition })
  if ('failed' in copied || !object(copied.ok)) return invalidInput
  const rawEntries = copied.ok.entries
  const rawFence = copied.ok.fence
  const rawCondition = copied.ok.condition
  if (
    !Array.isArray(rawEntries) ||
    rawEntries.length === 0 ||
    rawFence === undefined ||
    rawCondition === undefined
  )
    return invalidInput
  const parsedFence = fenceFrom(rawFence)
  const parsedCondition = conditionFrom(rawCondition)
  if ('failure' in parsedFence || 'failure' in parsedCondition) return invalidInput
  const owned = entriesFrom(rawEntries, parsedFence)
  if ('failure' in owned) return invalidInput
  return Object.freeze({
    ok: Object.freeze({
      session: parsedSession.ok,
      entries: owned,
      fence: parsedFence,
      condition: parsedCondition,
    }),
  })
}

/** Closed participant request boundary; no property is read before the strict data copy. */
export function checkAppendRequest(value: unknown): { readonly ok: AppendRequest } | InvalidInput {
  const copied = copyJsonValue(value)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    !only(copied.ok, ['session', 'entries', 'fence', 'condition'])
  )
    return invalidInput
  return checkAppendInput(
    copied.ok.session,
    copied.ok.entries,
    copied.ok.fence,
    copied.ok.condition,
  )
}
