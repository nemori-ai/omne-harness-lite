import type {
  BusinessOutcomes,
  GovernanceProvidedOperation,
  GovernanceStageOperation,
} from './messages.ts'

/** Rule kinds that convert one value without nested rules. */
export type LeafKind =
  | 'text'
  | 'string'
  | 'boolean'
  | 'null'
  | 'account'
  | 'organization'
  | 'login'
  | 'tenant'
  | 'instant'
  | 'session'
  | 'page-bytes'
  | 'parameters'
  | 'json'
  | 'user-message'
export type Rule =
  | { readonly kind: LeafKind }
  | { readonly kind: 'literal'; readonly values: readonly (string | boolean)[] }
  | {
      readonly kind: 'object'
      readonly fields: Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>
    }
  | { readonly kind: 'array'; readonly item: Rule; readonly nonempty?: true }
  /**
   * The options must be disjoint: the first option that converts wins, and the local value does
   * not record which option matched.
   */
  | { readonly kind: 'one-of'; readonly rules: readonly Rule[] }
export type RequestRule = { readonly body: Rule; readonly proof: boolean; readonly tenant: boolean }
/**
 * One protocol version with its closed operation table, read and written by the shared codec core.
 * A family without stage operations has no `stage-not-provided` outcome.
 */
export type Family<V extends string, P extends string, S extends string> = {
  readonly version: V
  readonly error: string
  readonly stages: readonly S[]
  readonly isProvided: (value: unknown) => value is P
  readonly requestRule: (operation: P) => RequestRule
  readonly responseRule: (operation: P, outcome: string) => Rule | undefined
}
export const empty: Rule = { kind: 'object', fields: {} }
function complete(key: string, item: Rule): Rule {
  return {
    kind: 'object',
    fields: {
      [key]: { rule: { kind: 'array', item } },
      completeness: { rule: { kind: 'literal', values: ['complete'] } },
    },
  }
}

const invitationState: Rule = {
  kind: 'literal',
  values: ['open', 'accepted', 'rejected', 'withdrawn', 'expired'],
}

const invitationTerminal: Rule = {
  kind: 'literal',
  values: ['accepted', 'rejected', 'withdrawn', 'expired'],
}

const affiliationRequestState: Rule = {
  kind: 'literal',
  values: ['pending', 'accepted', 'rejected', 'withdrawn', 'invalid', 'expired'],
}

const affiliationRequestTerminal: Rule = {
  kind: 'literal',
  values: ['accepted', 'rejected', 'withdrawn', 'invalid', 'expired'],
}

const loginItem: Rule = {
  kind: 'object',
  fields: {
    loginId: { rule: { kind: 'login' } },
    issuedAt: { rule: { kind: 'instant' } },
    maxDeadline: { rule: { kind: 'instant' } },
    idleDeadline: { rule: { kind: 'instant' } },
  },
}

const membershipItem: Rule = {
  kind: 'object',
  fields: {
    organizationId: { rule: { kind: 'organization' } },
    tenantId: { rule: { kind: 'tenant' } },
    role: { rule: { kind: 'text' } },
  },
}

const memberItem: Rule = {
  kind: 'object',
  fields: { accountId: { rule: { kind: 'account' } }, role: { rule: { kind: 'text' } } },
}

const invitationItem: Rule = {
  kind: 'object',
  fields: {
    invitationId: { rule: { kind: 'text' } },
    state: { rule: invitationState },
    expiresAt: { rule: { kind: 'instant' } },
    organizationId: { rule: { kind: 'organization' } },
    invitedAccountId: { rule: { kind: 'account' } },
  },
}

const affiliationRequestItem: Rule = {
  kind: 'object',
  fields: {
    requestId: { rule: { kind: 'text' } },
    state: { rule: affiliationRequestState },
    expiresAt: { rule: { kind: 'instant' } },
    superiorOrganizationId: { rule: { kind: 'organization' } },
    subordinateOrganizationId: { rule: { kind: 'organization' } },
  },
}

const loginList: Rule = {
  kind: 'object',
  fields: {
    logins: { rule: { kind: 'array', item: loginItem, nonempty: true } },
    completeness: { rule: { kind: 'literal', values: ['complete'] } },
  },
}

const requests = {
  'public-health': empty,
  'register-and-activate': {
    kind: 'object',
    fields: { loginIdentifier: { rule: { kind: 'text' } }, credential: { rule: { kind: 'text' } } },
  },
  'issue-login': {
    kind: 'object',
    fields: { loginIdentifier: { rule: { kind: 'text' } }, credential: { rule: { kind: 'text' } } },
  },
  'revoke-login': { kind: 'object', fields: { targetLoginId: { rule: { kind: 'login' } } } },
  'replace-credential': {
    kind: 'object',
    fields: {
      currentCredential: { rule: { kind: 'text' } },
      newCredential: { rule: { kind: 'text' } },
    },
  },
  'query-own-valid-logins': empty,
  'query-current-tenant': empty,
  'query-own-memberships': empty,
  'query-received-invitations': empty,
  'query-create-organization': {
    kind: 'object',
    fields: {
      targetCreateCallId: { rule: { kind: 'text' } },
      name: { rule: { kind: 'text' } },
      governanceModelId: { rule: { kind: 'text' } },
    },
  },
  'issue-member-invitation': {
    kind: 'object',
    fields: {
      invitedLoginIdentifier: { rule: { kind: 'text' } },
      duration: { rule: { kind: 'text' }, optional: true },
    },
  },
  'open-affiliation-request': {
    kind: 'object',
    fields: {
      superiorOrganizationId: { rule: { kind: 'organization' } },
      subordinateOrganizationId: { rule: { kind: 'organization' } },
      duration: { rule: { kind: 'text' }, optional: true },
    },
  },
  'query-organization-members': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      includeRemoved: { rule: { kind: 'boolean' }, optional: true },
    },
  },
  'accept-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['open'] } },
    },
  },
  'reject-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['open'] } },
    },
  },
  'withdraw-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['open'] } },
    },
  },
  'query-invitation': { kind: 'object', fields: { invitationId: { rule: { kind: 'text' } } } },
  'create-organization': {
    kind: 'object',
    fields: {
      createCallId: { rule: { kind: 'text' } },
      name: { rule: { kind: 'text' } },
      governanceModelId: { rule: { kind: 'text' } },
    },
  },
  'leave-organization': empty,
  'remove-member': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      accountId: { rule: { kind: 'account' } },
      expectedRole: { rule: { kind: 'text' } },
    },
  },
  'change-member-role': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      accountId: { rule: { kind: 'account' } },
      expectedRole: { rule: { kind: 'text' } },
      targetRole: { rule: { kind: 'text' } },
    },
  },
  'switch-current-tenant': { kind: 'object', fields: { tenantId: { rule: { kind: 'tenant' } } } },
  'query-organization': {
    kind: 'object',
    fields: { organizationId: { rule: { kind: 'organization' } } },
  },
  'query-issued-invitations': empty,
  'accept-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['pending'] } },
    },
  },
  'reject-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['pending'] } },
    },
  },
  'withdraw-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['pending'] } },
    },
  },
  'release-affiliation': {
    kind: 'object',
    fields: {
      affiliationId: { rule: { kind: 'text' } },
      expectedState: { rule: { kind: 'literal', values: ['effective'] } },
    },
  },
  'query-received-affiliation-requests': empty,
  'query-issued-affiliation-requests': empty,
  'query-affiliation-request': {
    kind: 'object',
    fields: { requestId: { rule: { kind: 'text' } } },
  },
  'judge-admission': {
    kind: 'object',
    fields: {
      resource: { rule: { kind: 'text' } },
      action: { rule: { kind: 'text' } },
      parameters: { rule: { kind: 'parameters' } },
      scopeId: { rule: { kind: 'text' } },
    },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: {
      expression: { rule: { kind: 'text' } },
      action: { rule: { kind: 'text' } },
      object: { rule: { kind: 'text' } },
      parameters: { rule: { kind: 'parameters' } },
    },
  },
  'withdraw-authorization-expression': {
    kind: 'object',
    fields: { expressionId: { rule: { kind: 'text' } } },
  },
} satisfies Readonly<Record<GovernanceProvidedOperation, Rule>>

const successes = {
  'public-health': {
    kind: 'object',
    fields: { protocolVersion: { rule: { kind: 'literal', values: ['governance-public/1'] } } },
  },
  'register-and-activate': {
    kind: 'object',
    fields: {
      accountId: { rule: { kind: 'account' } },
      organizationId: { rule: { kind: 'organization' } },
      tenantId: { rule: { kind: 'tenant' } },
    },
  },
  'issue-login': {
    kind: 'object',
    fields: {
      loginIdentifier: { rule: { kind: 'text' } },
      issuedAt: { rule: { kind: 'instant' } },
      tenantId: { rule: { kind: 'tenant' } },
      loginProof: { rule: { kind: 'text' } },
    },
  },
  'revoke-login': empty,
  'replace-credential': empty,
  'query-own-valid-logins': loginList,
  'query-current-tenant': { kind: 'object', fields: { tenantId: { rule: { kind: 'tenant' } } } },
  'query-own-memberships': complete('memberships', membershipItem),
  'query-received-invitations': complete('invitations', invitationItem),
  'query-create-organization': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      tenantId: { rule: { kind: 'tenant' } },
    },
  },
  'issue-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['open'] } },
      expiresAt: { rule: { kind: 'instant' } },
    },
  },
  'open-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['pending'] } },
      expiresAt: { rule: { kind: 'instant' } },
    },
  },
  'query-organization-members': complete('members', memberItem),
  'accept-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['accepted'] } },
    },
  },
  'reject-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['rejected'] } },
    },
  },
  'withdraw-member-invitation': {
    kind: 'object',
    fields: {
      invitationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['withdrawn'] } },
    },
  },
  'query-invitation': invitationItem,
  'create-organization': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      tenantId: { rule: { kind: 'tenant' } },
    },
  },
  'leave-organization': empty,
  'remove-member': empty,
  'change-member-role': empty,
  'switch-current-tenant': { kind: 'object', fields: { tenantId: { rule: { kind: 'tenant' } } } },
  'query-organization': {
    kind: 'object',
    fields: {
      organizationId: { rule: { kind: 'organization' } },
      name: { rule: { kind: 'text' } },
      kind: { rule: { kind: 'text' } },
      superiorOrganizationId: { rule: { kind: 'organization' }, optional: true },
    },
  },
  'query-issued-invitations': complete('invitations', invitationItem),
  'accept-affiliation-request': {
    kind: 'object',
    fields: {
      affiliationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['effective'] } },
    },
  },
  'reject-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['rejected'] } },
    },
  },
  'withdraw-affiliation-request': {
    kind: 'object',
    fields: {
      requestId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['withdrawn'] } },
    },
  },
  'release-affiliation': empty,
  'query-received-affiliation-requests': complete('affiliationRequests', affiliationRequestItem),
  'query-issued-affiliation-requests': complete('affiliationRequests', affiliationRequestItem),
  'query-affiliation-request': affiliationRequestItem,
  'judge-admission': {
    kind: 'object',
    fields: { admitted: { rule: { kind: 'literal', values: [true] } } },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: {
      expressionId: { rule: { kind: 'text' } },
      persistentSettingsUpdated: { rule: { kind: 'literal', values: [false] } },
    },
  },
  'withdraw-authorization-expression': empty,
} satisfies Readonly<Record<GovernanceProvidedOperation, Rule>>

const noChanges = {
  'revoke-login': empty,
  'switch-current-tenant': empty,
  'release-affiliation': {
    kind: 'object',
    fields: {
      affiliationId: { rule: { kind: 'text' } },
      state: { rule: { kind: 'literal', values: ['released'] } },
    },
  },
  'submit-authorization-expression': {
    kind: 'object',
    fields: { expressionId: { rule: { kind: 'text' } } },
  },
  'accept-member-invitation': {
    kind: 'object',
    fields: { invitationId: { rule: { kind: 'text' } }, state: { rule: invitationTerminal } },
  },
  'reject-member-invitation': {
    kind: 'object',
    fields: { invitationId: { rule: { kind: 'text' } }, state: { rule: invitationTerminal } },
  },
  'withdraw-member-invitation': {
    kind: 'object',
    fields: { invitationId: { rule: { kind: 'text' } }, state: { rule: invitationTerminal } },
  },
  'accept-affiliation-request': {
    kind: 'object',
    fields: { requestId: { rule: { kind: 'text' } }, state: { rule: affiliationRequestTerminal } },
  },
  'reject-affiliation-request': {
    kind: 'object',
    fields: { requestId: { rule: { kind: 'text' } }, state: { rule: affiliationRequestTerminal } },
  },
  'withdraw-affiliation-request': {
    kind: 'object',
    fields: { requestId: { rule: { kind: 'text' } }, state: { rule: affiliationRequestTerminal } },
  },
} satisfies Readonly<Record<keyof import('./messages.ts').NoChangeBodies, Rule>>

const outcomes = {
  'public-health': ['succeeded'],
  'register-and-activate': ['succeeded', 'not-loginable'],
  'issue-login': ['succeeded', 'uniform-auth-failure', 'basis-unavailable'],
  'revoke-login': ['succeeded', 'no-change', 'denied', 'not-visible', 'basis-unavailable'],
  'replace-credential': ['succeeded', 'denied', 'basis-unavailable'],
  'query-own-valid-logins': ['succeeded', 'denied', 'basis-unavailable'],
  'query-current-tenant': ['succeeded', 'denied', 'basis-unavailable'],
  'query-own-memberships': ['succeeded', 'denied', 'basis-unavailable'],
  'query-received-invitations': ['succeeded', 'denied', 'basis-unavailable'],
  'query-create-organization': ['succeeded', 'denied', 'basis-unavailable', 'conflict', 'unknown'],
  'issue-member-invitation': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'open-affiliation-request': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'query-organization-members': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'accept-member-invitation': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'reject-member-invitation': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'withdraw-member-invitation': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'query-invitation': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'create-organization': ['succeeded', 'denied', 'basis-unavailable', 'conflict', 'unknown'],
  'leave-organization': ['succeeded', 'denied', 'basis-unavailable'],
  'remove-member': ['succeeded', 'denied', 'not-visible', 'basis-unavailable', 'conflict'],
  'change-member-role': ['succeeded', 'denied', 'not-visible', 'basis-unavailable', 'conflict'],
  'switch-current-tenant': ['succeeded', 'no-change', 'denied', 'basis-unavailable'],
  'query-organization': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'query-issued-invitations': ['succeeded', 'denied', 'basis-unavailable'],
  'accept-affiliation-request': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'reject-affiliation-request': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'withdraw-affiliation-request': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
  ],
  'release-affiliation': [
    'succeeded',
    'no-change',
    'denied',
    'not-visible',
    'basis-unavailable',
    'conflict',
  ],
  'query-received-affiliation-requests': ['succeeded', 'denied', 'basis-unavailable'],
  'query-issued-affiliation-requests': ['succeeded', 'denied', 'basis-unavailable'],
  'query-affiliation-request': ['succeeded', 'denied', 'not-visible', 'basis-unavailable'],
  'judge-admission': ['succeeded', 'denied', 'not-visible', 'basis-unavailable', 'need-decision'],
  'submit-authorization-expression': [
    'succeeded',
    'no-change',
    'denied',
    'basis-unavailable',
    'unknown',
  ],
  'withdraw-authorization-expression': ['succeeded', 'denied', 'basis-unavailable', 'unknown'],
} satisfies { readonly [O in GovernanceProvidedOperation]: readonly BusinessOutcomes[O][] }

export const stages = [
  'disable-subject',
  'restore-subject',
  'end-subject',
  'reopen-after-media-loss',
] as const satisfies readonly GovernanceStageOperation[]

export function isProvided(value: unknown): value is GovernanceProvidedOperation {
  return typeof value === 'string' && Object.hasOwn(requests, value)
}

const proofOperations: ReadonlySet<string> = new Set([
  'revoke-login',
  'replace-credential',
  'query-own-valid-logins',
  'query-current-tenant',
  'query-own-memberships',
  'query-received-invitations',
  'query-create-organization',
  'issue-member-invitation',
  'open-affiliation-request',
  'query-organization-members',
  'accept-member-invitation',
  'reject-member-invitation',
  'withdraw-member-invitation',
  'query-invitation',
  'create-organization',
  'leave-organization',
  'remove-member',
  'change-member-role',
  'switch-current-tenant',
  'query-organization',
  'query-issued-invitations',
  'accept-affiliation-request',
  'reject-affiliation-request',
  'withdraw-affiliation-request',
  'release-affiliation',
  'query-received-affiliation-requests',
  'query-issued-affiliation-requests',
  'query-affiliation-request',
  'judge-admission',
  'submit-authorization-expression',
  'withdraw-authorization-expression',
])

const tenantOperations: ReadonlySet<string> = new Set([
  'issue-member-invitation',
  'open-affiliation-request',
  'query-organization-members',
  'accept-member-invitation',
  'reject-member-invitation',
  'withdraw-member-invitation',
  'query-invitation',
  'create-organization',
  'leave-organization',
  'remove-member',
  'change-member-role',
  'switch-current-tenant',
  'query-organization',
  'query-issued-invitations',
  'accept-affiliation-request',
  'reject-affiliation-request',
  'withdraw-affiliation-request',
  'release-affiliation',
  'query-received-affiliation-requests',
  'query-issued-affiliation-requests',
  'query-affiliation-request',
  'judge-admission',
  'submit-authorization-expression',
  'withdraw-authorization-expression',
])

export function requestRule(operation: GovernanceProvidedOperation): RequestRule {
  return {
    body: requests[operation],
    proof: proofOperations.has(operation),
    tenant: tenantOperations.has(operation),
  }
}

export function responseRule(
  operation: GovernanceProvidedOperation,
  outcome: string,
): Rule | undefined {
  const allowed: readonly string[] = outcomes[operation]
  if (!allowed.includes(outcome)) return undefined
  if (outcome === 'succeeded') return successes[operation]
  if (outcome === 'need-decision')
    return { kind: 'object', fields: { decisionRequestId: { rule: { kind: 'text' } } } }
  if (outcome === 'no-change' && Object.hasOwn(noChanges, operation))
    return noChanges[operation as keyof typeof noChanges]
  return empty
}

export const governanceFamily: Family<
  'governance-public/1',
  GovernanceProvidedOperation,
  GovernanceStageOperation
> = {
  version: 'governance-public/1',
  error: 'Invalid governance codec arguments',
  stages,
  isProvided,
  requestRule,
  responseRule,
}
