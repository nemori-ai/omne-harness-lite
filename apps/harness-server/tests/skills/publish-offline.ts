import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  deriveTransactionDomain,
  readDirectoryFile,
} from '../../src/rows/session-storage/directory.ts'
import { productionStorageCatalog } from '../../src/rows/storage/production-catalog.ts'
import { providerConfig } from '../rows/storage/fixtures/tree.ts'
import { publishSkill, writeSampleSkill } from './support.ts'

// The service must be stopped: opening its storage here takes over the writers of its domains.
export async function publishOffline(
  storageRoot: string,
  tenant: string,
  name: string,
  description?: string,
): Promise<void> {
  const materials = await productionStorageCatalog()
  const made = await createSqliteStorage({
    config: providerConfig(storageRoot, {
      maxWorkers: 2,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  try {
    await publishSkill({
      storage: made.storage,
      materials,
      domain: {
        scope: { kind: 'tenant', tenant },
        transactionDomain: deriveTransactionDomain(tenant),
      },
      packageRoot: join(dirname(storageRoot), 'assets'),
      dir: await writeSampleSkill(
        await realpath(await mkdtemp(join(tmpdir(), 'skill-source-'))),
        name,
        description,
      ),
      name,
    })
  } finally {
    await made.control.close({ initiator: 'disposal' })
  }
}

if (import.meta.main) {
  const [storageRoot, name = 'weekly-report'] = process.argv.slice(2)
  if (storageRoot === undefined) throw new Error('usage: publish-offline.ts <storage root> [name]')
  const tenants = readDirectoryFile(join(storageRoot, 'tenant-domains.json'))
  if (tenants.length !== 1) throw new Error(`expected one tenant, found ${String(tenants.length)}`)
  for (const tenant of tenants) await publishOffline(storageRoot, tenant, name)
  console.log(`published ${name} into the one tenant of ${storageRoot}`)
}
