// The handlers of `identity/v1`. Each operation this deployment provides calls the public entry of
// identity that the server entry's governance location calls for it, and maps the result the same
// way; the operations the deployment declares not provided answer `stage-not-provided`. The domain
// services are taken at each call; one that is not there answers `basis-unavailable`. A throw is
// left to the pipeline, which answers it by the effect rule.
import type { AccessContribution, Principal } from '@omne-harness/access-cordis-contract'
import type {
  IdentityGovernance,
  IdentityOperations,
  InvitationTerminal,
  MemberInvitation,
} from '@omne-harness/identity'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import type { LoginStateId, TenantId } from '@omne-harness/legal-identity'
import { parseDuration } from '@omne-harness/utc-instant'
import { actingOf, callerOf } from './caller.ts'

/** The domain services, taken at each call; `undefined` while a provider is not there. */
export type IdentityServices = Readonly<{
  operations: () => IdentityOperations | undefined
  governance: () => IdentityGovernance | undefined
}>

export type IdentityOperationHandlers = AccessContribution<IdentityProtocol>['operations']

const EMPTY = Object.freeze({})
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const NOT_PROVIDED = Object.freeze({ outcome: 'stage-not-provided' as const })

/** The refusals of the governance port; two of them carry an empty body on the wire. */
type Refusal = 'denied' | 'basis-unavailable' | 'not-visible' | 'conflict'
type RefusalAnswer<K extends Refusal> = K extends 'not-visible' | 'conflict'
  ? { readonly outcome: K; readonly body: Readonly<Record<string, never>> }
  : { readonly outcome: K }

function refuse<K extends Refusal>(kind: K): RefusalAnswer<K> {
  return (
    kind === 'not-visible' || kind === 'conflict'
      ? { outcome: kind, body: EMPTY }
      : { outcome: kind }
  ) as RefusalAnswer<K>
}

type Acting = Readonly<{ login: LoginStateId; actingTenant: TenantId }>

function actingInput(principal: Principal): Acting {
  const acting = actingOf(principal)
  return { login: acting.login, actingTenant: acting.tenant }
}

function invitationItem(invitation: MemberInvitation) {
  return {
    invitationId: invitation.invitation,
    state: invitation.state,
    expiresAt: invitation.expiresAt,
    organizationId: invitation.organization,
    invitedAccountId: invitation.invitedAccount,
  }
}

type InvitationListOutcome = Awaited<ReturnType<IdentityGovernance['queryReceivedInvitations']>>

function invitationList(outcome: InvitationListOutcome) {
  if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
  return {
    outcome: 'succeeded' as const,
    body: {
      invitations: outcome.invitations.map(invitationItem),
      completeness: 'complete' as const,
    },
  }
}

type DispositionMethod =
  | 'acceptMemberInvitation'
  | 'rejectMemberInvitation'
  | 'withdrawMemberInvitation'

/** One disposition of an open invitation; `state` is the terminal state the operation reaches. */
function disposition<S extends InvitationTerminal>(
  services: IdentityServices,
  method: DispositionMethod,
  state: S,
) {
  return async (
    call: Readonly<{ principal: Principal }>,
    body: Readonly<{ invitationId: string; expectedState: 'open' }>,
  ) => {
    const governance = services.governance()
    if (governance === undefined) return UNAVAILABLE
    const outcome = await governance[method]({
      ...actingInput(call.principal),
      invitation: body.invitationId,
      expectedState: body.expectedState,
    })
    switch (outcome.kind) {
      case 'succeeded':
      case 'no-change': {
        // The port reaches the state of the operation; any other is identity breaking its contract.
        if (outcome.kind === 'succeeded' && outcome.state !== state)
          throw new TypeError(`identity-access: ${method} answered state ${outcome.state}`)
        return outcome.kind === 'succeeded'
          ? { outcome: 'succeeded' as const, body: { invitationId: outcome.invitation, state } }
          : {
              outcome: 'no-change' as const,
              body: { invitationId: outcome.invitation, state: outcome.state },
            }
      }
      default:
        return refuse(outcome.kind)
    }
  }
}

export function createIdentityOperations(services: IdentityServices): IdentityOperationHandlers {
  /** Runs `work` with the governance port, or answers `basis-unavailable` without it. */
  const governed = async <A>(
    work: (governance: IdentityGovernance) => Promise<A>,
  ): Promise<A | typeof UNAVAILABLE> => {
    const governance = services.governance()
    return governance === undefined ? UNAVAILABLE : work(governance)
  }
  /** As `governed`, for an `acting-tenant` call: the login and acting tenant come from its principal. */
  const actingGoverned = async <A>(
    principal: Principal,
    work: (governance: IdentityGovernance, acting: Acting) => Promise<A>,
  ): Promise<A | typeof UNAVAILABLE> =>
    governed(governance => work(governance, actingInput(principal)))

  return {
    // --- the two operations without a login ---------------------------------------------------

    async 'register-and-activate'(_call, body) {
      const operations = services.operations()
      if (operations === undefined) return UNAVAILABLE
      const outcome = await operations.registerAndActivate(body)
      if (outcome.kind === 'not-loginable') return { outcome: 'not-loginable', body: EMPTY }
      return {
        outcome: 'succeeded',
        body: {
          accountId: outcome.account,
          organizationId: outcome.organization,
          tenantId: outcome.tenant,
        },
      }
    },

    async 'issue-login'(_call, body) {
      const operations = services.operations()
      if (operations === undefined) return UNAVAILABLE
      const outcome = await operations.issueLogin(body)
      switch (outcome.kind) {
        case 'succeeded':
          return {
            outcome: 'succeeded',
            body: {
              loginIdentifier: outcome.loginIdentifier,
              issuedAt: outcome.issuedAt,
              tenantId: outcome.tenant,
              loginProof: outcome.loginProof,
              loginId: outcome.login,
            },
          }
        case 'uniform-auth-failure':
          return { outcome: 'uniform-auth-failure' }
        case 'basis-unavailable':
          return UNAVAILABLE
      }
    },

    // --- the operations with a login ------------------------------------------------------------

    'revoke-login': (call, body) =>
      governed(async governance => {
        const outcome = await governance.revokeLogin({
          login: callerOf(call.principal).login,
          target: body.targetLoginId,
        })
        switch (outcome.kind) {
          case 'succeeded':
          case 'no-change':
            return { outcome: outcome.kind, body: EMPTY }
          default:
            return refuse(outcome.kind)
        }
      }),

    'query-own-valid-logins': call =>
      governed(async governance => {
        const outcome = await governance.queryOwnValidLogins({
          login: callerOf(call.principal).login,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        const [first, ...rest] = outcome.logins.map(item => ({
          loginId: item.login,
          issuedAt: item.issuedAt,
          maxDeadline: item.maxDeadline,
          idleDeadline: item.idleDeadline,
        }))
        // The list holds at least the calling login; an empty list is not one the wire can carry.
        if (first === undefined) return UNAVAILABLE
        return {
          outcome: 'succeeded',
          body: { logins: [first, ...rest], completeness: 'complete' },
        }
      }),

    'query-current-tenant': call =>
      governed(async governance => {
        const outcome = await governance.queryCurrentTenant({
          login: callerOf(call.principal).login,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
      }),

    'query-own-memberships': call =>
      governed(async governance => {
        const outcome = await governance.queryOwnMemberships({
          login: callerOf(call.principal).login,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return {
          outcome: 'succeeded',
          body: {
            memberships: outcome.memberships.map(membership => ({
              organizationId: membership.organization,
              tenantId: membership.tenant,
              role: membership.role.role,
            })),
            completeness: 'complete',
          },
        }
      }),

    'query-received-invitations': call =>
      governed(async governance =>
        invitationList(
          await governance.queryReceivedInvitations({ login: callerOf(call.principal).login }),
        ),
      ),

    'query-create-organization': (call, body) =>
      governed(async governance => {
        const outcome = await governance.queryCreateOrganization({
          login: callerOf(call.principal).login,
          createCallId: body.targetCreateCallId,
          name: body.name,
          governanceModelId: body.governanceModelId,
        })
        switch (outcome.kind) {
          case 'succeeded':
            return {
              outcome: 'succeeded',
              body: { organizationId: outcome.organization, tenantId: outcome.tenant },
            }
          case 'unknown':
            return { outcome: 'unknown' }
          default:
            return refuse(outcome.kind)
        }
      }),

    // --- the operations with a login and an acting tenant ---------------------------------------

    'issue-member-invitation': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        // The duration text is the deployment's to read; text that is not an SI-second duration is
        // outside the authorized range: denied, no invitation.
        let duration
        if (body.duration !== undefined) {
          const parsed = parseDuration(body.duration)
          if (!parsed.ok) return DENIED
          duration = parsed.value
        }
        const outcome = await governance.issueMemberInvitation({
          ...acting,
          invitedLoginIdentifier: body.invitedLoginIdentifier,
          ...(duration === undefined ? {} : { duration }),
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return {
          outcome: 'succeeded',
          body: {
            invitationId: outcome.invitation,
            state: outcome.state,
            expiresAt: outcome.expiresAt,
          },
        }
      }),

    'accept-member-invitation': disposition(services, 'acceptMemberInvitation', 'accepted'),
    'reject-member-invitation': disposition(services, 'rejectMemberInvitation', 'rejected'),
    'withdraw-member-invitation': disposition(services, 'withdrawMemberInvitation', 'withdrawn'),

    'query-invitation': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.queryInvitation({
          ...acting,
          invitation: body.invitationId,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return { outcome: 'succeeded', body: invitationItem(outcome.invitation) }
      }),

    'query-issued-invitations': call =>
      actingGoverned(call.principal, async (governance, acting) =>
        invitationList(await governance.queryIssuedInvitations(acting)),
      ),

    'query-organization-members': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.queryOrganizationMembers({
          ...acting,
          organization: body.organizationId,
          ...(body.includeRemoved === undefined ? {} : { includeRemoved: body.includeRemoved }),
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return {
          outcome: 'succeeded',
          body: {
            members: outcome.members.map(member => ({
              accountId: member.account,
              role: member.role.role,
            })),
            completeness: 'complete',
          },
        }
      }),

    'create-organization': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.createOrganization({
          ...acting,
          createCallId: body.createCallId,
          name: body.name,
          governanceModelId: body.governanceModelId,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return {
          outcome: 'succeeded',
          body: { organizationId: outcome.organization, tenantId: outcome.tenant },
        }
      }),

    'leave-organization': call =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.leaveOrganization(acting)
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return { outcome: 'succeeded', body: EMPTY }
      }),

    'remove-member': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.removeMember({
          ...acting,
          organization: body.organizationId,
          account: body.accountId,
          expectedRole: body.expectedRole,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return { outcome: 'succeeded', body: EMPTY }
      }),

    'change-member-role': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.changeMemberRole({
          ...acting,
          organization: body.organizationId,
          account: body.accountId,
          expectedRole: body.expectedRole,
          targetRole: body.targetRole,
        })
        if (outcome.kind !== 'succeeded') return refuse(outcome.kind)
        return { outcome: 'succeeded', body: EMPTY }
      }),

    'switch-current-tenant': (call, body) =>
      actingGoverned(call.principal, async (governance, acting) => {
        const outcome = await governance.switchCurrentTenant({ ...acting, tenant: body.tenantId })
        switch (outcome.kind) {
          case 'succeeded':
            return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
          case 'no-change':
            return { outcome: 'no-change', body: EMPTY }
          default:
            return refuse(outcome.kind)
        }
      }),

    // --- the operations this deployment declares not provided -----------------------------------

    'replace-credential': async () => NOT_PROVIDED,
    'open-affiliation-request': async () => NOT_PROVIDED,
    'query-organization': async () => NOT_PROVIDED,
    'accept-affiliation-request': async () => NOT_PROVIDED,
    'reject-affiliation-request': async () => NOT_PROVIDED,
    'withdraw-affiliation-request': async () => NOT_PROVIDED,
    'release-affiliation': async () => NOT_PROVIDED,
    'query-received-affiliation-requests': async () => NOT_PROVIDED,
    'query-issued-affiliation-requests': async () => NOT_PROVIDED,
    'query-affiliation-request': async () => NOT_PROVIDED,
    'judge-admission': async () => NOT_PROVIDED,
    'submit-authorization-expression': async () => NOT_PROVIDED,
    'withdraw-authorization-expression': async () => NOT_PROVIDED,
  }
}
