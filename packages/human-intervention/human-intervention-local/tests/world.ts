import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  createHitlSqlTerminals,
  hitlSqlMaterials,
  independentWaitSqlMaterials,
} from '@omne-harness/human-intervention-local'
import { config } from './config.ts'

export async function openWorld(
  options: {
    root?: string
    tenantRef?: string
    extraMaterials?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
    wrap?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const parent = fileURLToPath(new URL('../../../../tmp/hitl-r1-c2/databases/', import.meta.url))
  mkdirSync(parent, { recursive: true })
  const root = options.root ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const hitl = hitlSqlMaterials()
  const wait = independentWaitSqlMaterials()
  const own = {
    participants: [...hitl.participants, ...wait.participants],
    migrations: [...hitl.migrations, ...wait.migrations],
    readHandlers: [...hitl.readHandlers, ...wait.readHandlers],
  }
  const reject = new URL('./fixtures/reject.mjs', import.meta.url)
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...own,
    migrations: [...own.migrations, ...(options.extraMaterials?.migrations ?? [])],
    readHandlers: [...own.readHandlers, ...(options.extraMaterials?.readHandlers ?? [])],
    participants: [
      ...own.participants,
      ...(options.extraMaterials?.participants ?? []),
      {
        participant: 'fixture.hitl.reject',
        protocol: 'fixture-hitl-reject/1',
        moduleUrl: reject.href,
        codeDigest: createHash('sha256').update(readFileSync(reject)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = [...own.participants.map(item => item.participant), 'fixture.hitl.reject']
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const domain = {
    scope: { kind: 'tenant', tenant: options.tenantRef ?? 'tenant-a' },
    transactionDomain: 'hitl.test',
  } as const
  const combination = {
    ...domain,
    combinationVersion: 'hitl-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: {
      admit() {
        const lease = {}
        leases.add(lease)
        return lease
      },
      release(lease) {
        leases.delete(lease)
      },
    },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const registered = await created.storage.registerCombination(combination)
  if (registered.kind !== 'registered') {
    await created.control.close({ initiator: 'disposal' })
    throw new Error(JSON.stringify(registered))
  }
  const terminals = createHitlSqlTerminals({
    storage: options.wrap?.(created.storage) ?? created.storage,
    domain,
    ...combination,
  })
  let close: Promise<void> | undefined
  return {
    root,
    terminals,
    storage: created.storage,
    combination,
    close() {
      return (close ??= (async () => {
        const result = await created.control.close({ initiator: 'disposal' })
        if (result.kind !== 'closed' || leases.size) throw new Error(JSON.stringify(result))
      })())
    },
  }
}
