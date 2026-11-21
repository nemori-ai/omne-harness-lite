// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { InboxHub, InboxPage, UnresolvedBadge } from '../src/index.ts'
import { keyOf, type Entry } from '../src/model/inbox-machine.ts'
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
async function shown(entries: readonly Entry[], next: number | null = null, focus?: string) {
  const fake = createFakeClient()
  const hub = new InboxHub({ client: fake.client })
  const rendered = render(
    <InboxPage hub={hub} tenant={TENANT} {...(focus === undefined ? {} : { focus })} />,
  )
  await settle()
  await act(async () => fake.observations[0]!.frame())
  await answer(fake, 'list-inbox', page(entries, next))
  return { fake, hub, rendered }
}

/** The catalogue frame and its answer: each source named for people. */
async function named(fake: Fake, ...pairs: (readonly [string, string])[]) {
  await act(async () => fake.observations[0]!.frame('catalog'))
  await answer(fake, 'list-sources', {
    outcome: 'succeeded',
    body: { sources: pairs.map(([name, label]) => ({ name, label, types: [] })) },
  })
}

const rowOf = (title: string) => within(screen.getByRole('button', { name: title }).closest('li')!)
const dotted = (title: string) =>
  screen.getByRole('button', { name: title }).closest('li')!.querySelector('.notification-dot')
/** The icon button named `name` on a row: named by its label alone, its face the glyph `glyph` or the activity mark. */
function iconButton(title: string, name: string, glyph: string): HTMLButtonElement {
  const button = rowOf(title).getByRole<HTMLButtonElement>('button', { name })
  expect(button.getAttribute('aria-label')).toBe(name)
  expect(button.textContent).toBe('')
  const face =
    glyph === 'activity' ? '[data-loading-indicator]' : `svg[data-icon="${glyph}"][aria-hidden]`
  expect(button.querySelector(face), `${name} draws ${glyph}`).not.toBeNull()
  return button
}
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

  it('lists what is unresolved, newest first, each under the name its source has for people and its time, and no level or state in words', async () => {
    const { fake } = await shown([
      entry('e1', 1, { level: 'strong' }),
      entry('e2', 2, { marks: seen, source: 'agent.posts' }),
    ])
    await named(fake, ['demo.things', '演示的来源'], ['agent.posts', 'agent 写的'])
    const open = region('未了结')
    expect(open.getByRole('heading').textContent).toBe('未了结（2）')
    const rows = open.getAllByRole('listitem')
    expect(rows.map(row => within(row).getAllByRole('button')[0]!.textContent)).toEqual([
      'Title e2',
      'Title e1',
    ])
    const meta = (row: HTMLElement) => row.querySelector('.notification-meta')!.textContent
    expect(meta(rows[0]!)).toMatch(/^agent 写的 · \S.*[^l]$/)
    expect(meta(rows[1]!)).toMatch(/^演示的来源 · \S.*[^l]$/)
    for (const row of rows)
      expect(meta(row)).not.toMatch(
        /强|弱|未读|·\s*$|null|undefined|demo\.things|agent\.posts|changed/,
      )
    expect(screen.queryByRole('region', { name: '已了结' })).toBeNull()
    for (const role of ['alert', 'status']) expect(screen.queryByRole(role)).toBeNull()
    expect(screen.queryByText(/读不出|没有列全|没有未了结的通知|收件箱是空的/)).toBeNull()
  })

  it('names no source while the catalogue has not named it: only the time, never the identifier', async () => {
    const { fake } = await shown([entry('e1', 1), entry('e2', 2, { source: 'gone.source' })])
    const meta = (title: string) =>
      screen
        .getByRole('button', { name: title })
        .closest('li')!
        .querySelector('.notification-meta')!
    for (const title of ['Title e1', 'Title e2']) {
      expect(meta(title).textContent).not.toMatch(/demo\.things|gone\.source|changed|·/)
      expect(meta(title).querySelector('time')).not.toBeNull()
    }
    await named(fake, ['demo.things', '演示的来源'])
    expect(meta('Title e1').textContent).toMatch(/^演示的来源 · /)
    expect(meta('Title e2').textContent).not.toMatch(/gone\.source|·/)
  })

  it('is a row of three cells: the mark, the title with one line of source and time under it, the actions at its end', async () => {
    await shown([entry('e1', 1, { level: 'strong' })])
    const title = screen.getByRole('button', { name: 'Title e1' })
    const head = title.closest('.notification-head')!
    expect(head.hasAttribute('data-glide-row')).toBe(true)
    expect(head.closest('[data-glide-menu]')).not.toBeNull()
    expect([...head.children].map(child => child.className)).toEqual([
      'notification-mark',
      'notification-copy',
      'notification-actions',
    ])
    const copy = head.querySelector('.notification-copy')!
    expect([...copy.children]).toEqual([title, copy.querySelector('.notification-meta')])
    expect(title.getAttribute('data-variant')).not.toBe('link')
    expect(title.getAttribute('data-control')).toBe('button')
    expect(title.classList.contains('notification-title')).toBe(true)
  })

  it('says in one short line what the page is, and puts everything under the header in one reading column', async () => {
    const { rendered } = await shown([entry('e1', 1)])
    const header = rendered.container.querySelector('header')!
    expect(header.textContent).toContain('来源发给你的事件。')
    expect(header.textContent).not.toContain('办完或划掉之后')
    const column = rendered.container.querySelector('.notification-column')!
    expect(column.contains(header)).toBe(false)
    expect(column.contains(region('未了结').getByRole('list'))).toBe(true)
    expect(header.nextElementSibling).toBe(column)
  })

  it('settles the row it was brought to once, scrolls it near, and draws no standing mark on it', async () => {
    const frames: unknown[] = []
    const animate = vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
      this: Element,
      keyframes,
    ) {
      frames.push([this, keyframes])
      return { cancel: () => undefined, finished: Promise.resolve() } as never
    })
    const rects = vi
      .spyOn(Element.prototype, 'getClientRects')
      .mockImplementation(() => [new DOMRect(0, 0, 1, 1)] as never)
    const scrolled = vi.fn()
    Object.assign(Element.prototype, { scrollIntoView: scrolled })
    try {
      await shown([entry('e1', 1), entry('e2', 2)], null, keyOf(entry('e1', 1)))
      const row = screen.getByRole('button', { name: 'Title e1' }).closest('li')!
      expect(frames).toEqual([[row, [{ opacity: 0.6 }, { opacity: 1 }]]])
      expect(scrolled.mock.contexts).toEqual([row])
      expect(row.hasAttribute('data-focused')).toBe(false)
      expect(row.getAttribute('style')).toBeNull()
    } finally {
      animate.mockRestore()
      rects.mockRestore()
    }
  })

  it('starts a strong, unseen, open row with a dot of strong ink, and no other row', async () => {
    await shown([
      entry('fresh', 1, { level: 'strong' }),
      entry('looked', 2, { level: 'strong', marks: seen }),
      entry('quiet', 3),
      entry('settled', 4, { level: 'strong', marks: dismissed }),
      entry('replaced', 5, { level: 'strong', marks: superseded }),
    ])
    const dot = dotted('Title fresh')
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
    expect(dot?.textContent).toBe('')
    expect(dot?.parentElement?.className).toBe('notification-mark')
    for (const title of ['Title looked', 'Title quiet', 'Title settled', 'Title replaced'])
      expect(dotted(title), title).toBeNull()
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
        .map(button => button.getAttribute('aria-label'))
    expect(names('Title open')).toEqual(['办完', '划掉'])
    expect(names('Title done')).toEqual(['恢复'])
    expect(names('Title dismissed')).toEqual(['恢复'])
    expect(names('Title old')).toEqual([])
    iconButton('Title open', '办完', 'done')
    iconButton('Title open', '划掉', 'close')
    iconButton('Title done', '恢复', 'undo')
    iconButton('Title dismissed', '恢复', 'undo')
    const settled = region('已了结')
    expect(settled.getByRole('heading').textContent).toBe('已了结（3）')
    const labelOf = (title: string) =>
      screen
        .getByRole('button', { name: title })
        .closest('li')!
        .querySelector('.notification-meta')!.textContent
    expect(labelOf('Title done')).toMatch(/ · 已办完$/)
    expect(labelOf('Title dismissed')).toMatch(/ · 已划掉$/)
    expect(labelOf('Title old')).toMatch(/ · 已被顶替$/)
    expect(screen.queryByText(/没有未了结的通知|收件箱是空的/)).toBeNull()
  })

  it('marks done: only the pressed button waits, a second press sends nothing, and the row moves when the server says so', async () => {
    const { fake } = await shown([entry('e1', 1)])
    await click(iconButton('Title e1', '办完', 'done'))
    const pressed = iconButton('Title e1', '办完', 'activity')
    expect(pressed.getAttribute('aria-busy')).toBe('true')
    expect(pressed.querySelector('[data-icon="done"]')).toBeNull()
    const other = iconButton('Title e1', '划掉', 'close')
    expect(other.hasAttribute('aria-busy')).toBe(false)
    expect(other.querySelector('[data-loading-indicator]')).toBeNull()
    for (const button of [pressed, other]) expect(button.hasAttribute('disabled')).toBe(false)
    await click(pressed)
    await click(other)
    expect(fake.calls.filter(call => call.operation === 'mark')).toHaveLength(1)
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    const call = await answer(fake, 'mark', { outcome: 'succeeded', body: done })
    expect(call.body).toMatchObject({ event: 'e1', operation: 'done' })
    expect(screen.queryByRole('region', { name: '未了结' })).toBeNull()
    expect(region('已了结').getByRole('button', { name: '恢复' })).toBeTruthy()
    await click(rowOf('Title e1').getByRole('button', { name: '恢复' }))
    expect((await fake.next('mark')).body).toMatchObject({ operation: 'restore' })
  })

  it.each([
    [{ outcome: 'conflict', body: { reason: 'restore-first' } }, '要先恢复才能改', 'caution'],
    [{ outcome: 'conflict', body: { reason: 'superseded' } }, '已经被更新的一条顶替了', 'caution'],
    [{ outcome: 'not-found', body: {} }, '已经不在收件箱里了', 'caution'],
    [{ outcome: 'unknown' }, '不确定有没有办成', 'caution'],
    [{ outcome: 'denied' }, '没有权限处置这一条', 'danger'],
    [{ outcome: 'basis-unavailable' }, '现在办不了，这一条没有变', 'caution'],
  ])('a mark answered %j says so on the row and does not move it', async (reply, text, tone) => {
    const { fake } = await shown([entry('e1', 1), entry('e2', 2)])
    await click(rowOf('Title e1').getByRole('button', { name: '划掉' }))
    const call = await answer(fake, 'mark', reply)
    expect(call.body).toMatchObject({ event: 'e1', operation: 'dismiss' })
    const said = rowOf('Title e1').getByRole('status')
    expect(said.textContent).toMatch(new RegExp(text))
    expect(said.getAttribute('data-tone')).toBe(tone)
    expect(rowOf('Title e2').queryByRole('status')).toBeNull()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(2)
    expect(iconButton('Title e1', '划掉', 'close').hasAttribute('aria-busy')).toBe(false)
  })

  it('with as many settled as open it shows both sections and no empty state', async () => {
    await shown([entry('e1', 1), entry('e2', 2, { marks: done })])
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    expect(region('已了结').getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText(/没有未了结的通知|收件箱是空的|正在读取/)).toBeNull()
  })

  it('opens only the notification that was asked for', async () => {
    const { fake } = await shown([entry('e1', 1, { marks: seen }), entry('e2', 2, { marks: seen })])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', { outcome: 'succeeded', body: view(entry('e1', 1)) })
    expect(rowOf('Title e1').getByText('Body')).toBeTruthy()
    expect(rowOf('Title e2').queryByText('Body')).toBeNull()
    expect(screen.getByRole('button', { name: 'Title e2' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('follows the tenant it is given: the old inbox is let go and the new one is observed', async () => {
    const { fake, hub, rendered } = await shown([entry('e1', 1)])
    const other = TENANT.replace('acc_00000000000000000000000001', 'acc_00000000000000000000000002')
    rendered.rerender(<InboxPage hub={hub} tenant={other} />)
    await settle()
    expect(fake.observations).toHaveLength(2)
    expect(fake.observations[0]!.signal.aborted).toBe(true)
    expect(fake.observations[1]!.signal.aborted).toBe(false)
    expect(screen.queryByRole('region', { name: '未了结' })).toBeNull()
    await act(async () => fake.observations[1]!.frame())
    await answer(fake, 'list-inbox', page([entry('theirs', 1)]))
    expect(screen.getByRole('button', { name: 'Title theirs' })).toBeTruthy()
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
    const facts = row.getByText('类型').closest('dl')!
    expect(
      [...facts.querySelectorAll('.fact-list-row')].map(fact => [
        fact.querySelector('dt')!.textContent,
        fact.querySelector('dd')!.textContent,
      ]),
    ).toEqual([
      ['对象', 'repo/a'],
      ['类型', 'changed'],
      ['去处', 'session s-1'],
      ['缘由', '这类事件缺省发给你'],
    ])
    expect(facts.querySelector('dd code')?.textContent).toBe('changed')
    expect(facts.nextElementSibling?.textContent).toBe('Line one\nLine two')
    expect(screen.queryByText(/未读/)).toBeNull()
    await click(title)
    expect(screen.queryByText(/Line one/)).toBeNull()
    expect(title.getAttribute('aria-expanded')).toBe('false')
  })

  it.each([
    ['named', { kind: 'named' }, '缘由：点名发给你'],
    [
      'a subscription to everything',
      { kind: 'subscription', scope: { kind: 'all' }, note: null },
      '缘由：命中了你的订阅（这一类的全部）',
    ],
    [
      'a subscription to one subject, with its note',
      { kind: 'subscription', scope: { kind: 'subject', equals: 'repo/a' }, note: '失败了叫我' },
      '缘由：命中了你的订阅（对象是 repo/a）。备注：失败了叫我',
    ],
    [
      'a subscription to a subject prefix',
      { kind: 'subscription', scope: { kind: 'subject-prefix', prefix: 'repo/' }, note: null },
      '缘由：命中了你的订阅（对象以 repo/ 开头）',
    ],
  ] as const)('says why a notification came: %s', async (_label, cause, text) => {
    const item = entry('e1', 1, { marks: seen, cause })
    const { fake } = await shown([item])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', { outcome: 'succeeded', body: view(item) })
    const fact = rowOf('Title e1').getByText('缘由').closest('.fact-list-row')!
    expect(fact.querySelector('dd')!.textContent).toBe(text.replace(/^缘由：/, ''))
  })

  /** A title holds no instant: an instant has no JSON form, and a reporter writes titles as JSON. */
  const bodiless = () => ({
    outcome: 'succeeded',
    body: { ...view(entry('e1', 1), ''), subject: null },
  })
  it.each([
    ['without a body', bodiless, '这一条没有正文。'],
    ['that is gone', () => ({ outcome: 'not-found', body: {} }), '这一条已经不在收件箱里了。'],
    ['that cannot be read', () => ({ outcome: 'basis-unavailable' }), '正文现在读不出，稍后再试。'],
  ])('an opened notification %s shows that in place of the body', async (_label, reply, text) => {
    const { fake } = await shown([entry('e1', 1, { marks: seen })])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', reply())
    expect(rowOf('Title e1').getByText(text)).toBeTruthy()
    expect(screen.queryByText('对象')).toBeNull()
    expect(screen.queryByText('去处')).toBeNull()
    if (text !== '这一条没有正文。') expect(screen.queryByText('缘由')).toBeNull()
  })

  it('a body that cannot be read offers to read it again, and the second read shows it', async () => {
    const { fake } = await shown([entry('e1', 1, { marks: seen })])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', { outcome: 'basis-unavailable' })
    const said = rowOf('Title e1')
      .getByText('正文现在读不出，稍后再试。')
      .closest('[data-inline-notice]')!
    expect(said.getAttribute('data-tone')).toBe('caution')
    const retry = rowOf('Title e1').getByRole('button', { name: '重试' })
    expect(retry.querySelector('svg[data-icon="retry"]')).not.toBeNull()
    await click(retry)
    await answer(fake, 'read-notification', {
      outcome: 'succeeded',
      body: view(entry('e1', 1), 'Read the second time'),
    })
    expect(rowOf('Title e1').getByText('Read the second time')).toBeTruthy()
    expect(rowOf('Title e1').queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('a notification that is gone says so in the neutral tone, with nothing to retry', async () => {
    const { fake } = await shown([entry('e1', 1, { marks: seen })])
    await click(screen.getByRole('button', { name: 'Title e1' }))
    await answer(fake, 'read-notification', { outcome: 'not-found', body: {} })
    const said = rowOf('Title e1')
      .getByText('这一条已经不在收件箱里了。')
      .closest('[data-inline-notice]')!
    expect(said.getAttribute('data-tone')).toBe('neutral')
    expect(rowOf('Title e1').queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('switches to everything and back, and reads again each time', async () => {
    const { fake } = await shown([entry('e1', 1)])
    const option = (name: string, pressed: boolean) => screen.getByRole('button', { name, pressed })
    expect(option('未了结', true)).toBeTruthy()
    await click(option('全部', false))
    expect(option('全部', true)).toBeTruthy()
    const all = await answer(fake, 'list-inbox', page([]))
    expect(all.body).toMatchObject({ filter: 'all' })
    expect(screen.getByText('收件箱是空的')).toBeTruthy()
    await click(option('未了结', false))
    expect((await fake.next('list-inbox')).body).toMatchObject({ filter: 'unresolved' })
  })

  it('has no refresh: the list follows its observation, and the header holds only the filter', async () => {
    const { rendered } = await shown([entry('e1', 1)])
    expect(screen.queryByRole('button', { name: /刷新/ })).toBeNull()
    const header = rendered.container.querySelector('header')!
    expect(
      within(header)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['未了结', '全部'])
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
    await act(async () => fake.observations[0]!.frame('inbox'))
    await answer(fake, 'list-inbox', { outcome: 'basis-unavailable' })
    expect(screen.getByText('收件箱现在读不出，下面是上一次读到的。')).toBeTruthy()
    expect(region('未了结').getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('没有未了结的通知')).toBeNull()
    const retry = screen.getByRole('button', { name: '重试' })
    expect(retry.textContent).toBe('重试')
    expect(retry.querySelector('svg[data-icon="retry"]')).not.toBeNull()
    await click(retry)
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
    expect(screen.getByText('通知太多，这里没有列全。')).toBeTruthy()
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
    expect(screen.queryByText(/读不出/)).toBeNull()
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
