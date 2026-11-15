// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { humanInterventionUiModule } from '../src/cordis.ts'
import { page } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SERVICE = protocolServiceName({
  name: humanInterventionProtocol.name,
  major: humanInterventionProtocol.major,
})

beforeAll(stubAnimation)

afterEach(cleanup)

const pageIds = (root: Context) =>
  (root.shell as unknown as { items(slot: 'pages'): { id: string }[] })
    .items('pages')
    .map(item => item.id)

it('U1 协议客户端在：放「待你决定」一页，次序 10，不放侧栏与登录门', async () => {
  const { root, shell } = await startShell()
  root.reflect.provide(SERVICE, createFakeClient().client)
  await root.plugin(humanInterventionUiModule)
  const [placed] = shell.items('pages')
  expect(placed).toMatchObject({ id: 'decisions', title: '待你决定', order: 10 })
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
})

it('U2 这一页用外壳给的租户，经注入的客户端取列表', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(humanInterventionUiModule)
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const call = await fake.next('list-cards')
  await act(async () => {
    call.answer(page([]))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(fake.calls).toHaveLength(1)
})

it('U3 还没有租户：什么都不画，不发请求', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(humanInterventionUiModule)
  const view = render(<>{shell.items('pages')[0]!.render({ scope: undefined })}</>)
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(fake.calls).toHaveLength(0)
  expect(view.container.textContent).toBe('')
})

it('U4 协议客户端撤了：模块卸载，页面撤掉；回来了：再放上', async () => {
  const { root } = await startShell()
  const fake = createFakeClient()
  const unprovide = root.reflect.provide(SERVICE, fake.client)
  await root.plugin(humanInterventionUiModule)
  expect(pageIds(root)).toEqual(['decisions'])
  unprovide()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual([])
  root.reflect.provide(SERVICE, fake.client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual(['decisions'])
})

it('U5 没有协议客户端：模块不加载', async () => {
  const { root } = await startShell()
  await root.plugin(humanInterventionUiModule)
  expect(pageIds(root)).toEqual([])
})
