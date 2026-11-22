// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { providedOn, serveProtocol } from '@omne-harness/shell-contract/testing'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { workspaceChoicesKey, workspaceUiModule } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const OPERATIONS = Object.keys(workspaceProtocol.operations)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const choicesOf = (shell: Parameters<typeof providedOn>[0]) =>
  providedOn(shell, workspaceChoicesKey)

beforeAll(stubAnimation)
afterEach(cleanup)

it('the workspace client present: the page and the list of instances; withdrawn: the page stays, the list goes', async () => {
  const { root, shell } = await startShell()
  const client = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS).client
  const served = await serveProtocol(root, workspaceProtocol, client)
  await root.plugin(workspaceUiModule)
  expect(shell.items('pages')).toMatchObject([
    { id: 'workspaces', title: '工作区', order: 14, icon: 'resource' },
  ])
  expect(shell.items('sidebar')).toEqual([])
  expect(choicesOf(shell)).toMatchObject({ list: expect.any(Function) })
  expect(shell.adoption('workspace-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { workspace: { key: 'workspace/v1' } },
  })
  await served.dispose()
  await tick()
  expect(shell.items('pages').map(page => page.id)).toEqual(['workspaces'])
  expect(choicesOf(shell)).toBeUndefined()
})

it('no tenant yet: nothing is drawn and nothing is read', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
  await serveProtocol(root, workspaceProtocol, fake.client)
  await root.plugin(workspaceUiModule)
  const view = render(<>{shell.items('pages')[0]!.render({ scope: undefined })}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
  cleanup()
  const tenant =
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
  const drawn = render(<>{shell.items('pages')[0]!.render({ scope: tenant })}</>)
  expect(drawn.getByRole('heading', { name: '工作区' })).toBeTruthy()
  expect(fake.calls.map(call => call.operation)).toEqual(['list'])
})

it('a change made on the page is told to whoever listens to the list of instances', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
  await serveProtocol(root, workspaceProtocol, fake.client)
  await root.plugin(workspaceUiModule)
  let told = 0
  ;(choicesOf(shell) as { changed(listener: () => void): () => void }).changed(() => (told += 1))
  const tenant =
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
  render(<>{shell.items('pages')[0]!.render({ scope: tenant })}</>)
  ;(await fake.next('list')).answer({ outcome: 'succeeded', body: { workspaces: [] } })
  fireEvent.change(await screen.findByLabelText('要登记的目录'), { target: { value: '/srv/blog' } })
  fireEvent.click(screen.getByRole('button', { name: '登记' }))
  ;(await fake.next('register')).answer({ outcome: 'succeeded', body: {} })
  await act(async () => {
    await tick()
  })
  expect(told).toBe(1)
})
