import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { afterAll } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
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
import { WAIT_ACCEPTED_FACT } from '../src/request-schema.ts'
import { config } from './config.ts'

/**
 * 本测试文件用 mkdtemp 建的库目录。一个目录会被关闭后重开（重启、读回），所以不在世界关闭时删，
 * 而在文件的全部用例结束后删；否则每次运行都在磁盘上留下一批库，变异运行会把它放大成数千个。
 */
const createdRoots = new Set<string>()
afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true })
  createdRoots.clear()
})

export async function openWorld(
  options: {
    root?: string
    tenantRef?: string
    extraMaterials?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
    wrap?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/hitl-r1-c2-relational/repair/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = options.root ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  if (options.root === undefined) createdRoots.add(root)
  const hitl = hitlSqlMaterials()
  const wait = independentWaitSqlMaterials()
  const own = {
    participants: [...hitl.participants, ...wait.participants],
    migrations: [...hitl.migrations, ...wait.migrations],
    readHandlers: [...hitl.readHandlers, ...wait.readHandlers],
  }
  const reject = new URL('./fixtures/reject.mjs', import.meta.url)
  const lateReject = new URL('./fixtures/late-reject.mjs', import.meta.url)
  const guard = new URL('./fixtures/guard.mjs', import.meta.url)
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...own,
    migrations: [...own.migrations, ...(options.extraMaterials?.migrations ?? [])],
    readHandlers: [...own.readHandlers, ...(options.extraMaterials?.readHandlers ?? [])],
    participants: [
      ...own.participants,
      ...(options.extraMaterials?.participants ?? []),
      {
        participant: 'fixture.hitl.late-reject',
        protocol: 'fixture-hitl-reject/1',
        moduleUrl: lateReject.href,
        codeDigest: createHash('sha256').update(readFileSync(lateReject)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [WAIT_ACCEPTED_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: 'fixture.hitl.guard',
        protocol: 'fixture-hitl-guard/1',
        moduleUrl: guard.href,
        codeDigest: createHash('sha256').update(readFileSync(guard)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
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
  const participants = [
    ...own.participants.map(item => item.participant),
    'fixture.hitl.reject',
    'fixture.hitl.late-reject',
    'fixture.hitl.guard',
  ]
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const domain = {
    scope: { kind: 'tenant', tenant: options.tenantRef ?? 'tenant-a' },
    transactionDomain: 'hitl.test',
  } as const
  const combination = {
    ...domain,
    combinationVersion: 'independent-hitl/2',
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
    const diagnostic = await created.storage.read({
      domain,
      handler: 'hitl.request-read',
      protocol: 'hitl-sql/2',
      requestKey: 'failed-registration',
      input: {},
    })
    await created.control.close({ initiator: 'disposal' })
    throw new Error(JSON.stringify({ registered, diagnostic }))
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

/** 打开测试事务域的 SQLite 文件，供关系守护与成本测试直接读取。 */
export function database(root: string) {
  return new DatabaseSync(join(root, 'domains', '6869746c2e74657374.sqlite'))
}
