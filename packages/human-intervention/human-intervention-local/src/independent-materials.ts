import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { material } from './materials.ts'
import { DELIVERY_HANDLER } from './delivery-schema.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { PLAN_FACT, WAIT_ACCEPTED_FACT, WAIT_BASIS_FACT } from './request-schema.ts'
import {
  CONTROL_MIGRATION,
  INBOX_MIGRATION,
  WAIT_ACCEPT,
  WAIT_CONTROL,
  WAIT_HANDLER,
  WAIT_PROTOCOL,
} from './independent-schema.ts'
import {
  WAIT_PLANNER,
  WAIT_WRITER,
  WAIT_STATE_MIGRATION,
  WAIT_FINAL_MIGRATION,
} from './wait-schema.ts'
import { waitTables } from './relational-ddl.ts'
import {
  CONTROL_RETIRE_MIGRATION,
  INBOX_RETIRE_MIGRATION,
  REQUEST_RELATIONAL_MIGRATION,
} from './relational-migrations.ts'
export function independentWaitSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const planner = material('wait-plan'),
    writer = material('wait-write'),
    legacyControl = material('legacy-control-owner'),
    legacyInbox = material('legacy-inbox-owner')
  const controlMigration = material('independent-control-migration'),
    inboxMigration = material('independent-inbox-migration'),
    upgrade = material('wait-relational-migration')
  const retireControl = material('control-retire-migration'),
    retireInbox = material('inbox-retire-migration'),
    finalize = material('wait-finalize-migration')
  const reader = material('independent-read'),
    delivery = material('delivery-read'),
    businessTables = waitTables.filter(table => table !== 'hi_wait_hitl_export_v2')
  return {
    participants: [
      {
        participant: WAIT_PLANNER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: planner.moduleUrl,
        codeDigest: planner.digest,
        ownedTables: [],
        readTables: businessTables,
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
      {
        participant: WAIT_CONTROL,
        protocol: 'independent-wait/1',
        moduleUrl: legacyControl.moduleUrl,
        codeDigest: legacyControl.digest,
        ownedTables: ['hi_wait_controls'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: WAIT_ACCEPT,
        protocol: 'independent-wait/1',
        moduleUrl: legacyInbox.moduleUrl,
        codeDigest: legacyInbox.digest,
        ownedTables: ['hi_wait_active', 'hi_wait_inbox'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...CONTROL_MIGRATION,
        moduleUrl: controlMigration.moduleUrl,
        checksum: controlMigration.digest,
        requires: [],
      },
      {
        ...INBOX_MIGRATION,
        moduleUrl: inboxMigration.moduleUrl,
        checksum: inboxMigration.digest,
        requires: [],
      },
      {
        ...WAIT_STATE_MIGRATION,
        moduleUrl: upgrade.moduleUrl,
        checksum: upgrade.digest,
        requires: [CONTROL_MIGRATION, INBOX_MIGRATION],
      },
      {
        ...CONTROL_RETIRE_MIGRATION,
        moduleUrl: retireControl.moduleUrl,
        checksum: retireControl.digest,
        requires: [WAIT_STATE_MIGRATION, REQUEST_RELATIONAL_MIGRATION],
      },
      {
        ...INBOX_RETIRE_MIGRATION,
        moduleUrl: retireInbox.moduleUrl,
        checksum: retireInbox.digest,
        requires: [WAIT_STATE_MIGRATION, REQUEST_RELATIONAL_MIGRATION],
      },
      {
        ...WAIT_FINAL_MIGRATION,
        moduleUrl: finalize.moduleUrl,
        checksum: finalize.digest,
        requires: [REQUEST_RELATIONAL_MIGRATION, CONTROL_RETIRE_MIGRATION, INBOX_RETIRE_MIGRATION],
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
        requiresMigrations: [WAIT_FINAL_MIGRATION],
        maxRowsRead: 201,
        maxOutputBytes: 8388608,
      },
      {
        handler: WAIT_HANDLER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: businessTables,
        requiresMigrations: [WAIT_FINAL_MIGRATION],
        maxRowsRead: 130,
        maxOutputBytes: 8388608,
      },
    ],
  }
}
