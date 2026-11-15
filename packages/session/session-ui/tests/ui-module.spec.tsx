// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { sessionClientService, sessionUiModule } from '../src/cordis.tsx'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage } from './fixtures/frames.ts'
import { mountModule, startShell } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

it('协议客户端的服务名照客户端装配的取法', () => {
  expect(sessionClientService).toBe('protocol:session/v1')
})

it('依赖都在：往侧栏区放会话列表（最前），往页面放对话页；协议客户端撤了两样都撤掉', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  expect(mounted.shell.items('sidebar').map(item => [item.id, item.order])).toEqual([
    ['session-list', 0],
  ])
  expect(
    mounted.shell.items('pages').map(item => [item.id, item.title, item.order, item.icon]),
  ).toEqual([['conversation', '对话', 0, 'conversation']])
  await settle()
  expect(screen.getByRole('navigation', { name: '会话列表' })).toBeTruthy()
  expect(screen.getByRole('region', { name: '对话' })).toBeTruthy()

  await mounted.withdraw()
  await settle()
  expect(mounted.shell.items('sidebar')).toEqual([])
  expect(mounted.shell.items('pages')).toEqual([])
  expect(screen.queryByRole('navigation', { name: '会话列表' })).toBeNull()
})

it('没有协议客户端时不放任何东西', async () => {
  const { root, shell } = await startShell()
  await root.plugin(sessionUiModule)
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('pages')).toEqual([])
})

it('列表里选一个会话：把对话页切到前面', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  expect(shell.navigated).toEqual(['conversation'])
})

it('新建会话：把对话页切到前面', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  expect(shell.navigated).toEqual(['conversation'])
})

it('列表与对话共用一个模型：在列表里打开的会话，对话页读它的历史', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_a' })
  expect(fake.calls.filter(call => call.operation === 'list-sessions')).toHaveLength(1)
})

it('租户变了：模型重建，按新租户重读列表，原来的观察停掉', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  const other =
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
  mounted.rerender(other)
  await settle()
  const reread = await fake.next('list-sessions')
  expect(JSON.stringify(reread.body)).toContain('acc_00000000000000000000000002')
  expect(fake.observations[0]?.aborted).toBe(true)
  expect(screen.queryByRole('button', { name: '甲' })).toBeNull()
})

it('还没有租户：两样都不发调用', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, undefined)
  await settle()
  expect(fake.calls).toEqual([])
})
