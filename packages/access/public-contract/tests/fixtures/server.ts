import {
  readGovernanceRequest,
  encodeGovernanceResponse,
  type GovernanceCodecLimits,
  type GovernanceRequest,
} from '@omne-harness/public-contract'

export function receive(bytes: Uint8Array, limits: GovernanceCodecLimits) {
  const read = readGovernanceRequest({ bytes, limits })
  if (read.kind !== 'request') return encodeGovernanceResponse({ response: read.response, limits })
  if (read.request.operation === 'public-health')
    return encodeGovernanceResponse({
      operation: 'public-health',
      response: {
        protocolVersion: 'governance-public/1',
        messageId: read.request.messageId,
        outcome: 'succeeded',
        body: { protocolVersion: 'governance-public/1' },
      },
      limits,
    })
  return { kind: 'requires-business-owner', request: read.request } as const satisfies {
    readonly kind: 'requires-business-owner'
    readonly request: GovernanceRequest
  }
}
