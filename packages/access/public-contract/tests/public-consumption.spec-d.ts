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
import type { LoginStateId } from '@omne-harness/legal-identity'
const limits = {
  maxBytes: 1000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 10,
  maxStringLength: 100,
  maxNumberLength: 10,
}
test('issue-login success may carry the login identifier', () => {
  type Issued = Extract<GovernanceResponse<'issue-login'>, { outcome: 'succeeded' }>['body']
  expectTypeOf<Issued['loginId']>().toEqualTypeOf<LoginStateId | undefined>()
  type Revoked = Extract<GovernanceResponse<'revoke-login'>, { outcome: 'succeeded' }>['body']
  expectTypeOf<Revoked['loginId']>().toBeNever()
})
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
  // A deployment may declare any provided operation unprovided.
  const declared: GovernanceResponse<'public-health'> = {
    protocolVersion: 'governance-public/1',
    outcome: 'stage-not-provided',
    body: {},
  }
  void declared
  const declaredWithBody: GovernanceResponse<'public-health'> = {
    protocolVersion: 'governance-public/1',
    outcome: 'stage-not-provided',
    // @ts-expect-error A stage-not-provided response has an empty body.
    body: { protocolVersion: 'governance-public/1' },
  }
  void declaredWithBody
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
