import type { PointContributor } from '@omne-harness/shell-contract'
import { formatAmount, formatNumber, formatPercent, StatBlock } from '@omne-harness/ui-kit'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'
import type { Layouts, Position, Width } from '../model/layout.ts'
import { windowOf, type RangeWindow } from '../model/range.ts'
import {
  cacheByBucket,
  latencyByBucket,
  occupancyReading,
  tokensByBucket,
  tokensByModel,
  toolsByBucket,
  valueOf,
  type QueryBody,
  type QueryResult,
  type SeriesData,
} from '../model/shapes.ts'
import { usageWidget, type WidgetSubject } from '../points.ts'
import { Present, usePanel } from './present.tsx'
import { useLoaded, type Loaded } from './reads.ts'

const dateOf = (at: unknown): Date => new Date(encodeInstant(at as Instant))
const dayLabel = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
const hourLabel = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const momentLabel = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const labelOf = (window: RangeWindow) => (start: unknown) =>
  (window.bucket === 'hour' ? hourLabel : dayLabel).format(dateOf(start))

function useQuery(subject: WidgetSubject, groupBy: QueryBody['groupBy']) {
  const { reads, tenant } = usePanel()
  const window = windowOf(subject.range, new Date())
  const shape = { session: subject.session, window, groupBy }
  const loaded = useLoaded(reads, JSON.stringify(['query', tenant, shape]), () =>
    reads.query(tenant, shape),
  )
  return { loaded, window }
}

function Waiting<T>({
  loaded,
  label,
  children,
}: {
  readonly loaded: Loaded<T>
  readonly label: string
  readonly children: (value: T) => React.ReactNode
}): React.JSX.Element {
  if (loaded.kind === 'ready') return <>{children(loaded.value)}</>
  return (
    <div className="usage-card-wait" role="status" aria-label={label}>
      <span className="usage-card-title">{label}</span>
      <span>{loaded.kind === 'loading' ? '正在读取……' : loaded.text}</span>
    </div>
  )
}

const costOf = (result: QueryResult): string | null => {
  const sums = result.total.cost.sums.filter(sum => sum.known !== '0')
  return sums.length === 0
    ? result.total.cost.unknown > 0
      ? null
      : formatAmount('0', 'USD')
    : sums.map(sum => formatAmount(sum.known, sum.unit)).join(' + ')
}

function Summary({ subject }: { readonly subject: WidgetSubject }): React.JSX.Element {
  const { loaded } = useQuery(subject, ['source'])
  return (
    <Waiting loaded={loaded} label="概览">
      {result => {
        const model = result.groups.find(cell => cell.key[0] === 'model')?.measures
        const { tokens, rates, duration, cost } = result.total
        const total = [tokens.input, tokens.output].map(valueOf)
        return (
          <div className="usage-summary" role="group" aria-label="概览">
            <StatBlock
              label="费用"
              value={costOf(result)}
              {...(cost.unknown > 0 ? { detail: `${cost.unknown} 笔未知` } : {})}
            />
            <StatBlock
              label="Token（输入与输出）"
              value={
                total.every(part => part === null)
                  ? null
                  : formatNumber(
                      total.reduce<number>((sum, part) => sum + (part ?? 0), 0),
                      { compact: true },
                    )
              }
            />
            <StatBlock label="模型请求" value={formatNumber(model?.calls ?? 0)} />
            <StatBlock
              label="缓存命中率"
              value={
                rates.cacheHit.kind === 'known' ? formatPercent(Number(rates.cacheHit.value)) : null
              }
            />
            <StatBlock
              label="首字延迟（中位）"
              value={
                duration.toFirstContent.p50 === null
                  ? null
                  : `${formatNumber(duration.toFirstContent.p50)} 毫秒`
              }
            />
          </div>
        )
      }}
    </Waiting>
  )
}

function SeriesCard({
  subject,
  label,
  fallback,
  groupBy,
  map,
}: {
  readonly subject: WidgetSubject
  readonly label: string
  readonly fallback: string
  readonly groupBy: QueryBody['groupBy']
  readonly map: (result: QueryResult, labelOf: (start: unknown) => string) => SeriesData
}): React.JSX.Element {
  const { loaded, window } = useQuery(subject, groupBy)
  return (
    <Waiting loaded={loaded} label={label}>
      {result => (
        <Present
          shape="series"
          fallback={fallback}
          label={label}
          data={map(result, labelOf(window))}
        />
      )}
    </Waiting>
  )
}

function ByModel({ subject }: { readonly subject: WidgetSubject }): React.JSX.Element {
  const { loaded } = useQuery(subject, ['model'])
  return (
    <Waiting loaded={loaded} label="按模型的 token">
      {result => (
        <Present
          shape="breakdown"
          fallback="usage.share-bar"
          label="按模型的 token"
          data={tokensByModel(result)}
        />
      )}
    </Waiting>
  )
}

function Occupancy({ subject }: { readonly subject: WidgetSubject }): React.JSX.Element | null {
  const { reads, tenant } = usePanel()
  const session = subject.session
  const loaded = useLoaded(reads, JSON.stringify(['occupancy', tenant, session]), () =>
    session === null
      ? Promise.resolve({ kind: 'refused' as const, text: '没有会话。' })
      : reads.occupancy(tenant, session),
  )
  return (
    <Waiting loaded={loaded} label="上下文">
      {answer => (
        <Present
          shape="reading"
          fallback="usage.meter"
          label="上下文"
          data={occupancyReading(answer, at => momentLabel.format(dateOf(at)))}
        />
      )}
    </Waiting>
  )
}

type NativeWidget = Readonly<{
  id: string
  label: string
  width: Width
  draw: (subject: WidgetSubject) => React.JSX.Element | null
}>

const summary: NativeWidget = {
  id: 'usage.summary',
  label: '概览',
  width: 3,
  draw: subject => <Summary subject={subject} />,
}
const series = (
  id: string,
  label: string,
  fallback: string,
  width: Width,
  groupBy: QueryBody['groupBy'],
  map: (result: QueryResult, labelOf: (start: unknown) => string) => SeriesData,
): NativeWidget => ({
  id,
  label,
  width,
  draw: subject => (
    <SeriesCard subject={subject} label={label} fallback={fallback} groupBy={groupBy} map={map} />
  ),
})
const tokens = series('usage.tokens', '按时间的 token', 'usage.stacked-bar', 2, [], tokensByBucket)
const byModel: NativeWidget = {
  id: 'usage.by-model',
  label: '按模型的 token',
  width: 1,
  draw: subject => <ByModel subject={subject} />,
}
const cache = series('usage.cache', '缓存读写', 'usage.line', 1, [], cacheByBucket)
const latency = series('usage.latency', '延迟', 'usage.line', 1, [], latencyByBucket)
const tools = series('usage.tools', '工具执行', 'usage.stacked-bar', 1, ['source'], toolsByBucket)
const occupancy: NativeWidget = {
  id: 'usage.occupancy',
  label: '上下文',
  width: 1,
  draw: subject => <Occupancy subject={subject} />,
}

export const NATIVE_WIDGETS: Readonly<Record<Position, readonly NativeWidget[]>> = {
  tenant: [summary, tokens, byModel, cache, latency, tools],
  session: [summary, tokens, byModel, cache, latency, tools],
  status: [occupancy],
}

const placed = (widget: NativeWidget, width: Width = widget.width) => ({
  widget: widget.id,
  width,
  presentation: null,
})

export const MODULE_LAYOUTS: Layouts = {
  tenant: [summary, tokens, byModel, cache, latency, tools].map(widget => placed(widget)),
  session: [summary, tokens, byModel].map(widget => placed(widget, 3)),
  status: [placed(occupancy)],
}

export function contributeWidgets(shell: PointContributor): void {
  for (const [position, widgets] of Object.entries(NATIVE_WIDGETS))
    widgets.forEach((widget, order) =>
      usageWidget.contribute(shell, position, {
        id: widget.id,
        order,
        label: widget.label,
        render: ({ subject }) => widget.draw(subject),
      }),
    )
}
