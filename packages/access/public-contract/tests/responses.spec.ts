import {
  encodeGovernanceResponse,
  readGovernanceResponse,
  type GovernanceProvidedOperation,
  type GovernanceResponseEncodeInput,
} from '@omne-harness/public-contract'
import { expect, it } from 'vitest'
const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const accountId = 'acc_00000000000000000000000000'
const organizationId = 'org_00000000000000000000000000'
const tenantId = JSON.stringify({ organization: organizationId, account: accountId })
const at = '2016-12-31T23:59:60.123456789012345678900Z'
const invitation = {
  invitationId: 'i',
  state: 'expired',
  expiresAt: at,
  organizationId,
  invitedAccountId: accountId,
}
const affiliation = {
  requestId: 'r',
  state: 'invalid',
  expiresAt: at,
  superiorOrganizationId: organizationId,
  subordinateOrganizationId: organizationId,
}
const successes = {
  'public-health': { protocolVersion: 'governance-public/1' },
  'register-and-activate': { accountId, organizationId, tenantId },
  'issue-login': {
    loginIdentifier: ' Raw Login ',
    issuedAt: at,
    tenantId,
    loginProof: 'once-only-secret',
  },
  'revoke-login': {},
  'replace-credential': {},
  'query-own-valid-logins': {
    logins: [
      {
        loginId: 'lgn_00000000000000000000000000',
        issuedAt: at,
        maxDeadline: at,
        idleDeadline: at,
      },
    ],
    completeness: 'complete',
  },
  'query-current-tenant': { tenantId },
  'query-own-memberships': {
    memberships: [{ organizationId, tenantId, role: 'member' }],
    completeness: 'complete',
  },
  'query-received-invitations': { invitations: [invitation], completeness: 'complete' },
  'query-create-organization': { organizationId, tenantId },
  'issue-member-invitation': { invitationId: 'i', state: 'open', expiresAt: at },
  'open-affiliation-request': { requestId: 'r', state: 'pending', expiresAt: at },
  'query-organization-members': {
    members: [{ accountId, role: 'member' }],
    completeness: 'complete',
  },
  'accept-member-invitation': { invitationId: 'i', state: 'accepted' },
  'reject-member-invitation': { invitationId: 'i', state: 'rejected' },
  'withdraw-member-invitation': { invitationId: 'i', state: 'withdrawn' },
  'query-invitation': invitation,
  'create-organization': { organizationId, tenantId },
  'leave-organization': {},
  'remove-member': {},
  'change-member-role': {},
  'switch-current-tenant': { tenantId },
  'query-organization': {
    organizationId,
    name: ' Name ',
    kind: 'team',
    superiorOrganizationId: organizationId,
  },
  'query-issued-invitations': { invitations: [invitation], completeness: 'complete' },
  'accept-affiliation-request': { affiliationId: 'a', state: 'effective' },
  'reject-affiliation-request': { requestId: 'r', state: 'rejected' },
  'withdraw-affiliation-request': { requestId: 'r', state: 'withdrawn' },
  'release-affiliation': {},
  'query-received-affiliation-requests': {
    affiliationRequests: [affiliation],
    completeness: 'complete',
  },
  'query-issued-affiliation-requests': {
    affiliationRequests: [affiliation],
    completeness: 'complete',
  },
  'query-affiliation-request': affiliation,
  'judge-admission': { admitted: true },
  'submit-authorization-expression': { expressionId: 'e', persistentSettingsUpdated: false },
  'withdraw-authorization-expression': {},
} satisfies Record<GovernanceProvidedOperation, object>
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
function response(operation: GovernanceProvidedOperation, outcome: string, body: unknown = {}) {
  const wire = { protocolVersion: 'governance-public/1', messageId: 'm', outcome, body }
  return {
    wire,
    result: readGovernanceResponse({
      bytes: bytes(wire),
      operation,
      expectedMessageId: 'm',
      limits,
    }),
  }
}

it.each(Object.entries(successes))(
  '%s round trips success, enforces complete body and forbids credential/proof leakage',
  (name, body) => {
    const operation = name as GovernanceProvidedOperation
    const { wire, result } = response(operation, 'succeeded', body)
    expect(result.kind).toBe('response')
    if (result.kind !== 'response') return
    const encoded = encodeGovernanceResponse({
      operation,
      response: result.response,
      limits,
    } as GovernanceResponseEncodeInput)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(wire)
    for (const extra of ['credential', 'currentCredential', 'newCredential', 'permitSecret'])
      expect(response(operation, 'succeeded', { ...body, [extra]: 'secret' }).result.kind).toBe(
        'unreadable',
      )
    if (operation !== 'issue-login')
      expect(response(operation, 'succeeded', { ...body, loginProof: 'secret' }).result.kind).toBe(
        'unreadable',
      )
    for (const key of Object.keys(body)) {
      const missing: Record<string, unknown> = { ...body }
      delete missing[key]
      if (key !== 'superiorOrganizationId')
        expect(response(operation, 'succeeded', missing).result.kind).toBe('unreadable')
      expect(response(operation, 'succeeded', { ...body, [key]: null }).result.kind).toBe(
        'unreadable',
      )
    }
    expect(
      readGovernanceResponse({
        bytes: bytes({ ...wire, body: undefined }),
        operation,
        expectedMessageId: 'm',
        limits,
      }).kind,
    ).toBe('unreadable')
  },
)

const allowed = {
  'public-health': [],
  'register-and-activate': ['not-loginable'],
  'issue-login': ['uniform-auth-failure', 'basis-unavailable'],
  'revoke-login': ['denied', 'not-visible', 'basis-unavailable'],
  'replace-credential': ['denied', 'basis-unavailable'],
  'query-own-valid-logins': ['denied', 'basis-unavailable'],
  'query-current-tenant': ['denied', 'basis-unavailable'],
  'query-own-memberships': ['denied', 'basis-unavailable'],
  'query-received-invitations': ['denied', 'basis-unavailable'],
  'query-create-organization': ['denied', 'basis-unavailable', 'conflict', 'unknown'],
  'issue-member-invitation': ['denied', 'not-visible', 'basis-unavailable'],
  'open-affiliation-request': ['denied', 'not-visible', 'basis-unavailable'],
  'query-organization-members': ['denied', 'not-visible', 'basis-unavailable'],
  'accept-member-invitation': ['denied', 'not-visible', 'basis-unavailable'],
  'reject-member-invitation': ['denied', 'not-visible', 'basis-unavailable'],
  'withdraw-member-invitation': ['denied', 'not-visible', 'basis-unavailable'],
  'query-invitation': ['denied', 'not-visible', 'basis-unavailable'],
  'create-organization': ['denied', 'basis-unavailable', 'conflict', 'unknown'],
  'leave-organization': ['denied', 'basis-unavailable'],
  'remove-member': ['denied', 'not-visible', 'basis-unavailable', 'conflict'],
  'change-member-role': ['denied', 'not-visible', 'basis-unavailable', 'conflict'],
  'switch-current-tenant': ['denied', 'basis-unavailable'],
  'query-organization': ['denied', 'not-visible', 'basis-unavailable'],
  'query-issued-invitations': ['denied', 'basis-unavailable'],
  'accept-affiliation-request': ['denied', 'not-visible', 'basis-unavailable'],
  'reject-affiliation-request': ['denied', 'not-visible', 'basis-unavailable'],
  'withdraw-affiliation-request': ['denied', 'not-visible', 'basis-unavailable'],
  'release-affiliation': ['denied', 'not-visible', 'basis-unavailable', 'conflict'],
  'query-received-affiliation-requests': ['denied', 'basis-unavailable'],
  'query-issued-affiliation-requests': ['denied', 'basis-unavailable'],
  'query-affiliation-request': ['denied', 'not-visible', 'basis-unavailable'],
  'judge-admission': ['denied', 'not-visible', 'basis-unavailable'],
  'submit-authorization-expression': ['denied', 'basis-unavailable', 'unknown'],
  'withdraw-authorization-expression': ['denied', 'basis-unavailable', 'unknown'],
} satisfies Record<GovernanceProvidedOperation, readonly string[]>
it.each(Object.entries(allowed))(
  '%s permits exactly its empty-body refusal outcomes',
  (name, outcomes) => {
    const operation = name as GovernanceProvidedOperation
    const permitted: readonly string[] = outcomes
    for (const outcome of [
      'denied',
      'not-visible',
      'basis-unavailable',
      'conflict',
      'unknown',
      'not-loginable',
      'uniform-auth-failure',
      'protocol-rejected',
    ]) {
      expect(response(operation, outcome).result.kind).toBe(
        outcome === 'protocol-rejected' || permitted.includes(outcome) ? 'response' : 'unreadable',
      )
      expect(response(operation, outcome, { secret: true }).result.kind).toBe('unreadable')
    }
    expect(response(operation, 'stage-not-provided').result.kind).toBe('unreadable')
  },
)

it.each([
  'accept-member-invitation',
  'reject-member-invitation',
  'withdraw-member-invitation',
] as const)(
  '%s accepts an existing invitation terminal without fabricating a new outcome',
  operation => {
    for (const state of ['accepted', 'rejected', 'withdrawn', 'expired'])
      expect(response(operation, 'no-change', { invitationId: 'i', state }).result.kind).toBe(
        'response',
      )
    expect(response(operation, 'no-change', { invitationId: 'i', state: 'open' }).result.kind).toBe(
      'unreadable',
    )
    for (const state of ['accepted', 'rejected', 'withdrawn'])
      expect(response(operation, 'succeeded', { invitationId: 'i', state }).result.kind).toBe(
        state === successes[operation].state ? 'response' : 'unreadable',
      )
  },
)
it.each([
  'accept-affiliation-request',
  'reject-affiliation-request',
  'withdraw-affiliation-request',
] as const)('%s distinguishes request terminals from effective affiliation', operation => {
  for (const state of ['accepted', 'rejected', 'withdrawn', 'invalid', 'expired'])
    expect(response(operation, 'no-change', { requestId: 'r', state }).result.kind).toBe('response')
  expect(response(operation, 'no-change', { requestId: 'r', state: 'pending' }).result.kind).toBe(
    'unreadable',
  )
  expect(
    response(operation, 'no-change', { affiliationId: 'a', state: 'effective' }).result.kind,
  ).toBe('unreadable')
})
it('closes the remaining no-change/need-decision shapes and nonempty login list', () => {
  for (const operation of ['revoke-login', 'switch-current-tenant'] as const)
    expect(response(operation, 'no-change').result.kind).toBe('response')
  expect(
    response('release-affiliation', 'no-change', { affiliationId: 'a', state: 'released' }).result
      .kind,
  ).toBe('response')
  expect(
    response('submit-authorization-expression', 'no-change', { expressionId: 'e' }).result.kind,
  ).toBe('response')
  expect(response('judge-admission', 'need-decision', { decisionRequestId: 'd' }).result.kind).toBe(
    'response',
  )
  expect(
    response('judge-admission', 'need-decision', { decisionRequestId: 'd', approved: true }).result
      .kind,
  ).toBe('unreadable')
  expect(response('judge-admission', 'succeeded', { admitted: false }).result.kind).toBe(
    'unreadable',
  )
  expect(
    response('submit-authorization-expression', 'succeeded', {
      expressionId: 'e',
      persistentSettingsUpdated: true,
    }).result.kind,
  ).toBe('unreadable')
  expect(
    response('query-own-valid-logins', 'succeeded', { logins: [], completeness: 'complete' }).result
      .kind,
  ).toBe('unreadable')
  expect(
    response('query-own-valid-logins', 'basis-unavailable', successes['query-own-valid-logins'])
      .result.kind,
  ).toBe('unreadable')
})

it('requires a message ID for success while preserving uncorrelated common responses', () => {
  const success = {
    protocolVersion: 'governance-public/1',
    outcome: 'succeeded',
    body: successes['public-health'],
  }
  expect(
    readGovernanceResponse({
      bytes: bytes(success),
      operation: 'public-health',
      expectedMessageId: 'm',
      limits,
    }),
  ).toEqual({ kind: 'unreadable', diagnostic: { code: 'field' } })
  expect(
    encodeGovernanceResponse({
      operation: 'public-health',
      response: success,
      limits,
    } as GovernanceResponseEncodeInput),
  ).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
  for (const outcome of ['protocol-rejected', 'stage-not-provided'] as const) {
    const common = { protocolVersion: 'governance-public/1', outcome, body: {} } as const
    const encoded = encodeGovernanceResponse({ response: common, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') throw new Error('Expected valid common response')
    expect(
      readGovernanceResponse({
        bytes: encoded.bytes,
        operation: outcome === 'protocol-rejected' ? 'public-health' : 'disable-subject',
        expectedMessageId: 'm',
        limits,
      }),
    ).toEqual({ kind: 'unmatched' })
  }
})

it('accepts a query organization success without an optional superior', () => {
  const body = { organizationId, name: 'n', kind: 'team' }
  const { wire, result } = response('query-organization', 'succeeded', body)
  expect(result.kind).toBe('response')
  if (result.kind !== 'response')
    throw new Error('Expected organization response without a superior')
  const encoded = encodeGovernanceResponse({
    operation: 'query-organization',
    response: result.response,
    limits,
  } as GovernanceResponseEncodeInput)
  expect(encoded.kind).toBe('encoded')
  if (encoded.kind !== 'encoded') throw new Error('Expected encoded organization response')
  expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(wire)
})
