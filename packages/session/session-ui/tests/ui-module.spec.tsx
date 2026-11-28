// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { sessionUiModule } from '../src/cordis.ts'
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

it('要 session/v1 这份协议：协议在时模块被采用', async () => {
  const { shell } = await mountModule(createFakeClient().client, TENANT)
  expect(shell.adoption('session-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { session: { key: 'session/v1' } },
  })
})

it('依赖都在：往侧栏区放会话列表（最前），往页面放对话页与搜索页；协议客户端撤了都撤掉', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  expect(mounted.shell.items('sidebar').map(item => [item.id, item.order])).toEqual([
    ['session-list', 0],
    ['archived-sessions', 1],
  ])
  expect(
    mounted.shell.items('pages').map(item => [item.id, item.title, item.order, item.icon]),
  ).toEqual([
    ['conversation', '对话', 0, 'conversation'],
    ['history-search', '搜索', 1, 'search'],
  ])
  await settle()
  expect(screen.getByRole('navigation', { name: '会话列表' })).toBeTruthy()
  expect(screen.getByRole('region', { name: '对话' })).toBeTruthy()

  await mounted.withdraw()
  await settle()
  expect(mounted.shell.items('sidebar')).toEqual([])
  expect(mounted.shell.items('pages').map(item => item.id)).toEqual([
    'conversation',
    'history-search',
  ])
  expect(screen.queryByRole('navigation', { name: '会话列表' })).toBeNull()
})

it('没有协议客户端时：页面还在，侧栏不放；协议来了侧栏才放', async () => {
  const { root, shell } = await startShell()
  await root.plugin(sessionUiModule)
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('pages').map(item => item.id)).toEqual(['conversation', 'history-search'])
  await serveProtocol(root, sessionProtocol, createFakeClient().client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(shell.items('sidebar').map(item => item.id)).toEqual(['session-list', 'archived-sessions'])
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

it('M4 declares its 29 parts when the protocol is served', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(root, sessionProtocol, createFakeClient().client)
  await root.plugin(sessionUiModule)
  await serveProtocol(root, sessionProtocol, createFakeClient().client)
  await new Promise(resolve => setTimeout(resolve, 0))
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['session.archived', 'shell.sidebar'],
    ['session.archived.item', 'session.archived'],
    ['session.backdrop', null],
    ['session.companion', null],
    ['session.companion.figure', 'session.companion'],
    ['session.composer', null],
    ['session.composer.input', 'session.composer'],
    ['session.composer.send', 'session.composer'],
    ['session.header', null],
    ['session.header.model', 'session.header'],
    ['session.header.more', 'session.header'],
    ['session.header.permission', 'session.header'],
    ['session.header.title', 'session.header'],
    ['session.header.workspace', 'session.header'],
    ['session.list', 'shell.sidebar'],
    ['session.list.item', 'session.list'],
    ['session.list.new', 'session.list'],
    ['session.queue', null],
    ['session.search', 'shell.workspace.page'],
    ['session.search.hit', 'session.search'],
    ['session.side', null],
    ['session.side.background-call', 'session.side'],
    ['session.transcript', null],
    ['session.transcript.agent-message', 'session.transcript'],
    ['session.transcript.bubble', 'session.transcript'],
    ['session.transcript.failure', 'session.transcript'],
    ['session.transcript.reasoning', 'session.transcript'],
    ['session.transcript.tool-call', 'session.transcript'],
    ['session.transcript.user-message', 'session.transcript'],
  ])
})
