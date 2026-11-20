import type { SubscriptionCreators } from '@omne-harness/notification'
import { accountCodec, tenantCodec } from '@omne-harness/legal-identity'
import type { CallOrigin } from '../tool-bindings/live-calls.ts'

/** The account of a tenant text, as a person acting for the tenant is named on a schedule. */
function accountOf(tenantText: string): string | undefined {
  const tenant = tenantCodec.parse(tenantText)
  const account = tenant.ok ? accountCodec.encode(tenant.value.account) : undefined
  return account?.ok ? account.value : undefined
}

/** Who sets a subscription: the tenant's person by its account; an agent by the session and the
 * call its live call runs in. A context that cannot be named has no creator. */
export function subscriptionCreators(
  originOf: (tenantRef: string, call: string) => CallOrigin | undefined,
): SubscriptionCreators {
  return {
    async creatorOf(ctx) {
      if (ctx.actor.kind === 'owner') {
        const account = accountOf(ctx.tenant)
        return account === undefined ? null : { kind: 'human', actorRef: account }
      }
      const origin = ctx.call === undefined ? undefined : originOf(ctx.tenant, ctx.call)
      return origin === undefined
        ? null
        : {
            kind: 'agent',
            actorRef: origin.actorRef,
            originatingSessionRef: origin.session,
            originatingCallRef: origin.call,
          }
    },
  }
}
