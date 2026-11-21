// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { AssetRowView } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'

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

function serveSettings(fake: FakeClient): void {
  void (async () => {
    for (;;)
      (await fake.next('list-settings')).answer({
        outcome: 'succeeded',
        body: { items: [], next: null, completeness: 'complete' },
      })
  })()
}

const text = (value: string): JsonValue => ({ kind: 'string', value })
const object = (entries: Record<string, JsonValue>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})

// The two categories the server's slow test adds by one row, as the protocol describes them.
const CREATION: Readonly<Record<string, Readonly<{ detail: unknown; hint: string }>>> = {
  fixture: {
    detail: {
      kind: 'data',
      schema: object({
        type: text('object'),
        properties: object({ endpoint: object({ type: text('string'), title: text('地址') }) }),
        required: { kind: 'array', items: [text('endpoint')] },
      }),
    },
    hint: '填一个地址。',
  },
  'fixture-bundle': {
    detail: { kind: 'directory', limits: { files: 4, fileBytes: 1024, totalBytes: 2048 } },
    hint: '一个目录，根下有 README.md。',
  },
}

const described = (row: AssetRowView): unknown => ({
  item: row,
  revision: 1,
  content:
    row.category === 'fixture'
      ? { kind: 'data', body: object({ endpoint: text('https://a.example') }) }
      : { kind: 'directory', entries: [{ path: 'README.md', bytes: 40 }] },
  standing: { kind: 'selected' },
  settings: row.category === 'fixture',
})

const tabs = () => within(screen.getByRole('tablist', { name: '资产的类别' }))

async function click(element: HTMLElement): Promise<void> {
  fireEvent.click(element)
  await settle()
}

it('C17 两个只在测试里的类别各是一个页签：列表、详情与新建表单都画得出', async () => {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(
    fake,
    [assetRow('fixture', 'alpha'), assetRow('fixture-bundle', 'pack')],
    described,
    category => CREATION[category],
  )
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf({ fixture: '测试数据', 'fixture-bundle': '测试包' })}
    />,
  )
  await settle()
  await settle()
  expect(
    tabs()
      .getAllByRole('tab')
      .map(tab => tab.textContent),
  ).toEqual(['测试数据', '测试包'])

  await click(screen.getByRole('button', { name: 'alpha', expanded: false }))
  const alpha = within(screen.getByRole('listitem', { name: 'alpha' }))
  expect(alpha.getByText(/https:\/\/a\.example/)).toBeTruthy()
  await click(screen.getByRole('button', { name: '新建' }))
  const dataForm = within(screen.getByRole('form', { name: '新建' }))
  expect(dataForm.getByText('填一个地址。')).toBeTruthy()
  expect(dataForm.getByLabelText('地址（必填）')).toBeTruthy()

  await click(tabs().getByRole('tab', { name: '测试包' }))
  await settle()
  await click(screen.getByRole('button', { name: 'pack', expanded: false }))
  const pack = within(screen.getByRole('listitem', { name: 'pack' }))
  expect(within(pack.getByRole('list', { name: '文件' })).getByText(/README\.md/)).toBeTruthy()
  await click(screen.getByRole('button', { name: '新建' }))
  const directoryForm = within(screen.getByRole('form', { name: '新建' }))
  expect(directoryForm.getByText('一个目录，根下有 README.md。')).toBeTruthy()
  expect(directoryForm.getByLabelText('选择目录')).toBeTruthy()
})
