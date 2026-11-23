import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { notificationSourcesKey } from '@omne-harness/notification-cordis-contract/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import { standingItemsBinding } from '../notification/standing.ts'
import { pluginReportsKey, type PluginReportsService } from '../plugin-access/reports-service.ts'
import { pluginEffectPorts } from '../plugin-host/effect-ports.ts'
import { notificationsPortEntry } from './port.ts'
import { EXTENSIONS_SOURCE, PLUGIN_LOAD_FAILURES_KEY, loadFailuresBlock } from './standing.ts'

function now(): string {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('the clock of the load failures is unavailable')
  return instant.text
}

/** The extensions as a source of notification: a held plugin a client could not load is a standing item of its tenant.
 * It requires nothing: it registers while Notification's rows are there, and stays idle without them. */
export const pluginNotificationRow = defineRow({
  row: 'plugin-notification',
  implementation: 'real',
  manifest: { provides: [], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx: Context) {
    const { listed } = pluginEffectPorts(ctx)
    const block = loadFailuresBlock({
      tenantText(tenant) {
        const text = tenantCodec.encode(tenant as TenantId)
        return text.ok ? text.value : null
      },
      listed,
      reports: tenant =>
        (ctx.get(pluginReportsKey) as PluginReportsService | undefined)?.reportsOf(tenant),
      now,
    })
    // Notification's need is bound only while Notification is there to read it.
    ctx.inject([notificationSourcesKey, runtimeContextTenantBlocksKey], child => {
      child[notificationSourcesKey].register(EXTENSIONS_SOURCE)
      child[runtimeContextTenantBlocksKey].register({
        blocks: [block],
        needs: [standingItemsBinding(PLUGIN_LOAD_FAILURES_KEY)],
      })
    })
    ctx.inject(
      [dynamisKey],
      child => void (child.get(dynamisKey) as DynamisService).put([notificationsPortEntry(ctx)]),
    )
    return { stop: async () => ({ kind: 'settled' as const }) }
  },
})
