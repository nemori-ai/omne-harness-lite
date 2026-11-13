// The `identity-access` row: identity's access plugin (`identityAccessPlugin` of
// `@omne-harness/identity-access/cordis`). Loading it opens `identity/v1` at the new address
// (RFC-0015 I-15: a contribution is not an opening, this row is). It injects `accessRegistry`,
// which the `server-entry` row provides, and reads `identityOperations` and the trusted
// `identityGovernance` at each call: a missing identity provider makes the calls answer
// `basis-unavailable` and leaves the protocol mounted. No configuration and no shutdown phase;
// unloading the row takes `identity/v1` down.
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { identityAccessPlugin } from '@omne-harness/identity-access/cordis'
import { defineRow } from '../../row.ts'

export const identityAccessRow = defineRow({
  row: 'identity-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: identityAccessPlugin,
})
