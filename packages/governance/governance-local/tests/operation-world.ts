import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { governanceSqlMigrations, governanceRecoveryReadMaterials } from '../src/materials.ts'
import { GOVERNANCE_EXTERNAL_WRITE_TABLES } from '../src/external-write-migration.ts'
import { GOVERNANCE_SQL_TABLES } from '../src/sql-stage-migration.ts'
import { json, digest } from '../src/encoding.ts'
import { requestRef, type AcceptOperation, type Execution } from '../src/operation-schema.ts'
import { config } from './config.ts'
export const tenantRef = JSON.stringify({
  organization: 'org_00000000000000000000000001',
  account: 'acc_00000000000000000000000002',
})
export const scope = {
  tenantRef,
  deploymentId: 'deployment',
  logicalServiceId: 'service',
  visibility: { kind: 'tenant' as const, tenantRef },
}
export const bundle = {
  reference: { ownerId: 'example', definitionId: 'bundle', version: '1', digest: 'a'.repeat(64) },
  origin: { kind: 'independent' as const, providerId: 'example', definitionRef: 'bundle/1' },
  settings: [],
  permissions: [],
  enforcementBindings: [],
}
export const execution: Execution = {
  combinationVersion: 'actual-consumer/1',
  manifestDigest: 'a'.repeat(64),
  authority: { fixture: 'admission-origin-and-standing' },
}
export function command(operationId = 'one'): AcceptOperation {
  return {
    principalRef: 'alice',
    epoch: 'first',
    transactionDomain: 'governance-operations',
    request: {
      owner: 'contribute',
      command: {
        scope,
        contributorId: 'example',
        generation: 'generation-1',
        operationId,
        declaration: structuredClone(bundle),
      },
    },
  }
}
export function binding<T extends AcceptOperation>(input: T) {
  return {
    ref: requestRef<T['request']>(input.principalRef, input.request),
    requestDigest: digest(input.request),
  }
}
export async function openOperations(
  existing?: string,
  options: {
    tenantRef?: string
    legacySchema?: boolean
    extraMaterials?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
  } = {},
) {
  const root = existing ?? realpathSync(mkdtempSync(join(tmpdir(), 'governance-operations-')))
  const url = new URL('./operation-writer.mjs', import.meta.url)
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant: 'governance.activation',
        protocol: 'fixture-governance-operations/1',
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: options.legacySchema
          ? GOVERNANCE_SQL_TABLES
          : GOVERNANCE_EXTERNAL_WRITE_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      ...(options.extraMaterials?.participants ?? []),
    ],
    migrations: [
      ...governanceSqlMigrations().filter(
        migration =>
          !options.legacySchema ||
          !['governance-source-custody-1', 'governance-external-write-1'].includes(migration.id),
      ),
      ...(options.extraMaterials?.migrations ?? []),
    ],
    readHandlers: [
      ...(options.legacySchema ? [] : governanceRecoveryReadMaterials()),
      ...(options.extraMaterials?.readHandlers ?? []),
    ],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = ['governance.activation']
  const checked = combinationManifest({ catalog: materials, participants })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const domain = {
    scope: { kind: 'tenant' as const, tenant: options.tenantRef ?? tenantRef },
    transactionDomain: 'governance-operations',
  }
  const combination = {
    ...domain,
    combinationVersion: options.legacySchema ? 'fixture/1' : 'fixture/2',
    manifestDigest: manifestDigest(checked.manifest),
    participants,
  }
  const made = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const { storage, control } = made
  const registration = await storage.registerCombination(combination)
  if (registration.kind !== 'registered') throw new Error(JSON.stringify(registration))
  async function commit(facts: Record<string, unknown>) {
    return storage.commit({
      identity: {
        ...domain,
        operation: 'fixture.governance',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [
        {
          participant: 'governance.activation',
          facts: Object.fromEntries(
            Object.entries(facts).map(([key, value]) => [key, json(value)]),
          ),
        },
      ],
    })
  }
  return {
    root,
    storage,
    domain,
    commit,
    async call(facts: Record<string, unknown>) {
      const result = await commit(facts)
      if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
      return result.responses[0]!.reply.response
    },
    async close(remove = true) {
      const result = await control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
      if (remove) rmSync(root, { recursive: true, force: true })
    },
  }
}
