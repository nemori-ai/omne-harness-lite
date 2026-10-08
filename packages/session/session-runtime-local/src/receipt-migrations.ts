import type { MigrationFragment } from '@omne-harness-lite/storage'

export const operationReceiptMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_operation_receipts',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_operation_receipt')
          .addColumn('operation', 'text', column => column.primaryKey())
          .addColumn('semantic', 'text', column => column.notNull())
          .addColumn('receipt', 'text', column => column.notNull())
          .execute()
      },
    },
  },
]
