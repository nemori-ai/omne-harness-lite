import {
  readGovernanceRequest,
  encodeGovernanceRequest,
  type GovernanceProvidedOperation,
  type GovernanceRequest,
} from '@omne-harness/public-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { expect, it } from 'vitest'
const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const account = 'acc_00000000000000000000000000'
const organization = 'org_00000000000000000000000000'
const tenant = JSON.stringify({ organization, account })
const version = 'governance-public/1'
const encode = (wire: unknown) => new TextEncoder().encode(JSON.stringify(wire))
const bodies = {
  'public-health': {},
  'register-and-activate': { loginIdentifier: ' Raw Login ', credential: 'secret' },
  'issue-login': { loginIdentifier: ' Raw Login ', credential: 'secret' },
  'revoke-login': { targetLoginId: 'lgn_00000000000000000000000000' },
  'replace-credential': { currentCredential: 'old-secret', newCredential: 'new-secret' },
  'query-own-valid-logins': {},
  'query-current-tenant': {},
  'query-own-memberships': {},
  'query-received-invitations': {},
  'query-create-organization': {
    targetCreateCallId: 'creation',
    name: ' Name ',
    governanceModelId: 'model',
  },
  'issue-member-invitation': { invitedLoginIdentifier: ' Raw Login ', duration: 'deployment-unit' },
  'open-affiliation-request': {
    superiorOrganizationId: organization,
    subordinateOrganizationId: organization,
    duration: 'deployment-unit',
  },
  'query-organization-members': { organizationId: organization, includeRemoved: true },
  'accept-member-invitation': { invitationId: 'invite', expectedState: 'open' },
  'reject-member-invitation': { invitationId: 'invite', expectedState: 'open' },
  'withdraw-member-invitation': { invitationId: 'invite', expectedState: 'open' },
  'query-invitation': { invitationId: 'invite' },
  'create-organization': { createCallId: 'creation', name: ' Name ', governanceModelId: 'model' },
  'leave-organization': {},
  'remove-member': { organizationId: organization, accountId: account, expectedRole: 'member' },
  'change-member-role': {
    organizationId: organization,
    accountId: account,
    expectedRole: 'member',
    targetRole: 'admin',
  },
  'switch-current-tenant': { tenantId: tenant },
  'query-organization': { organizationId: organization },
  'query-issued-invitations': {},
  'accept-affiliation-request': { requestId: 'request', expectedState: 'pending' },
  'reject-affiliation-request': { requestId: 'request', expectedState: 'pending' },
  'withdraw-affiliation-request': { requestId: 'request', expectedState: 'pending' },
  'release-affiliation': { affiliationId: 'affiliation', expectedState: 'effective' },
  'query-received-affiliation-requests': {},
  'query-issued-affiliation-requests': {},
  'query-affiliation-request': { requestId: 'request' },
  'judge-admission': {
    resource: 'resource',
    action: 'act',
    parameters: { constructor: 'data' },
    scopeId: 'scope',
  },
  'submit-authorization-expression': {
    expression: 'expression',
    action: 'act',
    object: 'object',
    parameters: {},
  },
  'withdraw-authorization-expression': { expressionId: 'expression' },
} satisfies Record<GovernanceProvidedOperation, object>
const anonymous = ['public-health', 'register-and-activate', 'issue-login']
const loginOnly = [
  'revoke-login',
  'replace-credential',
  'query-own-valid-logins',
  'query-current-tenant',
  'query-own-memberships',
  'query-received-invitations',
  'query-create-organization',
]
function wire(operation: string, body: unknown) {
  return {
    protocolVersion: version,
    messageId: 'm',
    operation,
    body,
    ...(!anonymous.includes(operation) ? { loginProof: 'secret-proof' } : {}),
    ...(!anonymous.includes(operation) && !loginOnly.includes(operation)
      ? { actingTenant: tenant }
      : {}),
  }
}

it.each(Object.entries(bodies))(
  '%s accepts its complete request and rejects extra/missing/mistyped fields',
  (operation, body) => {
    const requestWire = wire(operation, body)
    const result = readGovernanceRequest({ bytes: encode(requestWire), limits })
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    const encoded = encodeGovernanceRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(requestWire)
    expect(
      readGovernanceRequest({
        bytes: encode(wire(operation, { ...body, forbidden: 'secret' })),
        limits,
      }).kind,
    ).toBe('protocol-rejected')
    for (const key of Object.keys(body)) {
      const changed = { ...body, [key]: null }
      expect(readGovernanceRequest({ bytes: encode(wire(operation, changed)), limits }).kind).toBe(
        'protocol-rejected',
      )
      if (key === 'duration' || key === 'includeRemoved') continue
      const missing: Record<string, unknown> = { ...body }
      delete missing[key]
      expect(readGovernanceRequest({ bytes: encode(wire(operation, missing)), limits }).kind).toBe(
        'protocol-rejected',
      )
    }
  },
)

it.each([
  'issue-member-invitation',
  'open-affiliation-request',
  'query-organization-members',
] as const)(
  '%s preserves omitted optional fields without choosing deployment policy',
  operation => {
    const body: Record<string, unknown> = { ...bodies[operation] }
    delete body.duration
    delete body.includeRemoved
    const result = readGovernanceRequest({ bytes: encode(wire(operation, body)), limits })
    expect(result.kind).toBe('request')
    if (result.kind === 'request') {
      const encoded = encodeGovernanceRequest({ request: result.request, limits })
      expect(encoded.kind).toBe('encoded')
      if (encoded.kind === 'encoded')
        expect(JSON.parse(new TextDecoder().decode(encoded.bytes)).body).toEqual(body)
    }
  },
)

it.each([
  JSON.stringify({ organization, account, extra: 'secret' }),
  '{"organization":"' + organization + '","account":"' + account + '","account":"' + account + '"}',
  JSON.stringify({ organization }),
  JSON.stringify({ organization, account: organization }),
  JSON.stringify({ organization: account, account }),
  JSON.stringify({ organization, account: 0 }),
  '\ud800',
  '',
  '[]',
])('rejects malformed inner tenant text %j', value => {
  expect(
    readGovernanceRequest({
      bytes: encode({ ...wire('switch-current-tenant', { tenantId: value }), actingTenant: value }),
      limits,
    }).kind,
  ).toBe('protocol-rejected')
})

it('retains both tenant halves, field text and lossless parameter lexemes including dangerous-looking data keys', () => {
  const source = JSON.stringify(
    wire('judge-admission', {
      resource: ' Raw Resource ',
      action: 'act',
      parameters: {},
      scopeId: 'scope',
    }),
  ).replace(
    '"parameters":{}',
    '"parameters":{"__proto__":{"polluted":true},"constructor":9007199254740993,"n":-0.000e+99}',
  )
  const result = readGovernanceRequest({ bytes: new TextEncoder().encode(source), limits })
  expect(result.kind).toBe('request')
  if (result.kind !== 'request' || result.request.operation !== 'judge-admission') return
  expect(tenantCodec.encode(result.request.actingTenant)).toEqual({ ok: true, value: tenant })
  expect(result.request.body.parameters.entries[1]?.value).toEqual({
    kind: 'number',
    lexeme: '9007199254740993',
  })
  const encoded = encodeGovernanceRequest({ request: result.request, limits })
  expect(encoded.kind).toBe('encoded')
  if (encoded.kind === 'encoded') {
    const output = new TextDecoder().decode(encoded.bytes)
    expect(output).toContain('9007199254740993')
    expect(output).toContain('-0.000e+99')
    expect(output).toContain(' Raw Resource ')
    expect(output).toContain('"__proto__"')
  }
  expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
})

it('rejects credential and identity confusion without creating business refusals', () => {
  expect(
    readGovernanceRequest({
      bytes: encode(wire('revoke-login', { targetLoginId: account })),
      limits,
    }).kind,
  ).toBe('protocol-rejected')
  expect(
    readGovernanceRequest({
      bytes: encode(wire('leave-organization', { accountId: account })),
      limits,
    }).kind,
  ).toBe('protocol-rejected')
  expect(
    readGovernanceRequest({
      bytes: encode(wire('judge-admission', { ...bodies['judge-admission'], admitted: true })),
      limits,
    }).kind,
  ).toBe('protocol-rejected')
  expect(
    readGovernanceRequest({
      bytes: encode(wire('register-and-activate', { loginIdentifier: '', credential: 'secret' })),
      limits,
    }).kind,
  ).toBe('protocol-rejected')
})

it('rejects an invalid acting tenant independently of a valid leave body', () => {
  const invalidTenant = { ...wire('leave-organization', {}), actingTenant: 'bad' }
  expect(readGovernanceRequest({ bytes: encode(invalidTenant), limits })).toEqual({
    kind: 'protocol-rejected',
    response: { protocolVersion: version, messageId: 'm', outcome: 'protocol-rejected', body: {} },
    diagnostic: { code: 'field' },
  })
  expect(
    encodeGovernanceRequest({
      request: {
        protocolVersion: version,
        messageId: 'm',
        operation: 'leave-organization',
        body: {},
        actingTenant: 'bad',
        proof: { kind: 'missing' },
      } as unknown as GovernanceRequest,
      limits,
    }),
  ).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
})

it('rejects hidden parameter discriminants and accepts shared noncyclic leaves', () => {
  const parsed = readGovernanceRequest({
    bytes: encode(wire('judge-admission', bodies['judge-admission'])),
    limits,
  })
  expect(parsed.kind).toBe('request')
  if (parsed.kind !== 'request' || parsed.request.operation !== 'judge-admission')
    throw new Error('Expected valid admission request')
  const request = parsed.request
  const hidden = Object.defineProperty({ kind: 'object' as const, entries: [] }, 'kind', {
    value: 'object',
    enumerable: false,
  })
  expect(
    encodeGovernanceRequest({
      request: { ...request, body: { ...request.body, parameters: hidden } },
      limits,
    }),
  ).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
  const leaf = { kind: 'string', value: 'v' } as const
  const result = encodeGovernanceRequest({
    request: {
      ...request,
      body: {
        ...request.body,
        parameters: {
          kind: 'object',
          entries: [
            { key: 'a', value: leaf },
            { key: 'b', value: leaf },
          ],
        },
      },
    },
    limits,
  })
  expect(result.kind).toBe('encoded')
  if (result.kind !== 'encoded') throw new Error('Expected valid shared parameter leaves')
  expect(JSON.parse(new TextDecoder().decode(result.bytes))).toEqual(
    wire('judge-admission', { ...bodies['judge-admission'], parameters: { a: 'v', b: 'v' } }),
  )
})
