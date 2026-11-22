import type { CalendarProtocol } from '@omne-harness/calendar-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Button,
  FactList,
  FactRow,
  InlineNotice,
  Input,
  LoadingIndicator,
  PageColumn,
  PageHeader,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@omne-harness/ui-kit'
import { useState, type JSX } from 'react'
import { READING, readOnce, useReading, type Reading } from '../model/reading.ts'
import { calendarLookup, calendarLookupAsk, calendarPage } from '../parts.ts'
import { Drawn, ReadNotice } from './drawn.tsx'
import { ShippedCalendars, type SupplyHealth } from './shipped-calendars.tsx'

type Client = ClientOf<CalendarProtocol>
type Operations = CalendarProtocol['operations']
type Succeeded<K extends keyof Operations> = Extract<
  Awaited<ReturnType<Client[K]>>,
  { outcome: 'succeeded' }
>['body']
type Environment = Succeeded<'read-environment'>
type Calendars = Succeeded<'list-calendars'>
type DayAnswer = Succeeded<'answer'>

/** The names a person reads for the shipped calendars; an unknown one shows its identifier. */
const CALENDAR_TITLES: Readonly<Record<string, string>> = {
  'cn-legal-holidays': '中国法定节假日',
  'jp-legal-holidays': '日本法定节假日',
  'us-federal-holidays': '美国联邦假日',
}

const DAY_WORDS = { workingDay: '工作日', holiday: '节假日', nonWorkingDay: '休息日' } as const

export const titleOf = (calendar: string): string => CALENDAR_TITLES[calendar] ?? calendar

export type CalendarPageProps = Readonly<{ client: Client; tenant: string }>

export function CalendarPage({ client, tenant }: CalendarPageProps): JSX.Element {
  const id = readTenantText(tenant)
  return (
    <PageColumn className="calendar-page" {...calendarPage.props}>
      <PageHeader title="日历" description="日期计算与日程用哪套日历、哪个时区；改在「设置」页。" />
      {id === undefined ? (
        <InlineNotice tone="danger">读不懂当前的租户。</InlineNotice>
      ) : (
        <CalendarFacts client={client} tenant={id} tenantText={tenant} />
      )}
    </PageColumn>
  )
}

function CalendarFacts({
  client,
  tenant,
  tenantText,
}: Readonly<{ client: Client; tenant: TenantId; tenantText: string }>): JSX.Element {
  const [environment, rereadEnvironment] = useReading<Environment>(tenantText, signal =>
    client['read-environment']({ tenant }, { signal }),
  )
  const [calendars, rereadCalendars] = useReading<Calendars>(tenantText, signal =>
    client['list-calendars']({ tenant }, { signal }),
  )
  const [health, rereadHealth] = useReading<SupplyHealth>(tenantText, signal =>
    client['read-supply-health']({ tenant }, { signal }),
  )
  const effective = environment.kind === 'read' ? environment.value.calendar : undefined
  const shipped =
    calendars.kind === 'read' ? calendars.value.calendars.map(item => item.calendar) : []
  return (
    <>
      <Section id="calendar-environment" title="生效的日历">
        <Drawn
          reading={environment}
          reread={rereadEnvironment}
          refused={() => '当前设置选的日历不在供应里。'}
        >
          {value => (
            <FactList aria-label="当前环境">
              <FactRow term="日历">{titleOf(value.calendar)}</FactRow>
              <FactRow term="时区">{value.timezone}</FactRow>
              <FactRow term="版本">{value.version ?? '没有可用的版本'}</FactRow>
            </FactList>
          )}
        </Drawn>
      </Section>
      <Section id="calendar-shipped" title="供应的日历">
        <Drawn reading={calendars} reread={rereadCalendars} refused={() => '读不出日历清单。'}>
          {value => (
            <ShippedCalendars
              calendars={value.calendars}
              health={health}
              rereadHealth={rereadHealth}
              effective={effective}
              titleOf={titleOf}
            />
          )}
        </Drawn>
      </Section>
      <Section id="calendar-lookup" title="查一天">
        <DayLookup client={client} tenant={tenant} calendars={shipped} key={tenantText} />
      </Section>
    </>
  )
}

const EFFECTIVE = '::effective'

function DayLookup({
  client,
  tenant,
  calendars,
}: Readonly<{ client: Client; tenant: TenantId; calendars: readonly string[] }>): JSX.Element {
  const [date, setDate] = useState('')
  const [calendar, setCalendar] = useState(EFFECTIVE)
  const [version, setVersion] = useState('')
  const [answer, setAnswer] = useState<Reading<DayAnswer> | undefined>(undefined)
  const asking = answer?.kind === 'reading'
  const named =
    calendar === EFFECTIVE
      ? {}
      : { calendar, ...(version.trim() === '' ? {} : { version: version.trim() }) }
  const ask = async () => {
    setAnswer(READING)
    setAnswer(
      await readOnce<DayAnswer>(() =>
        client.answer({ tenant, question: { kind: 'day', date }, ...named }),
      ),
    )
  }
  return (
    <div className="calendar-lookup" {...calendarLookup.props}>
      <form
        className="calendar-lookup-form"
        onSubmit={event => {
          event.preventDefault()
          void ask()
        }}
      >
        <Input
          aria-label="日期"
          placeholder="年-月-日，例如 2026-10-10"
          value={date}
          onChange={event => setDate(event.target.value)}
        />
        <Select value={calendar} onValueChange={setCalendar}>
          <SelectTrigger aria-label="按哪份日历" size="sm">
            <SelectValue>{calendar === EFFECTIVE ? '生效的日历' : titleOf(calendar)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EFFECTIVE}>生效的日历</SelectItem>
            {calendars.map(item => (
              <SelectItem key={item} value={item}>
                {titleOf(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {calendar !== EFFECTIVE && (
          <Input
            aria-label="版本"
            placeholder="版本，不填用当前版本"
            value={version}
            onChange={event => setVersion(event.target.value)}
          />
        )}
        <Button type="submit" disabled={date.trim() === '' || asking} {...calendarLookupAsk.props}>
          {asking && <LoadingIndicator size="sm" />}查
        </Button>
      </form>
      {answer?.kind === 'read' && <DayResult answer={answer.value} />}
      {(answer?.kind === 'refused' || answer?.kind === 'unreadable') && (
        <ReadNotice reading={answer} reread={() => void ask()} refused={dayRefusal} />
      )}
    </div>
  )
}

function dayRefusal(outcome: string, body: unknown): string {
  const reason = (body as { reason?: string } | undefined)?.reason
  if (outcome === 'invalid')
    return reason === 'timezone' ? '当前时区不合法。' : '日期要写成「年-月-日」，而且这一天要存在。'
  if (reason === 'coverage')
    return '这一天不在所选日历与版本的覆盖范围里（版本不存在也是这样），不猜。'
  if (reason === 'environment') return '当前设置选的日历不在供应里。'
  return '当前日历答不了这个问题。'
}

function DayResult({ answer }: Readonly<{ answer: DayAnswer }>): JSX.Element {
  const result = answer.result
  return (
    <FactList aria-label="这一天">
      {result.kind === 'day' && (
        <FactRow term={result.date}>
          {DAY_WORDS[result.classification]}
          {result.adjusted && '（调休）'}
        </FactRow>
      )}
      <FactRow term="依据">
        {titleOf(answer.calendar)}，版本 {answer.version}
      </FactRow>
    </FactList>
  )
}
