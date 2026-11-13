// The handlers of `identity/v1`. Each calls the public entry of identity that the server entry's
// governance location calls for the same operation, and maps its result the same way. The domain
// services are taken at each call; one that is not there answers `basis-unavailable`. A throw is
// left to the pipeline, which answers it by the effect rule.
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import type { IdentityGovernance, IdentityOperations } from '@omne-harness/identity'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { actingOf, callerOf } from './caller.ts'

/** The domain services, taken at each call; `undefined` while a provider is not there. */
export type IdentityServices = Readonly<{
  operations: () => IdentityOperations | undefined
  governance: () => IdentityGovernance | undefined
}>

export type IdentityOperationHandlers = AccessContribution<IdentityProtocol>['operations']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const EMPTY = Object.freeze({})

export function createIdentityOperations(services: IdentityServices): IdentityOperationHandlers {
  return {
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

    async 'revoke-login'(call, body) {
      const governance = services.governance()
      if (governance === undefined) return UNAVAILABLE
      const outcome = await governance.revokeLogin({
        login: callerOf(call.principal).login,
        target: body.targetLoginId,
      })
      switch (outcome.kind) {
        case 'succeeded':
        case 'no-change':
        case 'not-visible':
          return { outcome: outcome.kind, body: EMPTY }
        case 'denied':
          return DENIED
        case 'basis-unavailable':
          return UNAVAILABLE
      }
    },

    async 'query-current-tenant'(call) {
      const governance = services.governance()
      if (governance === undefined) return UNAVAILABLE
      const outcome = await governance.queryCurrentTenant({ login: callerOf(call.principal).login })
      if (outcome.kind !== 'succeeded') return { outcome: outcome.kind }
      return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
    },

    async 'query-own-memberships'(call) {
      const governance = services.governance()
      if (governance === undefined) return UNAVAILABLE
      const outcome = await governance.queryOwnMemberships({ login: callerOf(call.principal).login })
      if (outcome.kind !== 'succeeded') return { outcome: outcome.kind }
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
    },

    async 'switch-current-tenant'(call, body) {
      const governance = services.governance()
      if (governance === undefined) return UNAVAILABLE
      const acting = actingOf(call.principal)
      if (acting === undefined) return DENIED
      const outcome = await governance.switchCurrentTenant({
        login: acting.login,
        actingTenant: acting.tenant,
        tenant: body.tenantId,
      })
      switch (outcome.kind) {
        case 'succeeded':
          return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
        case 'no-change':
          return { outcome: 'no-change', body: EMPTY }
        case 'denied':
          return DENIED
        case 'basis-unavailable':
          return UNAVAILABLE
      }
    },
  }
}
