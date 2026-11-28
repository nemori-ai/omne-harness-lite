import type { JsonValue } from '@omne-harness/json-text'
import type {
  AccountId,
  Codec,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/public-contract'
import type { Instant } from '@omne-harness/utc-instant'
import { expectTypeOf, test } from 'vitest'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'

type EmptyBody = Readonly<Record<string, never>>
type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

type ExpectedRequests = {
  'register-and-activate': { readonly loginIdentifier: string; readonly credential: string }
  'issue-login': { readonly loginIdentifier: string; readonly credential: string }
  'revoke-login': { readonly targetLoginId: LoginStateId }
  'replace-credential': { readonly currentCredential: string; readonly newCredential: string }
  'query-own-valid-logins': EmptyBody
  'query-current-tenant': EmptyBody
  'read-account-preference': { readonly name: string }
  'write-account-preference': {
    readonly name: string
    readonly value: string | null
    readonly expected: string
  }
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
type ExpectedOperation = keyof ExpectedRequests

type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'
type InvitationTerminal = Exclude<InvitationState, 'open'>
type AffiliationRequestState =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'invalid'
  | 'expired'
type AffiliationRequestTerminal = Exclude<AffiliationRequestState, 'pending'>
type LoginItem = {
  readonly loginId: LoginStateId
  readonly issuedAt: Instant
  readonly maxDeadline: Instant
  readonly idleDeadline: Instant
}
type MembershipItem = {
  readonly organizationId: OrganizationId
  readonly tenantId: TenantId
  readonly role: string
}
type MemberItem = { readonly accountId: AccountId; readonly role: string }
type InvitationItem = {
  readonly invitationId: string
  readonly state: InvitationState
  readonly expiresAt: Instant
  readonly organizationId: OrganizationId
  readonly invitedAccountId: AccountId
}
type AffiliationRequestItem = {
  readonly requestId: string
  readonly state: AffiliationRequestState
  readonly expiresAt: Instant
  readonly superiorOrganizationId: OrganizationId
  readonly subordinateOrganizationId: OrganizationId
}
type Complete<K extends string, T> = { readonly [P in K]: readonly T[] } & {
  readonly completeness: 'complete'
}

type ExpectedSucceeded = {
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
    readonly loginId?: LoginStateId
  }
  'revoke-login': EmptyBody
  'replace-credential': EmptyBody
  'query-own-valid-logins': {
    readonly logins: readonly [LoginItem, ...LoginItem[]]
    readonly completeness: 'complete'
  }
  'query-current-tenant': { readonly tenantId: TenantId }
  'read-account-preference': { readonly value: string | null; readonly revision: string }
  'write-account-preference': { readonly revision: string }
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
type ExpectedNoChange = {
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
type ChangeAnswer = 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable'
type ExpectedOutcomes = {
  'register-and-activate': 'succeeded' | 'not-loginable'
  'issue-login': 'succeeded' | 'uniform-auth-failure' | 'basis-unavailable'
  'revoke-login': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable'
  'replace-credential': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-own-valid-logins': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-current-tenant': 'succeeded' | 'denied' | 'basis-unavailable'
  'read-account-preference': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'write-account-preference':
    | 'succeeded'
    | 'conflict'
    | 'denied'
    | 'not-visible'
    | 'basis-unavailable'
  'query-own-memberships': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-received-invitations': 'succeeded' | 'denied' | 'basis-unavailable'
  'query-create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown'
  'issue-member-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'open-affiliation-request': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'query-organization-members': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'accept-member-invitation': ChangeAnswer
  'reject-member-invitation': ChangeAnswer
  'withdraw-member-invitation': ChangeAnswer
  'query-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown'
  'leave-organization': 'succeeded' | 'denied' | 'basis-unavailable'
  'remove-member': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict'
  'change-member-role': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict'
  'switch-current-tenant': 'succeeded' | 'no-change' | 'denied' | 'basis-unavailable'
  'query-organization': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable'
  'query-issued-invitations': 'succeeded' | 'denied' | 'basis-unavailable'
  'accept-affiliation-request': ChangeAnswer
  'reject-affiliation-request': ChangeAnswer
  'withdraw-affiliation-request': ChangeAnswer
  'release-affiliation': ChangeAnswer | 'conflict'
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
type ExpectedBody<O extends ExpectedOperation, K extends PropertyKey> = K extends 'succeeded'
  ? ExpectedSucceeded[O]
  : K extends 'no-change'
    ? O extends keyof ExpectedNoChange
      ? ExpectedNoChange[O]
      : never
    : K extends 'need-decision'
      ? { readonly decisionRequestId: string }
      : K extends 'conflict'
        ? O extends 'write-account-preference'
          ? { readonly revision: string }
          : EmptyBody
        : EmptyBody

type Operations = IdentityProtocol['operations']
type Name = keyof Operations
type ValueOf<C> = C extends Codec<infer T> ? T : never
type Field<O extends Name, F extends string> = Operations[O] extends { readonly [K in F]: infer V }
  ? V
  : never
type Outcomes<O extends Name> = Field<O, 'outcomes'>
type RequestOf<O extends Name> = ValueOf<Field<O, 'body'>>
type BodyOf<O extends Name, K extends PropertyKey> = ValueOf<Outcomes<O>[K & keyof Outcomes<O>]>

type OldRequest<O extends ExpectedOperation> = ExpectedRequests[O]
type OldBody<O extends ExpectedOperation, K extends PropertyKey> = ExpectedBody<O, K>
type OldOutcomes<O extends ExpectedOperation> = ExpectedOutcomes[O]

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type AllTrue<T> = { readonly [K in keyof T]: true }
type Flat<T> = { [K in keyof T]: T[K] } & {}
type Matches<New, Old> =
  Same<New, Flat<Old>> extends true
    ? true
    : Same<New, {}> extends true
      ? Same<Old, Readonly<Record<string, never>>>
      : false

type Pipeline<O extends Name> =
  | 'protocol-rejected'
  | 'basis-unavailable'
  | (Field<O, 'identity'> extends 'none' ? never : 'denied')
  | (Field<O, 'effect'> extends 'commit' ? 'unknown' : never)

type Differs = 'issue-login' | 'query-own-valid-logins'

test('the operations are the governance family minus health, settings and stages', () => {
  expectTypeOf<Name>().toEqualTypeOf<ExpectedOperation>()
})

test('C4: the outcome names are the old business outcomes, the pipeline outcomes and stage-not-provided', () => {
  type Check = {
    readonly [O in Name]: Same<
      keyof Outcomes<O>,
      OldOutcomes<O> | Pipeline<O> | 'stage-not-provided'
    >
  }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
  expectTypeOf<Field<'query-create-organization', 'effect'>>().toEqualTypeOf<'read'>()
  expectTypeOf<Outcomes<'query-create-organization'>['unknown']>().toEqualTypeOf<true>()
})

test('C4: every commit operation has unknown', () => {
  type Commits = { [O in Name]: Field<O, 'effect'> extends 'commit' ? O : never }[Name]
  expectTypeOf<Commits>().toEqualTypeOf<
    | 'register-and-activate'
    | 'issue-login'
    | 'revoke-login'
    | 'replace-credential'
    | 'issue-member-invitation'
    | 'open-affiliation-request'
    | 'accept-member-invitation'
    | 'reject-member-invitation'
    | 'withdraw-member-invitation'
    | 'create-organization'
    | 'leave-organization'
    | 'remove-member'
    | 'change-member-role'
    | 'switch-current-tenant'
    | 'accept-affiliation-request'
    | 'reject-affiliation-request'
    | 'withdraw-affiliation-request'
    | 'release-affiliation'
    | 'submit-authorization-expression'
    | 'withdraw-authorization-expression'
    | 'write-account-preference'
  >()
  type Check = { readonly [O in Commits]: 'unknown' extends keyof Outcomes<O> ? true : false }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2: every request body is the old request body', () => {
  type Check = { readonly [O in Name]: Matches<RequestOf<O>, OldRequest<O>> }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2: every succeeded body is the old one, except the two below', () => {
  type Check = {
    readonly [O in Exclude<Name, Differs>]: Matches<BodyOf<O, 'succeeded'>, OldBody<O, 'succeeded'>>
  }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2 and decision 9: issue-login answers loginId always; the old body had it optional', () => {
  type Old = OldBody<'issue-login', 'succeeded'>
  type Expected = { readonly [K in keyof Old]-?: Exclude<Old[K], undefined> }
  expectTypeOf<BodyOf<'issue-login', 'succeeded'>>().toEqualTypeOf<Expected>()
  expectTypeOf<BodyOf<'issue-login', 'succeeded'>['loginId']>().toEqualTypeOf<LoginStateId>()
  expectTypeOf<Old['loginId']>().toEqualTypeOf<LoginStateId | undefined>()
})

test('C2: query-own-valid-logins lists logins as an array; a rule cannot type the nonempty tuple', () => {
  type Old = OldBody<'query-own-valid-logins', 'succeeded'>
  type Expected = {
    readonly logins: readonly Old['logins'][number][]
    readonly completeness: Old['completeness']
  }
  expectTypeOf<BodyOf<'query-own-valid-logins', 'succeeded'>>().toEqualTypeOf<Expected>()
  expectTypeOf<Old>().toExtend<BodyOf<'query-own-valid-logins', 'succeeded'>>()
})

test('C2: every other outcome with a body has the old body', () => {
  type Bodied<O extends Name> = {
    [K in keyof Outcomes<O>]: Outcomes<O>[K] extends true ? never : Exclude<K, 'succeeded'>
  }[keyof Outcomes<O>]
  type Check = {
    readonly [O in Name]: {
      readonly [K in Bodied<O>]: Matches<BodyOf<O, K>, OldBody<O, K>>
    }
  }
  type Expected = { readonly [O in Name]: AllTrue<Check[O]> }
  expectTypeOf<Check>().toEqualTypeOf<Expected>()
  expectTypeOf<keyof Check['judge-admission']>().toEqualTypeOf<'not-visible' | 'need-decision'>()
  expectTypeOf<keyof Check['release-affiliation']>().toEqualTypeOf<
    'no-change' | 'not-visible' | 'conflict'
  >()
})

test('C5: only the succeeded body of issue-login carries a login proof', () => {
  type Carriers = {
    [O in Name]: {
      [K in keyof Outcomes<O>]: Outcomes<O>[K] extends true
        ? never
        : 'loginProof' extends keyof BodyOf<O, K>
          ? `${O}:${K & string}`
          : never
    }[keyof Outcomes<O>]
  }[Name]
  expectTypeOf<Carriers>().toEqualTypeOf<'issue-login:succeeded'>()
})

test('C4 and I-13: a fixed outcome is written as true and has no body', () => {
  type Fixed =
    | 'denied'
    | 'unknown'
    | 'basis-unavailable'
    | 'protocol-rejected'
    | 'stage-not-provided'
    | 'uniform-auth-failure'
  type Check = {
    readonly [O in Name]: {
      readonly [K in Fixed & keyof Outcomes<O>]: Same<Outcomes<O>[K], true>
    }
  }
  type Expected = { readonly [O in Name]: AllTrue<Check[O]> }
  expectTypeOf<Check>().toEqualTypeOf<Expected>()
  expectTypeOf<Outcomes<'issue-login'>['uniform-auth-failure']>().toEqualTypeOf<true>()
})
