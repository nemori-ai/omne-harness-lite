import {
  checkSnapshotTables,
  type SnapshotCheck,
  type SnapshotTable,
} from '@omne-harness-lite/storage'
import type { OrganizationGovernanceMigrationOptions } from './migrations.ts'
import { snapshotTables } from './snapshot-structure.ts'

export const ORGANIZATION_SNAPSHOT_TABLES = Object.freeze(snapshotTables.map(table => table.name))
function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

/** The same static cross-owner reference used to construct this owner's migrations. */
export function organizationGovernanceSnapshotCheck(
  options: OrganizationGovernanceMigrationOptions,
): SnapshotCheck {
  const expected: SnapshotTable[] = snapshotTables.map(table =>
    table.name !== 'organization'
      ? table
      : {
          ...table,
          definition: table.definition
            .replace(
              'constraint "organization_owner_account_fk"',
              `constraint ${identifier(options.ownerAccountForeignKey)}`,
            )
            .replace(
              'references "account" ("account_id")',
              `references ${identifier(options.ownerAccountReference.table)} (${identifier(options.ownerAccountReference.column)})`,
            ),
          foreignKeys: table.foreignKeys.map(key => ({
            ...key,
            table: options.ownerAccountReference.table,
            to: [options.ownerAccountReference.column],
          })),
        },
  )
  return async view => checkSnapshotTables(view, expected, 'organization-snapshot-structure')
}
