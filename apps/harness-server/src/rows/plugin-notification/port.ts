import type { Context } from '@deepseek-ai/cordis'
import { tenantIdSchema, type SendRequestInput } from '@omne-harness/notification-contract'
import { notificationSendingKey } from '@omne-harness/notification-cordis-contract/cordis'
import { PORTS_POINT, type PortCaller } from '@omne-harness/plugin-host-local'
import type { PortFactory } from '@omne-harness/plugin-protocol'

export const NOTIFICATIONS_PORT = 'notifications'

/** Notification's own entry lent to plugins: one call sends one event as the caller, and Notification judges it as it judges any. */
export function notificationsPort(ctx: Context): PortFactory<PortCaller> {
  return ({ principal, tenant }) => ({
    async send(input) {
      const sending = ctx.get(notificationSendingKey)
      const tenantId = tenantIdSchema.safeParse(tenant)
      if (sending === undefined || !tenantId.success)
        return { outcome: 'unavailable', reason: 'notification is not there now' }
      const context = {
        tenant: tenantId.data,
        subject: principal,
        actor: { kind: 'owner' },
      } as const
      const answer = await sending.send(context, input as SendRequestInput)
      if (answer.kind === 'done') return { outcome: 'done', value: { recalled: answer.recalled } }
      if (answer.kind === 'refused') return { outcome: 'refused', reason: answer.reason }
      if (answer.kind === 'unknown') return { outcome: 'unknown' }
      return { outcome: 'unavailable', reason: 'notification cannot answer now' }
    },
  })
}

export const notificationsPortEntry = (ctx: Context) => ({
  point: PORTS_POINT,
  key: NOTIFICATIONS_PORT,
  id: '',
  scope: [],
  rank: 0,
  digest: `${NOTIFICATIONS_PORT}@plugin-notification`,
  item: { make: notificationsPort(ctx) },
})
