// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ClientOf } from '@omne-harness/sdk/core'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { REGISTER_HINT, WorkspacesPage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const OTHER =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
const OPERATIONS = Object.keys(workspaceProtocol.operations)
const BLOG = { workspace: 'wsp_blog', type: 'filesystem', standing: 'owner' }

beforeAll(stubAnimation)
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function shown(workspaces: readonly unknown[] = [BLOG]) {
  const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
  let id = 0
  render(
    <WorkspacesPage client={fake.client} tenant={TENANT} newId={() => `op-${String((id += 1))}`} />,
  )
  ;(await fake.next('list')).answer({ outcome: 'succeeded', body: { workspaces } })
  await settle()
  return fake
}

async function opened(fake: FakeClient<ClientOf<WorkspaceProtocol>>) {
  fireEvent.click(screen.getByRole('button', { name: `查看 ${BLOG.workspace}` }))
  const described = await fake.next('describe')
  expect(described.body).toMatchObject({ workspace: BLOG.workspace })
  described.answer({
    outcome: 'succeeded',
    body: {
      ...BLOG,
      instances: [
        {
          instance: 'wsi_main',
          address: '/srv/blog',
          availability: { kind: 'available', directory: '/srv/blog', basis: 'b' },
        },
        { instance: 'wsi_old', address: '/srv/old', availability: { kind: 'unknown' } },
      ],
    },
  })
  await settle()
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the workspaces page', () => {
  it('says what registering does, without promising what it does not do', async () => {
    await shown([])
    expect(screen.getByText(REGISTER_HINT)).toBeTruthy()
    expect(REGISTER_HINT).not.toMatch(/隔离|保证/u)
    expect(REGISTER_HINT).toContain('管谁能在这里工作、能不能读它的来源')
    expect(REGISTER_HINT).toContain(
      '它不拦原本就能做的文件读写；命令在这个目录之外读写，也不归它管',
    )
    expect(screen.getByText('还没有工作区。登记一个目录开始。')).toBeTruthy()
    const button = screen.getByRole('button', { name: '登记' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    type('要登记的目录', '   ')
    expect(button.disabled).toBe(true)
  })

  it('registers a directory and reads the list again; a list read before it does not win', async () => {
    const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
    let id = 0
    render(
      <WorkspacesPage
        client={fake.client}
        tenant={TENANT}
        newId={() => `op-${String((id += 1))}`}
      />,
    )
    const first = await fake.next('list')
    expect(first.body).toEqual({ tenant: expect.anything() })
    type('要登记的目录', '/srv/blog')
    fireEvent.click(screen.getByRole('button', { name: '登记' }))
    const registered = await fake.next('register')
    expect(registered.body).toEqual({
      tenant: expect.anything(),
      operation: 'op-1',
      address: '/srv/blog',
    })
    registered.answer({
      outcome: 'succeeded',
      body: { workspace: 'wsp_blog', instance: 'wsi_main', type: 'filesystem' },
    })
    await settle()
    expect(screen.getByText('正在读……')).toBeTruthy()
    ;(await fake.next('list')).answer({ outcome: 'succeeded', body: { workspaces: [BLOG] } })
    await settle()
    first.answer({ outcome: 'succeeded', body: { workspaces: [] } })
    await settle()
    expect(screen.getByRole('status').textContent).toBe('已登记')
    expect(screen.getByText('拥有者')).toBeTruthy()
  })

  it('a list shown is read again after a change, and said to be read meanwhile', async () => {
    const fake = await shown([BLOG])
    type('要登记的目录', '/srv/shop')
    fireEvent.click(screen.getByRole('button', { name: '登记' }))
    ;(await fake.next('register')).answer({ outcome: 'no-change', body: {} })
    await settle()
    expect(screen.getByText('正在读……')).toBeTruthy()
    expect(screen.queryByText('拥有者')).toBeNull()
  })

  it('each change reads the list and the workspace again', async () => {
    const fake = await shown()
    await opened(fake)
    for (const name of ['grant-participation', 'remove'] as const) {
      type('对方的租户', `  ${OTHER}  `)
      fireEvent.click(screen.getByRole('button', { name: name === 'remove' ? '移除' : '授予参与' }))
      ;(await fake.next(name)).answer({ outcome: 'succeeded', body: {} })
      await settle()
      ;(await fake.next('list')).answer({ outcome: 'succeeded', body: { workspaces: [BLOG] } })
      ;(await fake.next('describe')).answer({
        outcome: 'succeeded',
        body: { ...BLOG, instances: [] },
      })
      await settle()
    }
    const count = (name: string) => fake.calls.filter(call => call.operation === name).length
    expect([count('list'), count('describe')]).toEqual([3, 3])
    expect(screen.queryByText('对方的租户读不懂')).toBeNull()
  })

  it('a workspace still being read, or one it cannot see, is said', async () => {
    const fake = await shown()
    fireEvent.click(screen.getByRole('button', { name: `查看 ${BLOG.workspace}` }))
    await settle()
    expect(screen.getByRole('heading', { name: `工作区 ${BLOG.workspace}` })).toBeTruthy()
    expect(screen.getByText('正在读……')).toBeTruthy()
    expect((screen.getByLabelText('对方的租户') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('对方的租户读不懂')).toBeNull()
    ;(await fake.next('describe')).answer({ outcome: 'not-found', body: {} })
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('看不了：没有这个工作区')
    expect(screen.queryByText('正在读……')).toBeNull()
  })

  it('without a way to name an operation, each commit still gets a name of its own', async () => {
    const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
    render(<WorkspacesPage client={fake.client} tenant={TENANT} />)
    ;(await fake.next('list')).answer({ outcome: 'succeeded', body: { workspaces: [] } })
    await settle()
    type('要登记的目录', '/srv/blog')
    fireEvent.click(screen.getByRole('button', { name: '登记' }))
    const { body } = await fake.next('register')
    expect((body as { operation: unknown }).operation).toMatch(/^[0-9a-f-]{36}$/u)
  })

  it('shows the instances of a workspace and whether each can be worked in', async () => {
    const fake = await shown()
    await opened(fake)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('可用：/srv/blog')).toBeTruthy()
    expect(screen.getByText('现在不知道能不能用')).toBeTruthy()
  })

  it('grants participation and removes, to a tenant it can read, and refuses one it cannot', async () => {
    const fake = await shown()
    await opened(fake)
    type('对方的租户', 'nobody')
    fireEvent.click(screen.getByRole('button', { name: '授予参与' }))
    await settle()
    expect(screen.getByText('对方的租户读不懂')).toBeTruthy()
    expect(fake.calls.filter(call => call.operation === 'grant-participation')).toEqual([])

    type('对方的租户', OTHER)
    fireEvent.click(screen.getByRole('button', { name: '授予参与' }))
    const granted = await fake.next('grant-participation')
    expect(granted.body).toEqual({
      tenant: expect.anything(),
      operation: 'op-1',
      workspace: BLOG.workspace,
      target: expect.anything(),
    })
    granted.answer({ outcome: 'invalid', body: { reason: 'owner-needs-none' } })
    await settle()
    expect(screen.getByRole('status').textContent).toBe('没有授予：拥有者不需要授予')
    expect(screen.queryByText('对方的租户读不懂')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    const removed = await fake.next('remove')
    expect(removed.body).toMatchObject({ operation: 'op-2', workspace: BLOG.workspace })
    removed.answer({ outcome: 'succeeded', body: {} })
    await settle()
    expect(screen.getByRole('status').textContent).toBe('已移除')
    expect(fake.calls.filter(call => call.operation === 'list')).toHaveLength(2)
  })

  it('a commit whose end it does not learn is asked again, and can be asked once more', async () => {
    const fake = await shown()
    await opened(fake)
    type('对方的租户', OTHER)
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    ;(await fake.next('remove')).answer({ outcome: 'unknown' })
    await settle()
    const asked = await fake.next('query-remove')
    asked.answer({ outcome: 'basis-unavailable' })
    await settle()
    expect(screen.getByRole('status').textContent).toContain('不知道移除成没有，可以再查一次')
    fireEvent.click(screen.getByRole('button', { name: '再查一次' }))
    const again = await fake.next('query-remove')
    expect(again.body).toEqual(asked.body)
    again.answer({ outcome: 'not-committed', body: {} })
    await settle()
    expect(screen.getByRole('status').textContent).toBe('查过了：没有移除成')
  })

  it('a list it cannot read is said, and a tenant it cannot read asks nothing', async () => {
    const fake = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
    render(<WorkspacesPage client={fake.client} tenant={TENANT} />)
    ;(await fake.next('list')).answer({ outcome: 'denied' })
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('列不出：没有权限看工作区')
    cleanup()
    const lost = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
    render(
      <WorkspacesPage
        client={{ ...lost.client, list: async () => Promise.reject(new Error('down')) }}
        tenant={TENANT}
      />,
    )
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('列不出：没有送达')
    cleanup()
    const none = createFakeClient<ClientOf<WorkspaceProtocol>>(OPERATIONS)
    render(<WorkspacesPage client={none.client} tenant="not a tenant" />)
    await settle()
    expect(screen.getByText('读不懂当前的租户。')).toBeTruthy()
    expect(none.calls).toEqual([])
  })
})
