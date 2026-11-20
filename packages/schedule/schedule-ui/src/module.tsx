import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { KeyedPointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { ACTIVATION_KIND } from './model/activation.ts'
import { ActivationDetail } from './view/activation.tsx'
import { SchedulePage } from './view/schedule-page.tsx'

const SCHEDULE = protocolServiceName({ name: scheduleProtocol.name, major: scheduleProtocol.major })

export const SCHEDULE_PAGE_ID = 'schedules'
export const SCHEDULE_PAGE_ORDER = 12
export const ACTIVATION_DETAIL_ID = 'schedule-activation'

/** Where a release card draws a typed detail: the assembly hands in the point, keyed by kind. */
export type ScheduleUiOptions = Readonly<{ releaseDetail?: KeyedPointSink<string> }>

/** The schedule page, there while the `schedule/v1` client is on the tree; and, when the assembly
 * hands in the point, how a release card draws a call that would bring a schedule into effect. */
export function createScheduleUiModule(options: ScheduleUiOptions = {}) {
  return defineUiModule<Record<string, ClientOf<ScheduleProtocol>>>({
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
      options.releaseDetail?.contribute(shell, ACTIVATION_KIND, {
        id: ACTIVATION_DETAIL_ID,
        order: 0,
        render: ({ subject }) => <ActivationDetail value={subject} />,
      })
    },
  })
}
