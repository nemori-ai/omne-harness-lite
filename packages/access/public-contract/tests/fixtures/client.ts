import type { TenantId } from '@omne-harness/legal-identity'
import {
  encodeGovernanceRequest,
  encodeSessionRequest,
  readGovernanceResponse,
  readSessionResponse,
  type GovernanceCodecLimits,
  type SessionCodecLimits,
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

export function createSessionRequest(
  messageId: string,
  actingTenant: TenantId,
  limits: SessionCodecLimits,
) {
  return encodeSessionRequest({
    request: {
      protocolVersion: 'session-public/1',
      messageId,
      operation: 'create-session',
      proof: { kind: 'present', value: 'caller-proof' },
      actingTenant,
      body: { createCallId: messageId, definition: 'default', purpose: '' },
    },
    limits,
  })
}
export function createSessionResponse(
  bytes: Uint8Array,
  expectedMessageId: string,
  limits: SessionCodecLimits,
) {
  return readSessionResponse({ bytes, operation: 'create-session', expectedMessageId, limits })
}
