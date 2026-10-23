import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type {
  AccountId,
  OrganizationId,
  LoginStateId,
  TenantId,
} from '@omne-harness/legal-identity'
import type { Instant } from '@omne-harness/utc-instant'

export type EmptyBody = Readonly<Record<string, never>>
export type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>
export type GovernanceCodecLimits = JsonLimits
export type ProofInput =
  | { readonly kind: 'missing' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'present'; readonly value: string }

export type RequestBodies = {
  'public-health': EmptyBody
  'register-and-activate': { readonly loginIdentifier: string; readonly credential: string }
  'issue-login': { readonly loginIdentifier: string; readonly credential: string }
  'revoke-login': { readonly targetLoginId: LoginStateId }
  'replace-credential': { readonly currentCredential: string; readonly newCredential: string }
  'query-own-valid-logins': EmptyBody
  'query-current-tenant': EmptyBody
  'query-own-memberships': EmptyBody
  'query-received-invitations': EmptyBody
  'query-create-organization': {
    readonly targetCreateCallId: string
    readonly name: string
    readonly governanceModelId: string
  }
  'issue-member-invitation': { readonly invitedLoginIdentifier: string; readonly duration?: string }
  'open-affiliation-request': {
    readonly superiorOrganizationId: OrganizationId
    readonly subordinateOrganizationId: OrganizationId
    readonly duration?: string
  }
  'query-organization-members': {
    readonly organizationId: OrganizationId
    readonly includeRemoved?: boolean
  }
  'accept-member-invitation': { readonly invitationId: string; readonly expectedState: 'open' }
  'reject-member-invitation': { readonly invitationId: string; readonly expectedState: 'open' }
  'withdraw-member-invitation': { readonly invitationId: string; readonly expectedState: 'open' }
  'query-invitation': { readonly invitationId: string }
  'create-organization': {
    readonly createCallId: string
    readonly name: string
    readonly governanceModelId: string
  }
  'leave-organization': EmptyBody
  'remove-member': {
    readonly organizationId: OrganizationId
    readonly accountId: AccountId
    readonly expectedRole: string
  }
  'change-member-role': {
    readonly organizationId: OrganizationId
    readonly accountId: AccountId
    readonly expectedRole: string
    readonly targetRole: string
  }
  'switch-current-tenant': { readonly tenantId: TenantId }
  'query-organization': { readonly organizationId: OrganizationId }
  'query-issued-invitations': EmptyBody
  'accept-affiliation-request': { readonly requestId: string; readonly expectedState: 'pending' }
  'reject-affiliation-request': { readonly requestId: string; readonly expectedState: 'pending' }
  'withdraw-affiliation-request': { readonly requestId: string; readonly expectedState: 'pending' }
  'release-affiliation': { readonly affiliationId: string; readonly expectedState: 'effective' }
  'query-received-affiliation-requests': EmptyBody
  'query-issued-affiliation-requests': EmptyBody
  'query-affiliation-request': { readonly requestId: string }
  'judge-admission': {
    readonly resource: string
    readonly action: string
    readonly parameters: JsonObject
    readonly scopeId: string
  }
  'submit-authorization-expression': {
    readonly expression: string
    readonly action: string
    readonly object: string
    readonly parameters: JsonObject
  }
  'withdraw-authorization-expression': { readonly expressionId: string }
}
export type GovernanceProvidedOperation = keyof RequestBodies
export type GovernanceStageOperation =
  | 'disable-subject'
  | 'restore-subject'
  | 'end-subject'
  | 'reopen-after-media-loss'
export type GovernanceOperation = GovernanceProvidedOperation | GovernanceStageOperation
export type ProofOperations =
  | 'revoke-login'
  | 'replace-credential'
  | 'query-own-valid-logins'
  | 'query-current-tenant'
  | 'query-own-memberships'
  | 'query-received-invitations'
  | 'query-create-organization'
  | 'issue-member-invitation'
  | 'open-affiliation-request'
  | 'query-organization-members'
  | 'accept-member-invitation'
  | 'reject-member-invitation'
  | 'withdraw-member-invitation'
  | 'query-invitation'
  | 'create-organization'
  | 'leave-organization'
  | 'remove-member'
  | 'change-member-role'
  | 'switch-current-tenant'
  | 'query-organization'
  | 'query-issued-invitations'
  | 'accept-affiliation-request'
  | 'reject-affiliation-request'
  | 'withdraw-affiliation-request'
  | 'release-affiliation'
  | 'query-received-affiliation-requests'
  | 'query-issued-affiliation-requests'
  | 'query-affiliation-request'
  | 'judge-admission'
  | 'submit-authorization-expression'
  | 'withdraw-authorization-expression'
export type TenantOperations =
  | 'issue-member-invitation'
  | 'open-affiliation-request'
  | 'query-organization-members'
  | 'accept-member-invitation'
  | 'reject-member-invitation'
  | 'withdraw-member-invitation'
  | 'query-invitation'
  | 'create-organization'
  | 'leave-organization'
  | 'remove-member'
  | 'change-member-role'
  | 'switch-current-tenant'
  | 'query-organization'
  | 'query-issued-invitations'
  | 'accept-affiliation-request'
  | 'reject-affiliation-request'
  | 'withdraw-affiliation-request'
  | 'release-affiliation'
  | 'query-received-affiliation-requests'
  | 'query-issued-affiliation-requests'
  | 'query-affiliation-request'
  | 'judge-admission'
  | 'submit-authorization-expression'
  | 'withdraw-authorization-expression'
export type RequestByOperation = {
  readonly [O in GovernanceProvidedOperation]: {
    readonly protocolVersion: 'governance-public/1'
    readonly messageId: string
    readonly operation: O
    readonly body: RequestBodies[O]
  } & (O extends ProofOperations ? { readonly proof: ProofInput } : {}) &
    (O extends TenantOperations ? { readonly actingTenant: TenantId } : {})
}
export type GovernanceRequest<O extends GovernanceProvidedOperation = GovernanceProvidedOperation> =
  RequestByOperation[O]

export type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'
export type InvitationTerminal = Exclude<InvitationState, 'open'>
export type AffiliationRequestState =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'invalid'
  | 'expired'
export type AffiliationRequestTerminal = Exclude<AffiliationRequestState, 'pending'>
export type LoginItem = {
  readonly loginId: LoginStateId
  readonly issuedAt: Instant
  readonly maxDeadline: Instant
  readonly idleDeadline: Instant
}
export type MembershipItem = {
  readonly organizationId: OrganizationId
  readonly tenantId: TenantId
  readonly role: string
}
export type MemberItem = { readonly accountId: AccountId; readonly role: string }
export type InvitationItem = {
  readonly invitationId: string
  readonly state: InvitationState
  readonly expiresAt: Instant
  readonly organizationId: OrganizationId
  readonly invitedAccountId: AccountId
}
export type AffiliationRequestItem = {
  readonly requestId: string
  readonly state: AffiliationRequestState
  readonly expiresAt: Instant
  readonly superiorOrganizationId: OrganizationId
  readonly subordinateOrganizationId: OrganizationId
}
export type Complete<K extends string, T> = { readonly [P in K]: readonly T[] } & {
  readonly completeness: 'complete'
}
export type LoginList = {
  readonly logins: readonly [LoginItem, ...LoginItem[]]
  readonly completeness: 'complete'
}

export type SuccessBodies = {
  'public-health': { readonly protocolVersion: 'governance-public/1' }
  'register-and-activate': {
    readonly accountId: AccountId
    readonly organizationId: OrganizationId
    readonly tenantId: TenantId
  }
  'issue-login': {
    readonly loginIdentifier: string
    readonly issuedAt: Instant
    readonly tenantId: TenantId
    readonly loginProof: string
  }
  'revoke-login': EmptyBody
  'replace-credential': EmptyBody
  'query-own-valid-logins': LoginList
  'query-current-tenant': { readonly tenantId: TenantId }
  'query-own-memberships': Complete<'memberships', MembershipItem>
  'query-received-invitations': Complete<'invitations', InvitationItem>
  'query-create-organization': {
    readonly organizationId: OrganizationId
    readonly tenantId: TenantId
  }
  'issue-member-invitation': {
    readonly invitationId: string
    readonly state: 'open'
    readonly expiresAt: Instant
  }
  'open-affiliation-request': {
    readonly requestId: string
    readonly state: 'pending'
    readonly expiresAt: Instant
  }
  'query-organization-members': Complete<'members', MemberItem>
  'accept-member-invitation': { readonly invitationId: string; readonly state: 'accepted' }
  'reject-member-invitation': { readonly invitationId: string; readonly state: 'rejected' }
  'withdraw-member-invitation': { readonly invitationId: string; readonly state: 'withdrawn' }
  'query-invitation': InvitationItem
  'create-organization': { readonly organizationId: OrganizationId; readonly tenantId: TenantId }
  'leave-organization': EmptyBody
  'remove-member': EmptyBody
  'change-member-role': EmptyBody
  'switch-current-tenant': { readonly tenantId: TenantId }
  'query-organization': {
    readonly organizationId: OrganizationId
    readonly name: string
    readonly kind: string
    readonly superiorOrganizationId?: OrganizationId
  }
  'query-issued-invitations': Complete<'invitations', InvitationItem>
  'accept-affiliation-request': { readonly affiliationId: string; readonly state: 'effective' }
  'reject-affiliation-request': { readonly requestId: string; readonly state: 'rejected' }
  'withdraw-affiliation-request': { readonly requestId: string; readonly state: 'withdrawn' }
  'release-affiliation': EmptyBody
  'query-received-affiliation-requests': Complete<'affiliationRequests', AffiliationRequestItem>
  'query-issued-affiliation-requests': Complete<'affiliationRequests', AffiliationRequestItem>
  'query-affiliation-request': AffiliationRequestItem
  'judge-admission': { readonly admitted: true }
  'submit-authorization-expression': {
    readonly expressionId: string
    readonly persistentSettingsUpdated: false
  }
  'withdraw-authorization-expression': EmptyBody
}
export type NoChangeBodies = {
  'revoke-login': EmptyBody
  'switch-current-tenant': EmptyBody
  'release-affiliation': { readonly affiliationId: string; readonly state: 'released' }
  'submit-authorization-expression': { readonly expressionId: string }
  'accept-member-invitation': { readonly invitationId: string; readonly state: InvitationTerminal }
  'reject-member-invitation': { readonly invitationId: string; readonly state: InvitationTerminal }
  'withdraw-member-invitation': {
    readonly invitationId: string
    readonly state: InvitationTerminal
  }
  'accept-affiliation-request': {
    readonly requestId: string
    readonly state: AffiliationRequestTerminal
  }
  'reject-affiliation-request': {
    readonly requestId: string
    readonly state: AffiliationRequestTerminal
  }
  'withdraw-affiliation-request': {
    readonly requestId: string
    readonly state: AffiliationRequestTerminal
  }
}
export type BusinessOutcomes = {
  'public-health': 'succeeded'
  'register-and-activate': 'succeeded' | 'not-loginable'
  'issue-login': 'succeeded' | 'uniform-auth-failure' | 'basis-unavailable'
  'revoke-login': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable'
  'replace-credential': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-own-valid-logins': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-current-tenant': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-own-memberships': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-received-invitations': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown'
  'issue-member-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'open-affiliation-request': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'query-organization-members': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'accept-member-invitation':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'reject-member-invitation':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'withdraw-member-invitation':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'query-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown'
  'leave-organization': 'succeeded' | 'denied' | 'basis-unavailable'
  'remove-member': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict'
  'change-member-role': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict'
  'switch-current-tenant': 'succeeded' | 'no-change' | 'denied' | 'basis-unavailable'
  'query-organization': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'query-issued-invitations': 'succeeded' | 'denied' | 'basis-unavailable'
  'accept-affiliation-request':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'reject-affiliation-request':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'withdraw-affiliation-request':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'release-affiliation':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
    | 'conflict'
  'query-received-affiliation-requests': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-issued-affiliation-requests': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-affiliation-request': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'judge-admission': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'need-decision'
  'submit-authorization-expression':
    | 'succeeded'
    | 'no-change'
    | 'denied'
    | 'basis-unavailable'
    | 'unknown'
  'withdraw-authorization-expression': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown'
}
export type Correlated<K extends string, B> = {
  readonly protocolVersion: 'governance-public/1'
  readonly messageId: string
  readonly outcome: K
  readonly body: B
}
export type GovernanceProtocolRejected = {
  readonly protocolVersion: 'governance-public/1'
  readonly messageId?: string
  readonly outcome: 'protocol-rejected'
  readonly body: EmptyBody
}
export type GovernanceStageNotProvided = {
  readonly protocolVersion: 'governance-public/1'
  readonly messageId?: string
  readonly outcome: 'stage-not-provided'
  readonly body: EmptyBody
}
export type GovernanceProtocolResult = GovernanceProtocolRejected | GovernanceStageNotProvided
// Body is selected by both operation and outcome.
export type BusinessBody<
  O extends GovernanceProvidedOperation,
  K extends BusinessOutcomes[O],
> = K extends 'succeeded'
  ? SuccessBodies[O]
  : K extends 'no-change'
    ? O extends keyof NoChangeBodies
      ? NoChangeBodies[O]
      : never
    : K extends 'need-decision'
      ? { readonly decisionRequestId: string }
      : EmptyBody
export type BusinessResponse<O extends GovernanceProvidedOperation> = {
  readonly [K in BusinessOutcomes[O]]: Correlated<K, BusinessBody<O, K>>
}[BusinessOutcomes[O]]
export type ResponseByOperation = {
  readonly [O in GovernanceOperation]:
    | GovernanceProtocolRejected
    | (O extends GovernanceProvidedOperation ? BusinessResponse<O> : GovernanceStageNotProvided)
}
export type GovernanceResponse<O extends GovernanceOperation = GovernanceOperation> =
  ResponseByOperation[O]
export type GovernanceDiagnostic = {
  readonly code: 'json' | 'version' | 'operation' | 'field' | 'budget'
}
export type GovernanceRequestRead =
  | { readonly kind: 'request'; readonly request: GovernanceRequest }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: GovernanceProtocolRejected
      readonly diagnostic: GovernanceDiagnostic
    }
  | { readonly kind: 'stage-not-provided'; readonly response: GovernanceStageNotProvided }
export type GovernanceResponseRead<O extends GovernanceOperation> =
  | { readonly kind: 'response'; readonly response: GovernanceResponse<O> }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'unreadable'; readonly diagnostic: GovernanceDiagnostic }
export type GovernanceEncodeResult =
  | { readonly kind: 'encoded'; readonly bytes: Uint8Array }
  | { readonly kind: 'invalid'; readonly diagnostic: GovernanceDiagnostic }

// A distributive mapped union keeps the local operation and response correlated.
export type GovernanceResponseEncodeInput<O extends GovernanceOperation = GovernanceOperation> = {
  readonly [K in O]: {
    readonly operation: K
    readonly response: GovernanceResponse<K>
    readonly limits: GovernanceCodecLimits
  }
}[O]
