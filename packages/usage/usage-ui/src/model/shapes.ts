import type { Codec } from '@omne-harness/public-contract'
import type { ChartRow, ChartSeries, SharePart } from '@omne-harness/ui-kit'
import type { UsageProtocol } from '@omne-harness/usage-protocol'

type Operations = UsageProtocol['operations']
type ValueOf<C> = C extends Codec<infer T> ? T : never
export type QueryBody = ValueOf<Operations['query-usage']['body']>
export type QueryResult = ValueOf<Operations['query-usage']['outcomes']['succeeded']>
export type Measures = QueryResult['total']
export type Occupancy = ValueOf<Operations['read-context-occupancy']['outcomes']['succeeded']>

export type SeriesData = Readonly<{ series: readonly ChartSeries[]; rows: readonly ChartRow[] }>
export type BreakdownData = Readonly<{ parts: readonly SharePart[] }>
export type ReadingData = Readonly<{
  percent: number | null
  mark: number | null
  caption?: string
  unknownReason?: string
}>
export type ShapeData = Readonly<{
  series: SeriesData
  breakdown: BreakdownData
  reading: ReadingData
}>

type Sum = Measures['tokens']['input']

/** A sum with nothing known in it is unknown; a partly known sum shows what is known. */
export const valueOf = (sum: Sum): number | null =>
  sum.known === '0' && sum.unknown > 0 ? null : Number(sum.known)

const TOKEN_SERIES: readonly (ChartSeries & { key: keyof Measures['tokens'] })[] = [
  { key: 'input', label: '输入' },
  { key: 'cache-read', label: '缓存读' },
  { key: 'cache-write', label: '缓存写' },
  { key: 'output', label: '输出' },
  { key: 'reasoning', label: '推理' },
]

export function tokensByBucket(
  result: QueryResult,
  labelOf: (start: unknown) => string,
): SeriesData {
  return {
    series: TOKEN_SERIES,
    rows: result.buckets.map(bucket => ({
      label: labelOf(bucket.start),
      values: Object.fromEntries(
        TOKEN_SERIES.map(item => [item.key, valueOf(bucket.total.tokens[item.key])]),
      ),
    })),
  }
}

export function cacheByBucket(
  result: QueryResult,
  labelOf: (start: unknown) => string,
): SeriesData {
  const series = TOKEN_SERIES.filter(
    item => item.key === 'cache-read' || item.key === 'cache-write',
  )
  return {
    series,
    rows: result.buckets.map(bucket => ({
      label: labelOf(bucket.start),
      values: Object.fromEntries(
        series.map(item => [item.key, valueOf(bucket.total.tokens[item.key])]),
      ),
    })),
  }
}

export function latencyByBucket(
  result: QueryResult,
  labelOf: (start: unknown) => string,
): SeriesData {
  return {
    series: [
      { key: 'first', label: '首字延迟（中位，毫秒）' },
      { key: 'whole', label: '整次耗时（中位，毫秒）' },
    ],
    rows: result.buckets.map(bucket => ({
      label: labelOf(bucket.start),
      values: {
        first: bucket.total.duration.toFirstContent.p50,
        whole: bucket.total.duration.whole.p50,
      },
    })),
  }
}

export function toolsByBucket(
  result: QueryResult,
  labelOf: (start: unknown) => string,
): SeriesData {
  return {
    series: [{ key: 'calls', label: '工具执行' }],
    rows: result.buckets.map(bucket => ({
      label: labelOf(bucket.start),
      values: {
        calls: bucket.groups.find(cell => cell.key[0] === 'tool')?.measures.calls ?? 0,
      },
    })),
  }
}

const tokensOf = (measures: Measures): number | null => {
  const parts = [measures.tokens.input, measures.tokens.output].map(valueOf)
  return parts.every(part => part === null)
    ? null
    : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
}

export function tokensByModel(result: QueryResult): BreakdownData {
  return {
    parts: result.groups.map(cell => ({
      key: cell.key[0] ?? '',
      label: cell.key[0] ?? '未知型号',
      value: tokensOf(cell.measures),
    })),
  }
}

const UNKNOWN_REASONS: Readonly<Record<'usage-unknown' | 'window-unknown', string>> = {
  'usage-unknown': '这一次请求的用量未知',
  'window-unknown': '这个型号的窗口未知',
}

export function occupancyReading(answer: Occupancy, timeOf: (at: unknown) => string): ReadingData {
  if (answer.kind === 'none-yet')
    return { percent: null, mark: null, unknownReason: '还没有收场的请求' }
  if (answer.kind === 'unknown')
    return { percent: null, mark: null, unknownReason: UNKNOWN_REASONS[answer.reason] }
  const model = answer.asOf.model === null ? '' : ` · ${answer.asOf.model}`
  return {
    percent: Number(answer.percent),
    mark: answer.compactAtPercent === null ? null : Number(answer.compactAtPercent),
    caption: `截至上一次请求（${timeOf(answer.asOf.at)}${model}）`,
  }
}
