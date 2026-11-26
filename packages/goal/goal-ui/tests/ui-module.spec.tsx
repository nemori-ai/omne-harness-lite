// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { definePoint, partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { createGoalUiModule } from '../src/cordis.ts'
import { fakeClient, SESSION, TENANT } from './fixtures/client.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { startShell as startBare } from './fixtures/reference-shell.ts'

const side = definePoint<{ readonly session: string }>({
  name: 'session.side',
  subject: { encode: value => value.session, decode: text => ({ session: text }) },
})

/** The host of this point is not on this tree: the case stands in for it and declares the point. */
async function startShell() {
  const started = await startBare()
  side.declare(started.shell)
  return started
}
const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 12; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
  })
const tabs = (shell: Awaited<ReturnType<typeof startShell>>['shell']) =>
  shell.items('attached').map(item => [item.anchor, item.id, item.label, item.order])

beforeAll(stubAnimation)
afterEach(cleanup)

it('puts one tab named 目标 beside the open session, where the assembly said, and declares its part', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(root, goalProtocol, fakeClient().client)
  await root.plugin(createGoalUiModule({ sessionSide: side }))
  expect(tabs(shell)).toEqual([['session.side', 'goal', '目标', 10]])
  expect(shell.items('pages')).toEqual([])
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['goal.panel', 'session.side'],
  ])
})

it('puts nothing anywhere when the assembly names no place', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(root, goalProtocol, fakeClient().client)
  await root.plugin(createGoalUiModule())
  expect(tabs(shell)).toEqual([])
})

it('reads the goal of the session the tab is shown for, as the tenant of the shell; without a tenant it draws nothing and asks nothing', async () => {
  const { root, shell } = await startShell()
  const fake = fakeClient()
  await serveProtocol(root, goalProtocol, fake.client)
  await root.plugin(createGoalUiModule({ sessionSide: side }))
  const [tab] = shell.items('attached')
  const bare = render(<>{tab!.render({ scope: undefined, subject: SESSION })}</>)
  await settle()
  expect(bare.container.textContent).toBe('')
  expect(fake.streams).toHaveLength(0)
  cleanup()
  const view = render(<>{tab!.render({ scope: TENANT as unknown as string, subject: SESSION })}</>)
  await settle()
  fake.streams[0]!.push()
  await settle()
  expect(fake.calls).toEqual([['read-goal', { tenant: expect.anything(), session: SESSION }]])
  expect(view.container.textContent).toContain('处理中')
})

it('takes its tab away with the protocol, and puts it back when the protocol is served again', async () => {
  const { root, shell } = await startShell()
  const fake = fakeClient()
  const served = await serveProtocol(root, goalProtocol, fake.client)
  await root.plugin(createGoalUiModule({ sessionSide: side }))
  expect(shell.adoption('goal-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { goal: { key: 'goal/v1' } },
  })
  await served.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(shell.adoption('goal-ui')).toMatchObject({ kind: 'unavailable' })
  await serveProtocol(root, goalProtocol, fake.client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(shell.adoption('goal-ui')).toMatchObject({ kind: 'adopted' })
  expect(tabs(shell)).toEqual([['session.side', 'goal', '目标', 10]])
})
