// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { AttachedEntry, AttachedLayout } from '@omne-harness/shell-contract'
import type { ReactNode } from 'react'
import { createCategoryNames } from '../src/model/category-names.ts'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

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

const DATA = { detail: { kind: 'data', schema: { kind: 'null' } }, hint: null }
const NONE = { detail: { kind: 'none' }, hint: null }

/** The page with `own` bringing its own pane, `creations` saying how each category is made, and `forms` the categories that give a form. */
async function page(
  own: readonly string[],
  creations: Readonly<Record<string, typeof DATA | typeof NONE>>,
  forms: readonly string[],
  rows: Parameters<typeof serveAssetReads>[1] = [],
) {
  const fake = createFakeClient()
  void (async () => {
    for (;;)
      (await fake.next('list-settings')).answer({
        outcome: 'succeeded',
        body: { items: [], next: null, completeness: 'complete' },
      })
  })()
  serveAssetReads(fake, rows, undefined, category => creations[category])
  const entries: AttachedEntry[] = own.map(id => ({
    id,
    label: id.toUpperCase(),
    node: <p>{`${id} 自己的页面`}</p>,
  }))
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={createCategoryNames(fake.client)}
      pages={(layout: AttachedLayout): ReactNode => layout(entries)}
      createFormSlot={(category, generic) =>
        forms.includes(category) ? <p>{`${category} 自己的新建表单`}</p> : generic
      }
    />,
  )
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: {
      items: Object.keys(creations).map(category => ({
        category,
        title: category,
        summary: '',
        creation: 'data',
      })),
      next: null,
    },
  })
  await settle()
}

const panel = (label: string) => within(screen.getByRole('tabpanel', { name: label }))

it('H1 a category with its own page still has its name and 新建 above that page, and 新建 opens the form it gives', async () => {
  await page(['mcp'], { mcp: DATA }, ['mcp'])
  const pane = panel('MCP')
  expect(pane.getByRole('heading', { name: 'MCP' })).toBeTruthy()
  expect(pane.getByText('mcp 自己的页面')).toBeTruthy()
  fireEvent.click(pane.getByRole('button', { name: '新建' }))
  await settle()
  expect(pane.getByText('mcp 自己的新建表单')).toBeTruthy()
  expect(pane.getByRole('button', { name: '收起' })).toBeTruthy()
})

it('H2 a category with its own page and no form of its own gets the generic form under 新建', async () => {
  await page(['plugin'], { plugin: DATA }, [])
  const pane = panel('PLUGIN')
  fireEvent.click(pane.getByRole('button', { name: '新建' }))
  await settle()
  expect(pane.getByLabelText('名字（必填）')).toBeTruthy()
})

it('H3 a category that is not made here has no 新建, with its own page or without, even when it gives a form', async () => {
  await page(['mcp'], { mcp: NONE, note: NONE }, ['mcp', 'note'])
  expect(panel('MCP').queryByRole('button', { name: '新建' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'note' }))
  await settle()
  expect(panel('note').queryByRole('button', { name: '新建' })).toBeNull()
})

it('H4 the generic pane uses the form a category gives, and the generic one when it gives none', async () => {
  await page([], { note: DATA, tool: DATA }, ['tool'])
  fireEvent.click(panel('note').getByRole('button', { name: '新建' }))
  await settle()
  expect(panel('note').getByLabelText('名字（必填）')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'tool' }))
  await settle()
  fireEvent.click(panel('tool').getByRole('button', { name: '新建' }))
  await settle()
  expect(panel('tool').getByText('tool 自己的新建表单')).toBeTruthy()
})

it("H5 the head's generic form says when the name typed is held already: it becomes its new version", async () => {
  await page([], { note: DATA }, [], [assetRow('note', 'docs')])
  fireEvent.click(panel('note').getByRole('button', { name: '新建' }))
  await settle()
  fireEvent.change(panel('note').getByLabelText('名字（必填）'), { target: { value: 'docs' } })
  expect(panel('note').getByText('已有同名的 docs：提交后会成为它的新版本。')).toBeTruthy()
  fireEvent.change(panel('note').getByLabelText('名字（必填）'), { target: { value: 'other' } })
  expect(panel('note').queryByText('已有同名的', { exact: false })).toBeNull()
})
