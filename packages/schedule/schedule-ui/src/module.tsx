import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { SchedulePage } from './view/schedule-page.tsx'

const SCHEDULE = protocolServiceName({ name: scheduleProtocol.name, major: scheduleProtocol.major })

export const SCHEDULE_PAGE_ID = 'schedules'
export const SCHEDULE_PAGE_ORDER = 12

/** The schedule page, there while the `schedule/v1` client is on the tree. */
export const scheduleUiModule = defineUiModule<Record<string, ClientOf<ScheduleProtocol>>>({
  name: 'schedule-ui',
  inject: [SCHEDULE],
  apply(shell, services) {
    const client = services[SCHEDULE]!
    shell.contribute('pages', {
      id: SCHEDULE_PAGE_ID,
      title: '日程',
      order: SCHEDULE_PAGE_ORDER,
      icon: 'time',
      render: ({ scope }) =>
        scope === undefined ? null : <SchedulePage client={client} tenant={scope} />,
    })
  },
})
