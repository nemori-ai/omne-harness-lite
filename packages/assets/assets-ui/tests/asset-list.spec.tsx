// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { assetsProtocol, type AssetRowView } from '@omne-harness/assets-protocol'
import { needPoint } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetGovernanceKey, assetsUiModule, type AssetGovernance } from '../src/cordis.tsx'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { assetPage, assetRows, backToList, enterAsset } from './fixtures/asset-pages.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'
import { secretView } from './fixtures/views.ts'
import { startShell } from './fixtures/reference-shell.ts'

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

const skill = (name: string, overrides: Partial<AssetRowView> = {}): AssetRowView => ({
  ...assetRow('skill', name),
  ...overrides,
})

async function shown(rows: AssetRowView[], describe?: (row: AssetRowView) => unknown) {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, rows, describe)
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf({ skill: '技能' })}
    />,
  )
  await settle()
  await settle()
  return fake
}

const item = (name: string) => within(screen.getByRole('listitem', { name }))
const tree = (body: Record<string, number>) => ({
  kind: 'object',
  entries: Object.entries(body).map(([key, value]) => ({
    key,
    value: { kind: 'number', lexeme: String(value) },
  })),
})

it('L1 一行一份：简介的标题与一句说明，没有简介时只有名字；禁用的与官方的标出来，启用着的不写', async () => {
  const summary = { title: '代码评审', description: '读一份改动，给出意见。', facts: [] }
  await shown([
    skill('review', { summary }),
    skill('notes', { enabled: false, origin: 'official' }),
  ])
  const review = item('review')
  expect(review.getByRole('button').textContent).toContain('代码评审')
  expect(review.getByText('读一份改动，给出意见。')).toBeTruthy()
  expect(review.queryByText('已启用')).toBeNull()
  expect(review.queryByText('官方')).toBeNull()
  const notes = item('notes')
  expect(notes.getByRole('button').textContent).toContain('notes')
  expect(notes.getByText('已禁用')).toBeTruthy()
  expect(notes.getByText('官方')).toBeTruthy()
})

it('L1b 一行有哪一层都没有的密钥时写「还没填密钥」；部署层有或这一层填了就不写', async () => {
  const fake = createFakeClient()
  const keyOf = (name: string, own: string, official: string) => ({
    ...secretView({ owner: { kind: 'asset', category: 'skill', name } }),
    own,
    official,
  })
  void (async () => {
    for (;;)
      (await fake.next('list-settings')).answer({
        outcome: 'succeeded',
        body: {
          items: [
            keyOf('bare', 'unset', 'unset'),
            keyOf('deployed', 'unset', 'available'),
            keyOf('filled', 'available', 'unset'),
          ],
          next: null,
          completeness: 'complete',
        },
      })
  })()
  serveAssetReads(fake, [skill('bare'), skill('deployed'), skill('filled')])
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf({ skill: '技能' })}
    />,
  )
  await settle()
  await settle()
  expect(item('bare').getByText('还没填密钥')).toBeTruthy()
  expect(item('deployed').queryByText('还没填密钥')).toBeNull()
  expect(item('filled').queryByText('还没填密钥')).toBeNull()
})

it('A1 点一行进入这一份的页：页头写它在哪一类，列表藏起来不卸下；「回到列表」回去，焦点回到那一行', async () => {
  await shown([skill('review'), skill('notes')])
  const page = await enterAsset('review')
  expect(page.getByText(/技能/).textContent).toContain('review')
  expect(assetRows()).toEqual([])
  const hidden = document.querySelector('.assets-category-list')
  expect(hidden?.hasAttribute('hidden')).toBe(true)
  expect(hidden?.querySelector('[data-asset-row="notes"]')).toBeTruthy()
  await backToList()
  expect(document.querySelector('.assets-asset')).toBeNull()
  expect(assetRows().map(row => row.getAttribute('aria-label'))).toEqual(['review', 'notes'])
  expect(document.activeElement?.getAttribute('data-asset-row')).toBe('review')
})

it('A2 在一份资产的页上按 Esc 回到列表', async () => {
  await shown([skill('review')])
  await enterAsset('review')
  fireEvent.keyDown(assetPage(), { key: 'Escape' })
  await settle()
  expect(document.querySelector('.assets-asset')).toBeNull()
  expect(assetRows()).toHaveLength(1)
})

it('L2 官方来源的没有动作，页头写明为什么', async () => {
  await shown([skill('notes', { origin: 'official' })])
  const page = await enterAsset('notes')
  expect(page.queryByRole('button', { name: '更多' })).toBeNull()
  expect(page.queryByRole('button', { name: '移除' })).toBeNull()
  expect(page.getByText('官方 · 部署装的，不能禁用或移除。')).toBeTruthy()
})

it('L3 类别交来的文本只当文本显示：简介与事实里的 <script> 与标记不解释', async () => {
  const markup = '<script>window.hacked = 1</script><b>粗</b>'
  const summary = { title: markup, description: markup, facts: [{ name: '来历', text: markup }] }
  await shown([skill('review', { summary })])
  const page = await enterAsset('review')
  fireEvent.click(page.getByRole('button', { name: '详情' }))
  await settle()
  expect(document.querySelector('script')).toBeNull()
  expect(document.querySelector('.assets-page b')).toBeNull()
  expect(screen.getAllByText(markup).length).toBeGreaterThanOrEqual(3)
})

it('L5 详情收着，点开是事实（短版本号，全文在提示里）、内容（数据型写成普通 JSON，目录型是文件清单）与能不能用', async () => {
  const summary = { title: 'review', description: '', facts: [{ name: '作者', text: '小组' }] }
  await shown([skill('review', { summary }), skill('limits')], row =>
    row.name === 'review'
      ? {
          item: row,
          revision: 1,
          content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 9 }] },
          standing: { kind: 'selected' },
          settings: false,
        }
      : {
          item: row,
          revision: 1,
          content: { kind: 'data', body: tree({ depth: 2 }) },
          standing: { kind: 'filtered', reason: 'blocked', by: 'organization' },
          settings: true,
        },
  )
  const review = await enterAsset('review')
  expect(review.getByRole('button', { name: '详情' }).getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(review.getByRole('button', { name: '详情' }))
  await settle()
  expect(review.getByText('作者').nextElementSibling?.textContent).toBe('小组')
  expect(review.getByText('现在能不能用').nextElementSibling?.textContent).toBe('在用')
  const version = review.getByText('000000000000')
  expect(version.getAttribute('title')).toBe(skill('review').version)
  expect(within(review.getByRole('list', { name: '文件' })).getByText('SKILL.md')).toBeTruthy()
  await backToList()
  const limits = await enterAsset('limits')
  fireEvent.click(limits.getByRole('button', { name: '详情' }))
  await settle()
  expect(limits.getByText('现在能不能用').nextElementSibling?.textContent).toBe(
    '不在用：被上层挡住（organization）',
  )
  expect(limits.getByText(/"depth": 2/)).toBeTruthy()
  expect(limits.queryByText(/"kind"/)).toBeNull()
})

it('A3 设置一块：没有设置项时写「这一份没有可以改的设置。」', async () => {
  await shown([skill('review')])
  const page = await enterAsset('review')
  expect(page.getByRole('heading', { name: '设置' })).toBeTruthy()
  expect(page.getByText('这一份没有可以改的设置。')).toBeTruthy()
})

async function disable(fake: FakeClient) {
  const page = await enterAsset('review')
  fireEvent.pointerDown(page.getByRole('button', { name: '更多' }), { button: 0, ctrlKey: false })
  const menu = await screen.findByRole('menu')
  fireEvent.click(within(menu).getByRole('menuitem', { name: '禁用' }))
  return { page, sent: await fake.next('set-asset-enabled') }
}

it('L6 禁用在「更多」里：发出去，成功后说已禁用并重读；移除先说明不可逆，确认才发，移除之后回到列表', async () => {
  const rows = [skill('review')]
  const fake = await shown(rows)
  const { page, sent } = await disable(fake)
  expect(sent.body).toMatchObject({ holding: 'held-skill-review', enabled: false })
  sent.answer({ outcome: 'succeeded', body: {} })
  await settle()
  expect(page.getByText('已禁用。')).toBeTruthy()
  expect(fake.calls.filter(call => call.operation === 'list-assets').length).toBeGreaterThan(1)

  fireEvent.click(page.getByRole('button', { name: '移除' }))
  expect(fake.calls.some(call => call.operation === 'remove-asset')).toBe(false)
  expect(page.getByText('移除不能撤销，这一份的设置也随之退出。')).toBeTruthy()
  rows.splice(0, 1)
  fireEvent.click(page.getByRole('button', { name: '确认移除' }))
  const removal = await fake.next('remove-asset')
  expect(removal.body).toMatchObject({ holding: 'held-skill-review' })
  removal.answer({ outcome: 'succeeded', body: {} })
  await settle()
  await settle()
  expect(document.querySelector('.assets-asset')).toBeNull()
})

it('L7 结果不明：动作不可用，给「认回」；认回用同一个操作标识与同一个请求', async () => {
  const fake = await shown([skill('review')])
  const { page, sent } = await disable(fake)
  sent.answer({ outcome: 'unknown' })
  await settle()
  expect((page.getByRole('button', { name: '更多' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(page.getByRole('button', { name: '认回' }))
  const recall = await fake.next('query-asset-operation')
  expect(recall.body).toMatchObject({
    operation: (sent.body as { operation: string }).operation,
    request: { kind: 'set-asset-enabled', holding: 'held-skill-review', enabled: false },
  })
})

it('C16 页面开着时别处新建一份：不用人动就重读并显示；断开重连之后也重读', async () => {
  const rows = [skill('review')]
  const fake = await shown(rows)
  const stream = await fake.nextStream()
  rows.push(skill('notes'))
  stream.frame()
  await settle()
  await settle()
  expect(screen.getByRole('listitem', { name: 'notes' })).toBeTruthy()
  rows.splice(0, 1)
  stream.end()
  const again = await fake.nextStream()
  again.frame()
  await settle()
  await settle()
  expect(screen.queryByRole('listitem', { name: 'review' })).toBeNull()
  expect(screen.getByRole('listitem', { name: 'notes' })).toBeTruthy()
})

it('C14 递归：类别自己的页面经治理口拿到的列表与动作结果，与通用页面的相同', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(fake, [skill('review'), skill('notes')])
  await serveProtocol(root as unknown as Context, assetsProtocol, fake.client)
  await root.plugin(assetsUiModule)
  const ports: AssetGovernance[] = []
  await root.plugin(
    defineUiModule({
      name: 'skill-ui',
      needs: { port: needPoint(assetGovernanceKey) },
      apply(_shell, bound) {
        const port = bound.port.get()
        if (port !== undefined) ports.push(port)
      },
    }),
  )
  shell.tenant = TENANT
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  ;(await fake.next('list-categories')).answer({
    outcome: 'succeeded',
    body: {
      items: [{ category: 'skill', title: '技能', summary: '', creation: 'directory' }],
      next: null,
    },
  })
  await settle()
  await settle()
  const own = ports[0]!.open(TENANT, 'skill')
  const names = () => {
    const snapshot = own.getSnapshot()
    return snapshot.kind === 'read' && snapshot.assets.kind === 'read'
      ? snapshot.assets.entries.map(entry => entry.row.name)
      : []
  }
  const generic = () =>
    within(screen.getByRole('list', { name: '技能的资产' }))
      .getAllByRole('listitem')
      .filter(element => element.classList.contains('assets-item'))
      .map(element => element.getAttribute('aria-label'))
  expect(names()).toEqual(['review', 'notes'])
  expect(generic()).toEqual(names())
  own.setEnabled('review', false)
  ;(await fake.next('set-asset-enabled')).answer({ outcome: 'succeeded', body: {} })
  await settle()
  const snapshot = own.getSnapshot()
  const action =
    snapshot.kind === 'read' && snapshot.assets.kind === 'read'
      ? snapshot.assets.entries[0]!.action
      : undefined
  expect(action).toEqual({ kind: 'done', text: '已禁用。' })
  const page = await enterAsset('review')
  expect(page.getByText('已禁用。')).toBeTruthy()
  own.close()
})
