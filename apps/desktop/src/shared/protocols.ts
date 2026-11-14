import { assetsProtocol } from '@omne-harness/assets-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'

/**
 * The domain protocols of this app, in one list: the page's tree carries a client for each, and the
 * host forwards only what they and `access/v1` declare.
 */
export const domainProtocols: readonly ProtocolContract[] = [
  identityProtocol,
  sessionProtocol,
  assetsProtocol,
]
