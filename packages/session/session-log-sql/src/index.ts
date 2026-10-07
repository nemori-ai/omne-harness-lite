import { randomUUID } from 'node:crypto'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  checkSourceToken,
  type LogAuthority,
  type OwnerFailure,
  type SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import { narrow, StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import {
  ensureJournal,
  entriesBetween,
  journal,
  matchesScope,
  tenantFrom,
  token,
  type LogDatabase,
} from './database.ts'
import { createHandle, recognizeBatch, type HeldLog, type OriginalBatch } from './handle.ts'
import { createParticipant } from './participant.ts'
import type { SessionLogSqlOptions, SqlSessionLog } from './types.ts'

export * from './types.ts'
export { sessionLogMigrations } from './migrations.ts'

const owners = new WeakMap<object, object>()
const rejected = (reason: OwnerFailure['reason']): OwnerFailure =>
  Object.freeze({ kind: 'rejected', reason })

/** Storage is borrowed. Its owner must close it only after this journal and its consumers drain. */
export function openSqlSessionLog(options: SessionLogSqlOptions): SqlSessionLog {
  if (!Number.isSafeInteger(options.operationLimit) || options.operationLimit < 1)
    throw new TypeError('operationLimit must be a positive safe integer')
  if (options.authority.storage !== options.storage)
    throw new TypeError('log authorization must use the same storage')
  if (owners.has(options.storage))
    throw new TypeError('this storage already has a live journal owner')
  const identity = Object.freeze({})
  owners.set(options.storage, identity)
  const ownerGeneration = randomUUID()
  let stopped = false
  let closed = false
  const holds = new Set<HeldLog>()
  let reservedHolds = 0
  const tasks = new Set<Promise<unknown>>()
  const pending = new Map<string, OriginalBatch>()
  const admission = () => !stopped && tasks.size + pending.size < options.operationLimit
  const direct = createHandle({
    storage: options.storage,
    limit: options.operationLimit,
    ownerAdmitting: admission,
  })
  function supervise<T>(action: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(action)
    tasks.add(task)
    task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    )
    return task
  }
  function track(unit: StorageUnit, original: () => OriginalBatch | undefined): void {
    const completion = unit.observeCompletion()
    void supervise(async () => {
      const outcome = await completion
      const batch = original()
      if (outcome === 'unknown' && batch !== undefined) pending.set(batch.id, batch)
    })
  }
  const participant = createParticipant(
    options.storage,
    options.authority,
    admission,
    supervise,
    track,
  )
  function hold(held: HeldLog) {
    holds.add(held)
    return async () => {
      await held.release()
      holds.delete(held)
    }
  }
  async function authorizeBorrow(
    access: LogAuthority,
    scope: SessionScope,
  ): Promise<OwnerFailure | undefined> {
    return options.storage.atomic(unit =>
      unit.run(async () => {
        const decision = await options.authority.authorize(unit, access, scope, 'write')
        if (decision.kind !== 'authorized')
          return rejected(decision.kind === 'denied' ? 'notAuthorized' : 'unavailable')
        const row = await unit.mutate(tx => ensureJournal(tx, scope, randomUUID()))
        return matchesScope(row, scope) ? undefined : rejected('notAuthorized')
      }),
    )
  }
  const owner = Object.freeze<SessionLogOwnerOperations>({
    enumerate(access: RecoveryAccess) {
      if (stopped) return Promise.resolve(rejected('ownerStopped'))
      if (!admission()) return Promise.resolve(rejected('unavailable'))
      return supervise(async () => {
        try {
          return await options.storage.atomic(unit =>
            unit.run(async () => {
              const decision = await options.authority.authorizeEnumeration(unit, access)
              if (decision.kind !== 'authorized')
                return rejected(decision.kind === 'denied' ? 'notAuthorized' : 'unavailable')
              const rows = await unit.query(tx =>
                narrow<LogDatabase>(tx)
                  .selectFrom('sl_journal')
                  .selectAll()
                  .orderBy('session')
                  .execute(),
              )
              return {
                kind: 'sessions' as const,
                sessions: Object.freeze(
                  rows.map(row =>
                    Object.freeze({
                      scope: Object.freeze({
                        tenant: token(row).tenant,
                        session: token(row).session,
                      }),
                      locator: row.session,
                    }),
                  ),
                ),
              }
            }),
          )
        } catch (error) {
          return ownerError(error)
        }
      })
    },
    readPrefix(access, scope) {
      const checked = scopeToken(scope)
      if (checked === undefined) return Promise.resolve(rejected('invalidInput'))
      if (stopped) return Promise.resolve(rejected('ownerStopped'))
      if (!admission()) return Promise.resolve(rejected('unavailable'))
      return supervise(async () => {
        try {
          return await options.storage.atomic(unit =>
            unit.run(async () => {
              await unit.mutate(tx => tx.lockSentinel(`session-log:${checked.session}`))
              const decision = await options.authority.authorize(unit, access, checked, 'read')
              if (decision.kind !== 'authorized')
                return rejected(decision.kind === 'denied' ? 'notAuthorized' : 'unavailable')
              const row = await unit.query(tx => journal(tx, checked.session))
              if (row === undefined) return rejected('unavailable')
              if (!matchesScope(row, checked)) return rejected('notAuthorized')
              const source = token(row)
              return {
                kind: 'prefix' as const,
                prefix: Object.freeze({
                  scope: Object.freeze({ tenant: source.tenant, session: source.session }),
                  ownerGeneration,
                  tail: source.tail,
                  entries: await unit.query(tx => entriesBetween(tx, source, 0, source.tail)),
                }),
              }
            }),
          )
        } catch (error) {
          return ownerError(error)
        }
      })
    },
    borrow(access: LogAuthority, scope: SessionScope) {
      if (holds.size + reservedHolds >= options.operationLimit)
        return Promise.resolve(rejected('unavailable'))
      const checked = scopeToken(scope)
      if (checked === undefined) return Promise.resolve(rejected('invalidInput'))
      if (stopped) return Promise.resolve(rejected('ownerStopped'))
      if (!admission()) return Promise.resolve(rejected('unavailable'))
      reservedHolds += 1
      return supervise(async () => {
        try {
          const result = await authorizeBorrow(access, checked)
          if (result !== undefined) return result
          if (stopped) return rejected('ownerStopped')
          const held = createHandle({
            storage: options.storage,
            limit: options.operationLimit,
            ownerAdmitting: admission,
            authority: { operations: options.authority, access, scope: checked },
          })
          const release = hold(held)
          return { kind: 'borrowed' as const, log: held.log, ownerGeneration, release }
        } catch (error) {
          return ownerError(error)
        } finally {
          reservedHolds -= 1
        }
      })
    },
  })
  return Object.freeze({
    ...direct.log,
    participant,
    owner,
    drainRaw: direct.release,
    backing: Object.freeze({
      ownerGeneration,
      borrow() {
        if (stopped || holds.size + reservedHolds >= options.operationLimit)
          throw new StorageUnavailable('journal owner is stopped or at borrow capacity')
        const held = createHandle({
          storage: options.storage,
          limit: options.operationLimit,
          ownerAdmitting: admission,
        })
        return { log: held.log, release: hold(held) }
      },
    }),
    async close() {
      if (closed) return
      stopped = true
      while (tasks.size !== 0) await Promise.all([...tasks])
      await direct.release()
      for (const [id, original] of pending) {
        if (!(await recognizeBatch(options.storage, original)))
          throw new StorageUnavailable('participating journal commit is unresolved')
        pending.delete(id)
      }
      for (const held of holds)
        if (!held.isReleased()) throw new StorageUnavailable('journal borrow is still held')
      holds.clear()
      closed = true
      if (owners.get(options.storage) === identity) owners.delete(options.storage)
    },
  })
}
function ownerError(error: unknown): OwnerFailure {
  if (error instanceof StorageUnavailable) return rejected('unavailable')
  throw error
}
function scopeToken(scope: SessionScope): SessionScope | undefined {
  const copy = copyJsonValue(scope)
  if ('failed' in copy || typeof copy.ok !== 'object' || copy.ok === null || Array.isArray(copy.ok))
    return
  if (Object.keys(copy.ok).length !== 2) return
  const checked = checkSourceToken({ ...copy.ok, journalGeneration: 'scope-check', tail: 0 })
  if ('failure' in checked) return
  return Object.freeze({ tenant: checked.ok.tenant, session: checked.ok.session })
}
