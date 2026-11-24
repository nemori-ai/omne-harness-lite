import type {
  ScheduleExecutorInspection,
  ScheduleExecutorJob,
  ScheduleExecutorStart,
  ScheduleExecutorStop,
  ScheduleInstant,
  ScheduleJobExecutor,
  ScheduleOwner,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import { advanceJob, type JobEvent, type JobFacts } from './job.ts'
import type { DispatchCommand, DispatchJob } from './types.ts'

export type CoordinationPorts = Readonly<{
  owner: ScheduleOwner
  executor(work: ScheduleWork): ScheduleJobExecutor | undefined
  commit(command: DispatchCommand): Promise<boolean>
}>

const fromStart = (answer: Exclude<ScheduleExecutorStart, { kind: 'unknown' }>): JobEvent =>
  answer.kind === 'started'
    ? { kind: 'taken', executionRef: answer.executionRef, running: answer.running }
    : { kind: 'notStarted', recoverable: answer.recoverable, reason: answer.reason }

const fromInspection = (
  answer: Exclude<ScheduleExecutorInspection, { kind: 'unknown' }>,
): JobEvent => {
  if (answer.kind === 'ended' || answer.kind === 'notStarted') return answer
  return { kind: 'taken', executionRef: answer.executionRef, running: answer.kind === 'running' }
}

const fromStop = (answer: ScheduleExecutorStop): JobEvent =>
  answer.kind === 'sent'
    ? { kind: 'stopSent' }
    : answer.kind === 'confirmed'
      ? { kind: 'stopConfirmed' }
      : { kind: 'stopUnknown' }

/** One round of one open Job: each known fact is a commit the lock re-derives; an unknown answer changes nothing. */
export async function coordinateJob(
  ports: CoordinationPorts,
  job: DispatchJob,
  at: ScheduleInstant,
): Promise<number> {
  let facts: JobFacts = job.facts
  let revision = job.revision
  let moved = 0
  const step = async (event: JobEvent): Promise<boolean> => {
    const result = advanceJob(facts, event)
    if (result.kind !== 'move') return false
    const command: DispatchCommand = {
      kind: 'step',
      owner: ports.owner,
      jobId: job.jobId,
      revision,
      event,
      next: result.next,
      at,
    }
    if (!(await ports.commit(command))) return false
    facts = result.next
    revision += 1
    moved += 1
    return true
  }
  if (job.quietBefore) await step({ kind: 'predecessorsQuiet' })
  const { work } = job
  if (work === null) return moved
  const executor = ports.executor(work)
  if (executor === undefined) return moved
  const target = (): ScheduleExecutorJob => ({
    owner: ports.owner,
    jobId: job.jobId,
    scheduleId: job.scheduleId,
    work,
    executionRef: facts.executionRef,
    acceptedAt: job.acceptedAt,
  })
  if (facts.state === 'accepted' || facts.state === 'blocked') {
    if (!(await step({ kind: 'startIntent' }))) return moved
    const started = await executor.start(target())
    if (started.kind !== 'unknown') await step(fromStart(started))
  } else if (facts.state === 'startPending' || facts.state === 'running') {
    if (facts.stopState === 'requested' && facts.executionRef !== null)
      await step(fromStop(await executor.requestStop(target(), 'graceful')))
    const seen = await executor.inspect(target())
    if (seen.kind !== 'unknown') await step(fromInspection(seen))
  }
  return moved
}
