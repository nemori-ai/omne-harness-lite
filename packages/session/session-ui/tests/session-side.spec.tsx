// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SESSION_DOCK, SESSION_SIDE, sessionDock, sessionSide } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function openFromList(fake: ReturnType<typeof createFakeClient>, name: string, id: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', `${id}的内容`)], '1'),
  })
  await settle()
}

async function opened(sessions: readonly (readonly [string, string])[] = [['ses_a', '甲']]) {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(
    listPage(sessions.map(([id, name]) => listed(id, name))),
  )
  await settle()
  const [first] = sessions
  if (first !== undefined) await openFromList(fake, first[1], first[0])
  return { fake, ...mounted }
}

function side(id: string, order: number, label?: string) {
  return {
    id,
    order,
    ...(label === undefined ? {} : { label }),
    render: ({
      scope,
      subject,
    }: {
      readonly scope: string | undefined
      readonly subject: { readonly session: string }
    }) => (
      <p data-testid={id}>
        {subject.session}|{scope}
      </p>
    ),
  }
}

async function contribute(root: Context, name: string, put: (ctx: Context) => void) {
  const fiber = root.plugin({ name, inject: ['shell'], apply: put })
  await act(async () => {
    await fiber
  })
  return fiber
}

const panel = () => document.querySelector<HTMLElement>('.omne-session-side')
const paneOf = (id: string) => screen.getByTestId(id).closest<HTMLElement>('[data-side-pane]')
const tabs = () =>
  [...(panel()?.querySelectorAll<HTMLElement>('[data-segment]') ?? [])].map(tab => tab.textContent)

it('两个拓展点的名字：session.dock 与 session.side', () => {
  expect(SESSION_SIDE).toBe('session.side')
  expect(sessionSide.name).toBe(SESSION_SIDE)
  expect(sessionDock.name).toBe(SESSION_DOCK)
})

it('没有贡献时没有侧边区的元素，对话页的主体只有主列', async () => {
  await opened()
  expect(panel()).toBeNull()
  const body = document.querySelector('.omne-session-body')
  expect(body?.childElementCount).toBe(1)
  expect(body?.firstElementChild?.className).toBe('omne-session-main')
})

it('一个贡献：侧边区出现在主列之后，这一项收到当前会话与租户，不出页签', async () => {
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0, '状态')))
  expect(panel()?.previousElementSibling?.className).toBe('omne-session-main')
  expect(screen.getByTestId('status').textContent).toBe(`ses_a|${TENANT}`)
  expect(tabs()).toEqual([])
  expect(panel()?.querySelector('.omne-session-side-title')?.textContent).toBe('状态')
})

it('两个贡献：两个页签，次序取项上写的次序；点第二个，第二个显示、第一个藏起来不卸下', async () => {
  const { root } = await opened()
  await contribute(root, 'two', ctx => {
    sessionSide.contribute(ctx.shell, side('later', 2, '后'))
    sessionSide.contribute(ctx.shell, side('earlier', 1))
  })
  expect(tabs()).toEqual(['earlier', '后'])
  expect(paneOf('earlier')?.hidden).toBe(false)
  expect(paneOf('later')?.hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '后' }))
  expect(paneOf('earlier')?.hidden).toBe(true)
  expect(paneOf('later')?.hidden).toBe(false)
})

it('两个贡献方按三种先后放进来：会话打开之后先甲后乙、先乙后甲、打开之前就放，侧边区逐字相同', async () => {
  const first = (ctx: Context) => sessionSide.contribute(ctx.shell, side('a', 1, '甲签'))
  const second = (ctx: Context) => sessionSide.contribute(ctx.shell, side('b', 2, '乙签'))
  const markups: string[] = []
  for (const order of [
    [first, second],
    [second, first],
  ]) {
    const { root } = await opened()
    for (const [index, put] of order.entries()) await contribute(root, `c${index}`, put)
    markups.push(panel()?.outerHTML ?? '')
    cleanup()
  }
  const fake = createFakeClient()
  const { root } = await mountModule(fake.client, TENANT)
  await contribute(root, 'early-b', second)
  await contribute(root, 'early-a', first)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  await openFromList(fake, '甲', 'ses_a')
  markups.push(panel()?.outerHTML ?? '')
  expect(tabs()).toEqual(['甲签', '乙签'])
  expect(new Set(markups).size).toBe(1)
})

it('换一个会话：侧边区的项收到的对象跟着变', async () => {
  const { root, fake } = await opened([
    ['ses_a', '甲'],
    ['ses_b', '乙'],
  ])
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(screen.getByTestId('status').textContent).toContain('ses_a|')
  await openFromList(fake, '乙', 'ses_b')
  expect(screen.getByTestId('status').textContent).toContain('ses_b|')
})

it('没有会话打开时没有侧边区，有贡献也一样', async () => {
  const { root } = await opened([])
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(screen.getByText('点「新建会话」开始一段对话。')).toBeTruthy()
  expect(panel()).toBeNull()
  expect(screen.queryByTestId('status')).toBeNull()
})

it('选中的项撤下：回到第一项；项全撤下：侧边区消失', async () => {
  const { root } = await opened()
  const first = await contribute(root, 'first', ctx =>
    sessionSide.contribute(ctx.shell, side('a', 1, '甲签')),
  )
  const second = await contribute(root, 'second', ctx =>
    sessionSide.contribute(ctx.shell, side('b', 2, '乙签')),
  )
  fireEvent.click(screen.getByRole('button', { name: '乙签' }))
  expect(paneOf('b')?.hidden).toBe(false)
  await act(async () => {
    await second.dispose()
  })
  expect(screen.queryByTestId('b')).toBeNull()
  expect(paneOf('a')?.hidden).toBe(false)
  await act(async () => {
    await first.dispose()
  })
  expect(panel()).toBeNull()
})

it('收起与展开：收起后内容藏起来不卸下，按钮换成展开', async () => {
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(panel()?.dataset['folded']).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '收起侧边区' }))
  expect(panel()?.dataset['folded']).toBe('true')
  expect(panel()?.querySelector<HTMLElement>('.omne-session-side-body')?.hidden).toBe(true)
  expect(screen.getByTestId('status')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '展开侧边区' }))
  expect(panel()?.dataset['folded']).toBe('false')
  expect(panel()?.querySelector<HTMLElement>('.omne-session-side-body')?.hidden).toBe(false)
})

function stubWidth(narrow: boolean) {
  const listeners = new Set<() => void>()
  const otherTypes: string[] = []
  const media = {
    matches: narrow,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'change') listeners.add(listener)
      else otherTypes.push(type)
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'change') listeners.delete(listener)
      else otherTypes.push(type)
    },
  }
  const queries: string[] = []
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    queries.push(query)
    return media as unknown as MediaQueryList
  })
  return {
    queries,
    otherTypes,
    listening: () => listeners.size,
    set(next: boolean) {
      media.matches = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

it('窗口不到 768 像素宽时默认收起；变宽后跟着展开；人点过之后不再跟着窗口变', async () => {
  const width = stubWidth(true)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(width.queries).toContain('(max-width: 767px)')
  expect(panel()?.dataset['folded']).toBe('true')
  act(() => width.set(false))
  expect(panel()?.dataset['folded']).toBe('false')
  act(() => width.set(true))
  expect(panel()?.dataset['folded']).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: '展开侧边区' }))
  expect(panel()?.dataset['folded']).toBe('false')
  act(() => width.set(false))
  act(() => width.set(true))
  expect(panel()?.dataset['folded']).toBe('false')
  expect(width.listening()).toBeGreaterThan(0)
  cleanup()
  expect(width.listening()).toBe(0)
  expect(width.otherTypes).toEqual([])
})

it('经带类型的点往 session.dock 放的项，出现在转写区与输入框之间，收到解回来的会话', async () => {
  const { root } = await opened()
  await contribute(root, 'dock', ctx =>
    sessionDock.contribute(ctx.shell, {
      id: 'typed',
      order: 0,
      render: ({ scope, subject }) => (
        <aside data-testid="typed">
          {subject.session}|{scope}
        </aside>
      ),
    }),
  )
  const typed = screen.getByTestId('typed')
  expect(typed.textContent).toBe(`ses_a|${TENANT}`)
  const composer = screen.getByRole('textbox', { name: '输入消息' }).closest('form')
  expect(typed.closest('.omne-session-dock')?.nextElementSibling).toBe(composer)
})
