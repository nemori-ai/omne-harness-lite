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
  Section,
  StatusPill,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import type { JSX } from 'react'
import { useReading } from '../model/reading.ts'
import {
  authorText,
  calendarText,
  CONTROL_WORDS,
  localText,
  STANDING_WORDS,
  stateNote,
  type ScheduleDetail,
  type Succeeded,
  type Upcoming,
} from '../model/words.ts'
import { Drawn } from './drawn.tsx'
import { scheduleTitle, scheduleUpcoming } from '../parts.ts'

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
}>

/** The reading pane on one schedule: its toolbar, then its record and its next few times, each read on its own. */
export function ScheduleDetailView({
  client,
  tenant,
  picked,
  onBack,
}: ScheduleDetailProps): JSX.Element {
  const { schedule } = picked
  const [detail, rereadDetail] = useReading<ScheduleDetail>(schedule, signal =>
    client['read-schedule']({ tenant, schedule }, { signal }),
  )
  const [preview, rereadPreview] = useReading<Preview>(schedule, signal =>
    client.preview(
      { tenant, source: { kind: 'schedule', schedule }, count: UPCOMING_COUNT },
      { signal },
    ),
  )
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
        <Section id="schedule-upcoming" title="接下来几次">
          <Drawn reading={preview} reread={rereadPreview} refused={previewRefusal}>
            {value => <UpcomingList preview={value} />}
          </Drawn>
        </Section>
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
        <FactRow term="能否运行">{STANDING_WORDS[detail.standing]}</FactRow>
        <FactRow term="下一次">
          {detail.next === null ? '没有下一次' : <Time item={detail.next} />}
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

function previewRefusal(outcome: string): string {
  if (outcome === 'not-visible') return '看不到这条日程。'
  if (outcome === 'unsupported') return '当前日历答不了接下来几次。'
  return '服务端不认这次预览请求。'
}

function UpcomingList({ preview }: Readonly<{ preview: Preview }>): JSX.Element {
  if (preview.upcoming.length === 0) return <p className="schedule-note">没有接下来的时间。</p>
  return (
    <>
      <ol className="schedule-upcoming" aria-label="时间表" {...scheduleUpcoming.props}>
        {preview.upcoming.map(item => (
          <li key={encodeInstant(item.at)}>
            <Time item={item} />
          </li>
        ))}
      </ol>
      {!preview.complete && <p className="schedule-note">只列出了能确定的几次。</p>}
    </>
  )
}
