import { plainOf, type JobDetail } from './jobs.ts'

/** The session a Job is carried out in, with the run its work began in when that is known; null for any other Job,
 * and while what the execution left cannot be read: a session that cannot be read is not offered. */
export function sessionOf(
  where: JobDetail['where'],
): Readonly<{ session: string; run?: string }> | null {
  if (where?.kind !== 'session' || where.account === null) return null
  const { run } = where.account
  return run === null ? { session: where.session } : { session: where.session, run }
}

/** The Job that opened a session, among the Jobs it carries out: the one whose work asks for a new session. */
export function openerOf(items: readonly JobDetail[]): JobDetail | undefined {
  return items.find(item => {
    const work = plainOf(item.work) as { kind?: string; session?: { mode?: string } } | null
    return work?.kind === 'agent' && work.session?.mode === 'new'
  })
}

export const DIRECT_PROVENANCE = '由一份直接发起的作业开启'
/** The one line a session says of the Job of a schedule that opened it. */
export const provenanceText = (label: string | null): string =>
  `由日程「${label ?? '未命名'}」的作业开启`

/** The step the work began at: the first one the executor took the Job at; undefined while none has. */
export const beganAt = (events: JobDetail['events']): number | undefined =>
  events.find(event => event.kind === 'taken')?.seq
