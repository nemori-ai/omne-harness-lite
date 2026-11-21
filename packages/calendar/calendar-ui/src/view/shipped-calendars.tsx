import type { CalendarProtocol } from '@omne-harness/calendar-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Disclosure,
  EmptyState,
  FactList,
  FactRow,
  LoadingState,
  SettingRow,
  StateWord,
  StatusPill,
  type StateLabel,
} from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { Reading } from '../model/reading.ts'
import { ReadNotice } from './drawn.tsx'

type Client = ClientOf<CalendarProtocol>
type Succeeded<K extends keyof CalendarProtocol['operations']> = Extract<
  Awaited<ReturnType<Client[K]>>,
  { outcome: 'succeeded' }
>['body']
type Calendars = Succeeded<'list-calendars'>['calendars']
export type SupplyHealth = Succeeded<'read-supply-health'>
type Calendar = Calendars[number]
type Health = SupplyHealth['calendars'][number]

/** The one word at the row end: the most urgent standing, from the state word table; none when all is well. */
function wordOf(item: Health): StateLabel | undefined {
  if (item.supply === 'failed') return 'failed'
  if (item.horizon === 'critical' || item.horizon === 'warning') return 'attention'
  if (item.supply === 'pending') return 'queued'
  if (item.supply === 'unknown' || item.horizon === 'unknown') return 'unknown'
  return undefined
}

function hintOf(calendar: Calendar, item: Health | undefined): string {
  const version = calendar.version ?? '没有可用的版本'
  const late =
    item !== undefined &&
    (item.horizon === 'warning' || item.horizon === 'critical') &&
    item.remainingCoverageDays !== null
      ? `，还剩 ${item.remainingCoverageDays} 天`
      : ''
  const coverage =
    calendar.coverageEnd === null ? '没有覆盖' : `覆盖到 ${calendar.coverageEnd}${late}`
  return `${calendar.timezone} · ${version} · ${coverage}`
}

/** Which sources failed and why, how many runs failed in a row, then the domain's own words. */
function factsOf(item: Health): readonly (readonly [string, string])[] {
  return [
    ...item.sources
      .filter(source => source.observation === 'failed')
      .map(source => [source.source, source.reason ?? '没有给出原因'] as const),
    ...(item.consecutiveFailures > 0
      ? [['连续失败', `${item.consecutiveFailures} 次`] as const]
      : []),
    ...item.reasons.map(reason => ['说明', reason] as const),
  ]
}

function CalendarRow({
  calendar,
  health,
  effective,
  title,
}: Readonly<{
  calendar: Calendar
  health: Health | undefined
  effective: boolean
  title: string
}>): JSX.Element {
  const word = health === undefined ? undefined : wordOf(health)
  const facts = health === undefined ? [] : factsOf(health)
  return (
    <SettingRow
      label={
        <span className="calendar-name">
          {title}
          {effective && <StatusPill tone="neutral">生效</StatusPill>}
        </span>
      }
      hint={hintOf(calendar, health)}
      notice={
        facts.length === 0 ? undefined : (
          <Disclosure label="来源">
            <FactList aria-label={`${title}的来源`}>
              {facts.map(([term, value], at) => (
                <FactRow key={at} term={term}>
                  {value}
                </FactRow>
              ))}
            </FactList>
          </Disclosure>
        )
      }
    >
      {word === undefined ? undefined : <StateWord state={word} />}
    </SettingRow>
  )
}

/** One setting row per shipped calendar; the supply health joins the rows and is read on its own. */
export function ShippedCalendars({
  calendars,
  health,
  rereadHealth,
  effective,
  titleOf,
}: Readonly<{
  calendars: Calendars
  health: Reading<SupplyHealth>
  rereadHealth: () => void
  effective: string | undefined
  titleOf: (calendar: string) => string
}>): JSX.Element {
  if (calendars.length === 0) return <EmptyState title="部署供应的日历会列在这里。" />
  const standing = new Map(
    health.kind === 'read' ? health.value.calendars.map(item => [item.calendar, item]) : [],
  )
  return (
    <div className="calendar-shipped">
      <div>
        {calendars.map(calendar => (
          <CalendarRow
            key={calendar.calendar}
            calendar={calendar}
            health={standing.get(calendar.calendar)}
            effective={calendar.calendar === effective}
            title={titleOf(calendar.calendar)}
          />
        ))}
      </div>
      {health.kind === 'reading' && <LoadingState label="读取中" />}
      {(health.kind === 'refused' || health.kind === 'unreadable') && (
        <ReadNotice reading={health} reread={rereadHealth} refused={() => '读不出供应健康。'} />
      )}
    </div>
  )
}
