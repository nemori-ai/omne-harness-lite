import { sql } from 'kysely'
import type { ClockCheckpoint, Instant } from '@omne-harness-lite/offer-expiry'
import { composeMigrations, type Storage, type StorageInstance } from '@omne-harness-lite/storage'
import { openStorage, createUpgradeGuard } from '@omne-harness-lite/storage-sql'
import { LeaseClock, type LeaseClockOptions } from './clock.ts'
import { clockMigrations, leaseRow } from './lease.ts'
import {
  checkedFloor,
  newManifest,
  readManifest,
  writeManifest,
  type ClockManifest,
} from './resource-manifest.ts'

export interface OpenLeaseClockOptions extends Omit<LeaseClockOptions, 'storage'> {
  /** Independent SQLite resource. It must not be the business database. */
  readonly file: string
  /** Explicit creation or legacy migration. Ordinary opens must omit this member. */
  readonly initialize?: { readonly floor?: ClockCheckpoint }
  /** Restore a backup floor before the clock can publish time. Never lowers an existing floor. */
  readonly minimum?: ClockCheckpoint
}

const migrations = composeMigrations([
  ...clockMigrations,
  {
    name: 'clock_resource_identity',
    migration: {
      async up(db) {
        await db.schema
          .createTable('clock_resource_identity')
          .addColumn('id', 'integer', c => c.primaryKey().check(sql`id = 1`))
          .addColumn('resource_id', 'text', c => c.notNull())
          .execute()
      },
    },
  },
])
const zero: ClockCheckpoint = { writtenAt: 0 as Instant, upperBound: 0 as Instant }

async function validateResource(storage: Storage, manifest: ClockManifest) {
  await storage.write(async tx => {
    const { rows } = await sql<{
      resource_id: string
    }>`SELECT resource_id FROM clock_resource_identity WHERE id = 1`.execute(tx.db)
    if (rows.length === 0 && manifest.phase === 'prepared') {
      await sql`INSERT INTO clock_resource_identity(id,resource_id) VALUES(1,${manifest.id})`.execute(
        tx.db,
      )
      await sql`INSERT INTO clock_lease(id,lease_until,written_at) VALUES(1,${manifest.floor.upperBound},${manifest.floor.writtenAt})`.execute(
        tx.db,
      )
      return
    }
    if (rows[0]?.resource_id !== manifest.id)
      throw new Error('clock resource identity does not match its manifest')
    if (manifest.phase === 'prepared') {
      await sql`UPDATE clock_lease SET lease_until = max(lease_until,${manifest.floor.upperBound}), written_at = max(written_at,${manifest.floor.writtenAt}) WHERE id=1`.execute(
        tx.db,
      )
    }
    const lease = await sql<{
      lease_until: number
      written_at: number
    }>`SELECT lease_until,written_at FROM clock_lease WHERE id=1`.execute(tx.db)
    if (!lease.rows[0]) throw new Error('clock resource has no durable floor')
    const row = leaseRow(lease.rows[0])
    if (
      row.written_at < 0 ||
      row.written_at > row.lease_until ||
      row.lease_until < manifest.floor.upperBound
    )
      throw new Error('clock resource has an invalid durable floor')
  })
}

async function adoptMinimum(storage: Storage, checkpoint: ClockCheckpoint) {
  const floor = checkedFloor(checkpoint)
  await storage.write(async tx => {
    await sql`UPDATE clock_lease SET lease_until = max(lease_until,${floor.upperBound}), written_at = max(written_at,${floor.writtenAt}) WHERE id=1`.execute(
      tx.db,
    )
  })
}

class OwnedLeaseClock extends LeaseClock {
  #closing: Promise<void> | undefined
  constructor(
    options: LeaseClockOptions,
    private readonly resource: StorageInstance,
  ) {
    super(options)
  }
  override close(): Promise<void> {
    return (this.#closing ??= this.#closeResource())
  }
  async #closeResource() {
    let policyFailure: unknown
    let failed = false
    try {
      await super.close()
    } catch (error) {
      failed = true
      policyFailure = error
    }
    try {
      await this.resource.close()
    } catch (error) {
      if (failed) throw new AggregateError([policyFailure, error], 'clock and storage close failed')
      throw error
    }
    if (failed) throw policyFailure
  }
}

/** Open one exclusive clock resource. Format confirmation precedes every published instant. */
export async function openLeaseClock(options: OpenLeaseClockOptions): Promise<LeaseClock> {
  const manifestFile = `${options.file}.clock.json`
  const guard = createUpgradeGuard()
  let manifest: ClockManifest | undefined
  const storage = await openStorage(
    {
      dialect: 'sqlite',
      file: options.file,
      synchronous: 'full',
      migrations,
      upgrade: {
        guard,
        checks: [
          async ({ tables }) => {
            manifest = await prepareManifest(manifestFile, tables, options.initialize)
            return { ok: true }
          },
        ],
      },
    },
    options.logger ? { logger: options.logger } : {},
  )
  try {
    await validateResource(storage, manifest!)
    await guard.confirm()
    if (options.minimum) await adoptMinimum(storage, options.minimum)
    if (manifest!.phase !== 'ready')
      await writeManifest(manifestFile, { ...manifest!, phase: 'ready' }, false)
    const clock = new OwnedLeaseClock({ ...options, storage }, storage)
    await clock.start()
    return clock
  } catch (error) {
    try {
      await storage.close()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'clock startup and cleanup failed')
    }
    throw error
  }
}

async function prepareManifest(
  file: string,
  tables: ReadonlySet<string>,
  initialize: OpenLeaseClockOptions['initialize'],
): Promise<ClockManifest> {
  const manifest = await readManifest(file)
  if (!manifest) {
    if (!initialize)
      throw new Error('clock resource is missing; explicit initialization is required')
    if (tables.size !== 0) throw new Error('clock initialization requires an empty resource')
    const created = newManifest(initialize.floor ?? zero)
    await writeManifest(file, created, true)
    return created
  }
  if (manifest.phase === 'ready') {
    if (initialize) throw new Error('clock resource already exists; open it without initialization')
    if (!tables.has('clock_resource_identity') || !tables.has('clock_lease'))
      throw new Error('initialized clock database is missing or malformed')
    return manifest
  }
  if (!initialize?.floor) return manifest
  const next = checkedFloor(initialize.floor)
  const resumed: ClockManifest = {
    ...manifest,
    floor: {
      writtenAt: Math.max(manifest.floor.writtenAt, next.writtenAt),
      upperBound: Math.max(manifest.floor.upperBound, next.upperBound),
    },
  }
  await writeManifest(file, resumed, false)
  return resumed
}
