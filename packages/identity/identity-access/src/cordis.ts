// The access plugin of `identity/v1` (RFC-0015 §5): it depends on the access registry only, mounts
// identity's contribution on its own scope, and takes `identityOperations` and
// `identityGovernance` at each call. An application opens `identity/v1` by loading this plugin.
import { defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { identityGovernanceKey, identityOperationsKey } from '@omne-harness/identity/cordis'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { createIdentityOperations } from './operations.ts'

export const identityAccessPlugin = defineAccessPlugin({
  name: 'identity-access',
  protocol: identityProtocol,
  handlers: provide => ({
    operations: createIdentityOperations({
      operations: () => provide(identityOperationsKey),
      governance: () => provide(identityGovernanceKey),
    }),
    observations: {},
  }),
})
