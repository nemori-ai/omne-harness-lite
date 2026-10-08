import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  narrow,
  type MigrationFragment,
  type Storage,
  type WriteTx,
} from '@omne-harness-lite/storage'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import type {
  ModelCallSettlementWork,
  ModelCallSettlementWorkKey,
  ModelCallSettlementWorkStore,
} from './reference-types.ts'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { SettlementStagedBatch } from './settlement-types.ts'

interface WorkRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly call: string
  readonly response: string
  readonly work_id: string
  readonly generation: number
  readonly owner: string
  /** The complete held batch, lossless JSON. */
  readonly staged: string
}
interface WorkDatabase {
  model_call_settlement_work: WorkRow
}

/** RT12 S-99⑧: one row per (tenant, session, call, ResponseId); private to this package. */
export const settlementWorkMigration: MigrationFragment = {
  name: 'model_call_settlement_work',
  migration: {
    async up(db) {
      await db.schema
        .createTable('model_call_settlement_work')
        .ifNotExists()
        .addColumn('organization', 'text', c => c.notNull())
        .addColumn('account', 'text', c => c.notNull())
        .addColumn('session', 'text', c => c.notNull())
        .addColumn('call', 'text', c => c.notNull())
        .addColumn('response', 'text', c => c.notNull())
        .addColumn('work_id', 'text', c => c.notNull())
        .addColumn('generation', 'integer', c => c.notNull())
        .addColumn('owner', 'text', c => c.notNull())
        .addColumn('staged', 'text', c => c.notNull())
        .addPrimaryKeyConstraint('model_call_settlement_work_pkey', [
          'organization',
          'account',
          'session',
          'call',
          'response',
        ])
        .execute()
    },
  },
}

const unavailable = Object.freeze({ unavailable: true } as const)

function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function validKey(key: ModelCallSettlementWorkKey): boolean {
  const binding: SettlementLogBinding | undefined = key?.binding
  return (
    binding !== null &&
    typeof binding === 'object' &&
    'ok' in parseTenantId(binding.tenant) &&
    'ok' in parseOpaqueIdentifier(binding.session, 'SessionRef') &&
    typeof key.call === 'string' &&
    'ok' in judgeAccountValue('ModelCallId', key.call) &&
    typeof key.response === 'string' &&
    key.response.length > 0
  )
}

function validWork(workId: unknown, generation?: unknown): boolean {
  return (
    typeof workId === 'string' &&
    workId.length > 0 &&
    (generation === undefined || (Number.isSafeInteger(generation) && Number(generation) > 0))
  )
}

function isStagedCurrent(current: unknown): boolean {
  return (
    current === null ||
    (object(current) && typeof current.messageId === 'string' && current.disposition !== undefined)
  )
}
function isStagedCondition(condition: unknown): boolean {
  return (
    object(condition) &&
    (condition.kind === 'unconditional' ||
      (condition.kind === 'tailEquals' && isJsonNumber(condition.tail)))
  )
}
function matchesStagedRow(
  row: WorkRow | undefined | null,
  workId: string,
  generation: number,
  text: string,
): boolean {
  return (
    row !== undefined &&
    row !== null &&
    row.work_id === workId &&
    Number(row.generation) === generation &&
    row.staged === text
  )
}

function isStaged(
  value: Record<string, unknown>,
  key: ModelCallSettlementWorkKey,
): value is Record<string, unknown> & SettlementStagedBatch {
  const { target, current, condition, entries } = value
  return (
    Object.keys(value).length === 4 &&
    object(target) &&
    target.call === key.call &&
    target.response === key.response &&
    isJsonNumber(target.dispatch) &&
    isStagedCurrent(current) &&
    Array.isArray(entries) &&
    entries.length > 0 &&
    entries.every(
      entry => object(entry) && object(entry.tenant) && Array.isArray(entry.readKeys),
    ) &&
    isStagedCondition(condition)
  )
}

/** Owns a strict copy of a held batch, or refuses a shape it cannot restore exactly. */
function ownStaged(
  value: unknown,
  key: ModelCallSettlementWorkKey,
): SettlementStagedBatch | undefined {
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !object(copied.ok) || !isStaged(copied.ok, key)) return undefined
  return Object.freeze(copied.ok)
}

function decode(
  row: WorkRow,
  key: ModelCallSettlementWorkKey,
): ModelCallSettlementWork | undefined {
  const parsed = readJsonStrict(row.staged)
  if (!('ok' in parsed)) return undefined
  const staged = ownStaged(parsed.ok, key)
  const generation = Number(row.generation)
  if (staged === undefined || !validWork(row.work_id, generation)) return undefined
  return Object.freeze({ workId: row.work_id, generation, owner: row.owner, staged })
}

function stagedOrOccupied(
  row: WorkRow | undefined,
  key: ModelCallSettlementWorkKey,
  matches: (row: WorkRow) => boolean,
): Awaited<ReturnType<ModelCallSettlementWorkStore['stage']>> {
  if (row === undefined) return unavailable
  if (matches(row)) return { staged: { generation: 1 } }
  const occupied = decode(row, key)
  return occupied === undefined ? unavailable : { occupied }
}
/**
 * RT12 S-99⑧ staging rows in the same Storage as the call's content and retention rows. Every
 * statement names the exact CallKey and ResponseId; changes also name the work and generation.
 * A commit whose receipt is lost is recognized only from the row itself.
 */
export function createSettlementWorkStore(input: {
  readonly storage: Storage
  readonly owned: <T>(work: () => Promise<T>) => Promise<T>
  readonly closed: () => boolean
}): ModelCallSettlementWorkStore {
  const { storage, owned } = input
  const where = (key: ModelCallSettlementWorkKey) => ({
    organization: key.binding.tenant.organization,
    account: key.binding.tenant.account,
    session: key.binding.session,
    call: key.call,
    response: key.response,
  })
  async function select(
    tx: Parameters<Parameters<Storage['read']>[0]>[0],
    key: ModelCallSettlementWorkKey,
  ): Promise<WorkRow | undefined> {
    const k = where(key)
    return await narrow<WorkDatabase>(tx)
      .selectFrom('model_call_settlement_work')
      .selectAll()
      .where('organization', '=', k.organization)
      .where('account', '=', k.account)
      .where('session', '=', k.session)
      .where('call', '=', k.call)
      .where('response', '=', k.response)
      .executeTakeFirst()
  }
  async function readRow(key: ModelCallSettlementWorkKey): Promise<WorkRow | null | undefined> {
    try {
      return (await storage.read(async tx => await select(tx, key))) ?? null
    } catch {
      return undefined
    }
  }
  function ownKey(key: ModelCallSettlementWorkKey): ModelCallSettlementWorkKey {
    return Object.freeze({
      binding: Object.freeze({ ...key.binding, tenant: Object.freeze({ ...key.binding.tenant }) }),
      call: key.call,
      response: key.response,
    })
  }
  async function locked(
    tx: WriteTx,
    key: ModelCallSettlementWorkKey,
  ): Promise<WorkRow | undefined> {
    await tx.lockRow('model_call_settlement_work', where(key))
    return await select(tx, key)
  }

  return Object.freeze<ModelCallSettlementWorkStore>({
    async stage(request) {
      if (input.closed() || !validKey(request) || !validWork(request.workId)) return unavailable
      const key = ownKey(request)
      const staged = ownStaged(request.staged, key)
      if (staged === undefined || typeof request.owner !== 'string') return unavailable
      const text = writeJsonLossless(staged)
      const workId = request.workId
      const owner = request.owner
      const matches = (row: WorkRow | undefined | null) => matchesStagedRow(row, workId, 1, text)
      return await owned(async () => {
        let row: WorkRow | undefined
        try {
          row = await storage.write(async tx => {
            await narrow<WorkDatabase>(tx)
              .insertInto('model_call_settlement_work')
              .values({ ...where(key), work_id: workId, generation: 1, owner, staged: text })
              .onConflict(oc => oc.doNothing())
              .execute()
            return await locked(tx, key)
          })
        } catch {
          // Receipt unknown: only this exact row, read back, proves the stage committed.
          const found = await readRow(key)
          if (matches(found)) return { staged: { generation: 1 } }
          if (found === undefined || found === null) return unavailable
          row = found
        }
        return stagedOrOccupied(row, key, matches)
      })
    },
    async replace(request) {
      if (input.closed() || !validKey(request) || !validWork(request.workId, request.generation))
        return unavailable
      const key = ownKey(request)
      const staged = ownStaged(request.staged, key)
      if (staged === undefined) return unavailable
      const text = writeJsonLossless(staged)
      const { workId, generation } = request
      const next = generation + 1
      return await owned(async () => {
        let outcome: 'replaced' | 'rejected'
        try {
          outcome = await storage.write(async tx => {
            const row = await locked(tx, key)
            // A late worker of another work or an older generation never touches this row.
            if (
              row === undefined ||
              row.work_id !== workId ||
              Number(row.generation) !== generation
            )
              return 'rejected' as const
            const k = where(key)
            await narrow<WorkDatabase>(tx)
              .updateTable('model_call_settlement_work')
              .set({ generation: next, staged: text })
              .where('organization', '=', k.organization)
              .where('account', '=', k.account)
              .where('session', '=', k.session)
              .where('call', '=', k.call)
              .where('response', '=', k.response)
              .where('work_id', '=', workId)
              .where('generation', '=', generation)
              .execute()
            return 'replaced' as const
          })
        } catch {
          const found = await readRow(key)
          if (matchesStagedRow(found, workId, next, text)) return { staged: { generation: next } }
          return unavailable
        }
        return outcome === 'replaced' ? { staged: { generation: next } } : { rejected: true }
      })
    },
    async read(request) {
      if (!validKey(request)) return unavailable
      const key = ownKey(request)
      const row = await readRow(key)
      if (row === undefined) return unavailable
      if (row === null) return { absent: true }
      const work = decode(row, key)
      return work === undefined ? unavailable : { work }
    },
    async remove(request) {
      if (!validKey(request) || !validWork(request.workId, request.generation))
        return { pending: 'storage_unavailable' }
      const key = ownKey(request)
      const { workId, generation } = request
      return await owned(async () => {
        let outcome: 'removed' | 'rejected'
        try {
          outcome = await storage.write(async tx => {
            const row = await locked(tx, key)
            if (row === undefined) return 'removed' as const
            if (row.work_id !== workId || Number(row.generation) !== generation)
              return 'rejected' as const
            const k = where(key)
            await narrow<WorkDatabase>(tx)
              .deleteFrom('model_call_settlement_work')
              .where('organization', '=', k.organization)
              .where('account', '=', k.account)
              .where('session', '=', k.session)
              .where('call', '=', k.call)
              .where('response', '=', k.response)
              .where('work_id', '=', workId)
              .where('generation', '=', generation)
              .execute()
            return 'removed' as const
          })
        } catch {
          // Only a row read as absent proves the delete; a failed read proves nothing.
          const found = await readRow(key)
          if (found === undefined) return { pending: 'receipt_unknown' }
          if (found === null) return { removed: true }
          if (found.work_id !== workId || Number(found.generation) !== generation)
            return { rejected: true }
          return { pending: 'storage_unavailable' }
        }
        return outcome === 'removed' ? { removed: true } : { rejected: true }
      })
    },
  })
}
