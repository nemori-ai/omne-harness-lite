import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { createNotificationContribution } from './contribution.ts'
import type { NotificationChangeFeed, NotificationFaces, NotificationPrincipals } from './ports.ts'

export type NotificationAccessPluginInput = Readonly<{
  principals: (ctx: Context) => NotificationPrincipals
  faces: (ctx: Context) => NotificationFaces | undefined
  changes: (ctx: Context) => NotificationChangeFeed | undefined
}>

const NOTIFICATION_ACCESS_PLUGIN = 'notification-access'

export function createNotificationAccessPlugin(
  input: NotificationAccessPluginInput,
): Plugin.Object {
  return {
    name: NOTIFICATION_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${NOTIFICATION_ACCESS_PLUGIN}.contribution`,
          protocol: notificationProtocol,
          handlers: () =>
            createNotificationContribution({
              principals: input.principals(ctx),
              faces: () => input.faces(ctx),
              changes: () => input.changes(ctx),
            }),
        }),
      )
    },
  }
}
