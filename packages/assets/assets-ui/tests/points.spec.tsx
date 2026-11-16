// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { assetsProtocol, type SettingView } from '@omne-harness/assets-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import {
  ASSETS_CATEGORY,
  ASSETS_HOLDING,
  assetsCategory,
  assetsHolding,
  createAssetsUiModule,
} from '../src/cordis.tsx'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'
import { ordinaryView, permissionView, secretView } from './fixtures/views.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SERVICE = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function shown(items: readonly SettingView[], contribute: (ctx: Context) => void) {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(createAssetsUiModule({ categoryLabels: { tool: '工具', model: '模型' } }))
  await root.plugin({ name: 'contributor', inject: ['shell'], apply: contribute })
  shell.tenant = TENANT
  const page = shell.items('pages')[0]!
  render(<>{page.render({ scope: TENANT })}</>)
  ;(await fake.next('list-settings')).answer({
    outcome: 'succeeded',
    body: { items, next: null, completeness: 'complete' },
  })
  await settle()
  return shell
}

const block = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest<HTMLElement>('section')!
const rail = () => within(screen.getByRole('navigation', { name: '设置分组' }))

it('两个拓展点的名字：assets.category 与 assets.holding', () => {
  expect(ASSETS_CATEGORY).toBe('assets.category')
  expect(ASSETS_HOLDING).toBe('assets.holding')
  expect(assetsCategory.name).toBe(ASSETS_CATEGORY)
  expect(assetsHolding.name).toBe(ASSETS_HOLDING)
})

it('往一个类别的 assets.holding 下放的项，出现在这一类每一份资产的块里，收到类别、名字与租户', async () => {
  await shown([permissionView(), ordinaryView(), secretView()], ctx =>
    assetsHolding.contribute(ctx.shell, 'tool', {
      id: 'status',
      order: 0,
      render: ({ scope, subject }) => (
        <p data-holding={subject.name}>{`${subject.category}/${subject.name}|${scope}`}</p>
      ),
    }),
  )
  expect(within(block('shell')).getByText(`tool/shell|${TENANT}`)).toBeTruthy()
  expect(within(block('files')).getByText(`tool/files|${TENANT}`)).toBeTruthy()
  expect(block('openai').querySelector('[data-holding]')).toBeNull()
  expect(document.querySelectorAll('[data-holding]')).toHaveLength(2)
})

it('往一个类别的 assets.category 下放的项，只在选中这一类时出现在这一类的上方，收到类别', async () => {
  await shown([permissionView(), secretView()], ctx =>
    assetsCategory.contribute(ctx.shell, 'model', {
      id: 'create',
      order: 0,
      render: ({ subject }) => <p data-category-item="">{`新建一个${subject.category}`}</p>,
    }),
  )
  expect(document.querySelector('[data-category-item]')).toBeNull()
  fireEvent.click(rail().getByRole('button', { name: /工具/ }))
  expect(document.querySelector('[data-category-item]')).toBeNull()
  fireEvent.click(rail().getByRole('button', { name: /模型/ }))
  const item = document.querySelector<HTMLElement>('[data-category-item]')
  expect(item?.textContent).toBe('新建一个model')
  const firstBlock = block('openai')
  expect(item!.compareDocumentPosition(firstBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('贡献可以先于它的类别放进去：列表里没有这一类时它不出现，留在存放里，也不影响别的类', async () => {
  const shell = await shown([permissionView()], ctx => {
    assetsHolding.contribute(ctx.shell, 'not-installed', {
      id: 'early',
      order: 0,
      render: () => <p data-early="">早到的一项</p>,
    })
    assetsCategory.contribute(ctx.shell, 'not-installed', {
      id: 'early',
      order: 0,
      render: () => <p data-early="">早到的一项</p>,
    })
  })
  expect(document.querySelector('[data-early]')).toBeNull()
  expect(
    shell
      .items('attached')
      .map(item => item.anchor)
      .sort(),
  ).toEqual(['assets.category:not-installed', 'assets.holding:not-installed'])
  expect(
    rail()
      .getAllByRole('button')
      .map(button => button.textContent),
  ).toEqual(['全部1', '工具1'])
  expect(block('shell')).toBeTruthy()
})

it('对象编成文本再解回来不走样：名字里带冒号与数字也一样；读不懂的文本不画这一项', async () => {
  const tricky = secretView({ asset: { category: '12:ab', name: ':7:x' } })
  const { root, shell } = await startShell()
  root.reflect.provide(SERVICE, createFakeClient().client)
  await root.plugin(createAssetsUiModule())
  const received: unknown[] = []
  await root.plugin({
    name: 'contributor',
    inject: ['shell'],
    apply(ctx: Context) {
      assetsHolding.contribute(ctx.shell, tricky.asset.category, {
        id: 'echo',
        order: 0,
        render: ({ subject }) => {
          received.push(subject)
          return 'echo'
        },
      })
    },
  })
  const nodes = (text: string) => {
    let seen: readonly unknown[] = []
    shell.arranged(`${ASSETS_HOLDING}:${tricky.asset.category}`, text, entries => {
      seen = entries.map(entry => entry.node)
      return null
    })
    return seen
  }
  let viaPoint: readonly unknown[] = []
  assetsHolding.slot(shell, tricky.asset.category, tricky.asset, entries => {
    viaPoint = entries.map(entry => entry.node)
    return null
  })
  expect(viaPoint).toEqual(['echo'])
  expect(received).toEqual([{ category: '12:ab', name: ':7:x' }])
  expect(nodes('5:12:ab:7:x')).toEqual(['echo'])
  expect(received.at(-1)).toEqual({ category: '12:ab', name: ':7:x' })
  expect(nodes('0:')).toEqual(['echo'])
  expect(received.at(-1)).toEqual({ category: '', name: '' })
  expect(nodes('14:model-provideropenrouter')).toEqual(['echo'])
  expect(received.at(-1)).toEqual({ category: 'model-provider', name: 'openrouter' })
  for (const unreadable of ['', 'abc', ':x', '6:ab', 'x5:abcdef', '-1:ab'])
    expect(nodes(unreadable), unreadable).toEqual([null])
})

it('没有贡献时，块里与类别上方没有多出来的元素', async () => {
  await shown([permissionView()], () => undefined)
  fireEvent.click(rail().getByRole('button', { name: /工具/ }))
  expect(document.querySelector('.assets-category-slot')?.childElementCount).toBe(0)
  expect(block('shell').querySelector('.assets-holding-slot')?.childElementCount).toBe(0)
})
