// @module-tag slow
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type StorageControl,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { sessionStorageMaterials } from '../src/materials.ts'
import { SESSION_LOG_PARTICIPANTS } from '../src/participants.ts'
import { app, TENANT_A, textOf } from './fixtures/app.ts'
import { realConfig } from './fixtures/real-provider.ts'

const controls: StorageControl[] = []
const roots: string[] = []
afterEach(async () => {
  for (const control of controls.splice(0).reverse()) await control.close({ initiator: 'disposal' })
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('backfills original Session rows in a real migration Worker and retains the query after reopening', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'session-permission-migration-')))
  roots.push(root)
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  const access = a.access(TENANT_A)
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'change',
        input: {
          tenant: TENANT_A,
          session: access.session,
          operation: operationId('mode-before-worker-upgrade'),
          declaration: {
            kind: 'permission-mode',
            value: 'never',
            authorization: evidence('mode-fixture'),
          },
        },
      },
    }),
  ).toHaveProperty('ok')
  // Seed only the original Session rows. The production migration must derive both permission tables.
  const inserts = ['sl_journal', 'sl_state', 'sl_state_item', 'sl_entry', 'sl_operation'].flatMap(
    table => {
      const result = a.provider.select('dom_0', `SELECT * FROM ${table} LIMIT 100`, [])
      return result.rows.map(row => ({
        sql: `INSERT INTO ${table} (${result.columns.join(',')}) VALUES (${result.columns.map(() => '?').join(',')})`,
        params: row.map(value => (typeof value === 'bigint' ? String(value) : value)),
      }))
    },
  )
  const seedRef = { owner: 'session', id: '005-permission-test-seed' }
  const source = `export default { owner: 'session', id: '005-permission-test-seed', up(port) {
    for (const row of ${JSON.stringify(inserts)}) port.execute(row.sql, row.params)
  }, verify() { return { kind: 'verified' } } }`
  const file = join(root, 'seed.mjs')
  await writeFile(file, source)
  const material = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...material,
    migrations: [
      ...material.migrations.map(item =>
        item.owner === 'session' && item.id === '006-permission-current'
          ? { ...item, requires: [...item.requires, seedRef] }
          : item,
      ),
      {
        ...seedRef,
        moduleUrl: pathToFileURL(file).href,
        checksum: createHash('sha256').update(source).digest('hex'),
        requires: [{ owner: 'session', id: '005-attempt-grant' }],
      },
    ],
    declaredCombinations: {
      tenant: {
        combinationVersion: 'permission-migration-test',
        participants: SESSION_LOG_PARTICIPANTS,
      },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: SESSION_LOG_PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const digest = manifestDigest(manifest.manifest)
  async function open() {
    const created = await createSqliteStorage({
      config: realConfig(join(root, 'storage')),
      materials: catalog,
      closeLeases: { admit: name => ({ name }), release: () => undefined },
    })
    if (created.kind !== 'created') throw new Error(JSON.stringify(created))
    controls.push(created.control)
    const registration = await created.storage.registerCombination({
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: 'permission-migration',
      combinationVersion: 'permission-migration-test',
      manifestDigest: digest,
      participants: SESSION_LOG_PARTICIPANTS,
    })
    expect(registration, JSON.stringify(registration)).toMatchObject({ kind: 'registered' })
    return created
  }
  const read = (storage: Awaited<ReturnType<typeof open>>['storage']) =>
    storage.read({
      domain: {
        scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
        transactionDomain: 'permission-migration',
      },
      requestKey: 'current-after-upgrade',
      handler: 'session.permission-current',
      protocol: '1',
      input: {
        tenant: textOf(TENANT_A),
        session: 'session-1',
        capabilityId: 'calendar',
        enforcementKey: 'create',
      },
    })
  const first = await open()
  const current = await read(first.storage)
  expect(current).toMatchObject({
    kind: 'read',
    output: {
      kind: 'current',
      revision: '1',
      assignment: null,
      mode: { override: { value: 'never' } },
    },
  })
  expect(await first.control.close({ initiator: 'disposal' })).toMatchObject({ kind: 'closed' })
  const reopened = await open()
  expect(await read(reopened.storage)).toEqual(current)
}, 60_000)
