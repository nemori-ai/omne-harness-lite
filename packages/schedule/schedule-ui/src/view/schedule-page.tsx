import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Button,
  EmptyState,
  PageColumn,
  PageHeader,
  Segmented,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@omne-harness/ui-kit'
import { useState, type JSX } from 'react'
import { useReading } from '../model/reading.ts'
import {
  authorText,
  CONTROL_WORDS,
  localText,
  type ScheduleCard,
  type Succeeded,
} from '../model/words.ts'
import { Drawn } from './drawn.tsx'
import { ScheduleDetailView } from './schedule-detail.tsx'

type Client = ClientOf<ScheduleProtocol>
type Page = Succeeded<'list-schedules'>
type Span = 'current' | 'all'

const PAGE_LIMIT = 50

export type SchedulePageProps = Readonly<{ client: Client; tenant: string }>

export function SchedulePage({ client, tenant }: SchedulePageProps): JSX.Element {
  const id = readTenantText(tenant)
  return (
    <PageColumn className="schedule-page">
      <PageHeader
        title="日程"
        description="命令行与 agent 建的日程。这一页只读，要改用命令行 omne schedule。"
      />
      {id === undefined ? (
        <EmptyState role="alert" title="读不懂当前的租户。" />
      ) : (
        <Schedules client={client} tenant={id} key={tenant} />
      )}
    </PageColumn>
  )
}

function Schedules({
  client,
  tenant,
}: Readonly<{ client: Client; tenant: TenantId }>): JSX.Element {
  const [span, setSpan] = useState<Span>('current')
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const choose = (next: Span) => {
    setSpan(next)
    setCursors([null])
  }
  return (
    <div className="schedule-layout">
      <div className="schedule-list">
        <Segmented
          label="范围"
          value={span}
          onValueChange={choose}
          options={[
            { value: 'current', label: '当前的' },
            { value: 'all', label: '全部，含已结束的' },
          ]}
        />
        {cursors.map((cursor, at) => (
          <ListPage
            key={`${span} ${cursor ?? ''}`}
            client={client}
            tenant={tenant}
            terminal={span === 'all'}
            cursor={cursor}
            last={at === cursors.length - 1}
            selected={selected}
            onSelect={setSelected}
            onMore={next => setCursors(list => [...list, next])}
          />
        ))}
      </div>
      {selected !== undefined && (
        <ScheduleDetailView client={client} tenant={tenant} schedule={selected} key={selected} />
      )}
    </div>
  )
}

function ListPage(
  props: Readonly<{
    client: Client
    tenant: TenantId
    terminal: boolean
    cursor: string | null
    last: boolean
    selected: string | undefined
    onSelect: (schedule: string) => void
    onMore: (cursor: string) => void
  }>,
): JSX.Element {
  const { client, tenant, terminal, cursor } = props
  const [page, reread] = useReading<Page>(`${terminal} ${cursor ?? ''}`, signal =>
    client['list-schedules'](
      { tenant, control: null, terminal, cursor, limit: PAGE_LIMIT },
      { signal },
    ),
  )
  return (
    <Drawn reading={page} reread={reread} refused={() => '服务端不认这次列表请求。'}>
      {value => (
        <>
          {value.items.length === 0 && cursor === null ? (
            <EmptyState title="还没有日程。" />
          ) : (
            <ScheduleTable
              items={value.items}
              selected={props.selected}
              onSelect={props.onSelect}
            />
          )}
          {props.last && value.next !== null && (
            <Button variant="ghost" onClick={() => props.onMore(value.next!)}>
              更多
            </Button>
          )}
        </>
      )}
    </Drawn>
  )
}

function ScheduleTable({
  items,
  selected,
  onSelect,
}: Readonly<{
  items: readonly ScheduleCard[]
  selected: string | undefined
  onSelect: (schedule: string) => void
}>): JSX.Element {
  return (
    <Table aria-label="日程列表">
      <TableBody>
        {items.map(item => (
          <TableRow
            key={item.schedule}
            aria-selected={item.schedule === selected}
            className="schedule-row"
          >
            <TableCell>
              <Button variant="link" onClick={() => onSelect(item.schedule)}>
                {item.label ?? '未命名'}
              </Button>
            </TableCell>
            <TableCell>
              <StatusPill tone={item.control === 'active' ? 'good' : 'neutral'}>
                {CONTROL_WORDS[item.control]}
              </StatusPill>
            </TableCell>
            <TableCell>{authorText(item.author)}</TableCell>
            <TableCell>{item.next === null ? '没有下一次' : localText(item.next.local)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
