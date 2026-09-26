import { randomUUID } from 'node:crypto'
import {
  narrow,
  StorageUnavailable,
  type AtomicStorage,
  type ReadTx,
} from '@omne-harness-lite/storage'
import {
  capture,
  freeze,
  MAX_RECORD_BYTES,
  sameLogin,
  validRecord,
  validTransition,
} from './record.ts'
import {
  ClientStateUsageDefect,
  type ClientLocalState,
  type LocalSnapshot,
  type ReadOutcome,
  type ReadFailure,
  type ReplaceOutcome,
  type SnapshotToken,
} from './surface.ts'
import { unavailableIo } from './files.ts'

interface Row {
  singleton: number
  format_version: number
  store_id: string
  revision: number
  operation_id: string | null
  value_json: string
}
interface Database {
  client_local_state: Row
  sqlite_master: { name: string; type: string }
}
type Reading =
  | { kind: 'row'; row: Row; value: LocalSnapshot['value'] }
  | { kind: 'failed'; reason: ReadFailure; emptyCatalog?: boolean }

export async function initialize(storage: AtomicStorage): Promise<void> {
  await storage.atomic(unit =>
    unit.mutate(async tx => {
      const db = narrow<Database>(tx)
      await db.schema
        .createTable('client_local_state')
        .addColumn('singleton', 'integer', col => col.primaryKey())
        .addColumn('format_version', 'integer', col => col.notNull())
        .addColumn('store_id', 'text', col => col.notNull())
        .addColumn('revision', 'integer', col => col.notNull())
        .addColumn('operation_id', 'text')
        .addColumn('value_json', 'text', col => col.notNull())
        .execute()
      await db
        .insertInto('client_local_state')
        .values({
          singleton: 1,
          format_version: 1,
          store_id: randomUUID(),
          revision: 0,
          operation_id: null,
          value_json: 'null',
        })
        .execute()
    }),
  )
}

export async function readRow(tx: ReadTx): Promise<Reading> {
  const db = narrow<Database>(tx)
  const objects = await db
    .selectFrom('sqlite_master')
    .select(['name', 'type'])
    .where('name', 'not like', 'sqlite_%')
    .execute()
  if (
    objects.length !== 1 ||
    objects[0]?.name !== 'client_local_state' ||
    objects[0].type !== 'table'
  )
    return { kind: 'failed', reason: 'invalid-record', emptyCatalog: objects.length === 0 }
  // selectAll avoids converting a discoverably damaged layout into a missing-column defect.
  const rows = await db.selectFrom('client_local_state').selectAll().execute()
  if (rows.length !== 1) return { kind: 'failed', reason: 'invalid-record' }
  const row = rows[0]!
  if (Number.isSafeInteger(row.format_version) && row.format_version > 1)
    return { kind: 'failed', reason: 'unsupported-format' }
  const keys = ['singleton', 'format_version', 'store_id', 'revision', 'operation_id', 'value_json']
  if (
    Object.keys(row).length !== keys.length ||
    !keys.every(k => Object.hasOwn(row, k)) ||
    row.singleton !== 1 ||
    row.format_version !== 1 ||
    typeof row.store_id !== 'string' ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(row.store_id) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0 ||
    (row.revision === 0
      ? row.operation_id !== null
      : typeof row.operation_id !== 'string' || row.operation_id.length === 0) ||
    typeof row.value_json !== 'string'
  )
    return { kind: 'failed', reason: 'invalid-record' }
  if (Buffer.byteLength(row.value_json) > MAX_RECORD_BYTES)
    return { kind: 'failed', reason: 'unavailable' }
  let value: unknown
  try {
    value = JSON.parse(row.value_json)
  } catch {
    return { kind: 'failed', reason: 'invalid-record' }
  }
  if (!validRecord(value) || (row.revision === 0 && value !== null))
    return { kind: 'failed', reason: 'invalid-record' }
  return { kind: 'row', row, value: freeze(value) }
}

export interface StateStorage extends AtomicStorage {
  close(): Promise<void>
}

/** Internal constructor for storage/fdatasync fault tests; not a package export. */
export class LocalState implements ClientLocalState {
  readonly #proofs = new WeakMap<SnapshotToken, LocalSnapshot>()
  readonly #jobs = new Set<Promise<unknown>>()
  #closed = false
  #closing: Promise<void> | undefined
  constructor(
    readonly storage: StateStorage,
    private readonly syncDirectory: () => Promise<void>,
    private readonly closeDirectory: () => Promise<void>,
  ) {}

  #admit<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new ClientStateUsageDefect('closed'))
    const job = work()
    this.#jobs.add(job)
    void job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    )
    return job
  }

  #snapshot(reading: Extract<Reading, { kind: 'row' }>): LocalSnapshot {
    const token = Object.freeze(Object.create(null)) as SnapshotToken
    const snapshot: LocalSnapshot = Object.freeze({
      storeId: reading.row.store_id,
      revision: reading.row.revision,
      operationId: reading.row.operation_id,
      value: reading.value,
      token,
    })
    this.#proofs.set(token, snapshot)
    return snapshot
  }

  read(): Promise<ReadOutcome> {
    return this.#admit(async () => {
      try {
        const read = await this.storage.read(readRow)
        return read.kind === 'failed'
          ? { kind: 'failed', reason: read.reason }
          : { kind: 'read', snapshot: this.#snapshot(read) }
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'failed', reason: 'unavailable' }
        throw error
      }
    })
  }

  compareAndReplace(
    token: SnapshotToken,
    value: unknown,
    operationId: string,
  ): Promise<ReplaceOutcome> {
    return this.#admit(async () => {
      const original = this.#proofs.get(token)
      if (original === undefined) throw new ClientStateUsageDefect('invalid-snapshot')
      const input = capture(value)
      if (
        typeof operationId !== 'string' ||
        operationId.length === 0 ||
        !operationId.isWellFormed() ||
        input.kind === 'invalid'
      )
        return { kind: 'not-installed', reason: 'invalid-input' }
      if (input.kind === 'limit') return { kind: 'not-installed', reason: 'unavailable' }
      try {
        const outcome: ReplaceOutcome = await this.storage.atomic(unit =>
          unit.mutate(async tx => {
            const current = await readRow(tx)
            if (current.kind === 'failed') return { kind: 'not-installed', reason: current.reason }
            const snapshot = this.#snapshot(current)
            if (
              snapshot.storeId !== original.storeId ||
              snapshot.revision !== original.revision ||
              snapshot.value?.center.centerId !== original.value?.center.centerId ||
              !sameLogin(snapshot.value, original.value)
            )
              return { kind: 'conflict', current: snapshot }
            if (
              !validTransition(snapshot.value, input.value) ||
              snapshot.operationId === operationId
            )
              return { kind: 'not-installed', reason: 'invalid-input' }
            if (snapshot.revision === Number.MAX_SAFE_INTEGER)
              return { kind: 'not-installed', reason: 'unavailable' }
            const next: Row = {
              ...current.row,
              revision: snapshot.revision + 1,
              operation_id: operationId,
              value_json: input.json,
            }
            await narrow<Database>(tx)
              .updateTable('client_local_state')
              .set(next)
              .where('singleton', '=', 1)
              .execute()
            return {
              kind: 'installed',
              snapshot: this.#snapshot({ kind: 'row', row: next, value: input.value }),
            }
          }),
        )
        if (outcome.kind === 'installed') await this.syncDirectory()
        return outcome
      } catch (error) {
        if (error instanceof StorageUnavailable || unavailableIo(error))
          return { kind: 'unconfirmed' }
        throw error
      }
    })
  }

  close(): Promise<void> {
    if (this.#closing !== undefined) return this.#closing
    this.#closed = true
    this.#closing = (async () => {
      await Promise.allSettled([...this.#jobs])
      try {
        await this.storage.close()
      } finally {
        await this.closeDirectory()
      }
    })()
    return this.#closing
  }
}
