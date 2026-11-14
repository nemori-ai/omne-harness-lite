import { assetsProtocol } from '@omne-harness/assets-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'

export const domainProtocols: readonly ProtocolContract[] = [
  identityProtocol,
  sessionProtocol,
  assetsProtocol,
]
