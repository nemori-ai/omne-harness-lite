import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { material } from './materials.ts'
import { DELIVERY_HANDLER } from './delivery-schema.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { PLAN_FACT, WAIT_ACCEPTED_FACT, WAIT_BASIS_FACT } from './request-schema.ts'
import { WAIT_HANDLER, WAIT_PROTOCOL } from './independent-schema.ts'
import { WAIT_PLANNER, WAIT_WRITER, WAIT_MIGRATION } from './wait-schema.ts'
import { waitTables } from './relational-ddl.ts'
export function independentWaitSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const planner = material('wait-plan'),
    writer = material('wait-write'),
    migration = material('wait-tables')
  const reader = material('independent-read'),
    delivery = material('delivery-read')
  return {
    participants: [
      {
        participant: WAIT_PLANNER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: planner.moduleUrl,
        codeDigest: planner.digest,
        ownedTables: [],
        readTables: [...waitTables],
        requiresFacts: [TERMINAL_FACT],
        providesFacts: [WAIT_BASIS_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: WAIT_WRITER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: writer.moduleUrl,
        codeDigest: writer.digest,
        ownedTables: [...waitTables],
        readTables: [],
        requiresFacts: [WAIT_BASIS_FACT, PLAN_FACT],
        providesFacts: [WAIT_ACCEPTED_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...WAIT_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        handler: DELIVERY_HANDLER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: delivery.moduleUrl,
        codeDigest: delivery.digest,
        ordering: 'snapshot',
        readTables: [
          'hi_wait_pending_v2',
          'hi_wait_inbox_v2',
          'hi_wait_active_v2',
          'hi_wait_cards_v2',
          'hi_wait_preparations_v2',
        ],
        requiresMigrations: [WAIT_MIGRATION],
        maxRowsRead: 201,
        maxOutputBytes: 8388608,
      },
      {
        handler: WAIT_HANDLER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: [...waitTables],
        requiresMigrations: [WAIT_MIGRATION],
        maxRowsRead: 130,
        maxOutputBytes: 8388608,
      },
    ],
  }
}
