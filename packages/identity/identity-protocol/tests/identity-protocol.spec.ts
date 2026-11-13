// C1, C3 and C5: the identity/v1 contract has the 33 identity operations with the identity,
// effect and limit of the evidence table, and each body reads as the governance family reads it.
// The old family's reader is imported here only, as the reference.
import {
  readGovernanceRequest,
  readGovernanceResponse,
  type Codec,
  type GovernanceProvidedOperation,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'

type JsonValue = Parameters<Codec<unknown>['read']>[0]
type JsonLimits = Parameters<Codec<unknown>['read']>[1]
type Name = keyof typeof identityProtocol.operations

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

/** The evidence table (facts §2): identity, effect and limit of each operation. */
const table = {
  'register-and-activate': ['none', 'commit', 'small'],
  'issue-login': ['none', 'commit', 'small'],
  'revoke-login': ['login', 'commit', 'small'],
  'replace-credential': ['login', 'commit', 'small'],
  'query-own-valid-logins': ['login', 'read', 'small'],
  'query-current-tenant': ['login', 'read', 'small'],
  'query-own-memberships': ['login', 'read', 'small'],
  'query-received-invitations': ['login', 'read', 'small'],
  'query-create-organization': ['login', 'read', 'small'],
  'issue-member-invitation': ['acting-tenant', 'commit', 'small'],
  'open-affiliation-request': ['acting-tenant', 'commit', 'small'],
  'query-organization-members': ['acting-tenant', 'read', 'small'],
  'accept-member-invitation': ['acting-tenant', 'commit', 'small'],
  'reject-member-invitation': ['acting-tenant', 'commit', 'small'],
  'withdraw-member-invitation': ['acting-tenant', 'commit', 'small'],
  'query-invitation': ['acting-tenant', 'read', 'small'],
  'create-organization': ['acting-tenant', 'commit', 'small'],
  'leave-organization': ['acting-tenant', 'commit', 'small'],
  'remove-member': ['acting-tenant', 'commit', 'small'],
  'change-member-role': ['acting-tenant', 'commit', 'small'],
  'switch-current-tenant': ['acting-tenant', 'commit', 'small'],
  'query-organization': ['acting-tenant', 'read', 'small'],
  'query-issued-invitations': ['acting-tenant', 'read', 'small'],
  'accept-affiliation-request': ['acting-tenant', 'commit', 'small'],
  'reject-affiliation-request': ['acting-tenant', 'commit', 'small'],
  'withdraw-affiliation-request': ['acting-tenant', 'commit', 'small'],
  'release-affiliation': ['acting-tenant', 'commit', 'small'],
  'query-received-affiliation-requests': ['acting-tenant', 'read', 'small'],
  'query-issued-affiliation-requests': ['acting-tenant', 'read', 'small'],
  'query-affiliation-request': ['acting-tenant', 'read', 'small'],
  'judge-admission': ['acting-tenant', 'read', 'small'],
  'submit-authorization-expression': ['acting-tenant', 'commit', 'small'],
  'withdraw-authorization-expression': ['acting-tenant', 'commit', 'small'],
} as const

const account = 'acc_00000000000000000000000000'
const organization = 'org_00000000000000000000000000'
const login = 'lgn_00000000000000000000000000'
const tenant = JSON.stringify({ organization, account })

/** A valid body of each operation, from the shared contract member's `operations.spec.ts`. */
const bodies: Readonly<Record<Name, Readonly<Record<string, unknown>>>> = {
  'register-and-activate': { loginIdentifier: ' Raw Login ', credential: 'secret' },
  'issue-login': { loginIdentifier: ' Raw Login ', credential: 'secret' },
  'revoke-login': { targetLoginId: login },
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
    parameters: { constructor: 'data', n: 1 },
    scopeId: 'scope',
  },
  'submit-authorization-expression': {
    expression: 'expression',
    action: 'act',
    object: 'object',
    parameters: {},
  },
  'withdraw-authorization-expression': { expressionId: 'expression' },
}

/** Fields an operation may leave out. */
const optional: ReadonlySet<string> = new Set(['duration', 'includeRemoved'])

function json(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(json) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: json(item) })),
  }
}

/** The old governance family's envelope around a body, with the identity the table names. */
function oldRead(operation: Name, body: unknown) {
  const identity = table[operation][0]
  const wire = {
    protocolVersion: 'governance-public/1',
    messageId: 'm',
    operation,
    body,
    ...(identity === 'none' ? {} : { loginProof: 'secret-proof' }),
    ...(identity === 'acting-tenant' ? { actingTenant: tenant } : {}),
  }
  return readGovernanceRequest({
    bytes: new TextEncoder().encode(JSON.stringify(wire)),
    limits,
  })
}

const names = Object.keys(table) as Name[]

describe('C1: the operations and their columns', () => {
  it('names identity/v1 and has exactly the 33 operations of the table and no observation', () => {
    expect(identityProtocol.name).toBe('identity')
    expect(identityProtocol.major).toBe(1)
    expect(Object.keys(identityProtocol.operations).sort()).toEqual([...names].sort())
    expect(names).toHaveLength(33)
    expect(identityProtocol.observations).toEqual({})
  })

  it.each(names)('%s has the identity, effect and limit of the table', name => {
    const operation = identityProtocol.operations[name]
    expect([operation.identity, operation.effect, operation.limit]).toEqual(table[name])
  })

  it.each(names)('%s may answer stage-not-provided and the pipeline outcomes', name => {
    const outcomes: Readonly<Record<string, unknown>> = identityProtocol.operations[name].outcomes
    const [identity, effect] = table[name]
    expect(outcomes['stage-not-provided']).toBe(true)
    expect(outcomes['protocol-rejected']).toBe(true)
    expect(outcomes['basis-unavailable']).toBe(true)
    expect(outcomes.denied).toBe(identity === 'none' ? undefined : true)
    if (effect === 'commit') expect(outcomes.unknown).toBe(true)
  })

  it('query-create-organization reads and may still answer unknown', () => {
    const operation = identityProtocol.operations['query-create-organization']
    expect(operation.effect).toBe('read')
    expect(operation.outcomes.unknown).toBe(true)
  })

  it('no identity operation counts as business access', () => {
    for (const name of names)
      expect(Object.hasOwn(identityProtocol.operations[name], 'countsAsAccess')).toBe(false)
  })
})

describe('C3: a body reads as the governance family reads it', () => {
  it.each(names)('%s reads a valid body to the value the old family reads', name => {
    const body = bodies[name]
    const old = oldRead(name, body)
    expect(old.kind).toBe('request')
    if (old.kind !== 'request') return
    // One operation at a time; the union of all body types is not needed here.
    const codec = identityProtocol.operations[name].body as Codec<unknown>
    const read = codec.read(json(body), limits)
    expect(read).toEqual({ ok: true, value: old.request.body })
    if (!read.ok) return
    expect(codec.write(read.value, limits)).toEqual({
      ok: true,
      value: json(body),
    })
  })

  it.each(names)('%s rejects what the old family rejects', name => {
    const body = bodies[name]
    const invalid: Readonly<Record<string, unknown>>[] = [{ ...body, forbidden: 'secret' }]
    for (const key of Object.keys(body)) {
      invalid.push({ ...body, [key]: null })
      // Every string field of an identity body is non-empty text, a literal or an identifier.
      if (typeof body[key] === 'string') invalid.push({ ...body, [key]: '' })
      if (optional.has(key)) continue
      const missing: Record<string, unknown> = { ...body }
      delete missing[key]
      invalid.push(missing)
    }
    for (const sample of invalid) {
      expect(oldRead(name, sample).kind).toBe('protocol-rejected')
      expect(identityProtocol.operations[name].body.read(json(sample), limits)).toEqual({
        ok: false,
      })
    }
  })

  const withOptional: readonly Name[] = [
    'issue-member-invitation',
    'open-affiliation-request',
    'query-organization-members',
  ]
  it.each(withOptional)(
    '%s accepts a body without its optional field, as the old family does',
    name => {
      const body: Record<string, unknown> = { ...bodies[name] }
      for (const key of optional) delete body[key]
      const old = oldRead(name, body)
      expect(old.kind).toBe('request')
      if (old.kind !== 'request') return
      const codec = identityProtocol.operations[name].body as Codec<unknown>
      expect(codec.read(json(body), limits)).toEqual({ ok: true, value: old.request.body })
    },
  )

  it('rejects a malformed tenant text, as the old family does', () => {
    const body = { tenantId: JSON.stringify({ organization }) }
    expect(oldRead('switch-current-tenant', body).kind).toBe('protocol-rejected')
    expect(
      identityProtocol.operations['switch-current-tenant'].body.read(json(body), limits),
    ).toEqual({ ok: false })
  })
})

describe('C5: issue-login carries the credential', () => {
  const issued = {
    loginIdentifier: 'raw login',
    issuedAt: '2026-01-01T00:00:00.000Z',
    tenantId: tenant,
    loginProof: 'secret-proof',
    loginId: login,
  }
  const succeeded = identityProtocol.operations['issue-login'].outcomes.succeeded

  it('is the only operation with carriesCredential, and it is true', () => {
    expect(identityProtocol.operations['issue-login'].carriesCredential).toBe(true)
    for (const name of names.filter(name => name !== 'issue-login'))
      expect(Object.hasOwn(identityProtocol.operations[name], 'carriesCredential')).toBe(false)
  })

  it('may answer uniform-auth-failure', () => {
    expect(identityProtocol.operations['issue-login'].outcomes['uniform-auth-failure']).toBe(true)
  })

  it('reads a succeeded body with loginId as the old family reads it', () => {
    const old = readGovernanceResponse({
      operation: 'issue-login' satisfies GovernanceProvidedOperation,
      expectedMessageId: 'm',
      bytes: new TextEncoder().encode(
        JSON.stringify({
          protocolVersion: 'governance-public/1',
          messageId: 'm',
          outcome: 'succeeded',
          body: issued,
        }),
      ),
      limits,
    })
    expect(old.kind).toBe('response')
    if (old.kind !== 'response') return
    expect(succeeded.read(json(issued), limits)).toEqual({ ok: true, value: old.response.body })
  })

  it('rejects a succeeded body without loginId', () => {
    const { loginId: _, ...withoutId } = issued
    expect(succeeded.read(json(withoutId), limits)).toEqual({ ok: false })
  })
})
