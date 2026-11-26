import {
  completeAgentWork,
  ScheduleWorkSchema,
  type ScheduleExecutionRow,
  type ScheduleJobDetail,
  type ScheduleJobSummary,
} from '@omne-harness/schedule-contract'
import type { BoundJobs, JobsFaces } from './port.ts'
import type { JobsArguments } from './jobs-protocol.ts'
import { unreadLine, whereOf } from './protocol.ts'
import { refusalLine } from './text.ts'

type Of<K extends JobsArguments['command']> = Extract<JobsArguments, { command: K }>

const done = (command: string, value: unknown) => `done Jobs ${command}\n${JSON.stringify(value)}`

function standing(job: ScheduleJobSummary) {
  const { body } = job
  const state = body.kind === 'execution' ? body.executionState : body.primaryOutcome
  const outcome = body.kind === 'execution' ? body.outcome : null
  return { job: job.jobId, state, outcome, stop: job.stopState, acceptedAt: job.acceptedAt }
}

function rowOf(row: ScheduleExecutionRow) {
  if (row.kind === 'direct')
    return { kind: 'direct', at: row.originalScheduledAt, ...standing(row.job) }
  if (row.kind === 'lapse')
    return {
      kind: 'missed',
      schedule: row.scheduleId,
      from: row.originalScheduledAt,
      through: row.through,
      cause: row.cause,
      reason: row.reason,
      count: row.count,
      caughtUp: row.selected,
    }
  return {
    kind: 'slot',
    schedule: row.scheduleId,
    at: row.originalScheduledAt,
    disposition: row.receipt?.disposition ?? null,
    reason: row.receipt?.reasonCode ?? null,
    ...(row.job === null ? {} : standing(row.job)),
  }
}

function detailOf(detail: ScheduleJobDetail) {
  return {
    ...standing(detail.job),
    schedule: detail.scheduleId,
    slot: detail.slot?.scheduledAt ?? null,
    work: detail.purpose.kind === 'execution' ? detail.purpose.work : null,
    reason: detail.reason,
    where: detail.executionWhere,
    steps: detail.events.map(event => `${event.seq} ${event.kind} ${event.at}`),
  }
}

const OF_THIS_SESSION = 20

/** One Job by its id; without an id, the Jobs the session of this call carries out or carried out. */
async function show(job: string | undefined, { jobs, context }: JobsFaces): Promise<string> {
  if (job !== undefined) {
    const found = await jobs.get(context, { jobId: job as never })
    return found.kind === 'error' ? refusalLine(found.error) : done('show', detailOf(found.value))
  }
  const session = context.originatingSessionRef
  if (session === null)
    return 'invalid reason=show without job reads the Jobs of the session of the call, and this call is in none code=invalid_input'
  const found = await jobs.ofExecution(context, { executionRef: session, limit: OF_THIS_SESSION })
  return found.kind === 'error'
    ? refusalLine(found.error)
    : done('show', { session, jobs: found.value.map(detailOf) })
}

/** One call is one read or one write; an unknown write is said to be unknown, never success. */
export async function runJobs(
  args: Exclude<JobsArguments, Of<'help'>>,
  faces: JobsFaces,
  bound: BoundJobs,
): Promise<string> {
  const { context } = faces
  if (args.command === 'list') {
    const page = await faces.queries.executions(context, {
      scheduleId: args.params.schedule ?? null,
      from: null,
      to: null,
      cursor: args.params.after ?? null,
      limit: args.params.limit ?? 20,
    })
    if (page.kind === 'error') return refusalLine(page.error)
    return done('list', { items: page.value.items.map(rowOf), next: page.value.nextCursor })
  }
  if (args.command === 'show') return show(args.params.job, faces)
  if (args.command === 'cancel') {
    const answer = await faces.jobs.cancel(context, {
      jobId: args.params.job,
      operationKey: bound.operationKey('cancel'),
    })
    if (answer.kind === 'error') return refusalLine(answer.error)
    const { outcome, detail } = answer.value
    if (outcome === 'unknown' || detail === null)
      return `unknown reason=the cancel may or may not have happened; call show with this job to read its stop state job=${args.params.job}`
    return done('cancel', { changed: outcome === 'committed', ...detailOf(detail) })
  }
  const completed = completeAgentWork(args.params.work, await faces.defaults())
  if (completed.kind !== 'completed') return unreadLine(completed)
  const work = ScheduleWorkSchema.safeParse(completed.work)
  if (!work.success)
    return unreadLine({
      kind: 'refused',
      reason: `the work does not form a Job: ${whereOf(work.error)}`,
    })
  const answer = await faces.jobs.start(context, {
    work: work.data,
    operationKey: bound.operationKey('start'),
  })
  if (answer.kind === 'error') return refusalLine(answer.error)
  const { outcome, detail } = answer.value
  if (outcome === 'unknown' || detail === null)
    return 'unknown reason=the start may or may not have happened; call list to look for it and do not send it again'
  return done('start', detailOf(detail))
}
