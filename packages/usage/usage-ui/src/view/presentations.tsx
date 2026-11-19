import type { PointContributor } from '@omne-harness/shell-contract'
import {
  AreaChart,
  formatNumber,
  LineChart,
  ReadingMeter,
  ShareBar,
  StackedBarChart,
  type ChartRow,
  type ChartSeries,
  type SharePart,
} from '@omne-harness/ui-kit'
import { usagePresentation } from '../points.ts'

type Drawn = Readonly<Record<string, unknown>>
const label = (data: Drawn): string => (typeof data['label'] === 'string' ? data['label'] : '')
const series = (data: Drawn) => ({
  label: label(data),
  series: (data['series'] ?? []) as readonly ChartSeries[],
  rows: (data['rows'] ?? []) as readonly ChartRow[],
})
const parts = (data: Drawn) => (data['parts'] ?? []) as readonly SharePart[]
const reading = (data: Drawn) => ({
  percent: typeof data['percent'] === 'number' ? data['percent'] : null,
  mark: typeof data['mark'] === 'number' ? data['mark'] : null,
  ...(typeof data['caption'] === 'string' ? { caption: data['caption'] } : {}),
  ...(typeof data['unknownReason'] === 'string' ? { unknownReason: data['unknownReason'] } : {}),
})

export const NATIVE_PRESENTATIONS = {
  series: [
    {
      id: 'usage.stacked-bar',
      label: '堆叠柱',
      draw: (data: Drawn) => <StackedBarChart {...series(data)} />,
    },
    { id: 'usage.line', label: '折线', draw: (data: Drawn) => <LineChart {...series(data)} /> },
    { id: 'usage.area', label: '面积', draw: (data: Drawn) => <AreaChart {...series(data)} /> },
  ],
  breakdown: [
    {
      id: 'usage.share-bar',
      label: '占比条',
      draw: (data: Drawn) => <ShareBar label={label(data)} parts={parts(data)} />,
    },
    {
      id: 'usage.share-list',
      label: '列表',
      draw: (data: Drawn) => (
        <figure className="usage-share-list" aria-label={label(data)}>
          <figcaption>{label(data)}</figcaption>
          <ul>
            {parts(data).map(part => (
              <li key={part.key}>
                <span>{part.label}</span>
                <span>{formatNumber(part.value)}</span>
              </li>
            ))}
          </ul>
        </figure>
      ),
    },
  ],
  reading: [
    {
      id: 'usage.meter',
      label: '读数条',
      draw: (data: Drawn) => <ReadingMeter label={label(data)} {...reading(data)} />,
    },
    {
      id: 'usage.reading-text',
      label: '只有字',
      draw: (data: Drawn) => {
        const { percent, caption, unknownReason } = reading(data)
        return (
          <span className="usage-reading-text">
            {label(data)}{' '}
            {percent === null ? `— ${unknownReason ?? ''}` : `${formatNumber(percent)}%`}
            {caption === undefined ? null : ` · ${caption}`}
          </span>
        )
      },
    },
  ],
} as const

export function contributePresentations(shell: PointContributor): void {
  for (const [shape, items] of Object.entries(NATIVE_PRESENTATIONS))
    items.forEach((item, order) =>
      usagePresentation.contribute(shell, shape, {
        id: item.id,
        order,
        label: item.label,
        render: ({ subject }) => item.draw(subject),
      }),
    )
}
