import { isOk, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkAppendInput } from './input.ts'
import { addInteger, compareInteger } from './numbers.ts'
import type {
  AppendRequest,
  AppendRejection,
  AppendSuccess,
  LogCommit,
  LogState,
  JsonNumber,
  RunId,
  AttemptId,
} from './types.ts'

export function emptyLogState(): LogState {
  return Object.freeze({
    tail: 0,
    dedupeKeys: Object.freeze([]),
    readPositions: Object.freeze([]),
    maxAttempts: Object.freeze([]),
  })
}

/** S-33: caller owns the supplied confirmed state; this pure function performs no IO. */
export function judgeAppend(
  state: LogState,
  request: AppendRequest,
): AppendSuccess | AppendRejection {
  const first = request.entries[0]
  if (first === undefined) throw new TypeError('validated append has no entries')
  if (state.tenant !== undefined && !tenantIdEquals(state.tenant, first.tenant))
    return Object.freeze({ failure: 'tenantMismatch' })
  if (request.fence.kind === 'fenced') {
    const fence = request.fence
    const seen = state.maxAttempts.find(([run]) => run === fence.run)
    if (seen !== undefined && compareInteger(seen[1], fence.attempt) > 0)
      return Object.freeze({ failure: 'attemptSuperseded' })
  }
  const keys = request.entries.flatMap(entry =>
    entry.dedupeKey !== undefined && state.dedupeKeys.includes(entry.dedupeKey)
      ? [entry.dedupeKey]
      : [],
  )
  if (keys.length !== 0)
    return Object.freeze({ failure: 'alreadyRecorded', keys: Object.freeze(keys) })
  if (
    request.condition.kind === 'tailEquals' &&
    compareInteger(state.tail, request.condition.tail) !== 0
  )
    return Object.freeze({ failure: 'tailChanged', tail: state.tail })
  const positions = request.entries.map((_entry, index) => addInteger(state.tail, index + 1))
  return Object.freeze({
    positions: Object.freeze(positions),
    tail: addInteger(state.tail, request.entries.length),
  })
}

/** Folds shells, never business payloads; confirmed state is a deeply immutable value. */
export function foldCommit(state: LogState, commit: LogCommit): LogState {
  if (compareInteger(commit.first, addInteger(state.tail, 1)) !== 0)
    throw new TypeError('commit position is not contiguous')
  const checked = checkAppendInput(
    commit.session,
    commit.entries,
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new TypeError('invalid commit entries')
  const first = checked.ok.entries[0]
  if (first === undefined) throw new TypeError('commit has no entries')
  const parsedTenant = parseTenantId(state.tenant ?? first.tenant)
  if (!isOk(parsedTenant)) throw new TypeError('invalid confirmed tenant')
  const tenant = Object.freeze(parsedTenant.ok)
  const keys = new Set(state.dedupeKeys)
  const reads: (readonly [string, JsonNumber])[] = state.readPositions.map(([key, position]) =>
    Object.freeze([key, position]),
  )
  const attempts = new Map<RunId, AttemptId>(state.maxAttempts)
  for (const [index, entry] of checked.ok.entries.entries()) {
    if (!tenantIdEquals(tenant, entry.tenant)) throw new TypeError('commit mixes tenants')
    if (entry.dedupeKey !== undefined) keys.add(entry.dedupeKey)
    for (const key of entry.readKeys)
      reads.push(Object.freeze([key, addInteger(commit.first, index)]))
    if (entry.run !== undefined && entry.attempt !== undefined) {
      const seen = attempts.get(entry.run)
      if (seen === undefined || compareInteger(entry.attempt, seen) > 0)
        attempts.set(entry.run, entry.attempt)
    }
  }
  return Object.freeze({
    tenant,
    tail: addInteger(state.tail, commit.entries.length),
    dedupeKeys: Object.freeze([...keys]),
    readPositions: Object.freeze(reads),
    maxAttempts: Object.freeze(
      [...attempts].map(([run, attempt]) => Object.freeze([run, attempt] as const)),
    ),
  })
}
