// @module-tag slow
// Real SQLite registration runs migrations for all production governance combinations.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { productionStorageCatalog } from '../../../dist/rows/storage/production-catalog.js'
import { governanceStorageCombinations } from '../../../dist/rows/governance/storage-combinations.js'
import {
  SESSION_COMPOSITE_PARTICIPANTS,
  compositeManifestDigest,
} from '../../../src/rows/session-storage/composite.ts'
import { deriveTransactionDomain } from '../../../src/rows/session-storage/directory.ts'
import { COMBINATION_VERSION } from '../../../src/rows/agent-journal/config.ts'
import type { SqlStorage, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { storageCatalog } from '../../../src/rows/storage/catalog.ts'
import { providerConfig, TENANT_A, textOf } from './fixtures/tree.ts'

const domain = {
  scope: { kind: 'tenant' as const, tenant: textOf(TENANT_A) },
  transactionDomain: deriveTransactionDomain(textOf(TENANT_A)),
}
async function registerSession(storage: SqlStorage, catalog: SqlMaterialCatalog) {
  const manifest = compositeManifestDigest(catalog)
  if (manifest.kind !== 'manifest') throw new Error(manifest.diagnostic)
  expect(
    await storage.registerCombination({
      ...domain,
      combinationVersion: COMBINATION_VERSION,
      manifestDigest: manifest.digest,
      participants: SESSION_COMPOSITE_PARTICIPANTS,
    }),
  ).toMatchObject({ kind: 'registered' })
}

it('registers all governance combinations on the Session tenant domain without changing the core manifest', async () => {
  const catalog = await productionStorageCatalog()
  expect(compositeManifestDigest(catalog)).toEqual(compositeManifestDigest(storageCatalog()))
  const combinations = governanceStorageCombinations(catalog)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'governance-materials-')))
  const made = await createSqliteStorage({
    config: providerConfig(root),
    materials: catalog,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') {
    rmSync(root, { recursive: true, force: true })
    throw new Error(JSON.stringify(made))
  }
  try {
    await registerSession(made.storage, catalog)
    for (const [name, combination] of Object.entries(combinations)) {
      expect(
        await made.storage.registerCombination({ ...domain, ...combination }),
        name,
      ).toMatchObject({ kind: 'registered' })
      expect(
        await made.storage.registerCombination({ ...domain, ...combination }),
        `${name} replay`,
      ).toMatchObject({ kind: 'registered' })
    }
  } finally {
    await made.control.close({ initiator: 'disposal' })
    rmSync(root, { recursive: true, force: true })
  }
})

it('keeps ordinary storage available when the Tool release cannot be loaded', async () => {
  const catalog = await productionStorageCatalog(async () => ({
    kind: 'unavailable',
    diagnostic: 'fixture-missing-release',
  }))
  expect(compositeManifestDigest(catalog)).toEqual(compositeManifestDigest(storageCatalog()))
  expect(() => governanceStorageCombinations(catalog)).toThrow(/Invalid governance combination/)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'governance-no-release-')))
  const made = await createSqliteStorage({
    config: providerConfig(root),
    materials: catalog,
    closeLeases: { admit: () => ({}), release() {} },
  })
  try {
    if (made.kind !== 'created') throw new Error(JSON.stringify(made))
    await registerSession(made.storage, catalog)
  } finally {
    if (made.kind === 'created') await made.control.close({ initiator: 'disposal' })
    rmSync(root, { recursive: true, force: true })
  }
})
