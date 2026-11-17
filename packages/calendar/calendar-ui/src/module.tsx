import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { CalendarPage } from './view/calendar-page.tsx'

const CALENDAR = protocolServiceName({ name: calendarProtocol.name, major: calendarProtocol.major })

export const CALENDAR_PAGE_ID = 'calendar'
export const CALENDAR_PAGE_ORDER = 13

/** The calendar page, there while the `calendar/v1` client is on the tree. */
export const calendarUiModule = defineUiModule<Record<string, ClientOf<CalendarProtocol>>>({
  name: 'calendar-ui',
  inject: [CALENDAR],
  apply(shell, services) {
    const client = services[CALENDAR]!
    shell.contribute('pages', {
      id: CALENDAR_PAGE_ID,
      title: '日历',
      order: CALENDAR_PAGE_ORDER,
      render: ({ scope }) =>
        scope === undefined ? null : <CalendarPage client={client} tenant={scope} />,
    })
  },
})
