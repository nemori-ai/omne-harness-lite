// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  AreaChart,
  formatAmount,
  formatNumber,
  formatPercent,
  LineChart,
  ReadingMeter,
  ShareBar,
  Sparkline,
  StackedBarChart,
  StatBlock,
  UNKNOWN_TEXT,
} from '../src/index.ts'

// happy-dom lays nothing out; the responsive container needs a measured box to draw.
beforeAll(() => {
  const box = { width: 480, height: 200, top: 0, left: 0, right: 480, bottom: 200, x: 0, y: 0 }
  HTMLElement.prototype.getBoundingClientRect = () => ({ ...box, toJSON: () => box }) as DOMRect
  for (const [name, value] of [
    ['clientWidth', 480],
    ['clientHeight', 200],
    ['offsetWidth', 480],
    ['offsetHeight', 200],
  ] as const)
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value })
})
afterEach(cleanup)

const settle = () => new Promise(resolve => setTimeout(resolve, 30))
const series = [
  { key: 'input', label: '输入' },
  { key: 'output', label: '输出' },
]
const rows = [
  { label: '11-18', values: { input: 1200, output: 30 } },
  { label: '11-19', values: { input: null, output: 45 } },
]
const COLOR_ATTRIBUTES = ['fill', 'stroke', 'stop-color', 'color', 'style']

function colorsOf(root: Element): string[] {
  return [...root.querySelectorAll('svg, svg *')].flatMap(element =>
    COLOR_ATTRIBUTES.map(name => element.getAttribute(name)).filter(
      (value): value is string => value !== null,
    ),
  )
}

describe('the number formats', () => {
  it('groups, abbreviates, writes percents and amounts, and writes unknown as a dash, never as zero', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(1234567, { compact: true })).toBe('123.5万')
    expect(formatNumber(9999, { compact: true })).toBe('9,999')
    expect(formatNumber(10_000, { compact: true })).toBe('1万')
    expect(formatNumber(1.23456)).toBe('1.23')
    expect(UNKNOWN_TEXT).toBe('—')
    expect(formatNumber(0)).toBe('0')
    expect(formatPercent(0.4567)).toBe('45.7%')
    expect(formatAmount('12345.0123', 'USD')).toBe('12,345.0123 USD')
    expect(formatAmount('-0.5', 'USD')).toBe('-0.5 USD')
    expect(formatAmount('7', 'CNY')).toBe('7 CNY')
    for (const unknown of [
      formatNumber(null),
      formatNumber(Number.NaN),
      formatPercent(null),
      formatAmount(null, 'USD'),
      formatAmount('1e3', 'USD'),
      formatAmount('01', 'USD'),
    ])
      expect(unknown).toBe(UNKNOWN_TEXT)
  })
})

describe.each([
  ['stacked bars', StackedBarChart, 'recharts-bar'],
  ['a line', LineChart, 'recharts-line'],
  ['an area', AreaChart, 'recharts-area'],
] as const)('a series chart drawn as %s', (_name, Chart, mark) => {
  it('draws SVG whose colors come only from the style variables, inserts no stylesheet, and is reachable by keyboard', async () => {
    const before = document.querySelectorAll('style, link[rel="stylesheet"]').length
    const { container } = render(<Chart label="按天的 token" series={series} rows={rows} />)
    await settle()
    const figure = container.querySelector('figure')
    expect(figure?.getAttribute('aria-label')).toBe('按天的 token')
    expect(figure?.dataset['state']).toBe('drawn')
    const svg = container.querySelector('svg.recharts-surface')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('tabindex')).toBe('0')
    expect(container.querySelector('figure.omne-chart')).toBe(figure)
    expect(container.querySelectorAll(`.${mark}`).length).toBe(2)
    const others = ['recharts-bar', 'recharts-line', 'recharts-area'].filter(
      other => other !== mark,
    )
    expect(others.filter(other => container.querySelector(`.${other}`) !== null)).toEqual([])
    const painted = container.querySelectorAll(
      `.${mark} *, .recharts-cartesian-axis *, .recharts-cartesian-grid *`,
    )
    const paint = [...painted]
      .flatMap(node => ['fill', 'stroke'].map(name => node.getAttribute(name)))
      .filter((value): value is string => value !== null)
    expect(new Set(paint)).toEqual(new Set(['currentColor', 'none']))
    expect(container.querySelector('.recharts-cartesian-grid-vertical')).toBeNull()
    expect(container.querySelector('.recharts-cartesian-axis-tick-line')).toBeNull()
    if (mark === 'recharts-bar') {
      const widths = [...container.querySelectorAll('.recharts-rectangle')].map(bar =>
        Number(bar.getAttribute('width')),
      )
      expect(widths.length).toBeGreaterThan(0)
      expect(widths.every(width => width > 50)).toBe(true)
    }
    expect(container.querySelectorAll('.omne-chart-color-1').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.omne-chart-color-2').length).toBeGreaterThan(0)
    expect(
      colorsOf(container).filter(value => /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(value)),
    ).toEqual([])
    expect(document.querySelectorAll('style, link[rel="stylesheet"]').length).toBe(before)
  })

  it('walks the data points by keyboard, each shown with its series and formatted values', async () => {
    const { container } = render(<Chart label="按天的 token" series={series} rows={rows} />)
    await settle()
    const svg = container.querySelector('svg.recharts-surface') as SVGElement
    expect(container.querySelector('.omne-chart-tooltip')).toBeNull()
    await act(async () => {
      fireEvent.focus(svg)
      fireEvent.keyDown(svg, { key: 'ArrowRight' })
      await settle()
    })
    const tip = () => container.querySelector('.omne-chart-tooltip')
    expect(tip()?.textContent).toMatch(/^11-1[89]/)
    for (let step = 0; step < 2 && !tip()?.textContent?.startsWith('11-19'); step += 1)
      await act(async () => {
        fireEvent.keyDown(svg, { key: 'ArrowRight' })
        await settle()
      })
    expect(tip()?.textContent).toContain('11-19')
    expect(tip()?.textContent).toContain('输出：45')
    expect(tip()?.textContent).toContain(`输入：${UNKNOWN_TEXT}`)
    expect(tip()?.querySelector('[aria-label="未知"]')).not.toBeNull()
    expect(tip()?.querySelector('.omne-chart-swatch.omne-chart-color-2')).not.toBeNull()
    expect(container.querySelector('.omne-chart-cursor')).not.toBeNull()
    expect(colorsOf(container).filter(value => /#[0-9a-f]{3,8}\b|rgb\(/i.test(value))).toEqual([])
    await act(async () => {
      fireEvent.blur(svg)
      await settle()
    })
    expect(tip()).toBeNull()
  })

  it('gives the same data as a table, with an unknown cell written as unknown', async () => {
    const { container } = render(<Chart label="按天的 token" series={series} rows={rows} />)
    await settle()
    const cells = [...container.querySelectorAll('.omne-chart-table tbody tr')].map(row =>
      [...row.children].map(cell => cell.textContent),
    )
    expect(cells).toEqual([
      ['11-18', '1,200', '30'],
      ['11-19', UNKNOWN_TEXT, '45'],
    ])
    const heads = container.querySelectorAll('.omne-chart-table thead th')
    expect([...heads].map(cell => cell.textContent)).toEqual(['输入', '输出'])
    expect(container.querySelector('.omne-chart-table [aria-label="未知"]')).not.toBeNull()
  })

  it('says there is no data for no rows, says nothing is usable when all are unknown, and draws one row', async () => {
    const none = render(<Chart label="空" series={series} rows={[]} />)
    expect(none.container.querySelector('figure')?.dataset['state']).toBe('empty')
    expect(none.container.querySelector('svg')).toBeNull()
    expect(none.container.textContent).toContain('这段时间没有数据')
    expect(none.container.querySelector('.omne-chart-table')).toBeNull()
    const noSeries = render(<Chart label="空" series={[]} rows={rows} />)
    expect(noSeries.container.querySelector('figure')?.dataset['state']).toBe('empty')
    noSeries.unmount()
    const sparseRows = [
      { label: '11-17', values: { input: null, output: null } },
      { label: '11-18', values: { input: 5, output: null } },
      { label: '11-19', values: { input: null, output: 7 } },
    ]
    const sparse = render(<Chart label="稀疏" series={series} rows={sparseRows} />)
    expect(sparse.container.querySelector('figure')?.dataset['state']).toBe('drawn')
    sparse.unmount()
    none.unmount()
    const unknown = render(
      <Chart
        label="未知"
        series={series}
        rows={[{ label: '11-19', values: { input: null, output: null } }]}
      />,
    )
    expect(unknown.container.querySelector('figure')?.dataset['state']).toBe('unknown')
    expect(unknown.container.querySelector('svg')).toBeNull()
    expect(unknown.container.textContent).toContain('没有可用的数')
    expect(unknown.container.querySelector('.omne-chart-table')).not.toBeNull()
    unknown.unmount()
    const one = render(<Chart label="一个" series={series} rows={[rows[0]!]} />)
    await settle()
    expect(one.container.querySelector('figure')?.dataset['state']).toBe('drawn')
    expect(one.container.querySelector('svg.recharts-surface')).not.toBeNull()
  })
})

describe('the share bar', () => {
  const parts = [
    { key: 'a', label: '模型 A', value: 3 },
    { key: 'z', label: '模型 Z', value: 0 },
    { key: 'b', label: '模型 B', value: 1 },
    { key: 'c', label: '模型 C', value: null },
  ]

  it('splits the known parts in proportion, each a focusable segment, and counts the unknown apart', () => {
    const { container } = render(<ShareBar label="按模型" parts={parts} />)
    const segments = [...container.querySelectorAll('rect')]
    expect(segments.map(rect => Number(rect.getAttribute('width')))).toEqual([75, 25])
    expect(segments.map(rect => Number(rect.getAttribute('x')))).toEqual([0, 75])
    expect(segments.map(rect => rect.getAttribute('class'))).toEqual([
      'omne-chart-mark omne-chart-color-1',
      'omne-chart-mark omne-chart-color-3',
    ])
    const table = [...container.querySelectorAll('.omne-chart-table tr')].map(row =>
      [...row.children].map(cell => cell.textContent),
    )
    expect(table).toEqual([
      ['模型 A', '3', '75%'],
      ['模型 Z', '0', '0%'],
      ['模型 B', '1', '25%'],
      ['模型 C', UNKNOWN_TEXT, UNKNOWN_TEXT],
    ])
    const swatch = '.omne-share-legend .omne-chart-swatch.omne-chart-color-3'
    expect(container.querySelector(swatch)).not.toBeNull()
    expect(segments.map(rect => rect.getAttribute('tabindex'))).toEqual(['0', '0'])
    expect(segments[0]?.getAttribute('aria-label')).toBe('模型 A 3（75%）')
    expect(container.textContent).toContain('未知 1 项')
    cleanup()
    const known = render(<ShareBar label="按模型" parts={parts.slice(0, 3)} />).container
    expect(known.textContent).not.toContain('未知')
    expect(colorsOf(container).every(value => value === 'currentColor')).toBe(true)
  })

  it('is empty with no parts or only zeros, and unknown when every part is unknown', () => {
    for (const none of [[], [{ key: 'a', label: 'A', value: 0 }]])
      expect(
        render(<ShareBar label="空" parts={none} />).container.querySelector('figure')?.dataset[
          'state'
        ],
      ).toBe('empty')
    expect(
      render(
        <ShareBar label="未知" parts={[{ key: 'a', label: 'A', value: null }]} />,
      ).container.querySelector('figure')?.dataset['state'],
    ).toBe('unknown')
  })
})

describe('the reading meter', () => {
  it('is a meter with its value, the mark and a caption, and fills to the end past one hundred', () => {
    const { container } = render(
      <ReadingMeter label="上下文" percent={42.5} mark={80} caption="截至上一次请求" />,
    )
    const meter = container.querySelector('[role="meter"]')
    expect(meter?.getAttribute('aria-valuenow')).toBe('42.5')
    expect(meter?.getAttribute('aria-valuetext')).toBe('42.5%')
    expect(container.querySelector('.omne-meter')?.getAttribute('data-state')).toBe('drawn')
    expect(container.querySelector('.omne-meter-mark')?.getAttribute('x')).toBe('79.5')
    expect(container.textContent).toContain('42.5%')
    expect(container.textContent).toContain('截至上一次请求')
    cleanup()
    const over = render(<ReadingMeter label="上下文" percent={130} />).container
    expect(over.querySelector('.omne-meter')?.getAttribute('data-state')).toBe('over')
    expect(over.querySelectorAll('rect')[1]?.getAttribute('width')).toBe('100')
    expect(over.textContent).toContain('130%')
    expect(over.querySelector('.omne-meter-mark')).toBeNull()
    expect(over.querySelector('.omne-meter-caption')).toBeNull()
    cleanup()
    const full = render(<ReadingMeter label="上下文" percent={100} />).container
    expect(full.querySelector('.omne-meter')?.getAttribute('data-state')).toBe('drawn')
  })

  it('draws no bar for an unknown value and says why', () => {
    const { container } = render(
      <ReadingMeter label="上下文" percent={null} unknownReason="用量未知" />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toContain(UNKNOWN_TEXT)
    expect(container.textContent).toContain('用量未知')
    cleanup()
    const bare = render(<ReadingMeter label="上下文" percent={null} />).container
    expect(bare.querySelector('.omne-meter-caption')).toBeNull()
  })
})

describe('the sparkline and the stat block', () => {
  it('breaks the line at an unknown point instead of dropping to zero, and reads the values out', () => {
    const { container } = render(<Sparkline label="每小时" values={[1, 3, null, 2, 4]} />)
    const paths = [...container.querySelectorAll('path')].map(path => path.getAttribute('d'))
    expect(paths).toEqual(['M0.00,20.00L25.00,6.67', 'M75.00,13.33L100.00,0.00'])
    const spark = container.querySelector('svg')?.getAttribute('class')
    expect(spark).toBe('omne-spark omne-chart-mark omne-chart-color-1')
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      '每小时：1、3、未知、2、4',
    )
    cleanup()
    const dOf = (root: Element) =>
      [...root.querySelectorAll('path')].map(path => path.getAttribute('d'))
    expect(dOf(render(<Sparkline label="一个" values={[5]} />).container)).toEqual([
      'M0.00,20.00h0.01',
    ])
    cleanup()
    const flat = render(<Sparkline label="平" values={[3, 3]} />).container
    expect(dOf(flat)).toEqual(['M0.00,20.00L100.00,20.00'])
    cleanup()
    const edges = render(<Sparkline label="两头未知" values={[null, 1, 2, null]} />).container
    expect(dOf(edges)).toEqual(['M33.33,20.00L66.67,0.00'])
    cleanup()
    for (const [values, state] of [
      [[], 'empty'],
      [[null, null], 'unknown'],
    ] as const) {
      const none = render(<Sparkline label="空" values={values} />).container
      expect(none.querySelector('svg')).toBeNull()
      expect(none.querySelector('.omne-spark')?.getAttribute('data-state')).toBe(state)
      expect(none.querySelector('.omne-spark')?.getAttribute('aria-label')).toBe('空：没有可用的数')
      cleanup()
    }
  })

  it('shows a value or the unknown dash, with its label and detail', () => {
    const { container } = render(
      <StatBlock label="费用" value={formatAmount('0.0123', 'USD')} detail="2 笔未知" />,
    )
    expect(container.textContent).toBe('费用0.0123 USD2 笔未知')
    cleanup()
    const bare = render(<StatBlock label="费用" value={null} />).container
    expect(bare.textContent).toBe(`费用${UNKNOWN_TEXT}`)
    expect(bare.querySelector('.omne-stat-detail')).toBeNull()
  })
})
