import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  EmptyState,
  IconButton,
  InlineNotice,
  ListReadingDirectory,
  ListReadingMain,
  ListReadingPage,
  ListReadingRow,
  ListReadingWorkspace,
  ReadingState,
  RetryIcon,
  Segmented,
  TimeIcon,
} from '@omne-harness/ui-kit'
import { useState, type JSX } from 'react'
import { useReading, type Answer } from '../model/reading.ts'
import { nextText, stateNote, type ScheduleCard, type Succeeded } from '../model/words.ts'
import { Drawn } from './drawn.tsx'
import { ReadOnEnd } from './read-on-end.tsx'
import { ScheduleDetailView, type Picked } from './schedule-detail.tsx'

type Client = ClientOf<ScheduleProtocol>
type Page = Succeeded<'list-schedules'>
type Span = 'current' | 'all'
type ReadPage = (cursor: string | null, signal: AbortSignal) => Promise<Answer>

const PAGE_LIMIT = 50
const TITLE = '日程'
const DESCRIPTION = '命令行与 agent 建的日程，要改用 omne schedule。'
const LIST_REFUSED = () => '服务端不认这次列表请求。'

export type SchedulePageProps = Readonly<{ client: Client; tenant: string }>

export function SchedulePage({ client, tenant }: SchedulePageProps): JSX.Element {
  const id = readTenantText(tenant)
  if (id === undefined)
    return (
      <ListReadingPage title={TITLE} description={DESCRIPTION} detail={false}>
        <ReadingState>
          <InlineNotice tone="danger">读不懂当前的租户。</InlineNotice>
        </ReadingState>
      </ListReadingPage>
    )
  return <Schedules client={client} tenant={id} key={tenant} />
}

/** The list and the reading pane. 刷新 reads the list and the open schedule again: the list does not follow the
 * server by itself. The first page decides whether the list is empty; the pages after it are read at its end. */
function Schedules({
  client,
  tenant,
}: Readonly<{ client: Client; tenant: TenantId }>): JSX.Element {
  const [span, setSpan] = useState<Span>('current')
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<Picked | undefined>(undefined)
  const readPage: ReadPage = (cursor, signal) =>
    client['list-schedules'](
      { tenant, control: null, terminal: span === 'all', cursor, limit: PAGE_LIMIT },
      { signal },
    )
  const [first, reread] = useReading<Page>(`${span} ${round}`, signal => readPage(null, signal))
  const empty = first.kind === 'read' && first.value.items.length === 0
  const open = picked !== undefined
  return (
    <ListReadingPage
      title={TITLE}
      description={DESCRIPTION}
      detail={open}
      actions={
        <IconButton label="刷新" onClick={() => setRound(value => value + 1)}>
          <RetryIcon aria-hidden="true" />
        </IconButton>
      }
    >
      <ListReadingWorkspace detail={open} empty={empty}>
        <ListReadingDirectory
          search={
            <div className="schedule-span">
              <Segmented
                label="范围"
                value={span}
                onValueChange={setSpan}
                options={[
                  { value: 'current', label: '当前的' },
                  { value: 'all', label: '全部，含已结束的' },
                ]}
              />
            </div>
          }
        >
          <Drawn reading={first} reread={reread} refused={LIST_REFUSED}>
            {page => <Pages first={page} readPage={readPage} picked={picked} onPick={setPicked} />}
          </Drawn>
        </ListReadingDirectory>
        <ListReadingMain>
          {picked === undefined ? (
            <ReadingState>
              <EmptyState
                icon={TimeIcon}
                title={empty ? '命令行与 agent 建的日程会列在这里。' : '选一个日程看它的安排。'}
              />
            </ReadingState>
          ) : (
            <ScheduleDetailView
              key={`${picked.schedule} ${round}`}
              client={client}
              tenant={tenant}
              picked={picked}
              onBack={() => setPicked(undefined)}
            />
          )}
        </ListReadingMain>
      </ListReadingWorkspace>
    </ListReadingPage>
  )
}

type Choice = Readonly<{ picked: Picked | undefined; onPick: (picked: Picked) => void }>

/** The rows of the first page, then each page after it, asked for once the end of the one before comes into view. */
function Pages({
  first,
  readPage,
  ...choice
}: Readonly<{ first: Page; readPage: ReadPage }> & Choice): JSX.Element {
  const [cursors, setCursors] = useState<readonly string[]>([])
  const more = (next: string) => setCursors(list => [...list, next])
  return (
    <>
      <Rows items={first.items} {...choice} />
      {cursors.length === 0 && <ReadOnEnd next={first.next} onEnd={more} />}
      {cursors.map((cursor, at) => (
        <LaterPage
          key={cursor}
          cursor={cursor}
          readPage={readPage}
          last={at === cursors.length - 1}
          onMore={more}
          {...choice}
        />
      ))}
    </>
  )
}

function LaterPage({
  cursor,
  readPage,
  last,
  onMore,
  ...choice
}: Readonly<{
  cursor: string
  readPage: ReadPage
  last: boolean
  onMore: (next: string) => void
}> &
  Choice): JSX.Element {
  const [page, reread] = useReading<Page>(cursor, signal => readPage(cursor, signal))
  return (
    <Drawn reading={page} reread={reread} refused={LIST_REFUSED}>
      {value => (
        <>
          <Rows items={value.items} {...choice} />
          {last && <ReadOnEnd next={value.next} onEnd={onMore} />}
        </>
      )}
    </Drawn>
  )
}

/** One row per schedule: its mark, its name, a word only when it is not the normal one, and its next time. */
function Rows({
  items,
  picked,
  onPick,
}: Readonly<{ items: readonly ScheduleCard[] }> & Choice): JSX.Element {
  return (
    <>
      {items.map(item => (
        <ListReadingRow
          key={item.schedule}
          mark={<TimeIcon />}
          title={item.label ?? '未命名'}
          facts={stateNote(item)?.word}
          time={nextText(item.next)}
          selected={item.schedule === picked?.schedule}
          onSelect={() => onPick({ schedule: item.schedule, label: item.label })}
        />
      ))}
    </>
  )
}
