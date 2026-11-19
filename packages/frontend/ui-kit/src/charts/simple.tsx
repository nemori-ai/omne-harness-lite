import { cn } from '../lib/utils.ts'
import { formatNumber, formatPercent } from './format.ts'
import { ChartFrame, markClass, Unknown, type ChartFormat } from './frame.tsx'

export type SharePart = Readonly<{ key: string; label: string; value: number | null }>

type Segment = SharePart & Readonly<{ value: number; index: number; x: number; width: number }>

function segmentsOf(parts: readonly SharePart[]): readonly Segment[] {
  const counted = parts.flatMap((part, index) =>
    typeof part.value === 'number' && part.value > 0 ? [{ ...part, value: part.value, index }] : [],
  )
  const total = counted.reduce((sum, part) => sum + part.value, 0)
  let x = 0
  return counted.map(part => {
    const width = (part.value / total) * 100
    const segment = { ...part, x, width }
    x += width
    return segment
  })
}

export function ShareBar({
  label,
  parts,
  format = formatNumber,
}: {
  readonly label: string
  readonly parts: readonly SharePart[]
  readonly format?: ChartFormat
}): React.JSX.Element {
  const segments = segmentsOf(parts)
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const unknown = parts.filter(part => part.value === null).length
  const share = (value: number) => formatPercent(value / total)
  return (
    <ChartFrame
      label={label}
      state={total > 0 ? 'drawn' : unknown === 0 ? 'empty' : 'unknown'}
      className="omne-share"
      table={
        <table>
          <tbody>
            {parts.map(part => (
              <tr key={part.key}>
                <th scope="row">{part.label}</th>
                <td>{part.value === null ? <Unknown /> : format(part.value)}</td>
                <td>{part.value === null || total === 0 ? <Unknown /> : share(part.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg className="omne-share-bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="list">
        {segments.map(segment => (
          <rect
            key={segment.key}
            role="listitem"
            tabIndex={0}
            aria-label={`${segment.label} ${format(segment.value)}（${share(segment.value)}）`}
            className={markClass(segment.index)}
            fill="currentColor"
            x={segment.x}
            y={0}
            width={segment.width}
            height={8}
          />
        ))}
      </svg>
      <ul className="omne-share-legend">
        {segments.map(segment => (
          <li key={segment.key}>
            <span
              className={cn('omne-chart-swatch', markClass(segment.index))}
              aria-hidden="true"
            />
            {segment.label}
          </li>
        ))}
        {unknown > 0 && <li className="omne-share-unknown">未知 {unknown} 项</li>}
      </ul>
    </ChartFrame>
  )
}

export function ReadingMeter({
  label,
  percent,
  mark = null,
  caption,
  unknownReason,
}: {
  readonly label: string
  readonly percent: number | null
  readonly mark?: number | null
  readonly caption?: string
  readonly unknownReason?: string
}): React.JSX.Element {
  if (percent === null)
    return (
      <div className="omne-meter" role="group" aria-label={label} data-state="unknown">
        <span className="omne-meter-label">{label}</span>
        <span className="omne-meter-value">
          <Unknown />
        </span>
        {unknownReason !== undefined && <span className="omne-meter-caption">{unknownReason}</span>}
      </div>
    )
  const filled = Math.min(Math.max(percent, 0), 100)
  return (
    <div className="omne-meter" data-state={percent > 100 ? 'over' : 'drawn'}>
      <span className="omne-meter-label">{label}</span>
      <svg
        className="omne-meter-track"
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatNumber(percent)}%`}
      >
        <rect className="omne-meter-rail" fill="currentColor" x={0} y={0} width={100} height={6} />
        <rect className={markClass(0)} fill="currentColor" x={0} y={0} width={filled} height={6} />
        {mark !== null && (
          <rect
            className="omne-meter-mark"
            fill="currentColor"
            x={Math.min(mark, 100) - 0.5}
            y={0}
            width={1}
            height={6}
          />
        )}
      </svg>
      <span className="omne-meter-value">{formatNumber(percent)}%</span>
      {caption !== undefined && <span className="omne-meter-caption">{caption}</span>}
    </div>
  )
}

export function Sparkline({
  label,
  values,
}: {
  readonly label: string
  readonly values: readonly (number | null)[]
}): React.JSX.Element {
  const known = values.filter((value): value is number => typeof value === 'number')
  if (known.length === 0)
    return (
      <span
        className="omne-spark"
        role="img"
        aria-label={`${label}：没有可用的数`}
        data-state={values.length === 0 ? 'empty' : 'unknown'}
      >
        <Unknown />
      </span>
    )
  const low = Math.min(...known)
  const span = Math.max(...known) - low || 1
  const step = values.length > 1 ? 100 / (values.length - 1) : 0
  const runs: string[] = []
  let current = ''
  values.forEach((value, index) => {
    if (value === null) {
      if (current !== '') runs.push(current)
      current = ''
      return
    }
    const point = `${(index * step).toFixed(2)},${(20 - ((value - low) / span) * 20).toFixed(2)}`
    current = current === '' ? `M${point}` : `${current}L${point}`
  })
  if (current !== '') runs.push(current)
  const summary = values.map(value => (value === null ? '未知' : formatNumber(value))).join('、')
  return (
    <svg
      className={cn('omne-spark', markClass(0))}
      viewBox="-1 -1 102 22"
      role="img"
      aria-label={`${label}：${summary}`}
      data-state="drawn"
    >
      {runs.map(run => (
        <path
          key={run}
          d={run.includes('L') ? run : `${run}h0.01`}
          fill="none"
          stroke="currentColor"
        />
      ))}
    </svg>
  )
}

export function StatBlock({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: string | null
  readonly detail?: string
}): React.JSX.Element {
  return (
    <div className="omne-stat" role="group" aria-label={label}>
      <span className="omne-stat-label">{label}</span>
      <span className="omne-stat-value">{value === null ? <Unknown /> : value}</span>
      {detail !== undefined && <span className="omne-stat-detail">{detail}</span>}
    </div>
  )
}
