// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { McpPage, type McpStatus } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  TENANT,
  endpoint,
  fakeGovernance,
  otherRow,
  permissionRow,
  readOf,
} from './fixtures/fake-governance.tsx'
import { action, answered, fakeStatus, stood } from './fixtures/fake-status.ts'

beforeAll(stubAnimation)

afterEach(cleanup)

const LIST = '这个接入点的动作'

function shownWith(status: McpStatus | null) {
  const fake = fakeGovernance(
    readOf(endpoint('context7', [permissionRow(), otherRow('target', 'ordinary')])),
  )
  render(<McpPage governance={fake.governance} tenant={TENANT} status={status} />)
  return fake
}

const section = () => screen.getByRole('region', { name: 'context7' })

it('E1 under the name, one status line: connected or not, with the reason the endpoint gave', async () => {
  shownWith(fakeStatus(answered(stood(), [])).status)
  expect(await screen.findByText('已连上')).toBeTruthy()
  expect(section().querySelector('h3 + [data-omne-part="mcp.endpoint.status"]')).not.toBeNull()
  cleanup()
  const lost = stood({
    connection: { state: 'lost', reason: 'the endpoint could not be reached' },
  })
  shownWith(fakeStatus(answered(lost, null)).status)
  expect(await screen.findByText('连不上：the endpoint could not be reached')).toBeTruthy()
})

it('E2 it cannot be used: the status line says why, the credential that is missing too', async () => {
  const blocked = stood({
    connection: { state: 'none', reason: null },
    credential: 'absent',
    use: { kind: 'blocked', reason: 'the endpoint is disabled' },
  })
  shownWith(fakeStatus(answered(blocked, null)).status)
  expect(
    await screen.findByText('还没连过；凭据没配；不能用：the endpoint is disabled'),
  ).toBeTruthy()
})

it('E3 after the setting rows, one line per action: its name and summary, and why it cannot be called', async () => {
  const read = answered(stood({ catalog: { kind: 'acquired', actions: 2 } }), [
    action('search', '[peer] Search the docs'),
    action('fetch', '[peer] Fetch a page', 'the action is no longer offered'),
  ])
  shownWith(fakeStatus(read).status)
  const list = await screen.findByRole('list', { name: LIST })
  expect(
    within(list)
      .getAllByRole('listitem')
      .map(item => item.textContent),
  ).toEqual([
    'search[peer] Search the docs',
    'fetch[peer] Fetch a page（用不了：the action is no longer offered）',
  ])
  expect(
    section().querySelector('.mcp-endpoint-settings ~ [data-omne-part="mcp.endpoint.actions"]'),
  ).not.toBeNull()
  cleanup()
  shownWith(fakeStatus(answered(stood(), [])).status)
  expect(await screen.findByText('这个接入点没有动作。')).toBeTruthy()
})

it('E4 no actions acquired yet: says so with the reason, and 刷新 fetches them again, then reads the endpoint once more', async () => {
  const fake = fakeStatus(
    answered(
      stood({
        connection: { state: 'none', reason: null },
        catalog: { kind: 'not-acquired', reason: 'the address of the endpoint is not set' },
      }),
      null,
    ),
    answered(stood({ catalog: { kind: 'acquired', actions: 1 } }), [action('search', 'Search')]),
  )
  shownWith(fake.status)
  expect(
    await screen.findByText('动作清单还没取得：the address of the endpoint is not set'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByRole('list', { name: LIST })).toBeTruthy()
  expect(fake.calls).toEqual(['read context7', 'refresh context7', 'read context7'])
})

it('E5 while the refresh runs the block waits and offers no second one; an unknown answer is read back the same way', async () => {
  const fake = fakeStatus(
    answered(stood({ catalog: { kind: 'not-acquired', reason: null } }), null),
    answered(stood({ catalog: { kind: 'acquired', actions: 1 } }), [action('search', 'Search')]),
  )
  let answer: (value: { outcome: 'unknown' }) => void = () => undefined
  fake.refreshWith(new Promise(resolve => (answer = resolve)))
  shownWith(fake.status)
  expect(await screen.findByText('动作清单还没取得。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(screen.queryByRole('button', { name: '刷新' })).toBeNull()
  expect(
    section().querySelector('[data-omne-part="mcp.endpoint.actions"]')?.getAttribute('aria-busy'),
  ).toBe('true')
  await act(async () => answer({ outcome: 'unknown' }))
  expect(await screen.findByRole('list', { name: LIST })).toBeTruthy()
  expect(fake.calls).toEqual(['read context7', 'refresh context7', 'read context7'])
})

it('E6 the protocol is not there: status and actions say they cannot be read, the permission works as before', () => {
  const fake = shownWith(null)
  expect(screen.getByText('状态读不出。')).toBeTruthy()
  expect(screen.getByText('动作清单读不出。')).toBeTruthy()
  const choices = within(screen.getByRole('group', { name: '调用这个接入点的动作' }))
  fireEvent.click(choices.getByRole('button', { name: '自动' }))
  expect(fake.calls).toEqual(['set permission auto'])
})

it('E7 a read that is not answered, not visible, or throws says the status cannot be read', async () => {
  for (const answer of [
    () => Promise.resolve({ outcome: 'unavailable' as const }),
    () => Promise.resolve({ outcome: 'not-visible' as const, body: {} }),
    () => Promise.reject(new Error('transport')),
  ]) {
    const status: McpStatus = {
      'read-endpoint': answer,
      'refresh-endpoint': () => Promise.resolve({ outcome: 'unavailable' }),
    }
    shownWith(status)
    expect(await screen.findByText('状态读不出。')).toBeTruthy()
    expect(screen.getByText('动作清单读不出。')).toBeTruthy()
    cleanup()
  }
})
