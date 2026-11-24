// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { AssetRowView } from '@omne-harness/assets-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { AttachedEntry, AttachedLayout } from '@omne-harness/shell-contract'
import { useEffect, type ReactNode } from 'react'
import { CATEGORIES_POINT, createCategoryNames } from '../src/model/category-names.ts'
import { AssetsPage, createGovernance, type GovernanceModel } from '../src/index.ts'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'
import { fakeKeys, type FakeKeys } from './fixtures/server-keys.ts'

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

const mounted: string[] = []

function Contributed({ id }: { readonly id: string }) {
  useEffect(() => {
    mounted.push(`+${id}`)
    return () => {
      mounted.push(`-${id}`)
    }
  }, [id])
  return <p>{`${id} 自己的页面`}</p>
}

const entry = (id: string, label?: string): AttachedEntry => ({
  id,
  label,
  node: <Contributed id={id} />,
})

const pagesOf =
  (entries: readonly AttachedEntry[]) =>
  (layout: AttachedLayout): ReactNode =>
    layout(entries)

type Setup = Readonly<{
  fake: FakeClient
  governance: GovernanceModel
  show: (entries: readonly AttachedEntry[]) => void
}>

function serveSettings(fake: FakeClient): void {
  void (async () => {
    for (;;)
      (await fake.next('list-settings')).answer({
        outcome: 'succeeded',
        body: { items: [], next: null, completeness: 'complete' },
      })
  })()
}

const categoryItem = ([category, title]: readonly [string, string]) => ({
  category,
  title,
  summary: '',
  creation: 'none',
})

async function opened(
  categories: readonly (readonly [string, string])[],
  entries: readonly AttachedEntry[],
  rows: readonly AssetRowView[] = [],
): Promise<Setup> {
  mounted.length = 0
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, rows)
  const governance = createGovernance({ client: fake.client })
  const names = createCategoryNames(fake.client)
  const element = (shown: readonly AttachedEntry[]) => (
    <AssetsPage
      governance={governance}
      tenant={TENANT}
      categoryNames={names}
      pages={pagesOf(shown)}
    />
  )
  const view = render(element(entries))
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: { items: categories.map(categoryItem), next: null },
  })
  await settle()
  return { fake, governance, show: shown => view.rerender(element(shown)) }
}

const tabs = () => within(screen.getByRole('tablist', { name: '资产的类别' }))
const tabTexts = () =>
  tabs()
    .getAllByRole('tab')
    .map(tab => tab.textContent)
const selected = () =>
  tabs()
    .getAllByRole('tab')
    .filter(tab => tab.getAttribute('aria-selected') === 'true')
    .map(tab => tab.textContent)

it('A0 类别的列表还在读、也没有贡献的页面：说正在读，不说没有资产', async () => {
  const fake = createFakeClient()
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={createCategoryNames(fake.client)}
    />,
  )
  await fake.next('list-categories')
  expect(screen.getByText('正在读取资产……')).toBeTruthy()
  expect(screen.queryByText(/还没有可以管的资产/)).toBeNull()
})

it('A9 类别按标识的码元序排，和列表里的先后无关', async () => {
  await opened(
    [
      ['c-cat', 'c-cat'],
      ['a-cat', 'a-cat'],
      ['b-cat', 'b-cat'],
    ],
    [],
  )
  expect(tabTexts()).toEqual(['a-cat', 'b-cat', 'c-cat'])
  const marked = tabs()
    .getAllByRole('tab')
    .map(tab => tab.getAttribute('data-active'))
  expect(marked).toEqual(['true', 'false', 'false'])
})

it('A10 换租户：按新租户另读一份，旧租户迟到的答复不算数', async () => {
  const fake = createFakeClient()
  serveSettings(fake)
  const governance = createGovernance({ client: fake.client })
  const names = namesOf({ tool: '工具' })
  const other = TENANT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002')
  const view = render(<AssetsPage governance={governance} tenant={TENANT} categoryNames={names} />)
  const first = await fake.next('list-assets')
  view.rerender(<AssetsPage governance={governance} tenant={other} categoryNames={names} />)
  const second = await fake.next('list-assets')
  expect(second.body).toMatchObject({ tenant: readTenantText(other) })
  const page = (row: AssetRowView) => ({
    outcome: 'succeeded',
    body: { items: [row], next: null, completeness: 'complete' },
  })
  first.answer(page(assetRow('tool', 'shell')))
  await settle()
  expect(screen.queryByRole('listitem', { name: 'shell' })).toBeNull()
  second.answer(page(assetRow('tool', 'files')))
  await settle()
  expect(screen.getByRole('listitem', { name: 'files' })).toBeTruthy()
  expect(screen.queryByRole('listitem', { name: 'shell' })).toBeNull()
})

it('A1 一个页签都没有：写一句说明', async () => {
  await opened([], [])
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.getByText('这一层还没有可以管的资产，也没有类别带来自己的页面。')).toBeTruthy()
})

it('A2 页签是贡献的页面与类别列表的并集：贡献的照外壳排好的次序在前，其余按标识；同名的只有一个页签', async () => {
  await opened(
    [
      ['tool', '工具'],
      ['model-provider', 'model-provider'],
      ['mcp', 'mcp'],
    ],
    [entry('mcp', 'MCP')],
    [assetRow('mcp', 'context7')],
  )
  expect(tabTexts()).toEqual(['MCP', 'model-provider', '工具'])
  expect(selected()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
  expect(screen.queryByRole('listitem', { name: 'context7' })).toBeNull()
})

it('A2b 一类还没有任何资产时也有页签，页面写这一类还没有资产', async () => {
  await opened([['skill', '技能']], [])
  expect(tabTexts()).toEqual(['技能'])
  await settle()
  expect(screen.getByText('这一类还没有资产。')).toBeTruthy()
})

it('A3 放进一项而原来一个都没有：它成为选中的', async () => {
  const { show } = await opened([], [])
  show([entry('mcp', 'MCP')])
  expect(selected()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
})

it('A4 点一个页签：选中它；原来选中的贡献页面藏起来，不卸下', async () => {
  await opened([['tool', '工具']], [entry('mcp', 'MCP')], [assetRow('tool', 'shell')])
  expect(mounted).toEqual(['+mcp'])
  fireEvent.click(tabs().getByRole('tab', { name: '工具' }))
  await settle()
  await settle()
  expect(selected()).toEqual(['工具'])
  expect(screen.getByRole('listitem', { name: 'shell' })).toBeTruthy()
  const mcpPanel = screen.getByText('mcp 自己的页面').closest('[role=tabpanel]')!
  expect(mcpPanel.hasAttribute('hidden')).toBe(true)
  expect(mounted).toEqual(['+mcp'])
  fireEvent.click(tabs().getByRole('tab', { name: 'MCP' }))
  expect(mcpPanel.hasAttribute('hidden')).toBe(false)
  expect(mounted).toEqual(['+mcp'])
})

it('A5 撤下没选中的一项：选中的不变', async () => {
  const { show } = await opened([['tool', '工具']], [entry('mcp', 'MCP'), entry('skill', 'Skill')])
  fireEvent.click(tabs().getByRole('tab', { name: 'Skill' }))
  show([entry('skill', 'Skill')])
  expect(tabTexts()).toEqual(['Skill', '工具'])
  expect(selected()).toEqual(['Skill'])
})

it('A6 撤下选中的一项：选中的改成剩下的里次序最前的；一个都不剩时写说明', async () => {
  const { show } = await opened([], [entry('mcp', 'MCP'), entry('skill', 'Skill')])
  fireEvent.click(tabs().getByRole('tab', { name: 'Skill' }))
  show([entry('mcp', 'MCP')])
  expect(selected()).toEqual(['MCP'])
  show([])
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.getByText('这一层还没有可以管的资产，也没有类别带来自己的页面。')).toBeTruthy()
})

it('A7 点过的页签刚被撤下：这次点击不留下作用，选中的是剩下的里次序最前的；它再回来时也不自动选中它', async () => {
  const { show } = await opened([], [entry('mcp', 'MCP'), entry('skill', 'Skill')])
  fireEvent.click(tabs().getByRole('tab', { name: 'Skill' }))
  show([entry('mcp', 'MCP')])
  expect(selected()).toEqual(['MCP'])
  fireEvent.click(tabs().getByRole('tab', { name: 'MCP' }))
  show([entry('mcp', 'MCP'), entry('skill', 'Skill')])
  expect(selected()).toEqual(['MCP'])
})

it('A8 类别的列表读不出：照实说并给「重试」；贡献的页面照样在；重试读到了就有页签', async () => {
  mounted.length = 0
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, [])
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={createCategoryNames(fake.client)}
      pages={pagesOf([entry('mcp', 'MCP')])}
    />,
  )
  ;(await fake.next('list-categories')).answer({ outcome: 'basis-unavailable' })
  await settle()
  expect(screen.getByRole('alert').textContent).toContain('服务端暂时读不出需要的依据')
  expect(tabTexts()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: { items: [categoryItem(['tool', '工具'])], next: null },
  })
  await settle()
  expect(tabTexts()).toEqual(['MCP', '工具'])
  expect(screen.queryByRole('alert')).toBeNull()
})

type Pair = readonly [string, string]

const listed = (pairs: readonly Pair[]) => ({
  outcome: 'succeeded',
  body: { items: pairs.map(categoryItem), next: null },
})

const categoryReads = (fake: FakeClient): number =>
  fake.calls.filter(call => call.operation === 'list-categories').length

/** The page open on a server that tells the keys of its categories point. */
async function following(first: readonly Pair[]): Promise<{ fake: FakeClient; keys: FakeKeys }> {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, [])
  const keys = fakeKeys()
  keys.set(
    CATEGORIES_POINT,
    first.map(([category]) => category),
  )
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={createCategoryNames(fake.client, keys.source)}
    />,
  )
  ;(await fake.next('list-categories')).answer(listed(first))
  await settle()
  return { fake, keys }
}

it('K1 页面开着，服务端多了一个类别：重读一次，页签多出来，中间不说正在读，选中的不变', async () => {
  const { fake, keys } = await following([['tool', '工具']])
  expect(tabTexts()).toEqual(['工具'])
  await act(async () => keys.set(CATEGORIES_POINT, ['skill', 'tool']))
  const again = await fake.next('list-categories')
  expect(screen.queryByText('正在读取资产……')).toBeNull()
  expect(tabTexts()).toEqual(['工具'])
  again.answer(
    listed([
      ['skill', '技能'],
      ['tool', '工具'],
    ]),
  )
  await settle()
  expect(tabTexts()).toEqual(['技能', '工具'])
  expect(selected()).toEqual(['工具'])
  expect(categoryReads(fake)).toBe(2)
})

it('K2 页面开着，服务端少了一个类别：重读一次，页签少掉', async () => {
  const { fake, keys } = await following([
    ['skill', '技能'],
    ['tool', '工具'],
  ])
  expect(tabTexts()).toEqual(['技能', '工具'])
  await act(async () => keys.set(CATEGORIES_POINT, ['tool']))
  ;(await fake.next('list-categories')).answer(listed([['tool', '工具']]))
  await settle()
  expect(tabTexts()).toEqual(['工具'])
  expect(categoryReads(fake)).toBe(2)
})

it('K3 那条观察来了别的变化，类别的键没变：不重读', async () => {
  const { fake, keys } = await following([['tool', '工具']])
  await act(async () => {
    keys.touch()
    keys.set('some.other-point', ['x'])
    keys.set(CATEGORIES_POINT, ['tool'])
  })
  await settle()
  expect(categoryReads(fake)).toBe(1)
})

it('K4 连着变两次，先发的重读后到：以后发的那一次为准', async () => {
  const { fake, keys } = await following([['tool', '工具']])
  await act(async () => keys.set(CATEGORIES_POINT, ['skill', 'tool']))
  const first = await fake.next('list-categories')
  await act(async () => keys.set(CATEGORIES_POINT, ['mcp', 'skill', 'tool']))
  const second = await fake.next('list-categories')
  second.answer(
    listed([
      ['mcp', 'MCP'],
      ['skill', '技能'],
      ['tool', '工具'],
    ]),
  )
  await settle()
  first.answer(
    listed([
      ['skill', '技能'],
      ['tool', '工具'],
    ]),
  )
  await settle()
  expect(tabTexts()).toEqual(['MCP', '技能', '工具'])
})

it('K5 页面关了就不再跟：没有订阅留下，之后的变化不发调用', async () => {
  const { fake, keys } = await following([['tool', '工具']])
  expect(keys.listeners()).toBe(1)
  cleanup()
  expect(keys.listeners()).toBe(0)
  keys.set(CATEGORIES_POINT, ['skill', 'tool'])
  await settle()
  expect(categoryReads(fake)).toBe(1)
})

it('K6 点过的类别在一次重读失败时不在栏里，重试读到之后回到它，不停在回落的那一项', async () => {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, [])
  const keys = fakeKeys()
  keys.set(CATEGORIES_POINT, ['tool'])
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={createCategoryNames(fake.client, keys.source)}
      pages={pagesOf([entry('mcp', 'MCP')])}
    />,
  )
  ;(await fake.next('list-categories')).answer(listed([['tool', '工具']]))
  await settle()
  fireEvent.click(tabs().getByRole('tab', { name: '工具' }))
  expect(selected()).toEqual(['工具'])
  await act(async () => keys.set(CATEGORIES_POINT, ['skill', 'tool']))
  ;(await fake.next('list-categories')).answer({ outcome: 'basis-unavailable' })
  await settle()
  expect(tabTexts()).toEqual(['MCP'])
  expect(selected()).toEqual(['MCP'])
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  ;(await fake.next('list-categories')).answer(
    listed([
      ['skill', '技能'],
      ['tool', '工具'],
    ]),
  )
  await settle()
  expect(selected()).toEqual(['工具'])
})

it('A12 外壳指到一类时选中它（不进任何一份的页）；指到另一类时跟着换；人点过之后不再指时，留在人点的那一类', async () => {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, [assetRow('tool', 'shell')])
  const governance = createGovernance({ client: fake.client })
  const names = createCategoryNames(fake.client)
  const element = (pointAt?: string) => (
    <AssetsPage
      governance={governance}
      tenant={TENANT}
      categoryNames={names}
      {...(pointAt === undefined ? {} : { pointAt })}
    />
  )
  const view = render(element('tool'))
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: {
      items: [categoryItem(['model-provider', '模型供应商']), categoryItem(['tool', '工具'])],
      next: null,
    },
  })
  await settle()
  expect(selected()).toEqual(['工具'])
  expect(document.querySelector('.assets-asset')).toBeNull()
  view.rerender(element('model-provider'))
  await settle()
  expect(selected()).toEqual(['模型供应商'])
  fireEvent.click(tabs().getByRole('tab', { name: '工具' }))
  view.rerender(element())
  await settle()
  expect(selected()).toEqual(['工具'])
})
