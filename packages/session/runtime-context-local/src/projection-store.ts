import { randomUUID } from 'node:crypto'
import {
  narrow,
  StorageDefect,
  type Storage,
  type ReadTx,
  type WriteTx,
} from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ContextState } from './projection.ts'
import { identity } from './values.ts'
import {
  projectionScope,
  decodeProjection,
  encodeProjectionMeta,
  encodeProjectionEntries,
  type ProjectionTables,
  type ProjectionMeta,
  type ProjectionEntry,
  ProjectionDataInvalid,
} from './projection-codec.ts'
export interface ProjectionSnapshot {
  readonly token?: string
  readonly state?: ContextState
}
/** Assembly must install migrations before admitting this provider. This performs no migration. */
export async function verifyProjectionStorage(storage: Storage) {
  await storage.read(async tx => {
    const db = narrow<ProjectionTables>(tx)
    await db.selectFrom('rc_projection_meta').select('projection_revision').limit(0).execute()
    await db.selectFrom('rc_projection_entries').select('key').limit(0).execute()
  })
}
interface Batch {
  readonly scope: SessionScope
  readonly basis: ProjectionSnapshot
  readonly meta: ProjectionMeta
  readonly entries: readonly ProjectionEntry[]
  readonly keys?: readonly string[]
}
function metaRow(tx: ReadTx, scope: SessionScope) {
  const key = projectionScope(scope)
  return narrow<ProjectionTables>(tx)
    .selectFrom('rc_projection_meta')
    .selectAll()
    .where('tenant', '=', key.tenant)
    .where('session', '=', key.session)
    .executeTakeFirst()
}
function entryRows(tx: ReadTx, scope: SessionScope, keys?: readonly string[]) {
  if (keys?.length === 0) return Promise.resolve([] as ProjectionEntry[])
  const key = projectionScope(scope)
  let query = narrow<ProjectionTables>(tx)
    .selectFrom('rc_projection_entries')
    .selectAll()
    .where('tenant', '=', key.tenant)
    .where('session', '=', key.session)
  if (keys) query = query.where('key', 'in', keys.length ? [...keys] : [''])
  return query.orderBy('key').execute()
}
async function writeEntries(tx: WriteTx, batch: Batch) {
  if (batch.keys?.length === 0) return
  const db = narrow<ProjectionTables>(tx),
    key = projectionScope(batch.scope)
  let deletion = db
    .deleteFrom('rc_projection_entries')
    .where('tenant', '=', key.tenant)
    .where('session', '=', key.session)
  if (batch.keys) deletion = deletion.where('key', 'in', batch.keys.length ? [...batch.keys] : [''])
  await deletion.execute()
  if (batch.entries.length)
    await db
      .insertInto('rc_projection_entries')
      .values([...batch.entries])
      .execute()
}
async function commitBatch(tx: WriteTx, batch: Batch) {
  await tx.lockSentinel(`runtime-context:${identity(batch.scope)}`)
  const db = narrow<ProjectionTables>(tx),
    key = projectionScope(batch.scope)
  const meta = await metaRow(tx, batch.scope)
  if (meta?.projection_revision === batch.meta.projection_revision) {
    const rows = await entryRows(tx, batch.scope, batch.keys)
    // Compare keyed data without depending on database collation or the host locale.
    const keyed = (values: readonly ProjectionEntry[]) =>
      Object.fromEntries(values.map(row => [row.key, row]))
    if (
      identity(meta) !== identity(batch.meta) ||
      identity(keyed(rows)) !== identity(keyed(batch.entries))
    )
      throw new StorageDefect('original projection receipt has different data')
    return true
  }
  if (meta?.projection_revision !== batch.basis.token) return false
  if (meta)
    await db
      .updateTable('rc_projection_meta')
      .set(batch.meta)
      .where('tenant', '=', key.tenant)
      .where('session', '=', key.session)
      .execute()
  else await db.insertInto('rc_projection_meta').values(batch.meta).execute()
  await writeEntries(tx, batch)
  return true
}
/** Exact original SQL batches survive ambiguous returns and use the original Storage. */
export function createProjectionStore(storage: Storage) {
  const pending = new Map<string, Batch>()
  async function settle(batch: Batch) {
    const result = await storage.write(tx => commitBatch(tx, batch))
    pending.delete(identity(batch.scope))
    return result
  }
  async function reconcile(scope: SessionScope) {
    const held = pending.get(identity(scope))
    if (held) await settle(held)
  }
  return {
    async load(scope: SessionScope, keys?: readonly string[]): Promise<ProjectionSnapshot> {
      await reconcile(scope)
      return storage.read(async tx => {
        const meta = await metaRow(tx, scope)
        if (!meta) return {}
        if (meta.fold_version !== '1') return { token: meta.projection_revision }
        const rows = await entryRows(tx, scope, keys)
        try {
          return { token: meta.projection_revision, state: decodeProjection(meta, rows) }
        } catch (error) {
          if (error instanceof ProjectionDataInvalid) return { token: meta.projection_revision }
          throw error
        }
      })
    },
    async save(
      scope: SessionScope,
      basis: ProjectionSnapshot,
      state: ContextState,
      keys?: readonly string[],
    ) {
      await reconcile(scope)
      const batch: Batch = {
        scope,
        basis,
        meta: encodeProjectionMeta(scope, state, randomUUID()),
        entries: encodeProjectionEntries(scope, state, keys),
        ...(keys ? { keys: [...keys] } : {}),
      }
      pending.set(identity(scope), batch)
      return settle(batch)
    },
    async drain() {
      for (const batch of pending.values()) await settle(batch)
    },
    get unresolved() {
      return pending.size
    },
  }
}
