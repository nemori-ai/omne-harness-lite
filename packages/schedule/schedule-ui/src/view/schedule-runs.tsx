import type { TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Button, InlineNotice, Section, StatusPill } from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useEffect, useRef, useState, type JSX } from 'react'
import {
  blockedText,
  lapseText,
  slotFact,
  slotWord,
  type HistoryRow,
  type SlotRow,
} from '../model/jobs.ts'
import { readOnce, useReading, type Reading } from '../model/reading.ts'
import { calendarText, localText, type Succeeded, type Upcoming } from '../model/words.ts'
import { scheduleHappened, scheduleRun, scheduleUpcoming } from '../parts.ts'
import { Drawn } from './drawn.tsx'

type Client = ClientOf<ScheduleProtocol>
type Preview = Succeeded<'preview'>
type Page = Succeeded<'list-jobs'>

const PAGE_LIMIT = 20

/** Reads again each time the server says the tenant's Jobs may have changed; nothing when it cannot observe. */
export function useJobChanges(client: Client, tenant: TenantId, changed: () => void): void {
  const latest = useRef(changed)
  latest.current = changed
  useEffect(() => {
    const observe = (client as { observe?: Record<string, unknown> }).observe?.['observe-jobs']
    if (typeof observe !== 'function') return
    const abort = new AbortController()
    const frames = (observe as Client['observe']['observe-jobs'])(
      { tenant },
      { signal: abort.signal },
    )
    void (async () => {
      try {
        for (;;) {
          const next = await frames.next()
          if (next.done === true || abort.signal.aborted) return
          latest.current()
        }
      } catch {
        return
      }
    })()
    return () => abort.abort()
  }, [client, tenant])
}

export type RunsProps = Readonly<{
  client: Client
  tenant: TenantId
  schedule: string
  preview: Reading<Preview>
  rereadPreview: () => void
  reasons: readonly string[] | undefined
  round: number
  onOpen: (row: SlotRow) => void
}>

/** The runs of one schedule: a notice when it is blocked, the next times as planned, then what happened, newest first. */
export function ScheduleRuns(props: RunsProps): JSX.Element {
  const { preview, rereadPreview, reasons } = props
  return (
    <Section id="schedule-runs" title="执行">
      {reasons !== undefined && reasons.length > 0 && (
        <InlineNotice tone="caution">{blockedText(reasons)}</InlineNotice>
      )}
      <h3 className="schedule-runs-heading">
        接下来<span className="schedule-runs-aside">到点时按当时的定义重新核</span>
      </h3>
      <Drawn reading={preview} reread={rereadPreview} refused={previewRefusal}>
        {value => <UpcomingList preview={value} />}
      </Drawn>
      <h3 className="schedule-runs-heading">已发生</h3>
      <Happened {...props} />
    </Section>
  )
}

function previewRefusal(outcome: string): string {
  if (outcome === 'not-visible') return '看不到这条日程。'
  if (outcome === 'unsupported') return '当前日历答不了接下来几次。'
  return '服务端不认这次预览请求。'
}

function Time({ item }: Readonly<{ item: Upcoming }>): JSX.Element {
  const calendar = calendarText(item)
  return (
    <>
      {localText(item.local)}
      {calendar !== undefined && <span className="schedule-calendar">{calendar}</span>}
    </>
  )
}

function UpcomingList({ preview }: Readonly<{ preview: Preview }>): JSX.Element {
  if (preview.upcoming.length === 0) return <p className="schedule-note">没有接下来的时间。</p>
  return (
    <>
      <ol className="schedule-upcoming" aria-label="时间表" {...scheduleUpcoming.props}>
        {preview.upcoming.map(item => (
          <li key={encodeInstant(item.at)}>
            <Time item={item} />
            <span className="schedule-run-word">计划中</span>
          </li>
        ))}
      </ol>
      {!preview.complete && <p className="schedule-note">只列出了能确定的几次。</p>}
    </>
  )
}

/** What happened, read page by page: the first page on open and on each change, earlier ones on 更早的. */
function Happened({ client, tenant, schedule, round, onOpen }: RunsProps): JSX.Element {
  const [first, reread] = useReading<Page>(
    schedule,
    signal =>
      client['list-jobs']({ tenant, schedule, cursor: null, limit: PAGE_LIMIT }, { signal }),
    round,
  )
  const [earlier, setEarlier] = useState<readonly Page[]>([])
  useEffect(() => setEarlier([]), [first])
  return (
    <Drawn reading={first} reread={reread} refused={() => '看不到这条日程。'}>
      {page => {
        const pages = [page, ...earlier]
        const items = pages.flatMap(each => each.items)
        const cursor = pages.at(-1)?.next ?? null
        if (items.length === 0) return <p className="schedule-note">还没有到点。</p>
        return (
          <>
            <ol className="schedule-happened" aria-label="已发生" {...scheduleHappened.props}>
              {items.map(row => (
                <RunRow key={row.row} row={row} onOpen={onOpen} />
              ))}
            </ol>
            {cursor !== null && (
              <Earlier
                read={signal =>
                  client['list-jobs']({ tenant, schedule, cursor, limit: PAGE_LIMIT }, { signal })
                }
                onRead={more => setEarlier(pages => [...pages, more])}
              />
            )}
          </>
        )
      }}
    </Drawn>
  )
}

function Earlier({
  read,
  onRead,
}: Readonly<{
  read: (signal: AbortSignal) => Promise<{ outcome: string; body?: unknown }>
  onRead: (page: Page) => void
}>): JSX.Element {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        setPending(true)
        void readOnce<Page>(() => read(new AbortController().signal)).then(reading => {
          setPending(false)
          if (reading.kind === 'read') onRead(reading.value)
        })
      }}
    >
      更早的
    </Button>
  )
}

function RunRow({
  row,
  onOpen,
}: Readonly<{ row: HistoryRow; onOpen: (row: SlotRow) => void }>): JSX.Element {
  if (row.kind === 'lapse')
    return (
      <li className="schedule-run" {...scheduleRun.props}>
        <span className="schedule-run-fact">{lapseText(row)}</span>
      </li>
    )
  if (row.kind === 'direct') return <></>
  const word = slotWord(row)
  const body = (
    <>
      <span className="schedule-run-time">{localText(row.local)}</span>
      <StatusPill tone={word.tone}>{word.word}</StatusPill>
      <span className="schedule-run-fact">{slotFact(row, Date.now())}</span>
    </>
  )
  return (
    <li className="schedule-run" {...scheduleRun.props}>
      {row.job === null ? (
        body
      ) : (
        <Button variant="ghost" className="schedule-run-open" onClick={() => onOpen(row)}>
          {body}
        </Button>
      )}
    </li>
  )
}
