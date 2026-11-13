// @vitest-environment happy-dom
// The settings panel through the component and a fake protocol client: list, change, clear, a
// conflict, an unknown result, and a failed read.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { SettingView } from '@omne-harness/assets-protocol'
import { SettingsPanel } from '../src/index.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { ordinaryView, permissionView, secretView } from './fixtures/views.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

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

async function listed(items: readonly SettingView[] = [permissionView()]): Promise<FakeClient> {
  const fake = createFakeClient()
  render(<SettingsPanel client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items, next: null, completeness: 'complete' },
  })
  return fake
}

const row = (title: string) => screen.getByRole('heading', { name: title }).closest('li')!

it('P1 列出后每项显示说明、生效的值、来源、能不能改；不能改的写明原因', async () => {
  await listed([
    permissionView({ effective: { kind: 'value', value: 'ask', source: 'organization' } }),
    ordinaryView(),
    secretView(),
  ])
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

  const ordinary = within(row('一次读取的上限'))
  expect(ordinary.getByText('能不能改').nextElementSibling?.textContent).toBe('不能改：被上层锁定')
  expect(ordinary.getByText('来源').nextElementSibling?.textContent).toBe('默认')
  expect(ordinary.queryByRole('button', { name: '清除' })).toBeNull()

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
    asset: { category: 'tool', name: 'shell' },
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
  render(<SettingsPanel client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-settings', { outcome: 'denied' })
  expect(screen.getByRole('alert').textContent).toContain('没有权限，或登录已失效。')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items: [permissionView()], next: null, completeness: 'partial' },
  })
  expect(screen.getByRole('heading', { name: '调用权限' })).toBeTruthy()
  expect(screen.getByText(/列表不全/)).toBeTruthy()
})

it('P7 租户读不懂时不发任何调用', () => {
  const fake = createFakeClient()
  render(<SettingsPanel client={fake.client} tenant="not-a-tenant" />)
  expect(screen.getByRole('alert').textContent).toContain('租户读不懂')
  expect(fake.calls).toHaveLength(0)
})

it('P9 外壳重新渲染而租户没变：不重读整张列表', async () => {
  const fake = createFakeClient()
  const view = render(<SettingsPanel client={fake.client} tenant={TENANT} />)
  await answer(fake, 'list-settings', {
    outcome: 'succeeded',
    body: { items: [permissionView()], next: null, completeness: 'complete' },
  })
  const reads = () => fake.calls.filter(call => call.operation === 'list-settings').length
  expect(reads()).toBe(1)

  view.rerender(<SettingsPanel client={fake.client} tenant={TENANT} />)
  await settle()
  expect(reads()).toBe(1)
})
