import { createHash } from 'node:crypto'
import type { ScheduleExecutorJob } from '@omne-harness/schedule-contract'

const FAMILY = 'schedule-session/1'
const digest = (parts: readonly string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

export type JobIdentities = Readonly<{
  tenant: string
  session: string
  create: string
  goal: string
  stop: string
  by: string
}>

/** The session of a Job and the operations on it: derived from the tenant and the Job, so doing it again names the same ones. Null: the Job belongs to no tenant. */
export function identitiesOf(
  job: Pick<ScheduleExecutorJob, 'owner' | 'jobId'>,
): JobIdentities | null {
  if (job.owner.kind !== 'tenant') return null
  const tenant = job.owner.tenantId
  const from = [tenant, job.jobId]
  const session = digest([`${FAMILY}:session`, ...from])
  const at = [...from, session]
  return {
    tenant,
    session,
    create: `sop_${digest([`${FAMILY}:create`, ...at])}`,
    stop: `sop_${digest([`${FAMILY}:stop`, ...at])}`,
    goal: `schedule-job:${job.jobId}`,
    by: `schedule-job:${job.jobId}`,
  }
}
