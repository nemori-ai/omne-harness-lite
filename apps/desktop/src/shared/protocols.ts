import { assetsProtocol } from '@omne-harness/assets-protocol'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import type { ProtocolContract } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { toolProtocol } from '@omne-harness/tool-protocol'

export const domainProtocols: readonly ProtocolContract[] = [
  identityProtocol,
  sessionProtocol,
  assetsProtocol,
  humanInterventionProtocol,
  toolProtocol,
]
