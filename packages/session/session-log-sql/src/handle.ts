import { randomUUID } from 'node:crypto'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  checkKey,
  checkSession,
  compareInteger,
  type AppendRequest,
  type AppendResult,
  type LogAuthority,
  type LogAuthorityOperations,
  type LogEntry,
  type ReadResult,
  type SessionLog,
} from '@omne-harness-lite/session-log'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type AtomicStorage,
  type ReadTx,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { stageAppend } from './append.ts'
import {
  decodeEntry,
  entriesBetween,
  journal,
  matchesScope,
  numberFrom,
  tenantFrom,
  type JournalRow,
  type LogDatabase,
} from './database.ts'

const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
export interface OriginalBatch {
  readonly id: string
  readonly request: AppendRequest
  readonly entries: readonly LogEntry[]
}
export interface HeldLog {
  readonly log: SessionLog
  readonly release: () => Promise<void>
  readonly isReleased: () => boolean
}
export interface HandleOptions {
  readonly storage: AtomicStorage
  readonly limit: number
  readonly ownerAdmitting: () => boolean
  readonly authority?: {
    readonly operations: LogAuthorityOperations
    readonly access: LogAuthority
    readonly scope: SessionScope
  }
}
export function createHandle(options: HandleOptions): HeldLog {
  let stopped = false
  let released = false
  const tasks = new Set<Promise<unknown>>()
  const pending = new Map<string, OriginalBatch>()
  function run<T>(action: () => Promise<T>, denied: T): Promise<T> {
    if (stopped || !options.ownerAdmitting() || tasks.size >= options.limit)
      return Promise.resolve(denied)
    const task = Promise.resolve().then(action)
    tasks.add(task)
    task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    )
    return task
  }
  async function authorized(
    unit: StorageUnit,
    session: string,
    operation: 'read' | 'write',
  ): Promise<boolean> {
    const binding = options.authority
    if (binding === undefined) return true // Private backing construction, never a public access check.
    if (session !== binding.scope.session) return false
    const decision = await binding.operations.authorize(
      unit,
      binding.access,
      binding.scope,
      operation,
    )
    if (decision.kind !== 'authorized') return false
    const row = await unit.query(tx => journal(tx, session))
    return row === undefined || matchesScope(row, binding.scope)
  }
  async function append(request: AppendRequest): Promise<AppendResult> {
    for (const [batch, original] of pending) {
      if (!(await recognizeBatch(options.storage, original))) return unavailable
      pending.delete(batch)
    }
    const id = randomUUID()
    let original: OriginalBatch | undefined
    try {
      const result = await options.storage.atomic(unit =>
        unit.run(async () => {
          await unit.mutate(tx => tx.lockSentinel(`session-log:${request.session}`))
          if (!(await authorized(unit, request.session, 'write'))) return unavailable
          const binding = options.authority
          if (!requestScopeMatches(request, binding?.scope))
            return { failure: 'tenantMismatch' } as const
          const result = await unit.mutate(tx => stageAppend(tx, request, randomUUID(), id))
          if ('failure' in result) return result
          original = { id, request, entries: result.entries }
          pending.set(id, original)
          return batchSuccess(original)
        }),
      )
      pending.delete(id)
      return result
    } catch (error) {
      if (!(error instanceof StorageUnavailable)) throw error
      if (original !== undefined && (await recognizeBatch(options.storage, original))) {
        pending.delete(id)
        return batchSuccess(original)
      }
      return unavailable
    }
  }
  async function read(
    session: string,
    select: (tx: ReadTx, row: JournalRow) => Promise<readonly LogEntry[]>,
  ): Promise<ReadResult> {
    try {
      return await options.storage.atomic(unit =>
        unit.run(async () => {
          await unit.mutate(tx => tx.lockSentinel(`session-log:${session}`))
          if (!(await authorized(unit, session, 'read'))) return unavailable
          const row = await unit.query(tx => journal(tx, session))
          if (row === undefined) return { entries: Object.freeze([]), tail: 0 }
          const tail = numberFrom(row.tail)
          return { entries: await unit.query(tx => select(tx, row)), tail }
        }),
      )
    } catch (error) {
      if (error instanceof StorageUnavailable) return unavailable
      throw error
    }
  }
  const log = Object.freeze<SessionLog>({
    append(session, entries, fence, condition) {
      const checked = checkAppendInput(session, entries, fence, condition)
      if ('failure' in checked) return Promise.resolve(invalidInput)
      return run(() => append(checked.ok), unavailable)
    },
    readSince(session, after) {
      const checked = checkSession(session)
      const copied = copyJsonValue(after)
      if ('failure' in checked || 'failed' in copied || !isNonNegativeJsonInteger(copied.ok))
        return Promise.resolve(invalidInput)
      const cursor = copied.ok
      return run(
        () =>
          read(checked.ok, (tx, row) =>
            entriesBetween(
              tx,
              {
                session: checked.ok,
                tenant: tenantFrom(row.tenant),
              },
              cursor,
              numberFrom(row.tail),
            ),
          ),
        unavailable,
      )
    },
    readByKey(session, key) {
      const checked = checkSession(session)
      if ('failure' in checked || !checkKey(key)) return Promise.resolve(invalidInput)
      return run(
        () =>
          read(checked.ok, async (tx, row) => {
            const rows = await narrow<LogDatabase>(tx)
              .selectFrom('sl_entry')
              .innerJoin('sl_read_key', join =>
                join
                  .onRef('sl_entry.session', '=', 'sl_read_key.session')
                  .onRef('sl_entry.position', '=', 'sl_read_key.position'),
              )
              .selectAll('sl_entry')
              .where('sl_entry.session', '=', checked.ok)
              .where('sl_read_key.key', '=', key)
              .orderBy('sl_entry.position_length')
              .orderBy('sl_entry.position')
              .execute()
            const scope = { session: checked.ok, tenant: tenantFrom(row.tenant) }
            return Object.freeze(rows.map(entry => decodeEntry(entry, scope)))
          }),
        unavailable,
      )
    },
  })
  return Object.freeze({
    log,
    isReleased: () => released,
    async release() {
      stopped = true
      while (tasks.size !== 0) {
        const settled = await Promise.allSettled([...tasks])
        const failed = settled.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
      }
      for (const [id, original] of pending) {
        if (!(await recognizeBatch(options.storage, original)))
          throw new StorageUnavailable('original journal commit is unresolved')
        pending.delete(id)
      }
      released = true
    },
  })
}
function batchSuccess(original: OriginalBatch): AppendResult {
  const last = original.entries.at(-1)
  if (last === undefined) throw new StorageDefect('confirmed journal batch is empty')
  return Object.freeze({
    positions: Object.freeze(original.entries.map(entry => entry.position)),
    tail: last.position,
  })
}

export async function recognizeBatch(
  storage: AtomicStorage,
  original: OriginalBatch,
): Promise<boolean> {
  try {
    return await storage.read(async tx => {
      const rows = await narrow<LogDatabase>(tx)
        .selectFrom('sl_entry')
        .selectAll()
        .where('session', '=', original.request.session)
        .where('batch', '=', original.id)
        .orderBy('position_length')
        .orderBy('position')
        .execute()
      if (rows.length === 0) return false // Absence does not prove a possible writer can no longer commit.
      if (rows.length !== original.entries.length)
        throw new StorageDefect('original journal batch is partial')
      for (const [index, row] of rows.entries()) {
        const expected = original.entries[index]
        if (
          expected === undefined ||
          compareInteger(numberFrom(row.position), expected.position) !== 0 ||
          row.value !== writeJsonLossless(original.request.entries[index])
        )
          throw new StorageDefect('original journal batch identity conflicts')
      }
      return true
    })
  } catch (error) {
    if (error instanceof StorageUnavailable) return false
    throw error
  }
}

function requestScopeMatches(request: AppendRequest, scope: SessionScope | undefined): boolean {
  if (scope === undefined) return true
  const first = request.entries[0]
  return (
    first !== undefined &&
    matchesScope(
      {
        session: request.session,
        tenant: writeJsonLossless(first.tenant),
        generation: 'scope-check',
        tail: '0',
      },
      scope,
    )
  )
}
