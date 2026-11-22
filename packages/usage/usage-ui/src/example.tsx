import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { formatNumber, Sparkline } from '@omne-harness/ui-kit'
import type { ChartRow, ChartSeries } from '@omne-harness/ui-kit'
import { usagePresentation, usageWidget } from './points.ts'
import { Present } from './view/present.tsx'

export const EXAMPLE_PRESENTATION = 'example.sparklines'
export const EXAMPLE_WIDGET = 'example.weekdays'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function Sparklines({ data }: { readonly data: Readonly<Record<string, unknown>> }) {
  const series = (data['series'] ?? []) as readonly ChartSeries[]
  const rows = (data['rows'] ?? []) as readonly ChartRow[]
  return (
    <figure className="usage-example-sparklines" aria-label={String(data['label'] ?? '')}>
      <figcaption>{String(data['label'] ?? '')}（示例画法）</figcaption>
      <ul>
        {series.map(item => {
          const values = rows.map(row => row.values[item.key] ?? null)
          const last = values.at(-1) ?? null
          return (
            <li key={item.key}>
              <span>{item.label}</span>
              <Sparkline label={item.label} values={values} />
              <span>{formatNumber(last)}</span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}

function Weekdays() {
  const rows = WEEKDAYS.map((label, day) => ({ label, values: { sessions: 3 + ((day * 5) % 7) } }))
  return (
    <Present
      shape="series"
      fallback="usage.stacked-bar"
      label="示例：一周里每天的会话"
      data={{ series: [{ key: 'sessions', label: '会话' }], rows }}
    />
  )
}

/** A module of its own that brings one presentation and one widget, to show both points can be filled. */
export const usageExampleModule = defineUiModule({
  name: 'usage-example',
  needs: {},
  apply(shell) {
    usagePresentation.contribute(shell, 'series', {
      id: EXAMPLE_PRESENTATION,
      order: 100,
      label: '示例：每个系列一条迷你图',
      render: ({ subject }) => <Sparklines data={subject} />,
    })
    for (const position of ['tenant', 'session'])
      usageWidget.contribute(shell, position, {
        id: EXAMPLE_WIDGET,
        order: 100,
        label: '示例：一周里每天的会话',
        render: () => <Weekdays />,
      })
  },
})
