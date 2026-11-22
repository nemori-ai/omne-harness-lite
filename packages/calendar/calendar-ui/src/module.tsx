import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { CalendarPage } from './view/calendar-page.tsx'

export const CALENDAR_PAGE_ID = 'calendar'
export const CALENDAR_PAGE_ORDER = 13

/** The calendar page, placed whether or not `calendar/v1` is served. */
export const calendarUiModule = defineUiModule({
  name: 'calendar-ui',
  needs: { calendar: needProtocol<ClientOf<CalendarProtocol>>(calendarProtocol) },
  apply(shell, { calendar: client }) {
    shell.contribute('pages', {
      id: CALENDAR_PAGE_ID,
      title: '日历',
      order: CALENDAR_PAGE_ORDER,
      icon: 'appointment',
      render: ({ scope }) =>
        scope === undefined ? null : <CalendarPage client={client} tenant={scope} />,
    })
  },
})
