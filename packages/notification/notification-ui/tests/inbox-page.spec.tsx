// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { InboxHub, InboxPage, UnresolvedBadge } from '../src/index.ts'
import type { Entry } from '../src/model/inbox-machine.ts'
import { dismissed, done, entry, page, seen, superseded, view } from './fixtures/entries.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
type Fake = ReturnType<typeof createFakeClient>

beforeAll(stubAnimation)
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function answer(fake: Fake, operation: Parameters<Fake['next']>[0], value: unknown) {
  const call = await fake.next(operation)
  call.answer(value)
  await settle()
  return call
}

/** The page on screen with its first frame taken and the list answered. */
async function shown(entries: readonly Entry[], next: number | null = null) {
  const fake = createFakeClient()
  const hub = new InboxHub({ client: fake.client })
  const rendered = render(<InboxPage hub={hub} tenant={TENANT} />)
  await settle()
  await act(async () => fake.observations[0]!.frame())
  await answer(fake, 'list-inbox', page(entries, next))
  return { fake, hub, rendered }
}

const rowOf = (title: string) => within(screen.getByRole('button', { name: title }).closest('li')!)
const region = (name: string) => within(screen.getByRole('region', { name }))
const click = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element)
  })
  await settle()
}

describe('the inbox page', () => {
  it('waits for the list before it says anything about the inbox', async () => {
    const fake = createFakeClient()
    render(<InboxPage hub={new InboxHub({ client: fake.client })} tenant={TENANT} />)
    await settle()
    expect(screen.getByText('正在读取……')).toBeTruthy()
    expect(screen.queryByText('没有未了结的通知')).toBeNull()
    await act(async () => fake.observations[0]!.frame())
    await answer(fake, 'list-inbox', page([]))
    expect(screen.getByText('没有未了结的通知')).toBeTruthy()
    expect(screen.queryByText('正在读取……')).toBeNull()
  })

  it('lists what is unresolved, newest first, with source, level and state', async () => {
    await shown([
      entry('e1', 1, { level: 'strong' }),
      entry('e2', 2, { marks: seen, source: 'agent.posts' }),
    ])
    const open = region('未了结')
    expect(open.getByRole('heading').textContent).toBe('未了结（2）')
    const rows = open.getAllByRole('listitem')
    expect(rows.map(row => within(row).getAllByRole('button')[0]!.textContent)).toEqual([
      'Title e2',
      'Title e1',
    ])
    expect(rows[0]!.textContent).toContain('agent.posts · 弱提醒')
    expect(rows[0]!.textContent).not.toContain('未读')
    expect(rows[1]!.textContent).toContain('demo.things · 强提醒')
    expect(rows[1]!.textContent).toContain('未读')
    expect(rows[1]!.getAttribute('data-level')).toBe('strong')
    expect(screen.queryByRole('region', { name: '已了结' })).toBeNull()
  })

  it('offers done and dismiss for what is open, restore for what is settled, nothing for what was replaced', async () => {
    await shown([
      entry('open', 1),
      entry('done', 2, { marks: done }),
      entry('dismissed', 3, { marks: dismissed }),
      entry('old', 4, { marks: superseded }),
    ])
    const names = (title: string) =>
      rowOf(title)
        .getAllByRole('button')
        .slice(1)
        .map(button => button.textContent)
    expect(names('Title open')).toEqual(['办完', '划掉'])
    expect(names('Title done')).toEqual(['恢复'])
    expect(names('Title dismissed')).toEqual(['恢复'])
    expect(names('Title old')).toEqual([])
    const settled = region('已了结')
    expect(settled.getByRole('heading').textContent).toBe('已了结（3）')
    expect(settled.getByText(/已办完/)).toBeTruthy()
    expect(settled.getByText(/已划掉/)).toBeTruthy()
    expect(settled.getByText(/已被顶替/)).toBeTruthy()
  })

  it('marks done: the buttons wait for the answer, and the row moves when the server says so', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await click(rowOf('Title e1').getByRole('button', { name: '办完' }))
    for (const name of ['办完', '划掉'])
      expect(rowOf('Title e1').getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    const call = await answer(fake, 'mark', { outcome: 'succeeded', body: done })
    expect(call.body).toMatchObject({ event: 'e1', operation: 'done' })
    expect(screen.queryByRole('region', { name: '未了结' })).toBeNull()
    expect(region('已了结').getByRole('button', { name: '恢复' })).toBeTruthy()
    await click(rowOf('Title e1').getByRole('button', { name: '恢复' }))
    expect((await fake.next('mark')).body).toMatchObject({ operation: 'restore' })
  })

  it.each([
    [{ outcome: 'conflict', body: { reason: 'restore-first' } }, '要先恢复才能改'],
    [{ outcome: 'conflict', body: { reason: 'superseded' } }, '已经被更新的一条顶替了'],
    [{ outcome: 'not-found', body: {} }, '已经不在收件箱里了'],
    [{ outcome: 'unknown' }, '不确定有没有办成'],
    [{ outcome: 'denied' }, '没有权限处置这一条'],
    [{ outcome: 'basis-unavailable' }, '现在办不了，这一条没有变'],
  ])('a mark answered %j says so on the row and does not move it', async (reply, text) => {
    const { fake } = await shown([entry('e1', 1)])
    await click(rowOf('Title e1').getByRole('button', { name: '划掉' }))
    await answer(fake, 'mark', reply)
    expect(rowOf('Title e1').getByText(new RegExp(text))).toBeTruthy()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    expect(rowOf('Title e1').getByRole('button', { name: '划掉' }).hasAttribute('disabled')).toBe(
      false,
    )
  })

  it('opens a notification: shows its body, marks it seen, and closes again', async () => {
    const { fake } = await shown([entry('e1', 1)])
    const title = screen.getByRole('button', { name: 'Title e1' })
    expect(title.getAttribute('aria-expanded')).toBe('false')
    await click(title)
    expect(title.getAttribute('aria-expanded')).toBe('true')
    expect(rowOf('Title e1').getByText('正在读取……')).toBeTruthy()
    const full = {
      ...view(entry('e1', 1), 'Line one\nLine two'),
      locator: { kind: 'session', ref: 's-1' },
    }
    await answer(fake, 'read-notification', { outcome: 'succeeded', body: full })
    await answer(fake, 'mark', { outcome: 'succeeded', body: seen })
    const row = rowOf('Title e1')
    expect(row.getByText(/Line one/).textContent).toBe('Line one\nLine two')
    expect(row.getByText('对象：repo/a')).toBeTruthy()
    expect(row.getByText('去处：session s-1')).toBeTruthy()
    expect(screen.queryByText(/未读/)).toBeNull()
    await click(title)
    expect(screen.queryByText(/Line one/)).toBeNull()
    expect(title.getAttribute('aria-expanded')).toBe('false')
  })

  it.each([
    [
      { outcome: 'succeeded', body: { ...view(entry('e1', 1), ''), subject: null } },
      '这一条没有正文。',
    ],
    [{ outcome: 'not-found', body: {} }, '这一条已经不在收件箱里了。'],
    [{ outcome: 'basis-unavailable' }, '正文现在读不出，稍后再试。'],
  ])('an opened notification answered %j shows it in place of the body', async (reply, text) => {
    const { fake } = await shown([entry('e1', 1, { marks: seen })])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', reply)
    expect(rowOf('Title e1').getByText(text)).toBeTruthy()
    expect(screen.queryByText(/^对象：/)).toBeNull()
    expect(screen.queryByText(/^去处：/)).toBeNull()
  })

  it('switches to everything and back, and reads again each time', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await click(screen.getByRole('radio', { name: '全部' }))
    const all = await answer(fake, 'list-inbox', page([]))
    expect(all.body).toMatchObject({ filter: 'all' })
    expect(screen.getByText('收件箱是空的')).toBeTruthy()
    await click(screen.getByRole('radio', { name: '未了结' }))
    expect((await fake.next('list-inbox')).body).toMatchObject({ filter: 'unresolved' })
  })

  it('refreshes on demand, and not twice while it reads', async () => {
    const { fake } = await shown([entry('e1', 1)])
    const refresh = screen.getByRole('button', { name: '刷新' })
    await click(refresh)
    expect(refresh.hasAttribute('disabled')).toBe(true)
    await answer(fake, 'list-inbox', page([entry('e1', 1), entry('e2', 2)]))
    expect(refresh.hasAttribute('disabled')).toBe(false)
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(2)
  })

  it('reads again when a frame says the inbox may have changed', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await act(async () => fake.observations[0]!.frame('catalog'))
    await settle()
    expect(fake.calls.filter(call => call.operation === 'list-inbox')).toHaveLength(1)
    await act(async () => fake.observations[0]!.frame('inbox'))
    await answer(fake, 'list-inbox', page([entry('e1', 1), entry('e2', 2)]))
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(2)
  })

  it('a read that fails keeps what it had and offers to retry; it never shows an empty inbox instead', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await click(screen.getByRole('button', { name: '刷新' }))
    await answer(fake, 'list-inbox', { outcome: 'basis-unavailable' })
    expect(screen.getByText('收件箱现在读不出，下面是上一次读到的。')).toBeTruthy()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('没有未了结的通知')).toBeNull()
    await click(screen.getByRole('button', { name: '重试' }))
    await answer(fake, 'list-inbox', page([]))
    expect(screen.queryByText(/现在读不出/)).toBeNull()
    expect(screen.getByText('没有未了结的通知')).toBeTruthy()
  })

  it('a first read that fails says the inbox cannot be read, not that it is empty', async () => {
    const fake = createFakeClient()
    render(<InboxPage hub={new InboxHub({ client: fake.client })} tenant={TENANT} />)
    await settle()
    await act(async () => fake.observations[0]!.frame())
    await answer(fake, 'list-inbox', { outcome: 'basis-unavailable' })
    expect(screen.getByText('收件箱现在读不出。')).toBeTruthy()
    expect(screen.queryByText('没有未了结的通知')).toBeNull()
    expect(screen.queryByText('正在读取……')).toBeNull()
  })

  it('says when the list is not whole', async () => {
    const fake = createFakeClient()
    render(<InboxPage hub={new InboxHub({ client: fake.client })} tenant={TENANT} />)
    await settle()
    await act(async () => fake.observations[0]!.frame())
    for (let pageNumber = 1; pageNumber <= 20; pageNumber++)
      await answer(fake, 'list-inbox', page([entry(`p${pageNumber}`, pageNumber)], pageNumber))
    expect(screen.getByText(/这里没有列全/)).toBeTruthy()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(20)
  })

  it('says that updates are down while it reconnects, and that it has no access when refused', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await act(async () => fake.observations[0]!.end({ kind: 'unavailable' }))
    await settle()
    expect(screen.getByText(/更新暂时连不上/)).toBeTruthy()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    cleanup()
    const refused = await shown([entry('e1', 1)])
    await act(async () => refused.fake.observations[0]!.end({ kind: 'ended', reason: 'denied' }))
    await settle()
    expect(screen.getByRole('alert').textContent).toContain('没有权限看这个收件箱')
    expect(screen.queryByRole('region', { name: '未了结' })).toBeNull()
    expect(screen.queryByText('没有未了结的通知')).toBeNull()
  })

  it('says that it cannot work with a tenant it cannot read, and asks nothing', async () => {
    const fake = createFakeClient()
    render(<InboxPage hub={new InboxHub({ client: fake.client })} tenant="not a tenant" />)
    await settle()
    expect(screen.getByRole('alert').textContent).toContain('租户读不懂')
    expect(fake.observations).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('shows the sections it was given under its own', async () => {
    const fake = createFakeClient()
    const hub = new InboxHub({ client: fake.client })
    render(<InboxPage hub={hub} tenant={TENANT} sections={<p>来自别的领域的一栏</p>} />)
    await settle()
    expect(screen.getByText('来自别的领域的一栏')).toBeTruthy()
  })

  it('stops observing when it leaves the screen', async () => {
    const { fake, rendered } = await shown([entry('e1', 1)])
    rendered.unmount()
    expect(fake.observations[0]!.signal.aborted).toBe(true)
  })
})

describe('the count beside the title', () => {
  async function badge(entries: readonly Entry[]) {
    const fake = createFakeClient()
    const hub = new InboxHub({ client: fake.client })
    const rendered = render(<UnresolvedBadge hub={hub} tenant={TENANT} />)
    await settle()
    await act(async () => fake.observations[0]!.frame())
    await answer(fake, 'list-inbox', page(entries))
    return rendered.container
  }

  it('counts what is unresolved and shows nothing when there is none', async () => {
    const some = await badge([entry('a', 1), entry('b', 2, { marks: done }), entry('c', 3)])
    expect(some.textContent).toBe('2')
    expect(some.querySelector('[aria-label]')!.getAttribute('aria-label')).toBe('2 条未了结的通知')
    cleanup()
    expect((await badge([entry('b', 2, { marks: superseded })])).innerHTML).toBe('')
  })

  it('stops at 99+', async () => {
    const many = Array.from({ length: 100 }, (_, index) => entry(`e${index}`, index + 1))
    expect((await badge(many)).textContent).toBe('99+')
    cleanup()
    expect((await badge(many.slice(1))).textContent).toBe('99')
  })

  it('shows nothing and asks nothing for a tenant it cannot read', async () => {
    const fake = createFakeClient()
    const rendered = render(
      <UnresolvedBadge hub={new InboxHub({ client: fake.client })} tenant="x" />,
    )
    await settle()
    expect(rendered.container.innerHTML).toBe('')
    expect(fake.observations).toHaveLength(0)
  })
})
