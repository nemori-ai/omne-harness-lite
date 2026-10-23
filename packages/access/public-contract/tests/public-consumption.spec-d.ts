import { expectTypeOf, test } from 'vitest'
import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  readGovernanceResponse,
  type GovernanceRequest,
  type GovernanceResponse,
  type GovernanceOperation,
  type GovernanceStageOperation,
  type GovernanceResponseEncodeInput,
} from '@omne-harness/public-contract'
const limits = {
  maxBytes: 1000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 10,
  maxStringLength: 100,
  maxNumberLength: 10,
}
test('operation-indexed requests and responses reject unrelated bodies and outcomes', () => {
  const health: GovernanceRequest<'public-health'> = {
    protocolVersion: 'governance-public/1',
    messageId: 'm',
    operation: 'public-health',
    body: {},
  }
  expectTypeOf(encodeGovernanceRequest({ request: health, limits }).kind).toEqualTypeOf<
    'encoded' | 'invalid'
  >()
  // @ts-expect-error Empty health body cannot carry a credential.
  const bad: GovernanceRequest<'public-health'> = { ...health, body: { credential: 'secret' } }
  void bad
  const stage: GovernanceResponse<'public-health'> = {
    protocolVersion: 'governance-public/1',
    // @ts-expect-error Normal operations cannot produce stage outcomes.
    outcome: 'stage-not-provided',
    body: {},
  }
  void stage
  const business: GovernanceResponse<GovernanceStageOperation> = {
    protocolVersion: 'governance-public/1',
    messageId: 'm',
    // @ts-expect-error Stage operations cannot produce business success.
    outcome: 'succeeded',
    body: {},
  }
  void business
  const mismatched: GovernanceResponseEncodeInput<GovernanceOperation> = {
    operation: 'public-health',
    response: {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      outcome: 'succeeded',
      // @ts-expect-error Operation and success body stay correlated in a union input.
      body: { admitted: true },
    },
    limits,
  }
  void mismatched
  encodeGovernanceResponse({
    response: { protocolVersion: 'governance-public/1', outcome: 'protocol-rejected', body: {} },
    limits,
  })
  // @ts-expect-error Business success requires operation context.
  encodeGovernanceResponse({
    response: {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      outcome: 'succeeded',
      body: {},
    },
    limits,
  })
  const result = readGovernanceResponse({
    bytes: new Uint8Array(),
    operation: 'public-health',
    expectedMessageId: 'm',
    limits,
  })
  if (result.kind === 'response')
    expectTypeOf(result.response).toEqualTypeOf<GovernanceResponse<'public-health'>>()
})
