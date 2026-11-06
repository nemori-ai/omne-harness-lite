import { DELIVERY_HANDLER } from './delivery-schema.ts'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { material } from './materials.ts'
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

export function independentWaitSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const control = material('independent-control')
  const inbox = material('independent-accept')
  const controlMigration = material('independent-control-migration')
  const inboxMigration = material('independent-inbox-migration')
  const reader = material('independent-read')
  const deliveryReader = material('delivery-read')
  return {
    participants: [
      {
        participant: WAIT_CONTROL,
        protocol: WAIT_PROTOCOL,
        moduleUrl: control.moduleUrl,
        codeDigest: control.digest,
        ownedTables: ['hi_wait_controls'],
        readTables: ['hi_wait_active', 'hi_wait_inbox'],
        requiresFacts: [TERMINAL_FACT],
        providesFacts: [WAIT_BASIS_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: WAIT_ACCEPT,
        protocol: WAIT_PROTOCOL,
        moduleUrl: inbox.moduleUrl,
        codeDigest: inbox.digest,
        ownedTables: ['hi_wait_active', 'hi_wait_inbox'],
        readTables: [],
        requiresFacts: [PLAN_FACT],
        providesFacts: [WAIT_ACCEPTED_FACT],
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
    ],
    readHandlers: [
      {
        handler: DELIVERY_HANDLER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: deliveryReader.moduleUrl,
        codeDigest: deliveryReader.digest,
        ordering: 'snapshot',
        readTables: ['hi_wait_controls', 'hi_wait_inbox'],
        requiresMigrations: [CONTROL_MIGRATION, INBOX_MIGRATION],
        maxRowsRead: 65,
        maxOutputBytes: 8388608,
      },
      {
        handler: WAIT_HANDLER,
        protocol: WAIT_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: ['hi_wait_controls', 'hi_wait_active', 'hi_wait_inbox'],
        requiresMigrations: [CONTROL_MIGRATION, INBOX_MIGRATION],
        maxRowsRead: 66,
        maxOutputBytes: 8388608,
      },
    ],
  }
}
