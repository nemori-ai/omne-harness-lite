// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  createUsageUiModule,
  memoryLayoutStore,
  usageExampleModule,
  usagePresentation,
} from '../src/cordis.tsx'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage, measures, result } from './fixtures/fake-usage.ts'
import { startShell } from './fixtures/reference-shell.tsx'

beforeAll(stubDom)
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 20))
  })
const unknownSum = { known: '0', unknown: 2, provisional: 0 }

async function summaryOf(total: ReturnType<typeof measures>) {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  const answer = { ...result(['source']), total, groups: [] }
  root.reflect.provide(
    'protocol:usage/v1',
    fakeUsage(() => ({ outcome: 'succeeded', body: answer })).client,
  )
  const store = memoryLayoutStore({
    tenant: [{ widget: 'usage.summary', width: 3, presentation: null }],
  })
  await root.plugin(createUsageUiModule({ store }))
  render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
  await settle()
  return [...document.querySelectorAll('.omne-stat')].map(stat => stat.textContent)
}

describe('the summary widget writes what is unknown as unknown, never as zero', () => {
  it('reads the known figures', async () => {
    expect(await summaryOf(measures(1))).toEqual([
      '费用0.0123 USD1 笔未知',
      'Token（输入与输出）1,200',
      '模型请求0',
      '缓存命中率25%',
      '首字延迟（中位）310 毫秒',
    ])
  })

  it('writes unknown for a cost with no known sum, tokens all unknown, an unknown ratio and no latency', async () => {
    const base = measures(1)
    const figures = await summaryOf({
      ...base,
      tokens: { ...base.tokens, input: unknownSum, output: unknownSum },
      cost: { sums: [], unknown: 2 },
      rates: { ...base.rates, cacheHit: { kind: 'unknown' } },
      duration: { ...base.duration, toFirstContent: { count: 0, p50: null, p90: null } },
    })
    expect(figures).toEqual([
      '费用—2 笔未知',
      'Token（输入与输出）—',
      '模型请求0',
      '缓存命中率—',
      '首字延迟（中位）—',
    ])
  })

  it('writes a zero cost when nothing was payable and nothing is unknown, and joins two units', async () => {
    const base = measures(1)
    expect((await summaryOf({ ...base, cost: { sums: [], unknown: 0 } }))[0]).toBe('费用0 USD')
    cleanup()
    const two = {
      sums: [
        { unit: 'USD', known: '1.5' },
        { unit: 'CNY', known: '2' },
        { unit: 'EUR', known: '0' },
      ],
      unknown: 0,
    }
    expect((await summaryOf({ ...base, cost: two }))[0]).toBe('费用1.5 USD + 2 CNY')
  })
})

it('the example presentation draws a sparkline a series long, an unknown point left out of the line', async () => {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  await root.plugin(usageExampleModule)
  const drawn = render(
    <>
      {usagePresentation.slot(
        shell,
        'series',
        {
          series: [{ key: 'a', label: 'A' }],
          rows: [
            { label: '1', values: { a: 2 } },
            { label: '2', values: { a: null } },
            { label: '3', values: {} },
          ],
        },
        entries => entries.find(entry => entry.id === 'example.sparklines')?.node,
      )}
    </>,
  )
  expect(drawn.container.querySelector('figcaption')?.textContent).toBe('（示例画法）')
  expect(drawn.container.querySelector('.omne-spark')?.getAttribute('aria-label')).toBe(
    'A：2、未知、未知',
  )
  expect(drawn.container.querySelector('li')?.textContent).toBe('A—')
})
