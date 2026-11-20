import type { SubscriptionConsents } from '@omne-harness/notification'
import type { CallConsent } from '../tool-bindings/call-consent.ts'

const NONE: CallConsent = { kind: 'none' }

/** What the call a subscription is made in was released on, read the way the schedules read it. A
 * context without a call has no release to give. */
export function subscriptionConsents(
  consentOf: (tenant: string, call: string) => Promise<CallConsent>,
): SubscriptionConsents {
  return {
    consent: async ctx => (ctx.call === undefined ? NONE : consentOf(ctx.tenant, ctx.call)),
  }
}
