import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  PARTICIPANT,
  PROTOCOL,
  HANDLER,
  AUTHORITY_FACT,
  RESULT_FACT,
  MIGRATION,
  TABLES,
  PAGE_LIMIT,
  READ_BYTES,
} from './schema.ts'
export type CalendarSupplySqlMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>
function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function calendarSupplySqlMaterials(): CalendarSupplySqlMaterials {
  const participant = file('participant'),
    migration = file('migration'),
    reader = file('read')
  return {
    participants: [
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: TABLES,
        readTables: [],
        requiresFacts: [AUTHORITY_FACT],
        providesFacts: [RESULT_FACT],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...MIGRATION, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
    ],
    readHandlers: [
      {
        handler: HANDLER,
        protocol: PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'domain-serial',
        readTables: TABLES,
        requiresMigrations: [MIGRATION],
        maxOutputBytes: READ_BYTES,
        maxRowsRead: 2 * PAGE_LIMIT + 4,
      },
    ],
  }
}
export {
  AUTHORITY_FACT as calendarSupplyStorageAuthorityFact,
  RESULT_FACT as calendarSupplyStorageResultFact,
  PARTICIPANT as calendarSupplyStorageParticipant,
  PAGE_LIMIT as calendarSupplyReadLimit,
  MAX_MATERIAL_BYTES as calendarSupplyMaxMaterialBytes,
} from './schema.ts'
