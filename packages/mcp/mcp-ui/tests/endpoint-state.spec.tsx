// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
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
import { action, answered, fakeStatus, observed, stood } from './fixtures/fake-status.ts'

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
  cleanup()
  shownWith(
    fakeStatus(answered(stood({ connection: { state: 'preparing', reason: null } }), null)).status,
  )
  expect(await screen.findByText('正在连接')).toBeTruthy()
  cleanup()
  const degraded = stood({
    connection: { state: 'degraded', reason: 'the actions of the endpoint could not be listed' },
  })
  shownWith(fakeStatus(answered(degraded, null)).status)
  expect(
    await screen.findByText('已连上，动作取不全：the actions of the endpoint could not be listed'),
  ).toBeTruthy()
})

it('E8 while the endpoint is read, the status line says so through the loading part', () => {
  const status: McpStatus = {
    'read-endpoint': () => new Promise(() => undefined),
    'refresh-endpoint': () => new Promise(() => undefined),
  }
  shownWith(status)
  expect(screen.getByRole('status', { name: '正在读取状态……' })).toBeTruthy()
})

it('E9 another tenant: an answer for the one before, coming late, does not take its place', async () => {
  let late: (value: ReturnType<typeof answered>) => void = () => undefined
  const reads = [
    new Promise<ReturnType<typeof answered>>(resolve => (late = resolve)),
    Promise.resolve(answered(stood(), [])),
  ]
  const status: McpStatus = {
    'read-endpoint': () => reads.shift()!,
    'refresh-endpoint': () => new Promise(() => undefined),
  }
  const fake = fakeGovernance(readOf(endpoint('context7', [permissionRow()])))
  const other = TENANT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002')
  const view = render(<McpPage governance={fake.governance} tenant={TENANT} status={status} />)
  view.rerender(<McpPage governance={fake.governance} tenant={other} status={status} />)
  expect(await screen.findByText('已连上')).toBeTruthy()
  const gone = stood({ connection: { state: 'lost', reason: 'the endpoint could not be reached' } })
  await act(async () => late(answered(gone, null)))
  expect(screen.getByText('已连上')).toBeTruthy()
  expect(screen.queryByText(/连不上/)).toBeNull()
})

it('E10 every 刷新 fetches once and reads once more', async () => {
  const none = answered(stood({ catalog: { kind: 'not-acquired', reason: null } }), null)
  const fake = fakeStatus(none, none, none)
  shownWith(fake.status)
  for (let turn = 0; turn < 2; turn += 1) {
    fireEvent.click(await screen.findByRole('button', { name: '刷新' }))
    await act(async () => undefined)
  }
  expect(fake.calls).toEqual([
    'read context7',
    'refresh context7',
    'read context7',
    'refresh context7',
    'read context7',
  ])
})

it('E11 a tenant text the page cannot read: nothing is asked, the status cannot be read', () => {
  const fake = fakeStatus(answered(stood(), []))
  const governance = fakeGovernance(readOf(endpoint('context7', [permissionRow()])))
  render(<McpPage governance={governance.governance} tenant="not a tenant" status={fake.status} />)
  expect(screen.getByText('状态读不出。')).toBeTruthy()
  expect(fake.calls).toEqual([])
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
  cleanup()
  shownWith(fakeStatus(answered(stood({ credential: 'invalid' }), [])).status)
  expect(await screen.findByText('已连上；凭据的配值不对')).toBeTruthy()
})

it('E2b a credential the endpoint rejected: the status line says so and where to change it (C101)', async () => {
  const reason =
    'the credential of the endpoint was rejected by the endpoint; the person needs to set the right one'
  const rejected = stood({
    connection: { state: 'lost', reason },
    credential: 'present',
    credentialState: 'rejected',
  })
  shownWith(fakeStatus(answered(rejected, null)).status)
  expect(await screen.findByText(`连不上：${reason}；凭据被拒，要在设置里改成对的`)).toBeTruthy()
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

it('E12 a frame that the endpoints may have changed reads each endpoint again, without 刷新 (C107)', async () => {
  const fake = fakeStatus(
    answered(stood({ catalog: { kind: 'acquired', actions: 1 } }), [action('read', 'Read')]),
    answered(stood({ catalog: { kind: 'acquired', actions: 2 } }), [
      action('read', 'Read'),
      action('write', 'Write'),
    ]),
  )
  const feed = observed(fake.status)
  shownWith(feed.status)
  const list = await screen.findByRole('list', { name: LIST })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  await act(async () => feed.frame('events'))
  expect(fake.calls).toEqual(['read context7'])
  await act(async () => feed.frame())
  expect(await screen.findByText('Write')).toBeTruthy()
  expect(fake.calls).toEqual(['read context7', 'read context7'])
})

it('E13 an observation that broke is opened again later; one that was denied is not (C107)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const feed = observed(fakeStatus(answered(stood(), [])).status)
    shownWith(feed.status)
    expect(feed.opened()).toBe(1)
    await act(async () => feed.end({ kind: 'uncertain' }))
    expect(feed.opened()).toBe(1)
    await act(async () => vi.advanceTimersByTime(250))
    expect(feed.opened()).toBe(2)
    await act(async () => feed.end({ kind: 'ended', reason: 'denied' }))
    await act(async () => vi.advanceTimersByTime(20_000))
    expect(feed.opened()).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

const withFakeTimers = async (walk: () => Promise<void>) => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    await walk()
  } finally {
    vi.useRealTimers()
  }
}

it.each([
  ['refused', { kind: 'refused', outcome: 'protocol-rejected' }, 1],
  ['aborted', { kind: 'aborted' }, 1],
  ['unavailable on the server', { kind: 'ended', reason: 'unavailable' }, 2],
] as const)(
  'E14 an observation that ended %s is opened again only when it may come back (C107)',
  async (_label, end, opened) =>
    withFakeTimers(async () => {
      const feed = observed(fakeStatus(answered(stood(), [])).status)
      shownWith(feed.status)
      await act(async () => feed.end(end))
      await act(async () => vi.advanceTimersByTime(20_000))
      expect(feed.opened()).toBe(opened)
    }),
)

it('E15 the observation is opened for the tenant of the page; leaving the page stops it and opens nothing later (C107)', async () =>
  withFakeTimers(async () => {
    const feed = observed(fakeStatus(answered(stood(), [])).status)
    shownWith(feed.status)
    expect(feed.opens.map(open => open.tenant)).toHaveLength(1)
    expect(feed.opens[0]?.tenant).toBeTruthy()
    await act(async () => feed.end({ kind: 'uncertain' }))
    cleanup()
    expect(feed.opens[0]?.signal?.aborted).toBe(true)
    await act(async () => vi.advanceTimersByTime(20_000))
    expect(feed.opened()).toBe(1)
  }))

it('E16 each break in a row waits longer before the observation is opened again (C107)', async () =>
  withFakeTimers(async () => {
    const feed = observed(fakeStatus(answered(stood(), [])).status)
    shownWith(feed.status)
    await act(async () => feed.end({ kind: 'uncertain' }))
    await act(async () => vi.advanceTimersByTime(200))
    expect(feed.opened()).toBe(2)
    await act(async () => feed.end({ kind: 'uncertain' }))
    await act(async () => vi.advanceTimersByTime(300))
    expect(feed.opened()).toBe(2)
    await act(async () => vi.advanceTimersByTime(100))
    expect(feed.opened()).toBe(3)
  }))

it('E17 another tenant opens its own observation and stops the one before (C107)', async () => {
  const feed = observed(fakeStatus(answered(stood(), [])).status)
  const fake = fakeGovernance(readOf(endpoint('context7', [permissionRow()])))
  const other = TENANT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002')
  const view = render(<McpPage governance={fake.governance} tenant={TENANT} status={feed.status} />)
  view.rerender(<McpPage governance={fake.governance} tenant={other} status={feed.status} />)
  await act(async () => undefined)
  expect(feed.opened()).toBe(2)
  expect(feed.opens[0]?.signal?.aborted).toBe(true)
  expect(feed.opens[1]?.tenant).not.toEqual(feed.opens[0]?.tenant)
})

it('E18 a tenant text the page cannot read opens no observation; a client without observe waits for nothing (C107)', async () =>
  withFakeTimers(async () => {
    const feed = observed(fakeStatus(answered(stood(), [])).status)
    const governance = fakeGovernance(readOf(endpoint('context7', [permissionRow()])))
    render(
      <McpPage governance={governance.governance} tenant="not a tenant" status={feed.status} />,
    )
    await act(async () => undefined)
    expect(feed.opened()).toBe(0)
    cleanup()
    const timers = vi.getTimerCount()
    shownWith(fakeStatus(answered(stood(), [])).status)
    expect(await screen.findByText('已连上')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(timers)
  }))

it('E18 an OAuth endpoint not connected offers 连接: it opens the address in the browser and reads again (C201)', async () => {
  const fake = fakeStatus(
    answered(
      stood({ credential: 'absent', credentialState: 'absent', connect: 'available' }),
      null,
    ),
    answered(
      stood({ credential: 'absent', credentialState: 'absent', connect: 'connecting' }),
      null,
    ),
  )
  const opened: string[] = []
  vi.spyOn(window, 'open').mockImplementation(url => (opened.push(String(url)), null))
  const begun: string[] = []
  const status: McpStatus = {
    ...fake.status,
    'begin-connect': body => {
      begun.push(body.name)
      return Promise.resolve({
        outcome: 'succeeded',
        body: { url: 'https://auth.example/a', expiresAt: undefined as never },
      })
    },
  }
  shownWith(status)
  expect(await screen.findByText('这个接入点要先经 OAuth 连上。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '连接' }))
  expect(await screen.findByText('在浏览器里同意之后回到这里。')).toBeTruthy()
  expect(begun).toEqual(['context7'])
  expect(opened).toEqual(['https://auth.example/a'])
  expect(screen.queryByRole('button', { name: '连接' })).toBeNull()
  vi.restoreAllMocks()
})

it('E19 a grant that wants a new connection offers 重新连接, one that is there offers 断开, a static endpoint shows neither (C204, C206)', async () => {
  const again = fakeStatus(
    answered(
      stood({ credential: 'present', credentialState: 'reconnect-required', connect: 'available' }),
      null,
    ),
  )
  shownWith({
    ...again.status,
    'begin-connect': () => new Promise(() => undefined),
  })
  expect(await screen.findByRole('button', { name: '重新连接' })).toBeTruthy()
  cleanup()
  const ended: string[] = []
  const fake = fakeStatus(
    answered(
      stood({ credential: 'present', credentialState: 'present', connect: 'available' }),
      null,
    ),
    answered(
      stood({ credential: 'absent', credentialState: 'absent', connect: 'available' }),
      null,
    ),
  )
  shownWith({
    ...fake.status,
    disconnect: body => {
      ended.push(body.name)
      return Promise.resolve({ outcome: 'succeeded', body: { disconnected: 'disconnected' } })
    },
  })
  expect(await screen.findByText('已经经 OAuth 连上。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '断开' }))
  expect(await screen.findByText('这个接入点要先经 OAuth 连上。')).toBeTruthy()
  expect(ended).toEqual(['context7'])
  cleanup()
  shownWith(
    fakeStatus(answered(stood({ credential: 'present', credentialState: 'present' }), null)).status,
  )
  expect(await screen.findByText('已连上')).toBeTruthy()
  expect(section().querySelector('[data-omne-part="mcp.endpoint.connect"]')).toBeNull()
})
