// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { assetsProtocol, type AssetRowView } from '@omne-harness/assets-protocol'
import { serviceOf } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetGovernanceKey, assetsUiModule, type AssetGovernance } from '../src/cordis.tsx'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'
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
async function open(title: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: title, expanded: false }))
  await settle()
}

it('L1 一行一份：简介的标题与一句说明，没有简介时只有名字；名字、版本、启用还是禁用；官方的标出来', async () => {
  const summary = { title: '代码评审', description: '读一份改动，给出意见。', facts: [] }
  await shown([
    skill('review', { summary }),
    skill('notes', { enabled: false, origin: 'official' }),
  ])
  const review = item('review')
  expect(review.getByRole('heading', { level: 3 }).textContent).toBe('代码评审')
  expect(review.getByText('读一份改动，给出意见。')).toBeTruthy()
  expect(review.getByText('review')).toBeTruthy()
  expect(review.getByText('sha256:000000000000')).toBeTruthy()
  expect(review.getByText('已启用')).toBeTruthy()
  expect(review.queryByText('官方')).toBeNull()
  const notes = item('notes')
  expect(notes.getByRole('heading', { level: 3 }).textContent).toBe('notes')
  expect(notes.getByText('已禁用')).toBeTruthy()
  expect(notes.getByText('官方')).toBeTruthy()
})

it('L2 官方来源的不给禁用与移除，写明为什么', async () => {
  await shown([skill('notes', { origin: 'official' })])
  await open('notes')
  expect(item('notes').queryByRole('button', { name: '禁用' })).toBeNull()
  expect(item('notes').queryByRole('button', { name: '移除' })).toBeNull()
  expect(item('notes').getByText('这一份是部署装的官方资产，不能停用或移除。')).toBeTruthy()
})

it('L3 类别交来的文本只当文本显示：简介与事实里的 <script> 与标记不解释', async () => {
  const markup = '<script>window.hacked = 1</script><b>粗</b>'
  const summary = { title: markup, description: markup, facts: [{ name: '来历', text: markup }] }
  await shown([skill('review', { summary })])
  await open(markup)
  expect(document.querySelector('script')).toBeNull()
  expect(document.querySelector('.assets-page b')).toBeNull()
  expect(screen.getAllByText(markup).length).toBeGreaterThanOrEqual(3)
})

it('L4 列表不全时说出来；读不出时照实写原因并给「重试」，不显示成空', async () => {
  const fake = createFakeClient()
  serveSettings(fake)
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf({ skill: '技能' })}
    />,
  )
  ;(await fake.next('list-assets')).answer({ outcome: 'denied' })
  await settle()
  expect(screen.getByRole('alert').textContent).toContain('没有权限，或登录已失效。')
  expect(screen.queryByText('这一类还没有资产。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  ;(await fake.next('list-assets')).answer({
    outcome: 'succeeded',
    body: { items: [skill('review')], next: null, completeness: 'partial' },
  })
  await settle()
  expect(screen.getByText(/列表不全/)).toBeTruthy()
  expect(screen.getByRole('listitem', { name: 'review' })).toBeTruthy()
})

it('L5 点开一行是这一份的详情：事实、内容（数据型的正文，目录型的文件清单）、能不能用与原因', async () => {
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
          content: { kind: 'data', body: { depth: 2 } },
          standing: { kind: 'filtered', reason: 'blocked', by: 'organization' },
          settings: true,
        },
  )
  await open('review')
  const review = item('review')
  expect(review.getByText('作者').nextElementSibling?.textContent).toBe('小组')
  expect(review.getByText('现在能不能用').nextElementSibling?.textContent).toBe('在用')
  expect(within(review.getByRole('list', { name: '文件' })).getByText('SKILL.md')).toBeTruthy()
  await open('limits')
  const limits = item('limits')
  expect(limits.getByText('现在能不能用').nextElementSibling?.textContent).toBe(
    '不在用：被上层挡住（organization）',
  )
  expect(limits.getByText(/"depth": 2/)).toBeTruthy()
})

it('L6 禁用：发出去，成功后说已禁用并重读；移除先说明不可逆，确认才发', async () => {
  const fake = await shown([skill('review')])
  await open('review')
  fireEvent.click(item('review').getByRole('button', { name: '禁用' }))
  const disable = await fake.next('set-asset-enabled')
  expect(disable.body).toMatchObject({ holding: 'held-skill-review', enabled: false })
  disable.answer({ outcome: 'succeeded', body: {} })
  await settle()
  expect(item('review').getByText('已禁用。')).toBeTruthy()
  expect(fake.calls.filter(call => call.operation === 'list-assets').length).toBeGreaterThan(1)

  fireEvent.click(item('review').getByRole('button', { name: '移除' }))
  expect(fake.calls.some(call => call.operation === 'remove-asset')).toBe(false)
  expect(item('review').getByText('移除不能撤销，这一份的设置也随之退出。')).toBeTruthy()
  fireEvent.click(item('review').getByRole('button', { name: '确认移除' }))
  expect((await fake.next('remove-asset')).body).toMatchObject({ holding: 'held-skill-review' })
})

it('L7 结果不明：控件不可用，给「认回」；认回用同一个操作标识与同一个请求', async () => {
  const fake = await shown([skill('review')])
  await open('review')
  fireEvent.click(item('review').getByRole('button', { name: '禁用' }))
  const sent = await fake.next('set-asset-enabled')
  sent.answer({ outcome: 'unknown' })
  await settle()
  expect((item('review').getByRole('button', { name: '禁用' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(item('review').getByRole('button', { name: '认回' }))
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
      inject: [assetGovernanceKey],
      apply(_shell, services) {
        ports.push(serviceOf(services, assetGovernanceKey))
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
  await open('review')
  expect(item('review').getByText('已禁用。')).toBeTruthy()
  own.close()
})
