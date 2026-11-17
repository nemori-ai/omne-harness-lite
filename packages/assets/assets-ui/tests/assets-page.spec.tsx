// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { SettingView } from '@omne-harness/assets-protocol'
import type { AttachedEntry, AttachedLayout } from '@omne-harness/shell-contract'
import { useEffect, type ReactNode } from 'react'
import { AssetsPage, createGovernance, type GovernanceModel } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { permissionView } from './fixtures/views.ts'

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

const held = (category: string, name: string): SettingView =>
  permissionView({ asset: { category, name } })

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

async function opened(
  items: readonly SettingView[],
  entries: readonly AttachedEntry[],
): Promise<Setup> {
  mounted.length = 0
  const fake = createFakeClient()
  const governance = createGovernance({ client: fake.client })
  const labels = { tool: '工具' }
  const element = (shown: readonly AttachedEntry[]) => (
    <AssetsPage
      governance={governance}
      tenant={TENANT}
      categoryLabels={labels}
      pages={pagesOf(shown)}
    />
  )
  const view = render(element(entries))
  ;(await fake.next('list-settings')).answer({
    outcome: 'succeeded',
    body: { items, next: null, completeness: 'complete' },
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

it('A1 一个页签都没有：写一句说明', async () => {
  await opened([], [])
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.getByText('这一层还没有可以管的资产，也没有类别带来自己的页面。')).toBeTruthy()
})

it('A2 页签是贡献的页面与数据里的类别的并集：贡献的照外壳排好的次序在前，只有数据的按标识；同名的只有一个页签', async () => {
  await opened(
    [held('tool', 'shell'), held('model-provider', 'openai'), held('mcp', 'context7')],
    [entry('mcp', 'MCP')],
  )
  expect(tabTexts()).toEqual(['MCP', 'model-provider', '工具'])
  expect(selected()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
  expect(screen.queryByRole('heading', { level: 3, name: 'context7' })).toBeNull()
})

it('A3 放进一项而原来一个都没有：它成为选中的', async () => {
  const { show } = await opened([], [])
  show([entry('mcp', 'MCP')])
  expect(selected()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
})

it('A4 点一个页签：选中它；原来选中的贡献页面藏起来，不卸下', async () => {
  await opened([held('tool', 'shell')], [entry('mcp', 'MCP')])
  expect(mounted).toEqual(['+mcp'])
  fireEvent.click(tabs().getByRole('tab', { name: '工具' }))
  expect(selected()).toEqual(['工具'])
  expect(screen.getByRole('heading', { level: 3, name: 'shell' })).toBeTruthy()
  const mcpPanel = screen.getByText('mcp 自己的页面').closest('[role=tabpanel]')!
  expect(mcpPanel.hasAttribute('hidden')).toBe(true)
  expect(mounted).toEqual(['+mcp'])
  fireEvent.click(tabs().getByRole('tab', { name: 'MCP' }))
  expect(mcpPanel.hasAttribute('hidden')).toBe(false)
  expect(mounted).toEqual(['+mcp'])
})

it('A5 撤下没选中的一项：选中的不变', async () => {
  const { show } = await opened(
    [held('tool', 'shell')],
    [entry('mcp', 'MCP'), entry('skill', 'Skill')],
  )
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

it('A8 列表读不出：照实说并给「重试」；贡献的页面照样在', async () => {
  mounted.length = 0
  const fake = createFakeClient()
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      pages={pagesOf([entry('mcp', 'MCP')])}
    />,
  )
  ;(await fake.next('list-settings')).answer({ outcome: 'unavailable' })
  await settle()
  expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  expect(tabTexts()).toEqual(['MCP'])
  expect(screen.getByText('mcp 自己的页面')).toBeTruthy()
})
