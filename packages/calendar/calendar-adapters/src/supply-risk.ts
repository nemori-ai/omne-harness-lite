import type { CalendarHealth } from '@omne-harness/calendar-contract'
import {
  eventTypeNameSchema,
  sourceNameSchema,
  standingItemsSchema,
  type EventTypeDeclaration,
  type SourceDeclaration,
  type StandingItem,
} from '@omne-harness/notification-contract'
import type { StaticBlock, SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'

export const CALENDAR_SUPPLY_RISK_KEY = 'calendar.supply-risk'

export type CalendarRiskKind = 'coverage-warning' | 'coverage-critical' | 'supply-failing'
/** One open supply risk. `since` is when this read observed it: health keeps no start time. */
export type CalendarSupplyRisk = Readonly<{
  calendarId: string
  kind: CalendarRiskKind
  since: string
  detail: string
}>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'calendar.supply-risk': readonly CalendarSupplyRisk[]
  }
}

const KINDS: readonly CalendarRiskKind[] = [
  'coverage-warning',
  'coverage-critical',
  'supply-failing',
]

function risksOrNull(value: unknown): readonly CalendarSupplyRisk[] | null {
  if (!Array.isArray(value)) return null
  const ok = value.every(
    item =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.calendarId === 'string' &&
      KINDS.includes(item.kind) &&
      typeof item.since === 'string' &&
      typeof item.detail === 'string',
  )
  return ok ? (value as readonly CalendarSupplyRisk[]) : null
}

/** The risks open now: a warning or critical horizon, and a failing supply. Unknown is not a risk. */
export function supplyRisksOf(health: readonly CalendarHealth[]): readonly CalendarSupplyRisk[] {
  return health.flatMap(item => {
    const risks: CalendarSupplyRisk[] = []
    const left = item.remainingCoverageDays
    if (item.horizon === 'warning' || item.horizon === 'critical')
      risks.push({
        calendarId: item.calendarId,
        kind: item.horizon === 'warning' ? 'coverage-warning' : 'coverage-critical',
        since: item.observedAt,
        detail: `覆盖到 ${item.coverageEnd ?? '未知'}，还剩 ${left ?? '未知'} 天`,
      })
    if (item.supply === 'failed')
      risks.push({
        calendarId: item.calendarId,
        kind: 'supply-failing',
        since: item.observedAt,
        detail: `连续失败 ${item.consecutiveFailures} 次${item.reasons.length ? `：${item.reasons.join('；')}` : ''}`,
      })
    return risks
  })
}

export const calendarSupplyRiskDescriptor = Object.freeze({
  key: CALENDAR_SUPPLY_RISK_KEY,
  kind: 'supplied',
  schema: {
    '~standard': {
      version: 1,
      vendor: 'calendar-adapters',
      validate: (value: unknown) => {
        const risks = risksOrNull(value)
        return risks === null
          ? { issues: [{ message: 'Expected the open calendar supply risks' }] }
          : { value: risks }
      },
    },
  },
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-read',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof CALENDAR_SUPPLY_RISK_KEY, readonly CalendarSupplyRisk[]>)

/** Health is system-wide, so every tenant reads the same risks. Null from `read`: health is not known now. */
export function calendarSupplyRiskBlock(
  read: () => Promise<readonly CalendarHealth[] | null>,
): StaticBlock {
  return Object.freeze({
    declaration: calendarSupplyRiskDescriptor,
    supply: async () => {
      const health = await read()
      return health === null
        ? ({ kind: 'unknown' } as const)
        : ({ kind: 'value', value: supplyRisksOf(health) } as const)
    },
  })
}

const SOURCE = sourceNameSchema.parse('calendar.supply')
const LABELS: Record<CalendarRiskKind, Readonly<{ label: string; description: string }>> = {
  'coverage-warning': {
    label: '日历覆盖快用完了',
    description: '一份日历的数据覆盖到了警告线：再过一段时间，按它算工作日会答依据不足。',
  },
  'coverage-critical': {
    label: '日历覆盖即将耗尽',
    description: '一份日历的数据覆盖到了严重线：按它算的日期很快会答依据不足，发行也会被拦下。',
  },
  'supply-failing': {
    label: '日历供应失败',
    description: '一份日历跟进官方来源时连续失败：旧数据照常可查，新的修订进不来。',
  },
}

function riskType(kind: CalendarRiskKind): EventTypeDeclaration {
  return {
    name: eventTypeNameSchema.parse(kind),
    ...LABELS[kind],
    kind: { kind: 'standing', binding: CALENDAR_SUPPLY_RISK_KEY },
    subject: { presence: 'required', hint: '哪一份日历' },
    subscribable: ['person', 'agent'],
    nameable: [],
    defaults: { person: kind === 'coverage-critical' ? 'strong' : 'weak', agent: 'off' },
    external: false,
  }
}

/** The calendar as a source of notification: three standing types, all bound to the risk block. */
export const calendarSupplySource: SourceDeclaration = Object.freeze({
  name: SOURCE,
  label: '日历供应',
  types: KINDS.map(riskType),
})

/** Translates the risk block into the standing items Notification reads. */
export function standingItemsOfRisks(
  risks: readonly CalendarSupplyRisk[],
): readonly StandingItem[] {
  return standingItemsSchema.parse(
    risks.map(risk => ({
      id: `${SOURCE}/${risk.calendarId}/${risk.kind}`,
      source: SOURCE,
      type: risk.kind,
      subject: risk.calendarId,
      title: `${risk.calendarId}：${LABELS[risk.kind].label}（${risk.detail}）`.slice(0, 200),
      locator: { kind: 'calendar', ref: risk.calendarId },
      since: risk.since,
    })),
  )
}
