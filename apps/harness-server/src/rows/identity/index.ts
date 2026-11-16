import {
  identityClockKey,
  identityGovernanceKey,
  identityOperationsKey,
  tenantStandingKey,
  standingReservationsKey,
} from '@omne-harness/identity/cordis'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export const identityRow = defineRow({
  row: 'identity',
  implementation: 'real',
  manifest: {
    provides: [
      identityOperationsKey,
      tenantStandingKey,
      identityGovernanceKey,
      standingReservationsKey,
    ],
    injects: [storageKey, identityClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: IdentitySqlPlugin,
})
