import type { CalendarProtocol } from '@omne-harness/calendar-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  EmptyState,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableRow,
  type Tone,
} from '@omne-harness/ui-kit'
import type { JSX } from 'react'

type Client = ClientOf<CalendarProtocol>
export type SupplyHealth = Extract<
  Awaited<ReturnType<Client['read-supply-health']>>,
  { outcome: 'succeeded' }
>['body']
type Health = SupplyHealth['calendars'][number]

const SUPPLY: Readonly<Record<Health['supply'], readonly [string, Tone]>> = {
  ok: ['供应正常', 'good'],
  pending: ['有待处理的更新', 'info'],
  failed: ['供应失败', 'danger'],
  unknown: ['供应状态未知', 'neutral'],
}
const HORIZON: Readonly<Record<Health['horizon'], readonly [string, Tone]>> = {
  ok: ['覆盖充足', 'good'],
  warning: ['覆盖快用完了', 'caution'],
  critical: ['覆盖即将耗尽', 'danger'],
  unknown: ['覆盖情况未知', 'neutral'],
}

/** Which sources failed and why, then what the domain itself says; the words are the source adapter's own. */
function why(item: Health): readonly string[] {
  return [
    ...item.sources
      .filter(source => source.observation === 'failed')
      .map(source => `来源 ${source.source} 失败：${source.reason ?? '没有给出原因'}`),
    ...item.reasons,
  ]
}

function coverage(item: Health): string {
  if (item.coverageEnd === null) return '没有覆盖'
  const left = item.remainingCoverageDays
  return `覆盖到 ${item.coverageEnd}${left === null ? '' : `，还剩 ${left} 天`}`
}

/** Supply and horizon each say their state in words; colour only repeats it. */
export function SupplyHealthTable({
  health,
  titleOf,
}: Readonly<{ health: SupplyHealth; titleOf: (calendar: string) => string }>): JSX.Element {
  if (health.calendars.length === 0) return <EmptyState title="这个部署没有供应任何日历。" />
  return (
    <Table aria-label="各日历的供应健康">
      <TableBody>
        {health.calendars.map(item => {
          const [supply, supplyTone] = SUPPLY[item.supply]
          const [horizon, horizonTone] = HORIZON[item.horizon]
          return (
            <TableRow key={item.calendar}>
              <TableCell>{titleOf(item.calendar)}</TableCell>
              <TableCell>
                <StatusPill tone={supplyTone}>{supply}</StatusPill>
                {item.consecutiveFailures > 0 && `，连续失败 ${item.consecutiveFailures} 次`}
                {why(item).map(line => (
                  <div key={line}>{line}</div>
                ))}
              </TableCell>
              <TableCell>
                <StatusPill tone={horizonTone}>{horizon}</StatusPill>
              </TableCell>
              <TableCell>{coverage(item)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
