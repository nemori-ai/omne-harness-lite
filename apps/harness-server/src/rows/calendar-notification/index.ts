import type { Context } from '@deepseek-ai/cordis'
import { CALENDAR_SUPPLY_RISK_KEY, calendarSupplySource } from '@omne-harness/calendar-adapters'
import { notificationSourcesKey } from '@omne-harness/notification-cordis-contract/cordis'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { standingItemsBinding } from '../notification/standing.ts'

/** The calendar as a source of notification; without this row the calendar works and is no source.
 * It requires nothing: it registers while Notification's rows are there, and stays idle without them. */
export const calendarNotificationRow = defineRow({
  row: 'calendar-notification',
  implementation: 'real',
  manifest: { provides: [], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx: Context) {
    // Notification's need is bound only while Notification is there to read it.
    ctx.inject([notificationSourcesKey, runtimeContextTenantBlocksKey], child => {
      child[notificationSourcesKey].register(calendarSupplySource)
      child[runtimeContextTenantBlocksKey].register({
        needs: [standingItemsBinding(CALENDAR_SUPPLY_RISK_KEY)],
      })
    })
    return { stop: async () => ({ kind: 'settled' as const }) }
  },
})
