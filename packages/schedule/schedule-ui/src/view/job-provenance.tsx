import type { TenantId } from '@omne-harness/public-contract'
import { readTenantText } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Button } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { DIRECT_PROVENANCE, openerOf, provenanceText } from '../model/job-session.ts'
import { useReading } from '../model/reading.ts'
import type { Succeeded } from '../model/words.ts'

type Client = ClientOf<ScheduleProtocol>
export type JobProvenanceProps = Readonly<{
  client: Client
  tenant: string | undefined
  session: string
  onOpenJob: (job: string) => void
}>

/** The quiet line of a session a Job opened: which schedule its Job is of, and the way back to that Job. Nothing is
 * drawn while it is read, for a session no Job opened, or when it cannot be read. */
export function JobProvenance(props: JobProvenanceProps): JSX.Element | null {
  const tenant = props.tenant === undefined ? undefined : readTenantText(props.tenant)
  return tenant === undefined ? null : <Read {...props} id={tenant} />
}

function Read({
  client,
  session,
  onOpenJob,
  id,
}: JobProvenanceProps & Readonly<{ id: TenantId }>): JSX.Element | null {
  const [jobs] = useReading<Succeeded<'read-session-jobs'>>(session, signal =>
    client['read-session-jobs']({ tenant: id, session }, { signal }),
  )
  const job = jobs.kind === 'read' ? openerOf(jobs.value.items) : undefined
  const schedule = job?.schedule ?? null
  const [shown] = useReading<Succeeded<'read-schedule'>>(`${session} ${schedule ?? ''}`, signal =>
    schedule === null
      ? Promise.resolve({ outcome: 'not-visible' })
      : client['read-schedule']({ tenant: id, schedule }, { signal }),
  )
  if (job === undefined) return null
  if (schedule !== null && shown.kind !== 'read') return null
  const words = shown.kind === 'read' ? provenanceText(shown.value.label) : DIRECT_PROVENANCE
  return (
    <Button
      variant="link"
      size="compact"
      className="schedule-job-provenance"
      onClick={() => onOpenJob(job.job)}
    >
      {words}
    </Button>
  )
}
