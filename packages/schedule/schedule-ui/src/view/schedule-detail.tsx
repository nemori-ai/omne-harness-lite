import type { TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { FactList, FactRow, Section } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { useReading } from '../model/reading.ts'
import {
  authorText,
  basisText,
  CONTROL_WORDS,
  STANDING_WORDS,
  upcomingText,
  type ScheduleDetail,
  type Succeeded,
} from '../model/words.ts'
import { Drawn } from './drawn.tsx'

type Client = ClientOf<ScheduleProtocol>
type Preview = Succeeded<'preview'>

const UPCOMING_COUNT = 5

export type ScheduleDetailProps = Readonly<{ client: Client; tenant: TenantId; schedule: string }>

/** One schedule: what it is now, who made it, why it is in effect, and its next few times. */
export function ScheduleDetailView({ client, tenant, schedule }: ScheduleDetailProps): JSX.Element {
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
    <div className="schedule-detail">
      <Section id="schedule-detail" title="详情">
        <Drawn reading={detail} reread={rereadDetail} refused={() => '看不到这条日程。'}>
          {value => <Facts detail={value} />}
        </Drawn>
      </Section>
      <Section id="schedule-upcoming" title="接下来几次">
        <Drawn reading={preview} reread={rereadPreview} refused={previewRefusal}>
          {value => <UpcomingList preview={value} />}
        </Drawn>
      </Section>
    </div>
  )
}

function Facts({ detail }: Readonly<{ detail: ScheduleDetail }>): JSX.Element {
  return (
    <FactList aria-label="日程详情">
      <FactRow term="名字">{detail.label ?? '未命名'}</FactRow>
      <FactRow term="状态">{CONTROL_WORDS[detail.control]}</FactRow>
      <FactRow term="能否运行">{STANDING_WORDS[detail.standing]}</FactRow>
      <FactRow term="谁建的">{authorText(detail.author)}</FactRow>
      <FactRow term="凭什么生效">{basisText(detail.basis)}</FactRow>
      <FactRow term="建于">{String(detail.createdAt)}</FactRow>
      <FactRow term="修订">{detail.revision}</FactRow>
    </FactList>
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
      <ol className="schedule-upcoming" aria-label="时间表">
        {preview.upcoming.map(item => (
          <li key={String(item.at)}>{upcomingText(item)}</li>
        ))}
      </ol>
      {!preview.complete && <p className="schedule-note">只列出了能确定的几次。</p>}
    </>
  )
}
