import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { GOVERNANCE_MIGRATION, GOVERNANCE_OWNER, GOVERNANCE_TABLES } from './migration.ts'
import {
  ACTIVATION_PLAN,
  ADOPTION_CURRENT,
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  ACTIVATION_PROTOCOL,
} from './activation-schema.ts'
import { GOVERNANCE_RECOVERY_MIGRATION } from './recovery-migration.ts'
import { RECOVERY_HANDLER } from './recovery-read.ts'

export function governanceSqlMigrations(): SqlMaterialCatalog['migrations'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./migration.${extension}`, import.meta.url)
  const recovery = new URL(`./recovery-migration.${extension}`, import.meta.url)
  return [
    {
      ...GOVERNANCE_MIGRATION,
      moduleUrl: url.href,
      checksum: createHash('sha256').update(readFileSync(url)).digest('hex'),
      requires: [],
    },
    {
      ...GOVERNANCE_RECOVERY_MIGRATION,
      moduleUrl: recovery.href,
      checksum: createHash('sha256').update(readFileSync(recovery)).digest('hex'),
      requires: [GOVERNANCE_MIGRATION],
    },
  ]
}

export function governanceRecoveryReadMaterials(): SqlMaterialCatalog['readHandlers'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./recovery-read.${extension}`, import.meta.url)
  return [
    {
      ...RECOVERY_HANDLER,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ordering: 'domain-serial',
      readTables: ['gc_scope', 'gc_operation'],
      requiresMigrations: [GOVERNANCE_RECOVERY_MIGRATION],
      maxOutputBytes: 256 * 1024,
      maxRowsRead: 66,
    },
  ]
}

function participantFile(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function governanceSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const planners = [
    { participant: METADATA_PLANNER, file: 'metadata-plan', readTables: [], requiresFacts: [] },
    {
      participant: MUTATION_PLANNER,
      file: 'mutation-plan',
      readTables: ['gc_operation'],
      requiresFacts: [],
    },
    {
      participant: ADOPTION_PLANNER,
      file: 'adoption-plan-participant',
      readTables: ['gc_operation'],
      requiresFacts: [ADOPTION_CURRENT],
    },
  ]
  return {
    migrations: governanceSqlMigrations(),
    readHandlers: governanceRecoveryReadMaterials(),
    participants: [
      {
        participant: GOVERNANCE_OWNER,
        protocol: ACTIVATION_PROTOCOL,
        ...participantFile('activation'),
        ownedTables: GOVERNANCE_TABLES,
        readTables: [],
        requiresFacts: [ACTIVATION_PLAN],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      ...planners.map(planner => ({
        participant: planner.participant,
        protocol: ACTIVATION_PLAN.protocol,
        ...participantFile(planner.file),
        ownedTables: [],
        readTables: planner.readTables,
        requiresFacts: planner.requiresFacts,
        providesFacts: [ACTIVATION_PLAN],
        allowedFunctions: [],
        grouping: 'groupable' as const,
      })),
    ],
  }
}
