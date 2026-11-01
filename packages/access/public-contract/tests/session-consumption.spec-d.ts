import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { expectTypeOf, test } from 'vitest'
import {
  encodeGovernanceRequest,
  encodeSessionRequest,
  encodeSessionResponse,
  readSessionRequest,
  readSessionResponse,
  type GovernanceRequest,
  type SessionHistoryPage,
  type SessionOperation,
  type SessionOutcomes,
  type SessionRequest,
  type SessionRequestRead,
  type SessionResponse,
  type SessionResponseEncodeInput,
  type SessionSuccessBodies,
} from '@omne-harness/public-contract'

declare const tenant: TenantId
declare const message: Extract<JsonValue, { readonly kind: 'object' }>
const limits = {
  maxBytes: 1000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 10,
  maxStringLength: 100,
  maxNumberLength: 10,
}
const session = '0'.repeat(64)
const proof = { kind: 'present', value: 'p' } as const

test('the operation set and the session-only outcomes are closed', () => {
  expectTypeOf<SessionOperation>().toEqualTypeOf<
    | 'create-session'
    | 'query-create-session'
    | 'send-input'
    | 'query-send-input'
    | 'read-history'
    | 'cancel-run'
    | 'stop-call'
  >()
  expectTypeOf<SessionOutcomes['create-session']>().toEqualTypeOf<
    'succeeded' | 'denied' | 'invalid' | 'conflict' | 'basis-unavailable' | 'unknown'
  >()
  expectTypeOf<SessionOutcomes['query-create-session']>().toEqualTypeOf<
    'succeeded' | 'denied' | 'basis-unavailable' | 'unknown'
  >()
  expectTypeOf<SessionOutcomes['read-history']>().toEqualTypeOf<
    'succeeded' | 'denied' | 'invalid' | 'basis-unavailable'
  >()
  expectTypeOf<SessionOutcomes['send-input']>().toEqualTypeOf<
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'archived'
    | 'frozen'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  >()
  expectTypeOf<SessionOutcomes['query-send-input']>().toEqualTypeOf<
    'succeeded' | 'not-committed' | 'denied' | 'basis-unavailable' | 'unknown'
  >()
  expectTypeOf<SessionSuccessBodies['read-history']>().toEqualTypeOf<SessionHistoryPage>()
  expectTypeOf<SessionRequestRead['kind']>().toEqualTypeOf<'request' | 'protocol-rejected'>()
})

test('requests keep the envelope and body of their operation', () => {
  const create: SessionRequest<'create-session'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    operation: 'create-session',
    proof,
    actingTenant: tenant,
    body: { createCallId: 'c', definition: 'd', purpose: '' },
  }
  expectTypeOf(encodeSessionRequest({ request: create, limits }).kind).toEqualTypeOf<
    'encoded' | 'invalid'
  >()
  // @ts-expect-error create-session requires actingTenant.
  const noTenant: SessionRequest<'create-session'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    operation: 'create-session',
    proof,
    body: { createCallId: 'c', definition: 'd', purpose: '' },
  }
  void noTenant
  const send: SessionRequest<'send-input'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    operation: 'send-input',
    proof,
    body: { tenant, session, acceptId: 'a', inputId: 'i', message },
  }
  // @ts-expect-error Only create-session carries actingTenant.
  const extraTenant: SessionRequest<'send-input'> = { ...send, actingTenant: tenant }
  void extraTenant
  // @ts-expect-error The tenant is a TenantId, not its wire text.
  const textTenant: SessionRequest<'send-input'> = { ...send, body: { ...send.body, tenant: '' } }
  void textTenant
  // @ts-expect-error Session requests are not governance requests.
  encodeGovernanceRequest({ request: send, limits })
})

test('read-history has exactly two body shapes chosen by cursor', () => {
  const first: SessionRequest<'read-history'>['body'] = {
    tenant,
    session,
    cursor: null,
    direction: 'forward',
    pageBytes: '1024',
  }
  const next: SessionRequest<'read-history'>['body'] = { tenant, session, cursor: 'c' }
  void first
  void next
  // @ts-expect-error A null cursor needs direction and pageBytes.
  const bare: SessionRequest<'read-history'>['body'] = { tenant, session, cursor: null }
  void bare
  const mixed: SessionRequest<'read-history'>['body'] = {
    tenant,
    session,
    cursor: 'c',
    // @ts-expect-error A string cursor cannot carry direction.
    direction: 'forward',
  }
  void mixed
})

test('responses keep outcome and body correlated to the operation', () => {
  const archived: SessionResponse<'send-input'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    outcome: 'archived',
    body: {},
  }
  void archived
  const notArchived: SessionResponse<'read-history'> = {
    protocolVersion: 'session-public/1',
    messageId: 'm',
    // @ts-expect-error read-history has no archived outcome.
    outcome: 'archived',
    body: {},
  }
  void notArchived
  const noStage: SessionResponse<'create-session'> = {
    protocolVersion: 'session-public/1',
    // @ts-expect-error Session operations have no stage-not-provided outcome.
    outcome: 'stage-not-provided',
    body: {},
  }
  void noStage
  const mismatched: SessionResponseEncodeInput = {
    operation: 'send-input',
    response: {
      protocolVersion: 'session-public/1',
      messageId: 'm',
      outcome: 'succeeded',
      // @ts-expect-error The send-input success body is not the create-session body.
      body: { session, recovered: true },
    },
    limits,
  }
  void mismatched
  encodeSessionResponse({
    response: { protocolVersion: 'session-public/1', outcome: 'protocol-rejected', body: {} },
    limits,
  })
  encodeSessionResponse({
    // @ts-expect-error The common overload takes only the session refusal.
    response: { protocolVersion: 'governance-public/1', outcome: 'protocol-rejected', body: {} },
    limits,
  })
  // @ts-expect-error Business outcomes require operation context.
  encodeSessionResponse({
    response: {
      protocolVersion: 'session-public/1',
      messageId: 'm',
      outcome: 'denied',
      body: {},
    },
    limits,
  })
})

test('readers return the session models', () => {
  const request = readSessionRequest({ bytes: new Uint8Array(), limits })
  if (request.kind === 'request') {
    expectTypeOf(request.request).toEqualTypeOf<SessionRequest>()
    expectTypeOf(request.request).not.toExtend<GovernanceRequest>()
  }
  const result = readSessionResponse({
    bytes: new Uint8Array(),
    operation: 'read-history',
    expectedMessageId: 'm',
    limits,
  })
  if (result.kind === 'response') {
    expectTypeOf(result.response).toEqualTypeOf<SessionResponse<'read-history'>>()
    if (result.response.outcome === 'succeeded')
      expectTypeOf(result.response.body.next).toEqualTypeOf<string | null>()
  }
})
