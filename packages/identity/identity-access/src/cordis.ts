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
