// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { definePoint, partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { createHumanInterventionUiModule } from '../src/cordis.ts'
import { page, questionItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell as startBare } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const ANCHOR = 'session.transcript'
const SESSION = 'ses_0123456789abcdef'
const dock = definePoint<{ readonly session: string }>({
  title: 'test',
  name: ANCHOR,
  subject: { encode: value => value.session, decode: text => ({ session: text }) },
})

/** The host of these points is not on this tree: the case stands in for it and declares them. */
async function startShell() {
  const started = await startBare()
  for (const point of [dock]) point.declare(started.shell)
  return started
}

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const pageIds = (root: Context) =>
  (root.shell as unknown as { items(slot: 'pages'): { id: string }[] })
    .items('pages')
    .map(item => item.id)

it('U1 协议客户端在：放「待你决定」一页，次序 10，带张数；不放侧栏与登录门', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(root, humanInterventionProtocol, createFakeClient().client)
  await root.plugin(createHumanInterventionUiModule())
  const [placed] = shell.items('pages')
  expect(placed).toMatchObject({ id: 'decisions', title: '待你决定', order: 10 })
  expect(placed?.badge).toBeTypeOf('function')
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
})

it('U1b 模块声明它的十二个部位，协议客户端在不在都一样', async () => {
  const { root, shell } = await startShell()
  await root.plugin(createHumanInterventionUiModule())
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['human-intervention.page', 'shell.workspace.page'],
    ['human-intervention.page.group', 'human-intervention.page'],
    ['human-intervention.paper', null],
    ['human-intervention.paper.card', 'human-intervention.paper'],
    ['human-intervention.paper.card.answer', 'human-intervention.paper.card'],
    ['human-intervention.paper.card.detail', 'human-intervention.paper.card'],
    ['human-intervention.paper.card.title', 'human-intervention.paper.card'],
    ['human-intervention.paper.foot', 'human-intervention.paper'],
    ['human-intervention.paper.foot.actions', 'human-intervention.paper.foot'],
    ['human-intervention.paper.foot.submit', 'human-intervention.paper.foot'],
    ['human-intervention.paper.pager', 'human-intervention.paper'],
    ['human-intervention.session-cards', 'session.transcript'],
  ])
})

it('U2 这一页用外壳给的租户，经注入的客户端取列表', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const call = await fake.next('list-cards')
  await act(async () => {
    call.answer(page([]))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(fake.calls).toHaveLength(1)
})

it('U3 还没有租户：页面与张数什么都不画，不发请求', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  const item = shell.items('pages')[0]!
  const view = render(
    <>
      {item.render({ scope: undefined })}
      {item.badge?.({ scope: undefined })}
    </>,
  )
  await settle()
  expect(fake.calls).toHaveLength(0)
  expect(fake.observations).toHaveLength(0)
  expect(view.container.textContent).toBe('')
})

it('U4 协议客户端撤了：页面照放，采用转成不可用；回来了：采用再成立', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  const served = await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  expect(pageIds(root)).toEqual(['decisions'])
  expect(shell.adoption('human-intervention-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { humanIntervention: { key: 'human-intervention/v1' } },
  })
  await served.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual(['decisions'])
  expect(shell.adoption('human-intervention-ui')).toMatchObject({ kind: 'unavailable' })
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual(['decisions'])
  expect(shell.adoption('human-intervention-ui')).toMatchObject({ kind: 'adopted' })
})

it('U5 没有协议客户端：页面照放，侧栏、登录门与会话里的一项不放', async () => {
  const { root, shell } = await startShell()
  await root.plugin(createHumanInterventionUiModule({ sessionDock: dock }))
  expect(pageIds(root)).toEqual(['decisions'])
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
  expect(shell.items('attached')).toEqual([])
})

it('U6 张数与页面读同一份：一次列表，一个观察', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  const item = shell.items('pages')[0]!
  const view = render(
    <>
      <span data-testid="badge">{item.badge?.({ scope: TENANT })}</span>
      {item.render({ scope: TENANT })}
    </>,
  )
  await settle()
  ;(await fake.next('list-cards')).answer(page([questionItem()]))
  await settle()
  expect(view.getByTestId('badge').textContent).toBe('1')
  expect(fake.calls.filter(call => call.operation === 'list-cards')).toHaveLength(1)
  expect(fake.observations).toHaveLength(1)
})

it('U7 不给会话的拓展点：不往 attached 放', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(root, humanInterventionProtocol, createFakeClient().client)
  await root.plugin(createHumanInterventionUiModule())
  expect(shell.items('attached')).toEqual([])
})

it('U8 给了会话的拓展点：往它里面放一项，展示这个会话的卡', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  shell.tenant = TENANT
  await root.plugin(createHumanInterventionUiModule({ sessionDock: dock }))
  expect(shell.items('attached')).toEqual([
    expect.objectContaining({ id: 'decisions-in-session', order: 0, anchor: ANCHOR }),
  ])
  const view = render(<>{shell.attached(ANCHOR, SESSION)}</>)
  await settle()
  ;(await fake.next('list-cards')).answer(page([questionItem()]))
  await settle()
  expect(view.getByRole('region', { name: '这个会话待答的问题' })).toBeTruthy()
  const none = render(<>{shell.attached(ANCHOR, 'ses_other')}</>)
  await settle()
  expect(none.container.innerHTML).toBe('')
})

it('U9 拓展点里的一项没有租户：什么都不画', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule({ sessionDock: dock }))
  const view = render(<>{shell.attached(ANCHOR, SESSION)}</>)
  await settle()
  expect(view.container.innerHTML).toBe('')
  expect(fake.calls).toHaveLength(0)
})

it('U10 模块卸载：观察被中止', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  const served = await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  await settle()
  expect(fake.observations).toHaveLength(1)
  await served.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(fake.observations[0]!.signal.aborted).toBe(true)
})

it('U11 给了会话的拓展点：协议客户端撤下，放在里面的一项没有了、观察被中止；协议客户端回来，这一项回来', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  shell.tenant = TENANT
  const served = await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule({ sessionDock: dock }))
  const placed = () => shell.items('attached').map(item => `${item.anchor}/${item.id}`)
  expect(placed()).toEqual([`${ANCHOR}/decisions-in-session`])
  render(<>{shell.attached(ANCHOR, SESSION)}</>)
  await settle()
  expect(fake.observations).toHaveLength(1)

  await served.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(placed()).toEqual([])
  expect(fake.observations[0]!.signal.aborted).toBe(true)

  await serveProtocol(root, humanInterventionProtocol, createFakeClient().client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(placed()).toEqual([`${ANCHOR}/decisions-in-session`])
})

it('U12 经形口报待答数：外壳租户里等人回答的卡片张数，与「待你决定」这一页；不报活动与一次性的事实', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  shell.tenant = TENANT
  await root.plugin(createHumanInterventionUiModule())
  ;(await fake.next('list-cards')).answer(page([questionItem('a'), questionItem('b')]))
  await settle()
  expect(shell.reports.at(-1)).toEqual({ doing: 'idle', waiting: 2, waitingPage: 'decisions' })
  expect(shell.reports.every(report => report.moment === undefined)).toBe(true)
  const item = shell.items('pages')[0]!
  const view = render(<span data-testid="badge">{item.badge?.({ scope: TENANT })}</span>)
  await settle()
  expect(view.getByTestId('badge').textContent).toBe('2')
  expect(fake.calls.filter(call => call.operation === 'list-cards')).toHaveLength(1)
})

it('U13 待答数跟着外壳的租户：没有租户报零，租户来了读它的卡，租户清空时不再看着它的卡', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  await serveProtocol(root, humanInterventionProtocol, fake.client)
  await root.plugin(createHumanInterventionUiModule())
  expect(shell.reports).toEqual([{ doing: 'idle', waiting: 0 }])
  expect(fake.calls).toHaveLength(0)
  act(() => shell.setTenant(TENANT))
  ;(await fake.next('list-cards')).answer(page([questionItem('a')]))
  await settle()
  expect(shell.reports.at(-1)).toEqual({ doing: 'idle', waiting: 1, waitingPage: 'decisions' })
  act(() => shell.setTenant(TENANT))
  expect(fake.observations).toHaveLength(1)
  act(() => shell.setTenant(undefined))
  expect(shell.reports.at(-1)).toEqual({ doing: 'idle', waiting: 0 })
  expect(fake.observations[0]!.signal.aborted).toBe(true)
})
