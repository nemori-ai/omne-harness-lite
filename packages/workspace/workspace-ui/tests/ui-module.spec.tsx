// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { workspaceChoicesKey, workspaceClientService, workspaceUiModule } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const OPERATIONS = Object.keys(workspaceProtocol.operations)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const choicesOf = (root: unknown) =>
  (root as { get(name: string): unknown }).get(workspaceChoicesKey)

beforeAll(stubAnimation)
afterEach(cleanup)

it('the workspace client present: the page and the list of instances; withdrawn: both go', async () => {
  const { root, shell } = await startShell()
  const client = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS).client
  const unprovide = root.reflect.provide(workspaceClientService, client)
  await root.plugin(workspaceUiModule)
  expect(shell.items('pages')).toMatchObject([
    { id: 'workspaces', title: '工作区', order: 14, icon: 'resource' },
  ])
  expect(shell.items('sidebar')).toEqual([])
  expect(choicesOf(root)).toMatchObject({ list: expect.any(Function) })
  unprovide()
  await tick()
  expect(shell.items('pages')).toEqual([])
  expect(choicesOf(root)).toBeUndefined()
})

it('no tenant yet: nothing is drawn and nothing is read', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
  root.reflect.provide(workspaceClientService, fake.client)
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
