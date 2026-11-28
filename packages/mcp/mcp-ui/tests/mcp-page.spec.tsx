// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { McpPage } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  TENANT,
  endpoint,
  fakeGovernance,
  otherRow,
  permissionRow,
  readOf,
} from './fixtures/fake-governance.tsx'

beforeAll(stubAnimation)

afterEach(cleanup)

const EMPTY = '接进来的 MCP 接入点会列在这里。'

const choices = () => within(screen.getByRole('group', { name: '调用这个接入点的动作' }))
const choice = (label: string) => choices().getByRole('button', { name: label })
const pressed = () =>
  choices()
    .getAllByRole('button')
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.textContent)
const control = () => document.querySelector<HTMLElement>('.mcp-permission-control')

async function openMenu(): Promise<HTMLElement> {
  fireEvent.pointerDown(screen.getByRole('button', { name: '更多' }), { button: 0, ctrlKey: false })
  return screen.findByRole('menu')
}

function shown(rows = [permissionRow(), otherRow('target', 'ordinary')]) {
  const fake = fakeGovernance(readOf(endpoint('context7', rows)))
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  return fake
}

it('M1 opens the mcp category of the tenant the shell gives, and closes it when the page goes', () => {
  const fake = fakeGovernance({ kind: 'reading' })
  const view = render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  expect(fake.opened).toEqual([`mcp ${TENANT}`])
  view.unmount()
  expect(fake.calls).toEqual(['close'])
})

it('M17 another tenant: the old view is closed and the new tenant opened', () => {
  const fake = fakeGovernance({ kind: 'reading' })
  const other = TENANT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002')
  const view = render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  view.rerender(<McpPage governance={fake.governance} tenant={other} status={null} />)
  expect(fake.opened).toEqual([`mcp ${TENANT}`, `mcp ${other}`])
  expect(fake.calls).toEqual(['close'])
})

it('M2 still reading: says so', () => {
  const fake = fakeGovernance({ kind: 'reading' })
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  expect(screen.getByText('正在读取 MCP 的接入点……')).toBeTruthy()
  expect(screen.queryByText(EMPTY)).toBeNull()
})

it('M3 the port cannot read: the reason as given, and a retry that reads again', () => {
  const fake = fakeGovernance({
    kind: 'unreadable',
    notice: { kind: 'unavailable', text: '资产的依据暂时取不到。' },
  })
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  expect(screen.getByRole('alert').textContent).toContain('资产的依据暂时取不到。')
  expect(screen.queryByText(EMPTY)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(fake.calls).toEqual(['read'])
})

it('M4 read and no endpoint: says where endpoints will be listed', () => {
  const fake = fakeGovernance(readOf())
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  expect(screen.getByText(EMPTY)).toBeTruthy()
})

it('M5 one block per endpoint: the call permission drawn by MCP, every other item by the default part', () => {
  const fake = fakeGovernance(
    readOf(
      endpoint('context7', [
        permissionRow(),
        otherRow('target', 'ordinary'),
        otherRow('credential', 'secret'),
      ]),
      endpoint('docs', [
        permissionRow({ key: 'docs-permission' }),
        otherRow('docs-target', 'ordinary'),
      ]),
    ),
  )
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual([
    'context7',
    'docs',
  ])
  const defaults = [...document.querySelectorAll('[data-default-row]')].map(node =>
    node.getAttribute('data-default-row'),
  )
  expect(defaults).toEqual(['target', 'credential', 'docs-target'])
  expect(screen.getAllByRole('group', { name: '调用这个接入点的动作' })).toHaveLength(2)
  expect(screen.queryByText(EMPTY)).toBeNull()
})

it('M6 a segmented control, the effective pick selected; picking another one sets it through the port', () => {
  const fake = shown()
  expect(pressed()).toEqual(['询问'])
  expect(screen.getByText('这一层没有挑选')).toBeTruthy()
  fireEvent.click(choice('自动'))
  expect(fake.calls).toEqual(['set permission auto'])
})

it('M7 this layer has its own pick: says so, and the clear is in the row menu; without one there is no menu', async () => {
  const fake = shown([
    permissionRow({ view: { own: 'auto', effective: { kind: 'value', value: 'auto' } } }),
  ])
  expect(pressed()).toEqual(['自动'])
  expect(screen.getByText('这一层设的')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '清除这一层的挑选' })).toBeNull()
  const menu = await openMenu()
  await act(async () => {
    fireEvent.click(within(menu).getByRole('menuitem', { name: '清除这一层的挑选' }))
  })
  expect(fake.calls).toEqual(['clear permission'])
  cleanup()
  shown()
  expect(screen.queryByRole('button', { name: '更多' })).toBeNull()
})

it('M8 a write in flight: the control waits on itself and takes no pick; the menu is closed', () => {
  const fake = shown([permissionRow({ view: { own: 'auto' }, write: { kind: 'submitting' } })])
  expect(control()?.getAttribute('aria-busy')).toBe('true')
  fireEvent.click(choice('禁止'))
  expect(fake.calls).toEqual([])
  expect((screen.getByRole('button', { name: '更多' }) as HTMLButtonElement).disabled).toBe(true)
})

it('M18 a pick shows at once while it is written, and falls back to what was read when refused', () => {
  const fake = shown()
  fireEvent.click(choice('自动'))
  act(() =>
    fake.show(readOf(endpoint('context7', [permissionRow({ write: { kind: 'submitting' } })]))),
  )
  expect(pressed()).toEqual(['自动'])
  const notice = { kind: 'refused', text: '没有写成。' } as const
  act(() =>
    fake.show(
      readOf(endpoint('context7', [permissionRow({ write: { kind: 'refused', notice } })])),
    ),
  )
  expect(pressed()).toEqual(['询问'])
})

it('M9 the result is unknown: the control stays on the pick sent, the reason, and a confirm that asks about the same write', () => {
  const notice = { kind: 'unknown', text: '没等到结果，这次改动可能已经生效。' } as const
  const fake = shown()
  fireEvent.click(choice('自动'))
  act(() =>
    fake.show(
      readOf(
        endpoint('context7', [
          permissionRow({ write: { kind: 'unknown', confirming: false, notice } }),
        ]),
      ),
    ),
  )
  expect(pressed()).toEqual(['自动'])
  expect(screen.getByRole('status').textContent).toContain(notice.text)
  fireEvent.click(screen.getByRole('button', { name: '再确认一次' }))
  expect(fake.calls).toEqual(['set permission auto', 'confirm permission'])
  cleanup()
  shown([permissionRow({ write: { kind: 'unknown', confirming: true, notice } })])
  expect(screen.queryByRole('button', { name: '再确认一次' })).toBeNull()
})

it('M10 refused or not confirmed: the reason, and picking is open again', () => {
  for (const kind of ['refused', 'unconfirmed'] as const) {
    const text = `${kind} 的原因`
    const fake = shown([permissionRow({ write: { kind, notice: { kind: 'refused', text } } })])
    expect(screen.getByText(text)).toBeTruthy()
    fireEvent.click(choice('禁止'))
    expect(fake.calls).toEqual(['set permission deny'])
    cleanup()
  }
})

it('M11 written: no notice is left behind', () => {
  shown([permissionRow({ write: { kind: 'succeeded' } })])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
})

it('M12 this layer may not change the item: the value it has, read-only, no greyed control, and the page says so', () => {
  shown([permissionRow({ view: { editable: { kind: 'no' } } })])
  expect(screen.queryByRole('group', { name: '调用这个接入点的动作' })).toBeNull()
  expect(document.querySelector('.mcp-permission-value')?.textContent).toBe('询问')
  expect(screen.getByText('这一层不能改这一项。')).toBeTruthy()
})

it('M13 prohibited from outside, or no pick left inside the bound: a read-only value instead of the control', () => {
  shown([permissionRow({ view: { effective: { kind: 'prohibited' } } })])
  expect(screen.queryByRole('group', { name: '调用这个接入点的动作' })).toBeNull()
  expect(document.querySelector('.mcp-permission-value')?.textContent).toBe('被禁止')
  cleanup()
  shown([permissionRow({ view: { effective: { kind: 'empty-bound' } } })])
  expect(document.querySelector('.mcp-permission-value')?.textContent).toBe('没有可选的一档')
})

it('M14 the item is being read again: the control waits; the read failed: the default part takes the row', () => {
  shown([permissionRow({ read: { kind: 'reading' } })])
  expect(control()?.getAttribute('aria-busy')).toBe('true')
  cleanup()
  shown([permissionRow({ read: { kind: 'failed' } })])
  expect(screen.queryByRole('group', { name: '调用这个接入点的动作' })).toBeNull()
  expect(document.querySelector('[data-default-row="permission"]')).not.toBeNull()
})

it('M15 the list is partial: says so above the endpoints; with none read, it does not claim there are none', () => {
  const partial = '接入点不全：有的来源暂时读不出，这里没有列全。'
  const fake = fakeGovernance({ ...readOf(endpoint('context7', [permissionRow()])), partial: true })
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  const notice = screen.getByRole('alert')
  expect(notice.textContent).toContain(partial)
  expect(notice.closest<HTMLElement>('[data-inline-notice]')?.dataset['tone']).toBe('caution')
  expect(screen.getByRole('heading', { level: 3, name: 'context7' })).toBeTruthy()
  cleanup()
  const none = fakeGovernance({ ...readOf(), partial: true })
  render(<McpPage governance={none.governance} tenant={TENANT} status={null} />)
  expect(screen.getByText(partial)).toBeTruthy()
  expect(screen.queryByText(EMPTY)).toBeNull()
})

it('M16 the snapshot changes: the page follows', () => {
  const fake = fakeGovernance({ kind: 'reading' })
  render(<McpPage governance={fake.governance} tenant={TENANT} status={null} />)
  act(() => fake.show(readOf()))
  expect(screen.getByText(EMPTY)).toBeTruthy()
})

it('P0 each part of the page is on its own element', () => {
  shown()
  const on = (name: string) => document.querySelectorAll(`[data-omne-part="${name}"]`)
  expect(on('mcp.page')[0]?.classList.contains('mcp-page')).toBe(true)
  expect(on('mcp.endpoint')[0]?.classList.contains('mcp-endpoint')).toBe(true)
  expect(on('mcp.endpoint.permission')[0]?.classList.contains('mcp-permission')).toBe(true)
})

it('P-hint the empty page says where one is added', async () => {
  const { governance } = fakeGovernance(readOf())
  render(<McpPage governance={governance} tenant={TENANT} status={null} />)
  expect(
    await screen.findByText('点上面的「新建」填它的地址，或者在会话里让 agent 帮你接。'),
  ).toBeTruthy()
})
