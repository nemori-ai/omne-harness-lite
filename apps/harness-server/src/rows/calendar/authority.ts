import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  calendarPersistenceAuthorityFact,
  calendarSupplyStorageAuthorityFact,
  calendarSqlMaterials,
  calendarSupplySqlMaterials,
} from '@omne-harness/calendar-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES } from '../storage/catalog.ts'

export const CALENDAR_AUTHORITY = {
  participant: 'harness-server.calendar.authority',
  protocol: 'harness-server-calendar-authority/1',
}
export const CALENDAR_DOMAIN = {
  scope: { kind: 'system' as const },
  transactionDomain: 'system.calendar',
}
export const CALENDAR_PARTICIPANTS = [
  CALENDAR_AUTHORITY.participant,
  'calendar.persistence',
  'calendar.supply',
]

export function calendarAuthority(kind: 'publication' | 'supply') {
  return {
    participant: CALENDAR_AUTHORITY.participant,
    command: (binding: unknown): FactCommandV2 => ({
      participant: CALENDAR_AUTHORITY.participant,
      facts: { kind, binding: JSON.parse(JSON.stringify(binding)) },
    }),
  }
}

/** The calendar store and its authority participant, for the production storage catalog. */
export function calendarStorageMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const persistence = calendarSqlMaterials()
  const supply = calendarSupplySqlMaterials({
    maxReadBytes: DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES,
  })
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./authority-participant.${extension}`, import.meta.url)
  return {
    participants: [
      {
        ...CALENDAR_AUTHORITY,
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [calendarPersistenceAuthorityFact, calendarSupplyStorageAuthorityFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      ...persistence.participants,
      ...supply.participants,
    ],
    migrations: [...persistence.migrations, ...supply.migrations],
    readHandlers: [...persistence.readHandlers, ...supply.readHandlers],
  }
}
