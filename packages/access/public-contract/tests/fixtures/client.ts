import {
  encodeGovernanceRequest,
  readGovernanceResponse,
  type GovernanceCodecLimits,
} from '@omne-harness/public-contract'

export function healthRequest(messageId: string, limits: GovernanceCodecLimits) {
  return encodeGovernanceRequest({
    request: {
      protocolVersion: 'governance-public/1',
      messageId,
      operation: 'public-health',
      body: {},
    },
    limits,
  })
}
export function healthResponse(
  bytes: Uint8Array,
  expectedMessageId: string,
  limits: GovernanceCodecLimits,
) {
  return readGovernanceResponse({ bytes, operation: 'public-health', expectedMessageId, limits })
}
