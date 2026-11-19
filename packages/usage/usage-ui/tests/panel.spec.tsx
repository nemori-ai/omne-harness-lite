// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { ShellAssemblyError } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  createUsageUiModule,
  memoryLayoutStore,
  usageWidget,
  type UsageUiOptions,
} from '../src/cordis.tsx'
import type { Layouts } from '../src/index.ts'
import { Present } from '../src/index.ts'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage, type Answer, type Call } from './fixtures/fake-usage.ts'
import { startShell } from './fixtures/reference-shell.tsx'

beforeAll(stubDom)
afterEach(cleanup)

const SERVICE = 'protocol:usage/v1'
const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 20))
  })

async function page(
  options: UsageUiOptions = {},
  answer?: (call: Call) => Answer | undefined,
  extra?: (ctx: Context) => void,
) {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  const fake = fakeUsage(answer)
  root.reflect.provide(SERVICE, fake.client)
  const store = options.store ?? memoryLayoutStore()
  await root.plugin(createUsageUiModule({ ...options, store }))
  if (extra !== undefined) await root.plugin({ name: 'extra', inject: ['shell'], apply: extra })
  render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
  await settle()
  return { shell, fake, store }
}

const widgets = () =>
  [...document.querySelectorAll<HTMLElement>('.usage-card')].map(card => card.dataset['widget'])
const card = (id: string) => document.querySelector<HTMLElement>(`.usage-card[data-widget="${id}"]`)
const click = async (name: string, within?: HTMLElement | null) => {
  const scope = within ?? document.body
  const button = [...scope.querySelectorAll('button')].find(node => node.textContent === name)
  if (button === undefined) throw new Error(`no button ${name}`)
  fireEvent.click(button)
  await settle()
}
const choose = async (label: string, value: string, within?: HTMLElement | null) => {
  const scope = within ?? document.body
  const field = [...scope.querySelectorAll('label')].find(node =>
    node.textContent?.startsWith(label),
  )
  const select = field?.querySelector('select')
  if (select === null || select === undefined) throw new Error(`no field ${label}`)
  fireEvent.change(select, { target: { value } })
  await settle()
}

const DEFAULT = [
  'usage.summary',
  'usage.tokens',
  'usage.by-model',
  'usage.cache',
  'usage.latency',
  'usage.tools',
]

describe('the panel is the charts-first set of widgets in the order of its layout (C28)', () => {
  it('shows the module default, the summary first and charts after it', async () => {
    await page()
    expect(widgets()).toEqual(DEFAULT)
    expect(card('usage.summary')?.textContent).toContain('0.0123 USD')
    expect(card('usage.tokens')?.querySelector('.recharts-bar')).not.toBeNull()
    expect(card('usage.by-model')?.querySelector('.omne-share-bar')).not.toBeNull()
    expect(card('usage.cache')?.querySelector('.recharts-line')).not.toBeNull()
  })

  it('takes the layout the assembly gives when the user has changed nothing', async () => {
    const layouts: Layouts = {
      tenant: [{ widget: 'usage.by-model', width: 3, presentation: 'usage.share-list' }],
    }
    await page({ layouts })
    expect(widgets()).toEqual(['usage.by-model'])
    expect(card('usage.by-model')?.querySelector('.usage-share-list')).not.toBeNull()
  })

  it('edits: moves, removes, adds, resizes and changes the presentation, each saved; resets to the default', async () => {
    const { store } = await page()
    await click('编辑面板')
    await click('下移', card('usage.summary'))
    expect(widgets().slice(0, 2)).toEqual(['usage.tokens', 'usage.summary'])
    await click('上移', card('usage.summary'))
    expect(widgets().slice(0, 2)).toEqual(['usage.summary', 'usage.tokens'])
    await click('去掉', card('usage.tools'))
    expect(widgets()).toEqual(DEFAULT.slice(0, 5))
    await choose('加一张卡片', 'usage.tools')
    expect(widgets()).toEqual(DEFAULT)
    await choose('宽度', '3', card('usage.cache'))
    expect(card('usage.cache')?.dataset['width']).toBe('3')
    await choose('画法', 'usage.area', card('usage.tokens'))
    expect(card('usage.tokens')?.querySelector('.recharts-area')).not.toBeNull()
    expect(card('usage.tokens')?.querySelector('.recharts-bar')).toBeNull()
    expect(store.read().tenant?.find(item => item.widget === 'usage.tokens')).toEqual({
      widget: 'usage.tokens',
      width: 2,
      presentation: 'usage.area',
    })
    await click('恢复缺省')
    expect(widgets()).toEqual(DEFAULT)
    expect(store.read().tenant).toBeUndefined()
    expect(card('usage.tokens')?.querySelector('.recharts-bar')).not.toBeNull()
  })

  it('keeps the first and last widget where they are when moved past the end', async () => {
    await page()
    await click('编辑面板')
    const first = [...(card('usage.summary')?.querySelectorAll('button') ?? [])].find(
      node => node.textContent === '上移',
    )
    expect(first?.hasAttribute('disabled')).toBe(true)
    const last = [...(card('usage.tools')?.querySelectorAll('button') ?? [])].find(
      node => node.textContent === '下移',
    )
    expect(last?.hasAttribute('disabled')).toBe(true)
  })
})

describe('each item of a layout by the rows of T8 (C28)', () => {
  it('a widget no longer registered is a placeholder that can be removed', async () => {
    const store = memoryLayoutStore({
      tenant: [
        { widget: 'gone.widget', width: 1, presentation: null },
        { widget: 'usage.summary', width: 3, presentation: null },
      ],
    })
    await page({ store })
    expect(card('gone.widget')?.textContent).toContain('这张卡片不可用')
    await click('去掉', card('gone.widget'))
    expect(widgets()).toEqual(['usage.summary'])
    expect(store.read().tenant?.map(item => item.widget)).toEqual(['usage.summary'])
  })

  it('a chosen presentation no longer registered gives the default with a note', async () => {
    const store = memoryLayoutStore({
      tenant: [{ widget: 'usage.tokens', width: 2, presentation: 'gone.drawing' }],
    })
    await page({ store })
    expect(card('usage.tokens')?.textContent).toContain('所选的画法不在了')
    expect(card('usage.tokens')?.querySelector('.recharts-bar')).not.toBeNull()
  })

  it('a widget whose declared default is not registered either is a placeholder', async () => {
    const store = memoryLayoutStore({
      tenant: [{ widget: 'test.orphan', width: 1, presentation: null }],
    })
    await page({ store }, undefined, ctx =>
      usageWidget.contribute(ctx.shell, 'tenant', {
        id: 'test.orphan',
        order: 9,
        label: '孤儿',
        render: () => (
          <Present
            shape="series"
            fallback="nobody.draws"
            label="孤儿"
            data={{ series: [], rows: [] }}
          />
        ),
      }),
    )
    expect(card('test.orphan')?.textContent).toContain('这张卡片现在画不出来')
  })

  it('a widget that throws shows its own error and the others draw', async () => {
    const store = memoryLayoutStore({
      tenant: [
        { widget: 'test.broken', width: 1, presentation: null },
        { widget: 'usage.summary', width: 3, presentation: null },
      ],
    })
    const Broken = () => {
      throw new Error('broken widget')
    }
    await page({ store }, undefined, ctx =>
      usageWidget.contribute(ctx.shell, 'tenant', {
        id: 'test.broken',
        order: 9,
        render: () => <Broken />,
      }),
    )
    expect(card('test.broken')?.textContent).toContain('这张卡片出错了')
    expect(card('usage.summary')?.textContent).toContain('0.0123 USD')
  })

  it('two widgets of one id on one position are an assembly error', async () => {
    const { shell } = await page()
    expect(() =>
      usageWidget.contribute(shell, 'tenant', {
        id: 'usage.summary',
        order: 0,
        render: () => null,
      }),
    ).toThrow(ShellAssemblyError)
  })
})

describe('a read that is refused', () => {
  it('says why on the widget and draws no number', async () => {
    await page({}, call => (call.operation === 'query-usage' ? { outcome: 'denied' } : undefined))
    expect(card('usage.summary')?.textContent).toContain('没有权限，或登录已失效。')
    expect(card('usage.tokens')?.querySelector('svg')).toBeNull()
  })

  it('reads again on refresh', async () => {
    const { fake } = await page()
    const before = fake.calls.length
    await click('刷新')
    expect(fake.calls.length).toBeGreaterThan(before)
  })
})
