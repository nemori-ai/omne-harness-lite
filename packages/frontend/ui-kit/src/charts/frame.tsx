import { cn } from '../lib/utils.ts'
import { UNKNOWN_TEXT } from './format.ts'

export type ChartSeries = Readonly<{ key: string; label: string }>
export type ChartRow = Readonly<{ label: string; values: Readonly<Record<string, number | null>> }>
export type ChartFormat = (value: number) => string
export type ChartState = 'empty' | 'unknown' | 'drawn'

const PALETTE = 8

export const markClass = (index: number): string =>
  `omne-chart-mark omne-chart-color-${(index % PALETTE) + 1}`

export function seriesState(series: readonly ChartSeries[], rows: readonly ChartRow[]): ChartState {
  if (series.length === 0 || rows.length === 0) return 'empty'
  const drawn = rows.some(row => series.some(item => typeof row.values[item.key] === 'number'))
  return drawn ? 'drawn' : 'unknown'
}

const EMPTY: Readonly<Record<Exclude<ChartState, 'drawn'>, string>> = {
  empty: '这段时间没有数据',
  unknown: '没有可用的数',
}

export function Unknown(): React.JSX.Element {
  return <span aria-label="未知">{UNKNOWN_TEXT}</span>
}

export function ChartFrame({
  label,
  state,
  table,
  className,
  children,
}: {
  readonly label: string
  readonly state: ChartState
  readonly table: React.ReactNode
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <figure className={cn('omne-chart', className)} aria-label={label} data-state={state}>
      <figcaption className="omne-chart-label">{label}</figcaption>
      {state === 'drawn' ? (
        children
      ) : (
        <p className="omne-chart-empty" role="status">
          {EMPTY[state]}
        </p>
      )}
      {state !== 'empty' && (
        <details className="omne-chart-table">
          <summary>表格</summary>
          {table}
        </details>
      )}
    </figure>
  )
}

export function SeriesTable({
  series,
  rows,
  format,
}: {
  readonly series: readonly ChartSeries[]
  readonly rows: readonly ChartRow[]
  readonly format: ChartFormat
}): React.JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <td />
          {series.map(item => (
            <th scope="col" key={item.key}>
              {item.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <th scope="row">{row.label}</th>
            {series.map(item => {
              const value = row.values[item.key]
              return (
                <td key={item.key}>{typeof value === 'number' ? format(value) : <Unknown />}</td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
