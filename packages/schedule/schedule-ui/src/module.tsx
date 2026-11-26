import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { needProtocol, type RenderPointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { ACTIVATION_KIND } from './model/activation.ts'
import { ActivationDetail } from './view/activation.tsx'
import { SchedulePage } from './view/schedule-page.tsx'
import { scheduleParts } from './parts.ts'

export const SCHEDULE_PAGE_ID = 'schedules'
export const SCHEDULE_PAGE_ORDER = 12

/** Where a release card draws a typed detail: the assembly hands in the point, keyed by kind. */
export type ScheduleUiOptions = Readonly<{ releaseDetail?: RenderPointSink<string> }>

/** The schedule page, placed whether or not `schedule/v3` is served; and, when the assembly
 * hands in the point, how a release card draws a call that would bring a schedule into effect. */
export function createScheduleUiModule(options: ScheduleUiOptions = {}) {
  return defineUiModule({
    name: 'schedule-ui',
    needs: { schedule: needProtocol<ClientOf<ScheduleProtocol>>(scheduleProtocol) },
    apply(shell, { schedule: client }) {
      for (const part of scheduleParts) part.declare(shell)
      shell.contribute('pages', {
        id: SCHEDULE_PAGE_ID,
        title: '日程',
        order: SCHEDULE_PAGE_ORDER,
        icon: 'time',
        render: ({ scope }) =>
          scope === undefined ? null : <SchedulePage client={client} tenant={scope} />,
      })
      options.releaseDetail?.put(shell, ACTIVATION_KIND, ({ subject }) => (
        <ActivationDetail value={subject} />
      ))
    },
  })
}
