// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { SettingView } from '@omne-harness/assets-protocol'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetPage, assetRows, backToList, enterAsset, enterFirst } from './fixtures/asset-pages.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'
import { assetsOf, categoriesOf, serveAssetReads } from './fixtures/asset-reads.ts'
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

async function answer(
  fake: FakeClient,
  operation: Parameters<FakeClient['next']>[0],
  value: unknown,
) {
  const call = await fake.next(operation)
  call.answer(value)
  await settle()
  return call
}

/** Goes into the first asset of the shown tab: a setting shows only on its asset's page. */
const openListed = enterFirst

function page(fake: FakeClient, items: readonly SettingView[], names = {}) {
  const rows = assetsOf(items)
  serveAssetReads(fake, rows)
  return (
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf(categoriesOf(rows, names))}
    />
  )
}

async function listed(
  items: readonly SettingView[] = [permissionView()],
  names: Readonly<Record<string, string>> = {},
): Promise<FakeClient> {
  const fake = createFakeClient()
  render(page(fake, items, names))
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items, next: null, completeness: 'complete' },
  })
  await openListed()
  return fake
}

const row = (title: string) => screen.getByRole('heading', { name: title }).closest('li')!
async function showTab(label: string, into = true): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: label }))
  if (into) await openListed()
  else await settle()
}

it('P1 列出后每项显示说明、生效的值、来源、能不能改；不能改的写明原因', async () => {
  await listed([
    permissionView({ effective: { kind: 'value', value: 'ask', source: 'organization' } }),
    ordinaryView(),
    secretView(),
  ])
  await showTab('tool')
  const permission = within(row('调用权限'))
  expect(permission.getByText('Shell 工具每次调用要不要人批准。')).toBeTruthy()
  expect(permission.getByText('生效的值').nextElementSibling?.textContent).toBe('询问')
  expect(permission.getByText('来源').nextElementSibling?.textContent).toBe('组织')
  expect(permission.getByText('能不能改').nextElementSibling?.textContent).toBe('能改')
  expect(permission.getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual([
    'deny',
    'ask',
    'auto',
  ])

  await backToList()
  await enterAsset('files')
  const ordinary = within(row('一次读取的上限'))
  expect(ordinary.getByText('能不能改').nextElementSibling?.textContent).toBe('不能改：被上层锁定')
  expect(ordinary.getByText('来源').nextElementSibling?.textContent).toBe('默认')
  expect(ordinary.queryByRole('button', { name: '清除' })).toBeNull()

  await showTab('model')
  const secret = within(row('模型供应商的密钥'))
  expect(secret.getByText('能不能改').nextElementSibling?.textContent).toBe(
    '不能改：这一层不能配这一项',
  )
  expect(secret.getByText('部署层的秘密').nextElementSibling?.textContent).toBe('可用')
})

it('P2 改一项：带修订号提交，成功后按服务端读到的视图重画', async () => {
  const fake = await listed()
  fireEvent.click(screen.getByRole('radio', { name: /自动/ }))
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  const set = await fake.next('set-setting')
  expect(set.body).toMatchObject({
    owner: { kind: 'asset', category: 'tool', name: 'shell' },
    item: 'call-permission',
    expectedRevision: '1',
    value: { kind: 'permission', pick: 'auto' },
  })
  expect(set.options?.messageId).toBe((set.body as { operation: string }).operation)
  set.answer({ outcome: 'succeeded', body: { revision: '2' } })
  await settle()
  await answer(fake, 'describe-setting', {
    outcome: 'succeeded',
    body: {
      item: permissionView({
        revision: '2',
        own: 'auto',
        effective: { kind: 'value', value: 'auto', source: 'tenant' },
      }),
    },
  })
  const permission = within(row('调用权限'))
  expect(permission.getByText('生效的值').nextElementSibling?.textContent).toBe('自动')
  expect(permission.getByText('这一层的挑选').nextElementSibling?.textContent).toBe('自动')
  expect(permission.getByText('已写入。')).toBeTruthy()
})

it('P3 清除：这一层不再有挑选，显示外层来的值', async () => {
  const fake = await listed([
    permissionView({ own: 'auto', effective: { kind: 'value', value: 'auto', source: 'tenant' } }),
  ])
  fireEvent.click(screen.getByRole('button', { name: '清除' }))
  const clear = await answer(fake, 'clear-setting', {
    outcome: 'succeeded',
    body: { revision: '2' },
  })
  expect(clear.body).toMatchObject({ expectedRevision: '1' })
  await answer(fake, 'describe-setting', {
    outcome: 'succeeded',
    body: { item: permissionView({ revision: '2' }) },
  })
  const permission = within(row('调用权限'))
  expect(permission.getByText('这一层的挑选').nextElementSibling?.textContent).toBe('没有挑选')
  expect(permission.getByText('生效的值').nextElementSibling?.textContent).toBe('询问')
  expect(permission.getByText('来源').nextElementSibling?.textContent).toBe('默认')
})

it('P4 修订号不符：显示原因并重读这一项', async () => {
  const fake = await listed()
  fireEvent.click(screen.getByRole('radio', { name: /拒绝/ }))
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await answer(fake, 'set-setting', { outcome: 'conflict', body: {} })
  expect(screen.getByRole('alert').textContent).toContain('在别处改过了')
  const describe = await answer(fake, 'describe-setting', {
    outcome: 'succeeded',
    body: { item: permissionView({ revision: '5', own: 'ask' }) },
  })
  expect(describe.body).toMatchObject({ item: 'call-permission' })
  expect(within(row('调用权限')).getByText('这一层的挑选').nextElementSibling?.textContent).toBe(
    '询问',
  )
})

it('P5 结果未知：不发新的一次，原样再送同一次认回；认回之前控件不可用', async () => {
  const fake = await listed()
  fireEvent.click(screen.getByRole('radio', { name: /自动/ }))
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  const first = await answer(fake, 'set-setting', { outcome: 'unknown' })
  expect(screen.getByRole('status').textContent).toContain('结果未知，正在确认')
  expect((screen.getByRole('button', { name: '设置' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('radio', { name: /拒绝/ }).closest('fieldset')?.disabled).toBe(true)
  const again = await fake.next('set-setting')
  expect(again.body).toEqual(first.body)
  expect(again.options).toEqual(first.options)
  again.answer({ outcome: 'uncertain' })
  await settle()
  expect(screen.getByText(/结果仍未知/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '再确认一次' }))
  const third = await answer(fake, 'set-setting', { outcome: 'succeeded', body: { revision: '2' } })
  expect(third.body).toEqual(first.body)
  expect(fake.calls.filter(call => call.operation === 'set-setting')).toHaveLength(3)
})

it('P6 列表读失败如实显示并给「重试」', async () => {
  const fake = createFakeClient()
  render(page(fake, [permissionView()]))
  await answer(fake, 'list-settings', { outcome: 'denied' })
  expect(screen.getByRole('alert').textContent).toContain('没有权限，或登录已失效。')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items: [permissionView()], next: null, completeness: 'partial' },
  })
  await openListed()
  expect(screen.getByRole('heading', { name: '调用权限' })).toBeTruthy()
  expect(screen.getByText(/列表不全/)).toBeTruthy()
})

it('P7 租户读不懂时不发任何调用', () => {
  const fake = createFakeClient()
  render(
    <AssetsPage governance={createGovernance({ client: fake.client })} tenant="not-a-tenant" />,
  )
  expect(screen.getByRole('alert').textContent).toContain('租户读不懂')
  expect(fake.calls).toHaveLength(0)
})

it('P9 外壳重新渲染而租户没变：不重读整张列表', async () => {
  const fake = createFakeClient()
  const element = page(fake, [permissionView()])
  const view = render(element)
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items: [permissionView()], next: null, completeness: 'complete' },
  })
  const reads = (operation: string) =>
    fake.calls.filter(call => call.operation === operation).length
  expect([reads('list-settings'), reads('list-assets')]).toEqual([1, 1])

  view.rerender(element)
  await settle()
  expect([reads('list-settings'), reads('list-assets')]).toEqual([1, 1])
})

it('P10 一个类别一个页签，次序按类别的标识；默认选中第一个；挑一个只画这一类的项，别的类别的项不渲染', async () => {
  await listed([permissionView(), ordinaryView(), secretView()], { tool: '工具', model: '模型' })
  const tabs = within(screen.getByRole('tablist', { name: '资产的类别' }))
  expect(tabs.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['模型', '工具'])
  expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)).toEqual([
    '模型供应商的密钥',
  ])

  await showTab('工具')
  expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)).toEqual([
    '调用权限',
  ])
  expect(assetRows()).toEqual([])
  expect(tabs.getByRole('tab', { name: '工具' }).getAttribute('aria-selected')).toBe('true')
  expect(tabs.getByRole('tab', { name: '模型' }).getAttribute('aria-selected')).toBe('false')
})

it('P12 页签上的字与这一类的标题取类别列表给的名字', async () => {
  await listed([permissionView(), secretView()], { tool: '工具' })
  const tabs = within(screen.getByRole('tablist', { name: '资产的类别' }))
  expect(tabs.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['model', '工具'])
  await backToList()
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('model')
  await showTab('工具', false)
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('工具')
  await enterAsset('shell')
  expect(assetPage().textContent).toContain('工具 › shell')
})

const settingTitles = (item: HTMLElement) =>
  within(item)
    .queryAllByRole('heading', { level: 4 })
    .map(heading => heading.textContent)
const listedNames = () => assetRows().map(row => row.getAttribute('aria-label'))

it('P13 列表照资产列表的次序，一行一份；一份资产的设置项只在它自己的页上', async () => {
  const second = permissionView({
    item: 'second-permission',
    declaration: { ...permissionView().declaration, title: '第二项权限' },
  })
  await listed([permissionView(), ordinaryView(), second], { tool: '工具' })
  await backToList()
  expect(listedNames()).toEqual(['shell', 'files'])
  expect(screen.queryAllByRole('heading', { level: 4 })).toEqual([])
  await enterAsset('shell')
  expect(settingTitles(assetPage())).toEqual(['调用权限', '第二项权限'])
  await backToList()
  await enterAsset('files')
  expect(settingTitles(assetPage())).toEqual(['一次读取的上限'])
})

it('P14 名字相同而类别不同的两份资产在各自的页签里，各带自己的设置项', async () => {
  const sameName = secretView({ owner: { kind: 'asset', category: 'model', name: 'shell' } })
  await listed([permissionView(), sameName], { tool: '工具', model: '模型' })
  expect(settingTitles(assetPage())).toEqual(['模型供应商的密钥'])
  await backToList()
  expect(listedNames()).toEqual(['shell'])
  await showTab('工具')
  expect(settingTitles(assetPage())).toEqual(['调用权限'])
  await backToList()
  expect(listedNames()).toEqual(['shell'])
})

it('P11 没有本层的值时清除不可用；秘密项不显示值', async () => {
  await listed([secretView({ editable: { kind: 'yes' } })])
  expect(screen.getByText('这一层的秘密').nextElementSibling?.textContent).toBe('未配置')
  expect((screen.getByRole('button', { name: '清除' }) as HTMLButtonElement).disabled).toBe(true)
})

const SENTINEL = 'sentinel-secret-7f3a91c2'
const editableSecret = (overrides: Parameters<typeof secretView>[0] = {}) =>
  secretView({ editable: { kind: 'yes' }, ...overrides })
const secretInput = () => screen.getByLabelText(/输入秘密/) as HTMLInputElement
const pageText = () => document.body.innerHTML + document.body.textContent

it('S1 秘密项两行状态各用一句中文', async () => {
  const states = [
    ['unset', '未配置'],
    ['available', '可用'],
    ['revoked', '已吊销'],
    ['unreadable', '读不出'],
  ] as const
  for (const [state, text] of states) {
    await listed([editableSecret({ own: state, official: state })])
    expect(screen.getByText('这一层的秘密').nextElementSibling?.textContent).toBe(text)
    expect(screen.getByText('部署层的秘密').nextElementSibling?.textContent).toBe(text)
    cleanup()
  }
})

it('S2 能改时给口令框与「设置」；空的时候「设置」不可点；口令框不显示、不自动补全', async () => {
  await listed([editableSecret()])
  expect(secretInput().type).toBe('password')
  expect(secretInput().autocomplete).toBe('off')
  const set = screen.getByRole('button', { name: '设置' }) as HTMLButtonElement
  expect(set.disabled).toBe(true)
  fireEvent.change(secretInput(), { target: { value: SENTINEL } })
  expect(set.disabled).toBe(false)
})

it('S3 不能改时没有口令框也没有「设置」，写明原因', async () => {
  await listed([secretView()])
  expect(screen.queryByLabelText(/输入秘密/)).toBeNull()
  expect(screen.queryByRole('button', { name: '设置' })).toBeNull()
  expect(screen.getByText('能不能改').nextElementSibling?.textContent).toBe(
    '不能改：这一层不能配这一项',
  )
})

it('S4 设置：带修订号送出原文；提交时口令框立刻清空，页面任何地方都没有原文；成功后重读', async () => {
  const fake = await listed([editableSecret()])
  fireEvent.change(secretInput(), { target: { value: SENTINEL } })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  expect(secretInput().value).toBe('')
  const set = await fake.next('set-setting')
  expect(set.body).toMatchObject({
    owner: { kind: 'asset', category: 'model', name: 'openai' },
    item: 'api-key',
    expectedRevision: '2',
    value: { kind: 'secret', secret: SENTINEL },
  })
  expect(set.options?.messageId).toBe((set.body as { operation: string }).operation)
  expect(pageText()).not.toContain(SENTINEL)
  set.answer({ outcome: 'succeeded', body: { revision: '3' } })
  await settle()
  expect(screen.getByText('已写入。')).toBeTruthy()
  await answer(fake, 'describe-setting', {
    outcome: 'succeeded',
    body: { item: editableSecret({ own: 'available', revision: '3' }) },
  })
  expect(screen.getByText('这一层的秘密').nextElementSibling?.textContent).toBe('可用')
  expect(secretInput().value).toBe('')
  expect(pageText()).not.toContain(SENTINEL)
})

it('S5 结果未知：原文不留，不重发；点「再确认一次」只重读这一项', async () => {
  const fake = await listed([editableSecret()])
  fireEvent.change(secretInput(), { target: { value: SENTINEL } })
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await answer(fake, 'set-setting', { outcome: 'unknown' })
  expect(screen.getByRole('status').textContent).toContain('结果未知')
  expect(pageText()).not.toContain(SENTINEL)
  fireEvent.click(screen.getByRole('button', { name: '再确认一次' }))
  await settle()
  await answer(fake, 'describe-setting', {
    outcome: 'succeeded',
    body: { item: editableSecret({ own: 'available', revision: '3' }) },
  })
  expect(fake.calls.filter(call => call.operation === 'set-setting')).toHaveLength(1)
  expect(screen.getByText('这一层的秘密').nextElementSibling?.textContent).toBe('可用')
  expect(screen.getByRole('status').textContent).toContain('结果未知')
})

it('S6 清除：带修订号；有这一层的秘密才可点', async () => {
  const fake = await listed([editableSecret({ own: 'available' })])
  fireEvent.click(screen.getByRole('button', { name: '清除' }))
  const clear = await fake.next('clear-setting')
  expect(clear.body).toMatchObject({ item: 'api-key', expectedRevision: '2' })
  expect(JSON.stringify(clear.body)).not.toContain('secret')
})

it('P0 each part of the category page is on its own element', async () => {
  await listed([permissionView()])
  await showTab('tool')
  const on = (name: string) => document.querySelectorAll(`[data-omne-part="${name}"]`)
  expect(on('assets.page')[0]?.classList.contains('assets-page')).toBe(true)
  expect(on('assets.tabs')[0]?.getAttribute('role')).toBe('tablist')
  expect(on('assets.tabs.tab')[0]?.getAttribute('role')).toBe('tab')
  expect(on('assets.panel')[0]?.getAttribute('role')).toBe('tabpanel')
  expect(on('assets.category')[0]?.classList.contains('assets-category')).toBe(true)
  expect(on('assets.category.head')[0]?.tagName).toBe('HEADER')
  expect(on('assets.list')[0]?.tagName).toBe('UL')
  expect(on('assets.item')[0]?.tagName).toBe('LI')
  expect(on('assets.asset')[0]?.tagName).toBe('SECTION')
  expect(on('assets.asset.toolbar')[0]?.classList.contains('assets-asset-toolbar')).toBe(true)
  expect(on('assets.asset.actions')[0]?.classList.contains('assets-asset-actions')).toBe(true)
  expect(on('assets.asset.settings')[0]?.tagName).toBe('SECTION')
  expect(on('assets.asset.detail')[0]?.classList.contains('assets-asset-detail')).toBe(true)
  expect(on('assets.setting')[0]?.classList.contains('assets-setting')).toBe(true)
  expect(on('assets.setting.control')[0]?.classList.contains('assets-setting-control')).toBe(true)
})
