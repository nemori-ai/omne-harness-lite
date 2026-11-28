import type {
  ScheduleCarrierNeed,
  ScheduleExecutorAcceptance,
  ScheduleJobExecutor,
  ScheduleOwner,
  SchedulePurpose,
  ScheduleWork,
  ScheduleWorkPath,
} from '@omne-harness/schedule-contract'

export function workPathOf(work: ScheduleWork): ScheduleWorkPath {
  return work.kind === 'program' ? 'program' : `agent.${work.session.mode}`
}

function workNeeds(work: ScheduleWork): ScheduleCarrierNeed[] {
  const executor = { kind: 'executor', ref: workPathOf(work) } as const
  if (work.kind === 'program') return [executor, { kind: 'program', ref: work.programRef }]
  const { publication, archive } = work.resultPolicy
  return [
    executor,
    ...(publication.kind === 'none'
      ? []
      : [
          {
            kind: 'publication' as const,
            ref: publication.kind === 'provider' ? publication.providerRef : null,
          },
        ]),
    ...(work.returnTo === null ? [] : [{ kind: 'return' as const, ref: work.returnTo.targetRef }]),
    ...(archive.kind === 'none' ? [] : [{ kind: 'archive' as const, ref: archive.providerRef }]),
  ]
}

/** Every carrier a purpose selects; the work is accepted only when each of them is here. */
export function carriersOf(purpose: SchedulePurpose): readonly ScheduleCarrierNeed[] {
  const notice = { kind: 'notification', ref: null } as const
  if (purpose.kind === 'reminder') return [notice]
  return [...workNeeds(purpose.work), ...(purpose.notifications.length > 0 ? [notice] : [])]
}

/** Whether the executor of the work's path takes it as written. No executor, or one that does not judge, takes it: dispatch answers for a missing carrier. */
export async function workAcceptance(
  executor: ScheduleJobExecutor | undefined,
  work: ScheduleWork,
  owner: ScheduleOwner,
): Promise<ScheduleExecutorAcceptance> {
  try {
    return (await executor?.accepts?.(work, owner)) ?? { kind: 'accepted' }
  } catch {
    return { kind: 'unknown', reason: 'the executor failed to judge the work' }
  }
}

/** How a missing carrier is named in the reason a schedule is blocked. */
export const needText = (need: ScheduleCarrierNeed): string =>
  need.ref === null ? need.kind : `${need.kind}:${need.ref}`
