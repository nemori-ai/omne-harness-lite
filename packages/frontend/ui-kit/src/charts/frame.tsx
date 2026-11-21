import { cn } from '../lib/utils.ts'
import { Disclosure } from '../patterns/disclosure.tsx'
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

export type ChartCopy = Readonly<{
  empty: string
  unknown: string
  unknownValue: string
  table: string
  unknownCount: (count: number) => string
}>

export const CHART_COPY: ChartCopy = {
  empty: '这段时间没有数据',
  unknown: '没有可用的数',
  unknownValue: '未知',
  table: '表格',
  unknownCount: count => `未知 ${count} 项`,
}

export function Unknown({ copy }: { readonly copy: ChartCopy }): React.JSX.Element {
  return <span aria-label={copy.unknownValue}>{UNKNOWN_TEXT}</span>
}

export function ChartFrame({
  label,
  state,
  table,
  copy,
  className,
  children,
}: {
  readonly label: string
  readonly state: ChartState
  readonly table: React.ReactNode
  readonly copy: ChartCopy
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
          {copy[state]}
        </p>
      )}
      {state !== 'empty' && (
        <Disclosure className="omne-chart-table" label={copy.table}>
          {table}
        </Disclosure>
      )}
    </figure>
  )
}

export function SeriesTable({
  series,
  rows,
  format,
  copy,
}: {
  readonly series: readonly ChartSeries[]
  readonly rows: readonly ChartRow[]
  readonly format: ChartFormat
  readonly copy: ChartCopy
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
                <td key={item.key}>
                  {typeof value === 'number' ? format(value) : <Unknown copy={copy} />}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
