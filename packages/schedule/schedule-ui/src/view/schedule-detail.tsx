import type { TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Ago,
  BackIcon,
  FactList,
  FactRow,
  IconButton,
  ReadingDocument,
  ReadingToolbar,
  StatusPill,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useState, type JSX } from 'react'
import { useReading } from '../model/reading.ts'
import {
  authorText,
  calendarText,
  CONTROL_WORDS,
  localText,
  nextText,
  runnableText,
  stateNote,
  type ScheduleDetail,
  type Succeeded,
  type Upcoming,
} from '../model/words.ts'
import { Drawn } from './drawn.tsx'
import { JobDetailView, type JobDetailProps, type OpenedJob } from './job-detail.tsx'
import { ScheduleRuns, useJobChanges } from './schedule-runs.tsx'
import { scheduleTitle } from '../parts.ts'

type Client = ClientOf<ScheduleProtocol>
type Preview = Succeeded<'preview'>

const UPCOMING_COUNT = 5

/** The schedule a row opened, with the name the row showed, which the toolbar keeps while the record is read. */
export type Picked = Readonly<{ schedule: string; label: string | null }>

export type ScheduleDetailProps = Readonly<{
  client: Client
  tenant: TenantId
  picked: Picked
  onBack: () => void
  onOpenSession?: JobDetailProps['onOpenSession']
}>

/** The reading pane on one schedule, or on one of its Jobs; a change the server tells of reads both again. */
export function ScheduleDetailView(props: ScheduleDetailProps): JSX.Element {
  const { client, tenant, picked } = props
  const [job, setJob] = useState<OpenedJob | null>(null)
  const [round, setRound] = useState(0)
  useJobChanges(
    client,
    tenant,
    useCallback(() => setRound(value => value + 1), []),
  )
  if (job !== null)
    return (
      <JobDetailView
        client={client}
        tenant={tenant}
        opened={job}
        backLabel={`回到${picked.label ?? '未命名'}`}
        onBack={() => setJob(null)}
        round={round}
        {...(props.onOpenSession === undefined ? {} : { onOpenSession: props.onOpenSession })}
      />
    )
  return <ScheduleReading {...props} round={round} onOpen={setJob} />
}

/** The record and its runs: each read on its own; the runs follow the changes of the tenant's Jobs. */
function ScheduleReading({
  client,
  tenant,
  picked,
  onBack,
  round,
  onOpen,
}: ScheduleDetailProps &
  Readonly<{ round: number; onOpen: (job: OpenedJob) => void }>): JSX.Element {
  const { schedule } = picked
  const [detail, rereadDetail] = useReading<ScheduleDetail>(
    schedule,
    signal => client['read-schedule']({ tenant, schedule }, { signal }),
    round,
  )
  const [preview, rereadPreview] = useReading<Preview>(schedule, signal =>
    client.preview(
      { tenant, source: { kind: 'schedule', schedule }, count: UPCOMING_COUNT },
      { signal },
    ),
  )
  const reasons =
    detail.kind === 'read' && detail.value.standing !== 'ready' ? detail.value.reasons : undefined
  return (
    <>
      <ReadingToolbar
        name={picked.label ?? '未命名'}
        back={
          <IconButton label="回到列表" onClick={onBack}>
            <BackIcon aria-hidden="true" />
          </IconButton>
        }
      />
      <ReadingDocument>
        <Drawn reading={detail} reread={rereadDetail} refused={() => '看不到这条日程。'}>
          {value => <Record detail={value} />}
        </Drawn>
        <ScheduleRuns
          client={client}
          tenant={tenant}
          schedule={schedule}
          preview={preview}
          rereadPreview={rereadPreview}
          reasons={reasons}
          control={detail.kind === 'read' ? detail.value.control : undefined}
          round={round}
          onOpen={row => row.job !== null && onOpen({ job: row.job.job, local: row.local })}
        />
      </ReadingDocument>
    </>
  )
}

/** The record: the name as its title, who made it and how long ago, then its facts. */
function Record({ detail }: Readonly<{ detail: ScheduleDetail }>): JSX.Element {
  const note = stateNote(detail)
  return (
    <>
      <h2 className="schedule-record-title" {...scheduleTitle.props}>
        {detail.label ?? '未命名'}
      </h2>
      <p className="schedule-record-byline">
        {authorText(detail.author)}建的 · <Ago at={encodeInstant(detail.createdAt)} />
      </p>
      <FactList className="schedule-record-facts" aria-label="日程详情">
        <FactRow term="状态">
          <StatusPill tone={note?.tone ?? 'neutral'}>
            {note?.word ?? CONTROL_WORDS.active}
          </StatusPill>
        </FactRow>
        <FactRow term="能否运行">{runnableText(detail)}</FactRow>
        <FactRow term="下一次">
          {detail.control === 'active' && detail.next !== null ? (
            <Time item={detail.next} />
          ) : (
            nextText(detail)
          )}
        </FactRow>
        <FactRow term="修订">{detail.revision}</FactRow>
      </FactList>
    </>
  )
}

/** One time in the tenant's zone, and in a muted aside the calendar and version its working days came from. */
function Time({ item }: Readonly<{ item: Upcoming }>): JSX.Element {
  const calendar = calendarText(item)
  return (
    <>
      {localText(item.local)}
      {calendar !== undefined && <span className="schedule-calendar">{calendar}</span>}
    </>
  )
}
