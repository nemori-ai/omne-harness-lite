import { randomUUID } from 'node:crypto'
import {
  checkAppendRequest,
  checkKey,
  checkSourceToken,
  compareInteger,
  sourceTokenEquals,
  type LogAuthority,
  type LogAuthorityOperations,
  type LogParticipationFailure,
  type SessionLogParticipant,
  type AppendRequest,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  StorageDefect,
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { stageAppend } from './append.ts'
import { entriesBetween, entriesByKey, journal, matchesScope, token } from './database.ts'
import type { OriginalBatch } from './handle.ts'

const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const denied = Object.freeze({ failure: 'denied' } as const)

export function validUnit(unit: StorageUnit, storage: AtomicStorage): boolean {
  try {
    unit.assertStorage(storage)
    return true
  } catch (error) {
    if (error instanceof StorageDefect) return false
    throw error
  }
}
function mapRejection(
  result: import('@omne-harness-lite/session-log').AppendRejection,
): LogParticipationFailure {
  switch (result.failure) {
    case 'tenantMismatch':
      return denied
    case 'attemptSuperseded':
      return { failure: 'staleAttempt' }
    case 'alreadyRecorded':
      return { failure: 'dedupeConflict', keys: result.keys }
    case 'tailChanged':
      return { failure: 'conditionFailed', tail: result.tail }
  }
}
async function available<T>(action: () => Promise<T>): Promise<T | typeof unavailable> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof StorageUnavailable) return unavailable
    throw error
  }
}
/** Trusted authorization port is bound to this exact storage; no independent permission transaction. */
export function createParticipant(
  storage: AtomicStorage,
  authority: LogAuthorityOperations,
  admission: () => boolean,
  supervise: <T>(action: () => Promise<T>) => Promise<T>,
  track: (unit: StorageUnit, original: () => OriginalBatch | undefined) => void,
): SessionLogParticipant {
  if (authority.storage !== storage)
    throw new TypeError('log authorization must use the same storage')
  return Object.freeze<SessionLogParticipant>({
    async readByKeyIn(unit, access, source, key) {
      const checked = checkSourceToken(source)
      if ('failure' in checked || !checkKey(key) || !validUnit(unit, storage)) return invalidInput
      if (!admission()) return unavailable
      return available(() =>
        supervise(() =>
          unit.run(async () => {
            const selected = await readFixedSourceIn(unit, access, checked.ok, authority)
            if ('failure' in selected) return selected
            const entries = await unit.query(tx =>
              entriesByKey(tx, checked.ok, key, checked.ok.tail),
            )
            return { kind: 'keyed' as const, entries, source: checked.ok }
          }),
        ),
      )
    },
    async sourceIn(unit, access, scope) {
      const captured = sourceScope(scope)
      if (captured === undefined || !validUnit(unit, storage)) return invalidInput
      if (!admission()) return unavailable
      const requested = { tenant: captured.tenant, session: captured.session }
      return unit.run(async () => {
        await unit.mutate(tx => tx.lockSentinel(`session-log:${requested.session}`))
        const decision = await authority.authorize(unit, access, requested, 'read')
        if (decision.kind !== 'authorized') return decision.kind === 'denied' ? denied : unavailable
        const row = await unit.query(tx => journal(tx, requested.session))
        if (row === undefined) return unavailable
        if (!matchesScope(row, requested)) return denied
        return { kind: 'source' as const, source: token(row) }
      })
    },
    async appendIn(unit, access, request, expectedSource) {
      const checked = checkAppendRequest(request)
      if ('failure' in checked || !validUnit(unit, storage)) return invalidInput
      if (!admission()) return unavailable
      const first = checked.ok.entries[0]
      if (first === undefined) return invalidInput
      const capturedSource = expected(expectedSource, checked.ok)
      if (capturedSource === false) return invalidInput
      const source = capturedSource
      const batch = randomUUID()
      let original: OriginalBatch | undefined
      track(unit, () => original)
      const capturedRequest = checked.ok
      const tenant = first.tenant
      async function stageInUnit() {
        await unit.mutate(tx => tx.lockSentinel(`session-log:${capturedRequest.session}`))
        const decision = await authority.authorize(
          unit,
          access,
          { tenant: tenant, session: capturedRequest.session },
          'write',
        )
        if (decision.kind !== 'authorized') return decision.kind === 'denied' ? denied : unavailable
        if (source !== undefined) {
          const current = await unit.query(tx => journal(tx, capturedRequest.session))
          if (current === undefined || !sourceTokenEquals(token(current), source))
            return unavailable
        }
        const result = await unit.mutate(tx =>
          stageAppend(tx, capturedRequest, randomUUID(), batch),
        )
        if ('failure' in result) return mapRejection(result)
        const last = result.entries.at(-1)
        if (last === undefined) throw new StorageDefect('staged journal batch is empty')
        original = { id: batch, request: capturedRequest, entries: result.entries }
        return { kind: 'staged' as const, entries: result.entries, nextTail: last.position }
      }
      return unit.run(stageInUnit)
    },
    async source(access, scope) {
      const captured = sourceScope(scope)
      if (captured === undefined) return invalidInput
      const checked = { ok: captured }
      if (!admission()) return unavailable
      return available(() =>
        supervise(() =>
          storage.atomic(unit =>
            unit.run(async () => {
              await unit.mutate(tx => tx.lockSentinel(`session-log:${checked.ok.session}`))
              const decision = await authority.authorize(unit, access, checked.ok, 'read')
              if (decision.kind !== 'authorized')
                return decision.kind === 'denied' ? denied : unavailable
              const row = await unit.query(tx => journal(tx, checked.ok.session))
              if (row === undefined) return unavailable
              if (!matchesScope(row, checked.ok)) return denied
              return { kind: 'source' as const, source: token(row) }
            }),
          ),
        ),
      )
    },
    async readPrefixIn(unit, access, source) {
      const checked = checkSourceToken(source)
      if ('failure' in checked || !validUnit(unit, storage)) return invalidInput
      if (!admission()) return unavailable
      return available(() =>
        supervise(() => unit.run(() => readFixedPrefixIn(unit, access, checked.ok, authority))),
      )
    },
    async readPrefix(access: LogAuthority, source) {
      const checked = checkSourceToken(source)
      if ('failure' in checked) return invalidInput
      if (!admission()) return unavailable
      return available(() =>
        supervise(() =>
          storage.atomic(unit =>
            unit.run(() => readFixedPrefixIn(unit, access, checked.ok, authority)),
          ),
        ),
      )
    },
  })
}

async function readFixedPrefixIn(
  unit: StorageUnit,
  access: LogAuthority,
  source: SourceToken,
  authority: LogAuthorityOperations,
): ReturnType<SessionLogParticipant['readPrefix']> {
  const selected = await readFixedSourceIn(unit, access, source, authority)
  if ('failure' in selected) return selected
  const entries = await unit.query(tx => entriesBetween(tx, source, 0, source.tail))
  const last = entries.at(-1)?.position ?? 0
  if (!sourceTokenEquals({ ...source, tail: last }, source)) return unavailable
  return { kind: 'prefix', entries, source }
}

async function readFixedSourceIn(
  unit: StorageUnit,
  access: LogAuthority,
  source: SourceToken,
  authority: LogAuthorityOperations,
): ReturnType<SessionLogParticipant['sourceIn']> {
  await unit.mutate(tx => tx.lockSentinel(`session-log:${source.session}`))
  const decision = await authority.authorize(unit, access, source, 'read')
  if (decision.kind !== 'authorized') return decision.kind === 'denied' ? denied : unavailable
  const row = await unit.query(tx => journal(tx, source.session))
  if (row === undefined) return unavailable
  if (!matchesScope(row, source)) return denied
  const current = token(row)
  if (compareInteger(source.tail, current.tail) > 0) return unavailable
  if (!sourceTokenEquals({ ...current, tail: source.tail }, source)) return unavailable
  return { kind: 'source', source }
}

function expected(
  value: SourceToken | undefined,
  request: AppendRequest,
): SourceToken | false | undefined {
  if (value === undefined) return
  const checked = checkSourceToken(value)
  const first = request.entries[0]
  if ('failure' in checked || first === undefined) return false
  return checked.ok.session === request.session && tenantIdEquals(checked.ok.tenant, first.tenant)
    ? checked.ok
    : false
}
function sourceScope(value: unknown): SourceToken | undefined {
  const copied = copyJsonValue(value)
  if (
    'failed' in copied ||
    typeof copied.ok !== 'object' ||
    copied.ok === null ||
    Array.isArray(copied.ok)
  )
    return
  if (Object.keys(copied.ok).length !== 2) return
  const checked = checkSourceToken({ ...copied.ok, journalGeneration: 'scope-check', tail: 0 })
  return 'failure' in checked ? undefined : checked.ok
}
