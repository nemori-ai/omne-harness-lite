import type { TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Ago,
  BackIcon,
  FactList,
  FactRow,
  IconButton,
  OpenIcon,
  InlineConfirm,
  InlineNotice,
  ReadingDocument,
  ReadingToolbar,
  Section,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useRef, useState, type JSX } from 'react'
import {
  carriedText,
  jobWord,
  ORIGIN_WORDS,
  requirementText,
  stepText,
  type JobDetail,
} from '../model/jobs.ts'
import { beganAt, deliveredOf, sessionOf } from '../model/job-session.ts'
import { readOnce, useReading } from '../model/reading.ts'
import { localText } from '../model/words.ts'
import { scheduleJob, scheduleJobCancel } from '../parts.ts'
import { Drawn } from './drawn.tsx'
import { JobWord } from './job-word.tsx'

type Client = ClientOf<ScheduleProtocol>

/** The Job a row opened, with the time the row showed, which the toolbar keeps while the Job is read. */
export type OpenedJob = Readonly<{ job: string; local: string | null }>

export type JobDetailProps = Readonly<{
  client: Client
  tenant: TenantId
  opened: OpenedJob
  backLabel: string
  onBack: () => void
  round: number
  /** Opens the session a Job is carried out in, at the run its work began in; absent: sessions cannot be opened from here. */
  onOpenSession?: (session: string, run?: string) => void
}>

const titleOf = (local: string | null) =>
  local === null ? '直接发起的作业' : `${localText(local)}的作业`

/** The second level of the reading pane: one Job, and 取消这一次 while it has not concluded. */
export function JobDetailView(props: JobDetailProps): JSX.Element {
  const { client, tenant, opened, backLabel, onBack, round } = props
  const [detail, reread] = useReading<JobDetail>(
    opened.job,
    signal => client['read-job']({ tenant, job: opened.job }, { signal }),
    round,
  )
  const cancellable =
    detail.kind === 'read' && detail.value.state !== 'concluded' && detail.value.stop === 'none'
  return (
    <>
      <ReadingToolbar
        name={titleOf(opened.local)}
        back={
          <IconButton label={backLabel} onClick={onBack}>
            <BackIcon aria-hidden="true" />
          </IconButton>
        }
      >
        {cancellable && <Cancel {...props} onDone={reread} />}
      </ReadingToolbar>
      <ReadingDocument>
        <Drawn reading={detail} reread={reread} refused={() => '看不到这份作业。'}>
          {value => <Job detail={value} onOpenSession={props.onOpenSession} />}
        </Drawn>
      </ReadingDocument>
    </>
  )
}

type Cancelling =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unknown'; actionId: string }>
  | Readonly<{ kind: 'refused'; text: string }>

/** 取消这一次: asks once, then sends; an answer it cannot know is said, and 再确认一次 asks for the same cancel. */
function Cancel({
  client,
  tenant,
  opened,
  onDone,
}: JobDetailProps & Readonly<{ onDone: () => void }>): JSX.Element {
  const [state, setState] = useState<Cancelling>({ kind: 'idle' })
  const actionId = useRef(`cancel:${opened.job}:${Date.now().toString(36)}`)
  const send = async (operation: 'cancel-job' | 'query-cancel-job') => {
    setState({ kind: 'pending' })
    const body = { tenant, actionId: actionId.current, job: opened.job }
    const reading = await readOnce(() => client[operation](body))
    if (reading.kind === 'read') return onDone()
    if (reading.kind === 'refused' && reading.outcome === 'not-committed')
      return setState({ kind: 'idle' })
    if (reading.kind === 'refused' && reading.outcome !== 'unknown')
      return setState({ kind: 'refused', text: '看不到这份作业。' })
    setState({ kind: 'unknown', actionId: actionId.current })
  }
  if (state.kind === 'unknown')
    return (
      <InlineNotice
        tone="neutral"
        action={{ label: '再确认一次', onClick: () => void send('query-cancel-job') }}
      >
        没有收到确定的答复
      </InlineNotice>
    )
  if (state.kind === 'refused') return <InlineNotice tone="neutral">{state.text}</InlineNotice>
  return (
    <span {...scheduleJobCancel.props}>
      <InlineConfirm
        tone="danger"
        confirmLabel="取消这一次"
        consequence="还没开始的不会再开始；正在跑的会被要求停下。"
        pending={state.kind === 'pending'}
        onConfirm={() => void send('cancel-job')}
      >
        取消这一次
      </InlineConfirm>
    </span>
  )
}

type JobProps = Readonly<{
  detail: JobDetail
  onOpenSession: JobDetailProps['onOpenSession'] | undefined
}>

function Job({ detail, onOpenSession }: JobProps): JSX.Element {
  const word = jobWord(detail)
  const place = sessionOf(detail.where)
  const began = beganAt(detail.events)
  const delivered = deliveredOf(detail.where)
  const open = place !== null && onOpenSession !== undefined && (
    <IconButton
      label="打开会话"
      className="schedule-open-session"
      onClick={() => onOpenSession(place.session, place.run)}
    >
      <OpenIcon aria-hidden="true" />
    </IconButton>
  )
  const basis =
    detail.calendar === null
      ? `安排的修订 ${detail.revision}`
      : `${detail.calendar}，版本 ${detail.version ?? '未知'} · 安排的修订 ${detail.revision}`
  return (
    <>
      <h2 className="schedule-record-title" {...scheduleJob.props}>
        {titleOf(detail.local)}
      </h2>
      <FactList className="schedule-record-facts" aria-label="作业详情">
        <FactRow term="状态">
          <JobWord word={word} />
        </FactRow>
        <FactRow term="成因">{ORIGIN_WORDS[detail.origin]}</FactRow>
        <FactRow term="依据">{basis}</FactRow>
        <FactRow term="要求">{`${requirementText(detail.work)}（受理时冻结）`}</FactRow>
        <FactRow term="承接">
          {carriedText(detail.where)}
          {open}
        </FactRow>
      </FactList>
      <Section id="schedule-job-steps" title="经过">
        <ol className="schedule-steps" aria-label="经过的每一步">
          {detail.events.map(event => (
            <li key={event.seq}>
              <Ago at={encodeInstant(event.at)} /> {stepText(event.kind)}
              {event.seq === began && open}
            </li>
          ))}
        </ol>
      </Section>
      <Section id="schedule-job-results" title="成果">
        {delivered === null ? (
          <p className="schedule-note">这份作业没有要交的成果。</p>
        ) : delivered === 'unread' ? (
          <p className="schedule-note">交付物此刻读不到。</p>
        ) : delivered.length === 0 ? (
          <p className="schedule-note">还没有交付物。</p>
        ) : (
          <>
            <p className="schedule-note">交付物留在作业会话里：</p>
            <ul className="schedule-steps" aria-label="交付物">
              {delivered.map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  )
}
