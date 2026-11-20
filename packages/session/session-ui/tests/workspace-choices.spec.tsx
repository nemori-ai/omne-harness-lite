// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeAll, expect, it } from 'vitest'
import {
  sessionWorkspaceChoicesKey,
  type WorkspaceChoiceHolder,
  type WorkspaceChoiceSource,
} from '../src/cordis.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const BLOG = { workspace: 'wsp_blog', instance: 'wsi_blog' }
const SHOP = { workspace: 'wsp_shop', instance: 'wsi_shop' }
const OLD = { workspace: 'wsp_old', instance: 'wsi_old' }

const list: WorkspaceChoiceSource = {
  list: async () => ({
    kind: 'listed',
    choices: [
      { ...BLOG, label: 'blog', selectable: true, note: null },
      { ...SHOP, label: 'shop', selectable: true, note: null },
      { ...OLD, label: 'old', selectable: false, note: '实例用不了' },
    ],
  }),
}

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const picker = () => screen.queryByRole('combobox', { name: '新会话的工作区' })
const heading = () => screen.queryByRole('combobox', { name: '工作区' })
const holderOf = (root: Context): WorkspaceChoiceHolder =>
  (root as unknown as { get(name: string): unknown }).get(
    sessionWorkspaceChoicesKey,
  ) as WorkspaceChoiceHolder

async function pickOption(trigger: HTMLElement, name: RegExp): Promise<void> {
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name }))
  await settle()
}

async function opened(fake: FakeClient, selection: Record<string, unknown>): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: 'ses_a', recovered: false },
  })
  await settle()
  const read = await fake.next('read-workspace-selection')
  expect(read.body).toMatchObject({ session: 'ses_a' })
  read.answer({ outcome: 'succeeded', body: { revision: '1', reason: null, ...selection } })
  await settle()
}

it('nobody lists workspaces: the interface is whole, the heading names the directory, a new session names none', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  await settle()
  expect(shell.items('pages').map(item => item.id)).toEqual(['conversation', 'history-search'])
  expect(picker()).toBeNull()
  await opened(fake, { workspace: null, state: 'default', directory: '/srv/default' })
  expect(fake.calls.find(call => call.operation === 'create-session')?.body).toEqual({
    createCallId: expect.any(String),
    purpose: '',
  })
  expect(screen.getByText('工作目录：/srv/default')).toBeTruthy()
  expect(heading()).toBeNull()
})

it('a list is handed over: a new session starts in the instance picked; taken away: the rest stays', async () => {
  const fake = createFakeClient()
  const { root, shell } = await mountModule(fake.client, TENANT)
  let withdraw: () => void = () => {}
  await act(async () => {
    withdraw = holderOf(root).attach(list)
  })
  await settle()
  fireEvent.keyDown(picker()!, { key: 'Enter' })
  const old = await screen.findByRole('option', { name: /old/u })
  expect(old.getAttribute('aria-disabled')).toBe('true')
  fireEvent.click(await screen.findByRole('option', { name: /shop/u }))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  const create = await fake.next('create-session')
  expect(create.body).toEqual({ createCallId: expect.any(String), purpose: '', workspace: SHOP })

  await act(async () => {
    withdraw()
  })
  await settle()
  expect(picker()).toBeNull()
  expect(shell.items('sidebar').map(item => item.id)).toEqual(['session-list', 'archived-sessions'])
  expect(shell.items('pages').map(item => item.id)).toEqual(['conversation', 'history-search'])
})

it('the heading shows where the session works and changes it, to another instance or to none', async () => {
  const fake = createFakeClient()
  const { root } = await mountModule(fake.client, TENANT)
  await act(async () => {
    holderOf(root).attach(list)
  })
  await opened(fake, { workspace: BLOG, state: 'attached', directory: '/srv/blog' })
  expect(screen.getByText('工作目录：/srv/blog')).toBeTruthy()
  expect(heading()!.textContent).toContain('blog')

  await pickOption(heading()!, /shop/u)
  const moved = await fake.next('select-workspace')
  expect(moved.body).toEqual({
    tenant: expect.anything(),
    session: 'ses_a',
    controlId: expect.any(String),
    workspace: SHOP,
  })
  moved.answer({ outcome: 'succeeded', body: { controlId: 'c', directory: '/srv/shop' } })
  await settle()
  const reread = await fake.next('read-workspace-selection')
  reread.answer({
    outcome: 'succeeded',
    body: {
      workspace: SHOP,
      state: 'attached',
      directory: '/srv/shop',
      reason: null,
      revision: '2',
    },
  })
  await settle()
  expect(screen.getByText('已换到 /srv/shop')).toBeTruthy()
  expect(screen.getByText('工作目录：/srv/shop')).toBeTruthy()

  await pickOption(heading()!, /不选工作区/u)
  const cleared = await fake.next('select-workspace')
  expect(cleared.body).toMatchObject({ session: 'ses_a', workspace: null })
  cleared.answer({ outcome: 'invalid', body: { reason: 'not-permitted' } })
  await settle()
  ;(await fake.next('read-workspace-selection')).answer({ outcome: 'unknown' })
  await settle()
  expect(screen.getByText('没有换：没有在这个工作区里工作的权限')).toBeTruthy()
  expect(screen.getByText('工作目录读不到：unknown')).toBeTruthy()
})

it('an instance it cannot work in now is said, and one nobody offers any more stays shown', async () => {
  const fake = createFakeClient()
  const { root } = await mountModule(fake.client, TENANT)
  await act(async () => {
    holderOf(root).attach({ list: async () => ({ kind: 'listed', choices: [] }) })
  })
  await opened(fake, {
    workspace: OLD,
    state: 'unusable',
    directory: null,
    reason: 'not-permitted',
  })
  const said = screen.getByText('工作区用不了：没有在这个工作区里工作的权限')
  expect(said.textContent).not.toMatch(/隔离|保证/u)
  expect(heading()!.textContent).toContain(OLD.instance)
})

it('the place a list is handed over goes when the session interface unloads', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  expect(holderOf(mounted.root)).toBeDefined()
  await mounted.withdraw()
  expect(holderOf(mounted.root)).toBeUndefined()
})
