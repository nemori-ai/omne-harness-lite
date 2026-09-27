import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { sql } from 'kysely'
import {
  isOk,
  parseTenantId,
  parseLoginStateId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { instantFromEpochMs, type Clock } from '@omne-harness-lite/offer-expiry'
import {
  composeMigrations,
  StorageDefect,
  type AtomicStorage,
  type MigrationFragment,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { replicaMigrations } from '../src/migrations.ts'
import {
  createModelReplicaCustodian,
  type CredentialBindingRead,
  type ReplicaObservation,
  type ReadCredentialBindingIn,
} from '../src/model-replica.ts'

export const tenant = (() => {
  const parsed = parseTenantId({ organization: 'test-org', account: 'test-account' })
  if (!isOk(parsed)) throw new Error('test tenant invalid')
  return parsed.ok
})()
export const otherTenant = (() => {
  const parsed = parseTenantId({ organization: 'test-other-org', account: 'test-other-account' })
  if (!isOk(parsed)) throw new Error('test tenant invalid')
  return parsed.ok
})()
export const login = (() => {
  const parsed = parseLoginStateId('test-login')
  if (!isOk(parsed)) throw new Error('test login invalid')
  return parsed.ok
})()
export const instant = (() => {
  const parsed = instantFromEpochMs(12345)
  if (!isOk(parsed)) throw new Error('test instant invalid')
  return parsed.ok
})()
export const bodyA = new TextEncoder().encode('secret-test-body-AAAA-unique-sentinel')
export const bodyB = new TextEncoder().encode('secret-test-body-BBBB-unique-sentinel')
export const refA = 'ref-test-AAAA-unique-sentinel'
export const refB = 'ref-test-BBBB-unique-sentinel'

// An explicit reader fixture, not the directory schema/helper or a real credential chain.
const fixtureMigration: MigrationFragment = {
  name: 'replica_test_binding_and_sentinel',
  migration: {
    async up(db) {
      await db.schema
        .createTable('test_binding')
        .addColumn('organization', 'text', c => c.notNull())
        .addColumn('account', 'text', c => c.notNull())
        .addColumn('ref', 'text', c => c.notNull())
        .addPrimaryKeyConstraint('test_binding_pkey', ['organization', 'account'])
        .execute()
      await db.schema
        .createTable('test_sentinel')
        .addColumn('id', 'integer', c => c.primaryKey())
        .execute()
    },
  },
}

export function fixtureReader(storage: AtomicStorage): ReadCredentialBindingIn {
  return (unit, t) =>
    unit.run(async () => {
      unit.assertStorage(storage)
      await unit.mutate(tx =>
        tx.lockRow('test_binding', { organization: t.organization, account: t.account }),
      )
      return unit.query(async tx => {
        const result = await sql<{
          ref: unknown
        }>`SELECT ref FROM test_binding WHERE organization=${t.organization} AND account=${t.account}`.execute(
          tx.db,
        )
        const row = result.rows[0]
        if (row === undefined) return { absent: true }
        if (typeof row.ref !== 'string') throw new StorageDefect('test binding invalid')
        return { binding: { credentialRef: row.ref, boundAt: instant } }
      })
    })
}

export async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'omne-replica-'))
  const file = join(directory, 'db.sqlite')
  const keyFile = join(directory, 'key')
  await writeFile(keyFile, randomBytes(32), { mode: 0o600 })
  const migrations = composeMigrations([...replicaMigrations, fixtureMigration])
  const storage = await openStorage({ dialect: 'sqlite', file, migrations, upgrade: false })
  const events: ReplicaObservation[] = []
  const clockState = { unavailable: false, throws: false, calls: 0 }
  const clock: Clock = {
    now: () => {
      clockState.calls++
      if (clockState.throws) throw new Error('clock-secret-test-body')
      return clockState.unavailable ? 'unavailable' : instant
    },
  }
  const readerState: {
    error?: unknown
    hold?: Promise<void>
    entered?: () => void
    malformed: boolean
  } = { malformed: false }
  const realFixtureReader = fixtureReader(storage)
  const reader: ReadCredentialBindingIn = async (unit, t) => {
    readerState.entered?.()
    if (readerState.hold !== undefined) await readerState.hold
    if (Object.hasOwn(readerState, 'error')) throw readerState.error
    if (readerState.malformed) {
      // Purposeful runtime violation, checked by the component rather than a type assertion.
      return JSON.parse('{"binding":{"credentialRef":"","boundAt":12345}}') as CredentialBindingRead
    }
    return realFixtureReader(unit, t)
  }
  const diagnostics = {
    record: (event: ReplicaObservation) => {
      events.push(event)
    },
    sinkFailure: () => {},
  }
  const component = await createModelReplicaCustodian({
    storage,
    clock,
    keyFile,
    readCredentialBindingIn: reader,
    diagnostics,
  })
  const bind = (ref: string, t: TenantId = tenant) =>
    storage.write(async tx => {
      await tx.lockRow('test_binding', { organization: t.organization, account: t.account })
      await sql`INSERT INTO test_binding(organization,account,ref) VALUES(${t.organization},${t.account},${ref}) ON CONFLICT(organization,account) DO UPDATE SET ref=excluded.ref`.execute(
        tx.db,
      )
    })
  const store = (ref = refA, body = bodyA) =>
    component.storeBoundReplica({ tenant, loginState: login, sourceRef: ref, body })
  const read = (ref = refA, t = tenant) =>
    storage.atomic(unit => component.readBoundReplicaIn(unit, t, ref))
  const cleanup = async () => {
    await component.close()
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
  return {
    directory,
    file,
    keyFile,
    storage,
    component,
    reader,
    readerState,
    diagnostics,
    events,
    clock,
    clockState,
    bind,
    store,
    read,
    cleanup,
  }
}

export function barrier() {
  const release = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  return {
    hold: release.promise,
    entered: () => entered.resolve(),
    reached: entered.promise,
    release: () => release.resolve(),
  }
}
export async function sentinelCount(storage: AtomicStorage) {
  return storage.read(
    async tx =>
      (await sql<{ n: number }>`SELECT count(*) AS n FROM test_sentinel`.execute(tx.db)).rows[0]?.n,
  )
}
export async function putSentinel(unit: StorageUnit) {
  await unit.mutate(async tx => {
    await sql`INSERT INTO test_sentinel(id) VALUES(1)`.execute(tx.db)
  })
}
