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
