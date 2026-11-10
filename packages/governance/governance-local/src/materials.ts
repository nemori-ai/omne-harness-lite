import {
  GOVERNANCE_SELECTED_DEFINITION,
  governanceSelectedDefinitionFact,
} from './selected-definition-projection.ts'
import { EXTERNAL_WRITE_BASIS, EXTERNAL_WRITE_TERMINAL } from './external-write-stage.ts'
import {
  governanceExternalWriteBasisFact,
  governanceExternalWriteResultFact,
} from './external-write-protocol.ts'
import {
  GOVERNANCE_EXTERNAL_WRITE_MIGRATION,
  GOVERNANCE_EXTERNAL_WRITE_TABLES,
} from './external-write-migration.ts'
import { PERMISSION_CURRENT, PERMISSION_SNAPSHOT } from './permission-capture-schema.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { GOVERNANCE_MIGRATION, GOVERNANCE_OWNER } from './migration.ts'
import {
  ACTIVATION_PLAN,
  ADOPTION_CURRENT,
  METADATA_PLANNER,
  MUTATION_PLANNER,
  ADOPTION_PLANNER,
  ACTIVATION_PROTOCOL,
} from './activation-schema.ts'
import { GOVERNANCE_RECOVERY_MIGRATION } from './recovery-migration.ts'
import { GOVERNANCE_STAGE_MIGRATION } from './sql-stage-migration.ts'
import { GOVERNANCE_SOURCE_MIGRATION } from './source-custody-migration.ts'
import { OPERATION_HANDLER } from './operation-read.ts'
import { STAGE_HANDLER } from './sql-stage-read.ts'
import { RECOVERY_HANDLER } from './recovery-read.ts'
import { CATALOG_CURRENT, CATALOG_SNAPSHOT } from './catalog-schema.ts'
import { SCOPE_HANDLER } from './scope.ts'
import { OPERATION_REFERENCE_HANDLER } from './operation-reference-read.ts'
import {
  GOVERNANCE_TARGET_PROJECTION,
  governanceTargetProjectionFact,
} from './target-projection.ts'
import { CONTRIBUTION_HANDLER } from './contribution-read.ts'
import {
  GOVERNANCE_DEFINITION_PROJECTION,
  governanceDefinitionProjectionFact,
} from './definition-projection.ts'

export function governanceSqlMigrations(): SqlMaterialCatalog['migrations'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./migration.${extension}`, import.meta.url)
  const recovery = new URL(`./recovery-migration.${extension}`, import.meta.url)
  const stage = new URL(`./sql-stage-migration.${extension}`, import.meta.url)
  const source = new URL(`./source-custody-migration.${extension}`, import.meta.url)
  const external = new URL(`./external-write-migration.${extension}`, import.meta.url)
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
    {
      ...GOVERNANCE_STAGE_MIGRATION,
      moduleUrl: stage.href,
      checksum: createHash('sha256').update(readFileSync(stage)).digest('hex'),
      requires: [GOVERNANCE_MIGRATION],
    },
    {
      ...GOVERNANCE_SOURCE_MIGRATION,
      moduleUrl: source.href,
      checksum: createHash('sha256').update(readFileSync(source)).digest('hex'),
      requires: [GOVERNANCE_STAGE_MIGRATION, GOVERNANCE_RECOVERY_MIGRATION],
    },
    {
      ...GOVERNANCE_EXTERNAL_WRITE_MIGRATION,
      moduleUrl: external.href,
      checksum: createHash('sha256').update(readFileSync(external)).digest('hex'),
      requires: [GOVERNANCE_SOURCE_MIGRATION],
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
      readTables: ['gc_scope', 'gc_operation', 'gc_permission_source'],
      requiresMigrations: [GOVERNANCE_SOURCE_MIGRATION],
      maxOutputBytes: 256 * 1024,
      maxRowsRead: 131,
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
    readHandlers: [
      ...governanceRecoveryReadMaterials(),
      {
        ...SCOPE_HANDLER,
        ...participantFile('scope'),
        ordering: 'domain-serial',
        readTables: ['gc_scope'],
        requiresMigrations: [GOVERNANCE_MIGRATION],
        maxOutputBytes: 8 * 1024,
        maxRowsRead: 1,
      },
      {
        ...OPERATION_REFERENCE_HANDLER,
        ...participantFile('operation-reference-read'),
        ordering: 'domain-serial',
        readTables: ['gc_operation'],
        requiresMigrations: [GOVERNANCE_MIGRATION],
        maxOutputBytes: 3 * 1024 * 1024,
        maxRowsRead: 1,
      },
      {
        ...CONTRIBUTION_HANDLER,
        ...participantFile('contribution-read'),
        ordering: 'domain-serial',
        readTables: ['gc_contribution', 'gc_scope'],
        requiresMigrations: [GOVERNANCE_MIGRATION],
        maxOutputBytes: 8 * 1024,
        maxRowsRead: 2,
      },
      {
        ...OPERATION_HANDLER,
        ...participantFile('operation-read'),
        ordering: 'domain-serial',
        readTables: ['gc_operation', 'gc_permission_source'],
        requiresMigrations: [GOVERNANCE_SOURCE_MIGRATION],
        maxOutputBytes: 3 * 1024 * 1024,
        maxRowsRead: 5,
      },
      {
        ...STAGE_HANDLER,
        ...participantFile('sql-stage-read'),
        ordering: 'domain-serial',
        readTables: ['gc_operation', 'gc_sql_stage', 'gc_permission_source'],
        requiresMigrations: [GOVERNANCE_SOURCE_MIGRATION],
        maxOutputBytes: 4 * 1024 * 1024 + 1024,
        maxRowsRead: 4,
      },
    ],
    participants: [
      {
        participant: EXTERNAL_WRITE_BASIS,
        protocol: governanceExternalWriteBasisFact.protocol,
        ...participantFile('external-write-basis'),
        ownedTables: [],
        readTables: ['gc_scope', 'gc_operation', 'gc_sql_stage', 'gc_permission_source'],
        requiresFacts: [],
        providesFacts: [governanceExternalWriteBasisFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: EXTERNAL_WRITE_TERMINAL,
        protocol: governanceExternalWriteResultFact.protocol,
        ...participantFile('external-write-terminal'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [governanceExternalWriteBasisFact, governanceExternalWriteResultFact],
        providesFacts: [ACTIVATION_PLAN],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        ...PERMISSION_SNAPSHOT,
        ...participantFile('permission-snapshot'),
        ownedTables: [],
        readTables: ['gc_operation'],
        requiresFacts: [PERMISSION_CURRENT],
        providesFacts: [ACTIVATION_PLAN],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        ...GOVERNANCE_TARGET_PROJECTION,
        ...participantFile('target-projection-participant'),
        ownedTables: [],
        readTables: ['gc_scope', 'gc_contribution', 'gc_definition', 'gc_selected_target'],
        requiresFacts: [],
        providesFacts: [governanceTargetProjectionFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        ...GOVERNANCE_SELECTED_DEFINITION,
        ...participantFile('selected-definition-participant'),
        ownedTables: [],
        readTables: ['gc_scope', 'gc_contribution', 'gc_definition', 'gc_selected_definition'],
        requiresFacts: [],
        providesFacts: [governanceSelectedDefinitionFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        ...GOVERNANCE_DEFINITION_PROJECTION,
        ...participantFile('definition-projection-participant'),
        ownedTables: [],
        readTables: ['gc_scope', 'gc_contribution', 'gc_definition'],
        requiresFacts: [],
        providesFacts: [governanceDefinitionProjectionFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        ...CATALOG_SNAPSHOT,
        ...participantFile('catalog-snapshot'),
        ownedTables: [],
        readTables: [
          'gc_scope',
          'gc_contribution',
          'gc_definition',
          'gc_member',
          'gc_selected_target',
          'gc_operation',
        ],
        requiresFacts: [CATALOG_CURRENT],
        providesFacts: [ACTIVATION_PLAN],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: GOVERNANCE_OWNER,
        protocol: ACTIVATION_PROTOCOL,
        ...participantFile('activation'),
        ownedTables: GOVERNANCE_EXTERNAL_WRITE_TABLES,
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
