import {
  calendarEnvironmentItems,
  calendarEnvironmentSettings,
  createCalendarSettingsEnvironment,
} from '@omne-harness/calendar-local'
import type { SettingsReadPort } from '@omne-harness/settings'
import type { TenantIndependentSettingsService } from '../governance/independent-settings-service.ts'

/** The calendar environment read straight from the tenant's independent settings. */
export function environmentOf(independent: TenantIndependentSettingsService) {
  const settings: SettingsReadPort<string> = {
    read: async (tenantRef, request) =>
      (await independent.read(tenantRef, request)) ?? { kind: 'rejected', reason: 'unavailable' },
  }
  return createCalendarSettingsEnvironment<string>({
    settings,
    async resolve(context) {
      if (context.owner.kind !== 'tenant') return null
      return {
        principal: context.owner.tenantId,
        owner: context.owner,
        ...independent.bindingOf(context.owner.tenantId, calendarEnvironmentSettings),
        timezoneItemId: calendarEnvironmentItems.timezone,
        calendarItemId: calendarEnvironmentItems.calendar,
      }
    },
  })
}
