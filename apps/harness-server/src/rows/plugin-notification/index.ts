import type { Context } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { CATALOG, list, type Contract } from '@omne-harness/dynamis'
import { tenantIdSchema } from '@omne-harness/notification-contract'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { openRegisteredTenants } from '../registered-tenants.ts'
import { arrivalRequest, arrivals, type Arrival, type ExtensionShape } from './arrivals.ts'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  notificationSendingKey,
  notificationSourcesKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { instantTextOf } from '../../entry/time.ts'
import { defineRow } from '../../row.ts'
import { standingItemsBinding } from '../notification/standing.ts'
import { pluginReportsKey, type PluginReportsService } from '../plugin-access/reports-service.ts'
import { pluginEffectPorts } from '../plugin-host/effect-ports.ts'
import { notificationsPortEntry } from './port.ts'
import { EXTENSIONS_SOURCE, PLUGIN_LOAD_FAILURES_KEY, loadFailuresBlock } from './standing.ts'

/** The server points declared now and the categories registered now, each with what it says of itself. */
function shapeOf(ctx: Context): ExtensionShape | undefined {
  const registry = (ctx.get(dynamisKey) as DynamisService | undefined)?.registry()
  const view = ctx.get(assetCategoriesKey)?.view
  const declared = registry && list<Contract>(registry, CATALOG, null, [])
  if (declared?.kind !== 'read' || view === undefined) return undefined
  const points = declared.items.filter(({ entry }) => entry.item.tree === 'server')
  return {
    points: new Map(points.map(({ entry }) => [entry.item.name, entry.item.summary])),
    categories: new Map(view.list().map(each => [each.category, each.display.summary])),
  }
}

/** Tells every registered tenant what arrived, as the source itself; Notification judges it as any send. */
async function announce(ctx: Context, news: readonly Arrival[], warn: (line: string) => void) {
  const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown> | undefined
  const principal: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
  if (directory === undefined) return warn('extension arrivals: the tenant listing is not there')
  const source = EXTENSIONS_SOURCE.name
  await openRegisteredTenants('extension arrivals', {
    listing: () => directory.enumerate({ principal }),
    async open(tenant) {
      const sending = ctx.get(notificationSendingKey)
      const id = tenantIdSchema.safeParse(tenant)
      if (sending === undefined || !id.success) return
      const context = { tenant: id.data, subject: null, actor: { kind: 'system', source } } as const
      for (const arrival of news) {
        const answer = await sending.send(
          context,
          arrivalRequest(source, tenant, arrival, instantTextOf(ctx, 'plugin-notification')),
        )
        if (answer.kind !== 'done')
          warn(`tenant ${tenant}: ${arrival.type} ${arrival.name} not told: ${answer.kind}`)
      }
    },
    warn,
  })
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
      now: () => instantTextOf(ctx, 'plugin-notification'),
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
    // What is there once every row is up is the baseline: only what arrives later is told.
    let seen: ExtensionShape | undefined
    let telling: Promise<void> = Promise.resolve()
    const warn = (line: string): void => ctx.logger('plugin-notification').warn(line)
    ctx.on('dynamis-cordis/changed', () => {
      const shape = seen === undefined ? undefined : shapeOf(ctx)
      if (seen === undefined || shape === undefined) return
      const news = arrivals(seen, shape)
      seen = shape
      if (news.length > 0)
        telling = telling.then(() => announce(ctx, news, warn)).catch(() => undefined)
    })
    return {
      async start() {
        seen = shapeOf(ctx)
      },
      async stop() {
        await telling
        return { kind: 'settled' as const }
      },
    }
  },
})
