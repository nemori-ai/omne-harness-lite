// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { createUsageUiModule, memoryLayoutStore, usageExampleModule } from '../src/cordis.tsx'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage } from './fixtures/fake-usage.ts'
import { startShell } from './fixtures/reference-shell.tsx'

beforeAll(stubDom)
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 20))
  })

it('draws the widget and the presentation another module brings once the layout chooses them (C29)', async () => {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  root.reflect.provide('protocol:usage/v1', fakeUsage().client)
  const store = memoryLayoutStore({
    tenant: [
      { widget: 'usage.tokens', width: 2, presentation: 'example.sparklines' },
      { widget: 'example.weekdays', width: 1, presentation: null },
    ],
  })
  await root.plugin(createUsageUiModule({ store }))
  const example = await root.plugin(usageExampleModule)
  render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
  await settle()
  const tokens = document.querySelector('.usage-card[data-widget="usage.tokens"]')
  expect(tokens?.querySelector('.usage-example-sparklines')).not.toBeNull()
  expect(tokens?.querySelectorAll('.usage-example-sparklines li')).toHaveLength(5)
  expect(tokens?.querySelector('.recharts-surface')).toBeNull()
  const weekdays = document.querySelector('.usage-card[data-widget="example.weekdays"]')
  expect(weekdays?.textContent).toContain('示例：一周里每天的会话')
  expect(weekdays?.querySelector('.recharts-bar')).not.toBeNull()

  await act(async () => {
    await example.dispose()
  })
  await settle()
  expect(document.querySelector('.usage-card[data-widget="usage.tokens"]')?.textContent).toContain(
    '所选的画法不在了',
  )
  expect(
    document.querySelector('.usage-card[data-widget="example.weekdays"]')?.textContent,
  ).toContain('这张卡片不可用')
})
