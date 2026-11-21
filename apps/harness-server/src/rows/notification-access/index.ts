import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { NotificationFaces, NotificationPrincipals } from '@omne-harness/notification-access'
import { createNotificationAccessPlugin } from '@omne-harness/notification-access/cordis'
import { tenantIdSchema } from '@omne-harness/notification-contract'
import {
  notificationCatalogKey,
  notificationChangesKey,
  notificationDestinationsKey,
  notificationInboxKey,
  notificationSendingKey,
  notificationSubscriptionsKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

/** A login that acts for a tenant is the person the tenant is: the actor is the owner. */
function principalsOf(ctx: Context): NotificationPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
    contextOf: (principal, tenant) => ({
      tenant: tenantIdSchema.parse(tenant),
      subject: principal,
      actor: { kind: 'owner' },
    }),
  }
}

function facesOf(ctx: Context): NotificationFaces | undefined {
  const sending = ctx.get(notificationSendingKey)
  const inbox = ctx.get(notificationInboxKey)
  const subscriptions = ctx.get(notificationSubscriptionsKey)
  const destinations = ctx.get(notificationDestinationsKey)
  const catalog = ctx.get(notificationCatalogKey)
  return sending === undefined ||
    inbox === undefined ||
    subscriptions === undefined ||
    destinations === undefined ||
    catalog === undefined
    ? undefined
    : { sending, inbox, subscriptions, destinations, catalog }
}

function now(): string {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('notification-access clock unavailable')
  return instant.text
}

const plugin = createNotificationAccessPlugin({
  principals: principalsOf,
  faces: facesOf,
  changes: ctx => ctx.get(notificationChangesKey),
  now,
})

export const notificationAccessRow = defineRow({
  row: 'notification-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
