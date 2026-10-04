import {
  ACCOUNT_ID_COLUMN,
  ACCOUNT_TABLE,
  accountIdentityMigrations,
} from '@omne-harness-lite/account-identity'
import { clockMigrations } from '@omne-harness-lite/clock'
import { replicaMigrations } from '@omne-harness-lite/credential-custodian-local/migrations'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance'
import {sessionTenancyMigrations} from '@omne-harness-lite/session-tenancy-table'
import {
  composedMigrationName,
  type MigrationFragment,
  type PreflightCheck,
} from '@omne-harness-lite/storage'

/** This app owns a separate database format; the complete sequence is fixed before opening. */
export const acceptanceMigrations: readonly MigrationFragment[] = Object.freeze([
  ...accountIdentityMigrations,
  ...organizationGovernanceMigrations({
    ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
    ownerAccountForeignKey: 'organization_owner_account_fk',
  }),
  ...clockMigrations,
  ...modelProfileDirectoryMigrations,
  ...replicaMigrations,
])

export const requestPreparationMigrations: readonly MigrationFragment[] = Object.freeze([
  ...acceptanceMigrations,
  ...sessionTenancyMigrations,
])

export function migrationPrefixCheck(fragments: readonly MigrationFragment[]): PreflightCheck {
  const names = fragments.map((fragment, index) => composedMigrationName(index + 1, fragment))
  return async ({ appliedMigrations }) =>
    appliedMigrations.every((name, index) => name === names[index])
      ? { ok: true }
      : {
          ok: false,
          check: 'acceptance-data-format',
          detail: 'stored migration sequence is not the adopted prefix',
        }
}
