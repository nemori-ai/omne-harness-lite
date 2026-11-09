// C9: a database migrated under the pre-r6 Tool baseline (`tool/001-tool-ledger-custody`, the
// catalog of d3631d30e) is quarantined when the current catalog opens it. The provider finds a
// migration marker the catalog does not list (sqlite-provider SPEC, migration markers) and refuses
// the domain with a diagnostic; nothing migrates the old data.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  combinationManifest,
  manifestDigest,
  type DomainRef,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { tenantCodec } from '@omne-harness/legal-identity'
import { toolStorageMaterials, TOOL_PARTICIPANT } from '../src/index.ts'
import { TENANT_A } from './fixtures/app.ts'
import { configuration } from './windows-composition/storage.ts'

const OLD_BASELINE = { owner: 'tool', id: '001-tool-ledger-custody' }

/** The pre-r6 baseline as a standalone module: its id and the four tables it created. */
const OLD_MIGRATION_MODULE = `
export default {
  owner: ${JSON.stringify(OLD_BASELINE.owner)},
  id: ${JSON.stringify(OLD_BASELINE.id)},
  up(port) {
    for (const statement of [
      'CREATE TABLE tl_domain (tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY (tenant, kind, name)) STRICT',
      'CREATE TABLE tl_record (tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY (tenant, kind, name, key)) STRICT',
      'CREATE TABLE tl_chunk (tenant TEXT NOT NULL, call TEXT NOT NULL, operation TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (tenant, call, operation, idx)) STRICT',
      'CREATE TABLE tl_manifest (tenant TEXT NOT NULL, call TEXT NOT NULL, operation TEXT NOT NULL, kind TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, sha256 TEXT NOT NULL, seal TEXT NOT NULL, answer TEXT NOT NULL, PRIMARY KEY (tenant, call, operation)) STRICT',
    ])
      port.execute(statement, [])
  },
  verify() {
    return { kind: 'verified' }
  },
}
`

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function catalogOf(materials: ReturnType<typeof toolStorageMaterials>): SqlMaterialCatalog {
  return {
    catalogProtocol: 'sql-catalog/1',
    ...materials,
    declaredCombinations: {
      tenant: { combinationVersion: 'c9-v1', participants: [TOOL_PARTICIPANT] },
      system: null,
    },
  }
}

async function open(root: string, catalog: SqlMaterialCatalog) {
  const built = combinationManifest({ catalog, participants: [TOOL_PARTICIPANT] })
  if (built.kind !== 'manifest') throw new Error(`combination unavailable: ${built.kind}`)
  const created = await createSqliteStorage({
    config: configuration(join(root, 'storage'), 4_194_304),
    materials: catalog,
    closeLeases: { admit: () => ({}), release: () => {} },
  })
  if (created.kind !== 'created') throw new Error(`SQLite rejected: ${JSON.stringify(created)}`)
  const encoded = tenantCodec.encode(TENANT_A)
  assert.ok(encoded.ok)
  const domain: DomainRef = {
    scope: { kind: 'tenant', tenant: encoded.value },
    transactionDomain: 'c9-tool-0',
  }
  const register = () =>
    created.storage.registerCombination({
      ...domain,
      combinationVersion: 'c9-v1',
      manifestDigest: manifestDigest(built.manifest),
      participants: [TOOL_PARTICIPANT],
    })
  const close = async () => {
    const result = await created.control.close({ initiator: 'assembly' })
    created.control.assemblyReportSettled()
    assert.equal(result.kind, 'closed', JSON.stringify(result))
  }
  return { register, close }
}

it('C9: a database created under the pre-r6 baseline is quarantined by the current catalog', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-storage-sql-c9-')))
  roots.push(root)
  const materials = toolStorageMaterials()
  assert.ok(
    !materials.migrations.some(item => item.id === OLD_BASELINE.id),
    'the current catalog must not list the pre-r6 baseline, or the old database would migrate',
  )
  const modulePath = join(root, 'old-migration.mjs')
  await writeFile(modulePath, OLD_MIGRATION_MODULE)
  const oldCatalog = catalogOf({
    ...materials,
    migrations: [
      {
        ...OLD_BASELINE,
        moduleUrl: pathToFileURL(modulePath).href,
        checksum: createHash('sha256')
          .update(await readFile(modulePath))
          .digest('hex'),
        requires: [],
      },
    ],
    readHandlers: [],
  })
  const old = await open(root, oldCatalog)
  expect((await old.register()).kind).toBe('registered')
  await old.close()

  const current = await open(root, catalogOf(materials))
  try {
    const answer = await current.register()
    expect(answer.kind).toBe('rejected_before_accept')
    assert.ok(answer.kind === 'rejected_before_accept')
    // The provider names the quarantined domain unavailable at its boundary (sqlite-provider
    // SPEC 5.5: a quarantined domain answers like an absent one); the marker reason stays in the
    // provider's domain state. Nothing of the old data is migrated or read.
    expect(answer.reason).toBe('domain_unavailable')
  } finally {
    await current.close()
  }
})
