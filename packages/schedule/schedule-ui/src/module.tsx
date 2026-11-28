import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { needProtocol, type PointSink, type RenderPointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { ACTIVATION_KIND } from './model/activation.ts'
import { ActivationDetail } from './view/activation.tsx'
import { JobProvenance } from './view/job-provenance.tsx'
import { SchedulePage } from './view/schedule-page.tsx'
import { scheduleParts } from './parts.ts'

export const SCHEDULE_PAGE_ID = 'schedules'
export const SCHEDULE_PAGE_ORDER = 12
export const SCHEDULE_JOB_PROVENANCE = 'schedule.job-provenance'

type Target = Readonly<{ page: string; subject: string }>

/** Where a jump to a Job goes: the shell's navigate takes these two, and the schedule page opens on that Job. */
export const scheduleJobTarget = (job: string): Target => ({ page: SCHEDULE_PAGE_ID, subject: job })

/** What the assembly hands in: where a release card draws a typed detail, keyed by kind; where a jump to a session
 * goes, as the session module writes it; and the status line of the open session. */
export type ScheduleUiOptions = Readonly<{
  releaseDetail?: RenderPointSink<string>
  conversation?: (session: string, run?: string) => Target
  sessionStatus?: PointSink<{ readonly session: string }>
}>

/** The schedule page, placed whether or not `schedule/v3` is served; and, when the assembly
 * hands in the point, how a release card draws a call that would bring a schedule into effect. */
export function createScheduleUiModule(options: ScheduleUiOptions = {}) {
  return defineUiModule({
    name: 'schedule-ui',
    needs: { schedule: needProtocol<ClientOf<ScheduleProtocol>>(scheduleProtocol) },
    apply(shell, { schedule: client }) {
      for (const part of scheduleParts) part.declare(shell)
      const go = (target: Target): void => shell.navigate(target.page, target.subject)
      const { conversation } = options
      const opener =
        conversation === undefined
          ? {}
          : { onOpenSession: (session: string, run?: string) => go(conversation(session, run)) }
      shell.contribute('pages', {
        id: SCHEDULE_PAGE_ID,
        title: '日程',
        order: SCHEDULE_PAGE_ORDER,
        icon: 'time',
        render: ({ scope, subject }) =>
          scope === undefined ? null : (
            <SchedulePage
              client={client}
              tenant={scope}
              {...(subject === undefined ? {} : { job: subject })}
              {...opener}
            />
          ),
      })
      options.sessionStatus?.contribute(shell, {
        id: SCHEDULE_JOB_PROVENANCE,
        order: 10,
        render: ({ scope, subject }) => (
          <JobProvenance
            client={client}
            tenant={scope}
            session={subject.session}
            onOpenJob={job => go(scheduleJobTarget(job))}
          />
        ),
      })
      options.releaseDetail?.put(shell, ACTIVATION_KIND, ({ subject }) => (
        <ActivationDetail value={subject} />
      ))
    },
  })
}
