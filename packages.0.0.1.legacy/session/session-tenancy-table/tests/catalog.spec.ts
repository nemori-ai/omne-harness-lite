import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { composeMigrations, narrow, StorageDefect } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { sessionTenancyMigrations } from '../src/index.ts'
import { readSessionCatalogIn } from '@omne-harness-lite/session-tenancy-table/maintenance'

const tenant = unwrap(parseTenantId({ organization: 'catalog-org', account: 'catalog-account' }))
interface Catalog {
  session_tenancy: { session: string; tenant: string }
}
async function database(test: (storage: SqlStorage) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'session-catalog-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'catalog.sqlite'),
    migrations: composeMigrations(sessionTenancyMigrations),
    upgrade: false,
  })
  try {
    await test(storage)
  } finally {
    await storage.close()
    await rm(dir, { recursive: true, force: true })
  }
}
it('lists every immutable holding row without requiring a login or an active reader', async () => {
  await database(async storage => {
    expect(await storage.read(tx => readSessionCatalogIn(tx))).toEqual([])
    const second = unwrap(
      parseTenantId({ organization: 'catalog-org-b', account: 'catalog-account-b' }),
    )
    await storage.write(async tx => {
      await narrow<Catalog>(tx)
        .insertInto('session_tenancy')
        .values([
          { session: 'older-session', tenant: writeJsonLossless(tenant) },
          { session: 'new-empty-session', tenant: writeJsonLossless(second) },
        ])
        .execute()
    })
    expect(await storage.read(tx => readSessionCatalogIn(tx))).toEqual([
      { session: 'new-empty-session', tenant: second },
      { session: 'older-session', tenant },
    ])
  })
})
it.each([
  { session: ' illegal-session', tenant: writeJsonLossless(tenant) },
  { session: 'valid-session', tenant: '{broken' },
  { session: 'valid-session', tenant: '{"organization":"x","account":""}' },
])('does not skip malformed catalog rows: %j', async row => {
  await database(async storage => {
    await storage.write(async tx => {
      await narrow<Catalog>(tx).insertInto('session_tenancy').values(row).execute()
    })
    await expect(storage.read(tx => readSessionCatalogIn(tx))).rejects.toBeInstanceOf(StorageDefect)
  })
})
