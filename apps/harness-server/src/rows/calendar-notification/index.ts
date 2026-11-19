import type { Context } from '@deepseek-ai/cordis'
import { CALENDAR_SUPPLY_RISK_KEY, calendarSupplySource } from '@omne-harness/calendar-adapters'
import { notificationSourcesKey } from '@omne-harness/notification-cordis-contract/cordis'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { standingItemsBinding } from '../notification/standing.ts'

/** The calendar as a source of notification; without this row the calendar works and is no source. */
export const calendarNotificationRow = defineRow({
  row: 'calendar-notification',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [notificationSourcesKey, runtimeContextTenantBlocksKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx: Context) {
    ctx.inject([notificationSourcesKey], child => {
      child[notificationSourcesKey].register(calendarSupplySource)
    })
    ctx.inject([runtimeContextTenantBlocksKey], child => {
      child[runtimeContextTenantBlocksKey].register({
        needs: [standingItemsBinding(CALENDAR_SUPPLY_RISK_KEY)],
      })
    })
    return { stop: async () => ({ kind: 'settled' as const }) }
  },
})
