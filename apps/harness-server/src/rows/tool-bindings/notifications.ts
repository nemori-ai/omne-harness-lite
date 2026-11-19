import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { tenantIdSchema } from '@omne-harness/notification-contract'
import {
  notificationCatalogKey,
  notificationInboxKey,
  notificationSendingKey,
  notificationSubscriptionsKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { AGENT_POSTS } from '@omne-harness/notification-local'
import {
  attachNotifications,
  bindNotifications,
  type NotificationToolFaces,
} from '@omne-harness/notification-tools'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

const POSTS = { source: AGENT_POSTS.name, type: AGENT_POSTS.types[0]!.name }

function facesOf(ctx: Context): NotificationToolFaces | undefined {
  const sending = ctx.get(notificationSendingKey)
  const inbox = ctx.get(notificationInboxKey)
  const subscriptions = ctx.get(notificationSubscriptionsKey)
  const catalog = ctx.get(notificationCatalogKey)
  return sending === undefined ||
    inbox === undefined ||
    subscriptions === undefined ||
    catalog === undefined
    ? undefined
    : { sending, inbox, subscriptions, catalog }
}

/** The agent is the verified session of the call. No turn is woken by a notification yet, so the
 * depth is 0. The call's access stays registered while its scope is open, so the notification
 * service can read what this call was released on. */
export function bindReleaseNotifications(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const notifications = bindNotifications({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    posts: POSTS,
    faces: () => facesOf(ctx),
    async context() {
      const caller = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        parent.principal,
        parent.tenant,
      )
      if (caller === undefined) return undefined
      return {
        tenant: tenantIdSchema.parse(caller.tenantId),
        subject: parent.principal,
        actor: { kind: 'agent', recipient: { kind: 'agent', ref: caller.session } },
      }
    },
    causalDepth: () => 0,
    now() {
      const instant = readSystemInstant()
      if (!instant.ok) throw new Error('Notifications clock unavailable')
      return instant.text
    },
  })
  return holdLiveCall(ctx, parent, attachNotifications(scope, notifications))
}
