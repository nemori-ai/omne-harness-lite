// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { assetsProtocol, type SettingView } from '@omne-harness/assets-protocol'
import {
  ASSETS_CATEGORY,
  ASSETS_HOLDING,
  assetsCategory,
  assetsHolding,
  assetsUiModule,
} from '../src/cordis.tsx'
import { assetsOf, serveAssetReads } from './fixtures/asset-reads.ts'
import { assetPage, backToList, enterAsset } from './fixtures/asset-pages.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'
import { ordinaryView, permissionView, secretView } from './fixtures/views.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

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
  serveAssetReads(fake, assetsOf(items))
  await serveProtocol(root, assetsProtocol, fake.client)
  await root.plugin(assetsUiModule)
  await root.plugin({ name: 'contributor', inject: ['shell'], apply: contribute })
  shell.tenant = TENANT
  const page = shell.items('pages')[0]!
  render(<>{page.render({ scope: TENANT })}</>)
  ;(await fake.next('list-settings')).answer({
    outcome: 'succeeded',
    body: { items, next: null, completeness: 'complete' },
  })
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: {
      items: [
        { category: 'model', title: '模型', summary: '模型。' },
        { category: 'tool', title: '工具', summary: '工具。' },
      ],
      next: null,
    },
  })
  await openListed()
  return shell
}

async function openListed(): Promise<void> {
  await settle()
  await settle()
}

const block = (name: string) => screen.getByRole('listitem', { name })
const tabs = () => within(screen.getByRole('tablist', { name: '资产的类别' }))
async function showTab(label: string): Promise<void> {
  fireEvent.click(tabs().getByRole('tab', { name: label }))
  await openListed()
}

it('两个拓展点的名字：assets.category 与 assets.holding', () => {
  expect(ASSETS_CATEGORY).toBe('assets.category')
  expect(ASSETS_HOLDING).toBe('assets.holding')
  expect(assetsCategory.name).toBe(ASSETS_CATEGORY)
  expect(assetsHolding.name).toBe(ASSETS_HOLDING)
})

it('往一个类别的 assets.holding 下放的项，出现在这一类每一份资产自己的页上，收到类别、名字与租户', async () => {
  await shown([permissionView(), ordinaryView(), secretView()], ctx =>
    assetsHolding.contribute(ctx.shell, 'tool', {
      id: 'status',
      order: 0,
      render: ({ scope, subject }) => (
        <p data-holding={subject.name}>{`${subject.category}/${subject.name}|${scope}`}</p>
      ),
    }),
  )
  await showTab('工具')
  expect(document.querySelectorAll('[data-holding]')).toHaveLength(0)
  expect((await enterAsset('shell')).getByText(`tool/shell|${TENANT}`)).toBeTruthy()
  await backToList()
  expect((await enterAsset('files')).getByText(`tool/files|${TENANT}`)).toBeTruthy()
  expect(document.querySelectorAll('[data-holding]')).toHaveLength(1)
  await showTab('模型')
  await enterAsset('openai')
  expect(assetPage().querySelector('[data-holding]')).toBeNull()
})

it('一项 assets.holding 认领的设置项不在「设置」段里画；这一份的项全被认领时，「设置」段不出现', async () => {
  await shown([permissionView(), ordinaryView(), secretView()], ctx =>
    assetsHolding.contribute(ctx.shell, 'tool', {
      id: 'claims-files',
      order: 0,
      claims: ['max-read-bytes'],
      render: ({ subject }) => <p data-holding={subject.name}>自己画</p>,
    }),
  )
  await showTab('工具')
  const files = await enterAsset('files')
  expect(files.getByText('自己画')).toBeTruthy()
  expect(files.queryByText('一次读取的上限')).toBeNull()
  expect(assetPage().querySelector('#assets-asset-settings')).toBeNull()
  await backToList()
  await enterAsset('shell')
  expect(assetPage().querySelector('#assets-asset-settings')).not.toBeNull()
  await showTab('模型')
  const openai = await enterAsset('openai')
  expect(assetPage().querySelector('#assets-asset-settings')).not.toBeNull()
  expect(openai.queryByText('这一份没有可以改的设置。')).toBeNull()
})

it('往一个类别的 assets.category 下放的项，只在选中这一类时出现在这一类的上方，收到类别', async () => {
  await shown([permissionView(), secretView()], ctx =>
    assetsCategory.contribute(ctx.shell, 'model', {
      id: 'create',
      order: 0,
      render: ({ subject }) => <p data-category-item="">{`新建一个${subject.category}`}</p>,
    }),
  )
  await showTab('工具')
  expect(document.querySelector('[data-category-item]')).toBeNull()
  await showTab('模型')
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
    tabs()
      .getAllByRole('tab')
      .map(tab => tab.textContent),
  ).toEqual(['模型', '工具'])
  await showTab('工具')
  expect(block('shell')).toBeTruthy()
})

it('对象编成文本再解回来不走样：名字里带冒号与数字也一样；读不懂的文本不画这一项', async () => {
  const trickyAsset = { category: '12:ab', name: ':7:x' }
  const { root, shell } = await startShell()
  await serveProtocol(root, assetsProtocol, createFakeClient().client)
  await root.plugin(assetsUiModule)
  const received: unknown[] = []
  await root.plugin({
    name: 'contributor',
    inject: ['shell'],
    apply(ctx: Context) {
      assetsHolding.contribute(ctx.shell, trickyAsset.category, {
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
    shell.arranged(`${ASSETS_HOLDING}:${trickyAsset.category}`, text, entries => {
      seen = entries.map(entry => entry.node)
      return null
    })
    return seen
  }
  let viaPoint: readonly unknown[] = []
  assetsHolding.slot(shell, trickyAsset.category, trickyAsset, entries => {
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
  await showTab('工具')
  expect(document.querySelector('.assets-category-slot')?.childElementCount).toBe(0)
  await enterAsset('shell')
  expect(assetPage().querySelector('.assets-holding-slot')?.childElementCount).toBe(0)
})
