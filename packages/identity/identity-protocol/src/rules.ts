import type { Rule } from '@omne-harness/public-contract'

export const empty = { kind: 'object', fields: {} } as const satisfies Rule

const text = { kind: 'text' } as const
const organization = { kind: 'organization' } as const
const account = { kind: 'account' } as const
const tenant = { kind: 'tenant' } as const
const instant = { kind: 'instant' } as const
const complete = { kind: 'literal', values: ['complete'] } as const
const tenantId = { kind: 'object', fields: { tenantId: { rule: tenant } } } as const

const invitationState = {
  kind: 'literal',
  values: ['open', 'accepted', 'rejected', 'withdrawn', 'expired'],
} as const
const invitationTerminal = {
  kind: 'literal',
  values: ['accepted', 'rejected', 'withdrawn', 'expired'],
} as const
const affiliationRequestState = {
  kind: 'literal',
  values: ['pending', 'accepted', 'rejected', 'withdrawn', 'invalid', 'expired'],
} as const
const affiliationRequestTerminal = {
  kind: 'literal',
  values: ['accepted', 'rejected', 'withdrawn', 'invalid', 'expired'],
} as const

const loginItem = {
  kind: 'object',
  fields: {
    loginId: { rule: { kind: 'login' } },
    issuedAt: { rule: instant },
    maxDeadline: { rule: instant },
    idleDeadline: { rule: instant },
  },
} as const
const membershipItem = {
  kind: 'object',
  fields: {
    organizationId: { rule: organization },
    tenantId: { rule: tenant },
    role: { rule: text },
  },
} as const
const memberItem = {
  kind: 'object',
  fields: { accountId: { rule: account }, role: { rule: text } },
} as const
const invitationItem = {
  kind: 'object',
  fields: {
    invitationId: { rule: text },
    state: { rule: invitationState },
    expiresAt: { rule: instant },
    organizationId: { rule: organization },
    invitedAccountId: { rule: account },
  },
} as const
const affiliationRequestItem = {
  kind: 'object',
  fields: {
    requestId: { rule: text },
    state: { rule: affiliationRequestState },
    expiresAt: { rule: instant },
    superiorOrganizationId: { rule: organization },
    subordinateOrganizationId: { rule: organization },
  },
} as const

const credentialPair = {
  kind: 'object',
  fields: { loginIdentifier: { rule: text }, credential: { rule: text } },
} as const
const openInvitation = {
  kind: 'object',
  fields: {
    invitationId: { rule: text },
    expectedState: { rule: { kind: 'literal', values: ['open'] } },
  },
} as const
const pendingRequest = {
  kind: 'object',
  fields: {
    requestId: { rule: text },
    expectedState: { rule: { kind: 'literal', values: ['pending'] } },
  },
} as const
const createOrganization = {
  kind: 'object',
  fields: { name: { rule: text }, governanceModelId: { rule: text } },
} as const
const createdOrganization = {
  kind: 'object',
  fields: { organizationId: { rule: organization }, tenantId: { rule: tenant } },
} as const
const invitationNoChange = {
  kind: 'object',
  fields: { invitationId: { rule: text }, state: { rule: invitationTerminal } },
} as const
const requestNoChange = {
  kind: 'object',
  fields: { requestId: { rule: text }, state: { rule: affiliationRequestTerminal } },
} as const

export const requests = {
  'register-and-activate': credentialPair,
  'issue-login': credentialPair,
  'revoke-login': { kind: 'object', fields: { targetLoginId: { rule: { kind: 'login' } } } },
  'replace-credential': {
    kind: 'object',
    fields: { currentCredential: { rule: text }, newCredential: { rule: text } },
  },
  'query-own-valid-logins': empty,
  'query-current-tenant': empty,
  'query-own-memberships': empty,
  'query-received-invitations': empty,
  'query-create-organization': {
    kind: 'object',
    fields: { targetCreateCallId: { rule: text }, ...createOrganization.fields },
  },
  'issue-member-invitation': {
    kind: 'object',
    fields: {
      invitedLoginIdentifier: { rule: text },
      duration: { rule: text, optional: true },
    },
  },
  'open-affiliation-request': {
    kind: 'object',
    fields: {
      superiorOrganizationId: { rule: organization },
      subordinateOrganizationId: { rule: organization },
      duration: { rule: text, optional: true },
    },
  },
  'query-organization-members': {
    kind: 'object',
    fields: {
      organizationId: { rule: organization },
      includeRemoved: { rule: { kind: 'boolean' }, optional: true },
    },
  },
  'accept-member-invitation': openInvitation,
  'reject-member-invitation': openInvitation,
  'withdraw-member-invitation': openInvitation,
  'query-invitation': { kind: 'object', fields: { invitationId: { rule: text } } },
  'create-organization': {
    kind: 'object',
    fields: { createCallId: { rule: text }, ...createOrganization.fields },
  },
  'leave-organization': empty,
  'remove-member': {
    kind: 'object',
    fields: {
      organizationId: { rule: organization },
      accountId: { rule: account },
      expectedRole: { rule: text },
    },
  },
  'change-member-role': {
    kind: 'object',
    fields: {
      organizationId: { rule: organization },
      accountId: { rule: account },
      expectedRole: { rule: text },
      targetRole: { rule: text },
    },
  },
  'switch-current-tenant': tenantId,
  'query-organization': { kind: 'object', fields: { organizationId: { rule: organization } } },
  'query-issued-invitations': empty,
  'accept-affiliation-request': pendingRequest,
  'reject-affiliation-request': pendingRequest,
  'withdraw-affiliation-request': pendingRequest,
  'release-affiliation': {
    kind: 'object',
    fields: {
      affiliationId: { rule: text },
      expectedState: { rule: { kind: 'literal', values: ['effective'] } },
    },
  },
  'query-received-affiliation-requests': empty,
  'query-issued-affiliation-requests': empty,
  'query-affiliation-request': { kind: 'object', fields: { requestId: { rule: text } } },
  'judge-admission': {
    kind: 'object',
    fields: {
      resource: { rule: text },
      action: { rule: text },
      parameters: { rule: { kind: 'parameters' } },
      scopeId: { rule: text },
    },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: {
      expression: { rule: text },
      action: { rule: text },
      object: { rule: text },
      parameters: { rule: { kind: 'parameters' } },
    },
  },
  'withdraw-authorization-expression': {
    kind: 'object',
    fields: { expressionId: { rule: text } },
  },
} as const satisfies Readonly<Record<string, Rule>>

type IdentityOperation = keyof typeof requests

export const successes = {
  'register-and-activate': {
    kind: 'object',
    fields: {
      accountId: { rule: account },
      organizationId: { rule: organization },
      tenantId: { rule: tenant },
    },
  },
  'issue-login': {
    kind: 'object',
    fields: {
      loginIdentifier: { rule: text },
      issuedAt: { rule: instant },
      tenantId: { rule: tenant },
      loginProof: { rule: text },
      loginId: { rule: { kind: 'login' } },
    },
  },
  'revoke-login': empty,
  'replace-credential': empty,
  'query-own-valid-logins': {
    kind: 'object',
    fields: {
      logins: { rule: { kind: 'array', item: loginItem, nonempty: true } },
      completeness: { rule: complete },
    },
  },
  'query-current-tenant': tenantId,
  'query-own-memberships': {
    kind: 'object',
    fields: {
      memberships: { rule: { kind: 'array', item: membershipItem } },
      completeness: { rule: complete },
    },
  },
  'query-received-invitations': {
    kind: 'object',
    fields: {
      invitations: { rule: { kind: 'array', item: invitationItem } },
      completeness: { rule: complete },
    },
  },
  'query-create-organization': createdOrganization,
  'issue-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['open'] } },
      expiresAt: { rule: instant },
    },
  },
  'open-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: text },
      state: { rule: { kind: 'literal', values: ['pending'] } },
      expiresAt: { rule: instant },
    },
  },
  'query-organization-members': {
    kind: 'object',
    fields: {
      members: { rule: { kind: 'array', item: memberItem } },
      completeness: { rule: complete },
    },
  },
  'accept-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['accepted'] } },
    },
  },
  'reject-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['rejected'] } },
    },
  },
  'withdraw-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['withdrawn'] } },
    },
  },
  'query-invitation': invitationItem,
  'create-organization': createdOrganization,
  'leave-organization': empty,
  'remove-member': empty,
  'change-member-role': empty,
  'switch-current-tenant': tenantId,
  'query-organization': {
    kind: 'object',
    fields: {
      organizationId: { rule: organization },
      name: { rule: text },
      kind: { rule: text },
      superiorOrganizationId: { rule: organization, optional: true },
    },
  },
  'query-issued-invitations': {
    kind: 'object',
    fields: {
      invitations: { rule: { kind: 'array', item: invitationItem } },
      completeness: { rule: complete },
    },
  },
  'accept-affiliation-request': {
    kind: 'object',
    fields: {
      affiliationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['effective'] } },
    },
  },
  'reject-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: text },
      state: { rule: { kind: 'literal', values: ['rejected'] } },
    },
  },
  'withdraw-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: text },
      state: { rule: { kind: 'literal', values: ['withdrawn'] } },
    },
  },
  'release-affiliation': empty,
  'query-received-affiliation-requests': {
    kind: 'object',
    fields: {
      affiliationRequests: { rule: { kind: 'array', item: affiliationRequestItem } },
      completeness: { rule: complete },
    },
  },
  'query-issued-affiliation-requests': {
    kind: 'object',
    fields: {
      affiliationRequests: { rule: { kind: 'array', item: affiliationRequestItem } },
      completeness: { rule: complete },
    },
  },
  'query-affiliation-request': affiliationRequestItem,
  'judge-admission': {
    kind: 'object',
    fields: { admitted: { rule: { kind: 'literal', values: [true] } } },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: {
      expressionId: { rule: text },
      persistentSettingsUpdated: { rule: { kind: 'literal', values: [false] } },
    },
  },
  'withdraw-authorization-expression': empty,
} as const satisfies Readonly<Record<IdentityOperation, Rule>>

export const noChanges = {
  'revoke-login': empty,
  'switch-current-tenant': empty,
  'release-affiliation': {
    kind: 'object',
    fields: {
      affiliationId: { rule: text },
      state: { rule: { kind: 'literal', values: ['released'] } },
    },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: { expressionId: { rule: text } },
  },
  'accept-member-invitation': invitationNoChange,
  'reject-member-invitation': invitationNoChange,
  'withdraw-member-invitation': invitationNoChange,
  'accept-affiliation-request': requestNoChange,
  'reject-affiliation-request': requestNoChange,
  'withdraw-affiliation-request': requestNoChange,
} as const satisfies Readonly<Partial<Record<IdentityOperation, Rule>>>

export const needDecision = {
  kind: 'object',
  fields: { decisionRequestId: { rule: text } },
} as const satisfies Rule
