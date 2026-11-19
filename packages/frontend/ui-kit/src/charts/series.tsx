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
  ChartFrame,
  markClass,
  SeriesTable,
  seriesState,
  Unknown,
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
}: {
  readonly active: boolean | undefined
  readonly label: unknown
  readonly payload: readonly TooltipItem[] | undefined
  readonly series: readonly ChartSeries[]
  readonly format: ChartFormat
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
              {item.label}：{typeof value === 'number' ? format(value) : <Unknown />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function marks(kind: Kind, series: readonly ChartSeries[]): React.JSX.Element[] {
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
          dot={false}
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
}: SeriesChartProps & { readonly kind: Kind }): React.JSX.Element {
  const Frame = kind === 'bar' ? BarFrame : kind === 'line' ? LineFrame : AreaFrame
  return (
    <ChartFrame
      label={label}
      state={seriesState(series, rows)}
      table={<SeriesTable series={series} rows={rows} format={format} />}
    >
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 480, height }}>
        <Frame
          data={dataOf(series, rows)}
          accessibilityLayer
          className="omne-chart-plot"
          margin={MARGIN}
        >
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
              />
            )}
          />
          {marks(kind, series)}
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
