import {
  accountIdentitySnapshotCheck,
  ACCOUNT_SNAPSHOT_TABLES,
  ACCOUNT_TABLE,
  ACCOUNT_ID_COLUMN,
} from '@omne-harness-lite/account-identity'
import {
  organizationGovernanceSnapshotCheck,
  ORGANIZATION_SNAPSHOT_TABLES,
} from '@omne-harness-lite/organization-governance-sql'
import { clockSnapshotCheck, CLOCK_SNAPSHOT_TABLES } from '@omne-harness-lite/clock-lease'
import {
  governanceCenterSnapshotCheck,
  CENTER_SNAPSHOT_TABLES,
} from '@omne-harness-lite/governance-center-entry'
import { storageSnapshotCheck, STORAGE_SNAPSHOT_TABLES } from '@omne-harness-lite/storage-sql'
import type { SnapshotCheck } from '@omne-harness-lite/storage'
import {
  composedMigrationNames,
  hostMigrationFragments,
  ORGANIZATION_OWNER_ACCOUNT_FK,
} from './migrations.ts'

const tables = new Set([
  ...ACCOUNT_SNAPSHOT_TABLES,
  ...ORGANIZATION_SNAPSHOT_TABLES,
  ...CLOCK_SNAPSHOT_TABLES,
  ...CENTER_SNAPSHOT_TABLES,
  ...STORAGE_SNAPSHOT_TABLES,
])
const migrations = composedMigrationNames(hostMigrationFragments)

/** Composition only: no query of any owner's private tables. */
const completeFormat: SnapshotCheck = async view => {
  if (
    view.structure.views.length !== 0 ||
    view.structure.triggers.length !== 0 ||
    view.structure.tables.length !== tables.size ||
    view.structure.tables.some(table => !tables.has(table.name))
  )
    return {
      ok: false,
      check: 'host-snapshot-objects',
      detail: 'snapshot has missing or unrecognized schema objects',
    }
  const applied = view.inspection.appliedMigrations
  if (
    applied.length !== migrations.length ||
    applied.some((name, index) => name !== migrations[index])
  )
    return {
      ok: false,
      check: 'host-snapshot-migrations',
      detail: 'snapshot does not use the supported complete migration sequence',
    }
  return { ok: true }
}

export const hostSnapshotChecks: readonly SnapshotCheck[] = Object.freeze([
  completeFormat,
  storageSnapshotCheck,
  accountIdentitySnapshotCheck,
  organizationGovernanceSnapshotCheck({
    ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
    ownerAccountForeignKey: ORGANIZATION_OWNER_ACCOUNT_FK,
  }),
  clockSnapshotCheck,
  governanceCenterSnapshotCheck,
])
