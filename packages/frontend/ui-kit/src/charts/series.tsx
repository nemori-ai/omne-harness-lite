import {
  Area,
  AreaChart as AreaFrame,
  Bar,
  BarChart as BarFrame,
  CartesianGrid,
  Line,
  LineChart as LineFrame,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from './format.ts'
import {
  CHART_COPY,
  ChartFrame,
  markClass,
  SeriesTable,
  seriesState,
  Unknown,
  type ChartCopy,
  type ChartFormat,
  type ChartRow,
  type ChartSeries,
} from './frame.tsx'

export type SeriesChartProps = Readonly<{
  label: string
  series: readonly ChartSeries[]
  rows: readonly ChartRow[]
  format?: ChartFormat
  height?: number
  copy?: ChartCopy
}>

type Kind = 'bar' | 'line' | 'area'
type Datum = Record<string, string | number | null>

const INK = 'currentColor'
const CURSOR = { fill: INK, stroke: INK, className: 'omne-chart-cursor' }
const ACTIVE_DOT = { stroke: 'none' }
const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 }
const keyOf = (index: number): string => `s${index}`

function dataOf(series: readonly ChartSeries[], rows: readonly ChartRow[]): Datum[] {
  return rows.map(row => {
    const datum: Datum = { x: row.label }
    series.forEach((item, index) => {
      datum[keyOf(index)] = row.values[item.key] ?? null
    })
    return datum
  })
}

type TooltipItem = Readonly<{ payload?: unknown }>

function TooltipBody({
  active,
  label,
  payload,
  series,
  format,
  copy,
}: {
  readonly active: boolean | undefined
  readonly label: unknown
  readonly payload: readonly TooltipItem[] | undefined
  readonly series: readonly ChartSeries[]
  readonly format: ChartFormat
  readonly copy: ChartCopy
}): React.JSX.Element | null {
  const datum = payload?.[0]?.payload as Datum | undefined
  if (active !== true || datum === undefined) return null
  return (
    <div className="omne-chart-tooltip">
      <p>{String(label)}</p>
      <ul>
        {series.map((item, index) => {
          const value = datum[keyOf(index)]
          return (
            <li key={item.key}>
              <span className={`omne-chart-swatch ${markClass(index)}`} aria-hidden="true" />
              {item.label}：{typeof value === 'number' ? format(value) : <Unknown copy={copy} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const known = (data: readonly Datum[], key: string, at: number): boolean =>
  typeof data[at]?.[key] === 'number'

type PointProps = Readonly<{ cx?: number; cy?: number; index?: number }>

const pointOf = (data: readonly Datum[], key: string) =>
  function Point({ cx, cy, index = -1 }: PointProps): React.JSX.Element {
    const lone =
      known(data, key, index) && !known(data, key, index - 1) && !known(data, key, index + 1)
    return lone && cx !== undefined && cy !== undefined ? (
      <circle
        key={index}
        className="omne-chart-point"
        cx={cx}
        cy={cy}
        r={3}
        fill={INK}
        stroke="none"
      />
    ) : (
      <g key={index} />
    )
  }

function marks(
  kind: Kind,
  series: readonly ChartSeries[],
  data: readonly Datum[],
): React.JSX.Element[] {
  return series.map((item, index) => {
    const shared = {
      key: item.key,
      dataKey: keyOf(index),
      name: item.label,
      className: markClass(index),
      isAnimationActive: false,
    }
    if (kind === 'bar') return <Bar {...shared} key={item.key} stackId="stack" fill={INK} />
    if (kind === 'line')
      return (
        <Line
          {...shared}
          key={item.key}
          type="monotone"
          dot={pointOf(data, keyOf(index))}
          activeDot={ACTIVE_DOT}
          stroke={INK}
        />
      )
    return (
      <Area
        {...shared}
        key={item.key}
        type="monotone"
        stackId="stack"
        dot={pointOf(data, keyOf(index))}
        activeDot={ACTIVE_DOT}
        stroke={INK}
        fill={INK}
      />
    )
  })
}

function SeriesChart({
  kind,
  label,
  series,
  rows,
  format = formatNumber,
  height = 200,
  copy = CHART_COPY,
}: SeriesChartProps & { readonly kind: Kind }): React.JSX.Element {
  const Frame = kind === 'bar' ? BarFrame : kind === 'line' ? LineFrame : AreaFrame
  const data = dataOf(series, rows)
  return (
    <ChartFrame
      label={label}
      state={seriesState(series, rows)}
      table={<SeriesTable series={series} rows={rows} format={format} copy={copy} />}
      copy={copy}
    >
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 480, height }}>
        <Frame data={data} accessibilityLayer className="omne-chart-plot" margin={MARGIN}>
          <CartesianGrid className="omne-chart-grid" vertical={false} stroke={INK} />
          <XAxis dataKey="x" className="omne-chart-axis" stroke={INK} tickLine={false} />
          <YAxis
            className="omne-chart-axis"
            stroke={INK}
            tickFormatter={format}
            tickLine={false}
            width={56}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={CURSOR}
            content={props => (
              <TooltipBody
                active={props.active}
                label={props.label}
                payload={props.payload as readonly TooltipItem[] | undefined}
                series={series}
                format={format}
                copy={copy}
              />
            )}
          />
          {marks(kind, series, data)}
        </Frame>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function StackedBarChart(props: SeriesChartProps): React.JSX.Element {
  return <SeriesChart {...props} kind="bar" />
}

export function LineChart(props: SeriesChartProps): React.JSX.Element {
  return <SeriesChart {...props} kind="line" />
}

export function AreaChart(props: SeriesChartProps): React.JSX.Element {
  return <SeriesChart {...props} kind="area" />
}
