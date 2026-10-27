import {
  readGovernanceRequest,
  encodeGovernanceResponse,
  readSessionRequest,
  encodeSessionResponse,
  type GovernanceCodecLimits,
  type GovernanceRequest,
  type SessionCodecLimits,
  type SessionRequest,
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

/** Step 1 of the session order only. Every accepted request still needs identity and Session. */
export function receiveSession(bytes: Uint8Array, limits: SessionCodecLimits) {
  const read = readSessionRequest({ bytes, limits })
  if (read.kind !== 'request') return encodeSessionResponse({ response: read.response, limits })
  return { kind: 'requires-business-owner', request: read.request } as const satisfies {
    readonly kind: 'requires-business-owner'
    readonly request: SessionRequest
  }
}
