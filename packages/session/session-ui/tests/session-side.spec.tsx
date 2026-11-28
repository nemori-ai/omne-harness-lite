// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { moveRegion } from '@omne-harness/ui-kit'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SESSION_DOCK, SESSION_SIDE, sessionDock, sessionSide } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { iconButton } from './fixtures/icon-button.ts'
import { stubRoom } from './fixtures/room.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('--omne-size')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
const control = () => screen.getByRole('button', { name: 'Agent' })
/** The side area's markup, its generated id aside: each mount names it anew. */
const markup = () => (panel()?.outerHTML ?? '').replace(/ id="[^"]*"/, '')
/** Folded where it docks: kept in its grid track, out of reach. */
const folded = () => panel()?.dataset['open'] === 'false' && panel()?.inert === true
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
  stubRoom(1440)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0, '状态')))
  expect(panel()?.previousElementSibling?.className).toBe('omne-session-main')
  expect(screen.getByTestId('status').textContent).toBe(`ses_a|${TENANT}`)
  expect(tabs()).toEqual([])
  expect(panel()?.querySelector('.omne-session-side-title')?.textContent).toBe('状态')
})

it('两个贡献：两个页签，次序取项上写的次序；点第二个，第二个显示、第一个藏起来不卸下', async () => {
  stubRoom(1440)
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
  stubRoom(1440)
  const first = (ctx: Context) => sessionSide.contribute(ctx.shell, side('a', 1, '甲签'))
  const second = (ctx: Context) => sessionSide.contribute(ctx.shell, side('b', 2, '乙签'))
  const markups: string[] = []
  for (const order of [
    [first, second],
    [second, first],
  ]) {
    const { root } = await opened()
    for (const [index, put] of order.entries()) await contribute(root, `c${index}`, put)
    markups.push(markup())
    cleanup()
  }
  const fake = createFakeClient()
  const { root } = await mountModule(fake.client, TENANT)
  await contribute(root, 'early-b', second)
  await contribute(root, 'early-a', first)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  await openFromList(fake, '甲', 'ses_a')
  markups.push(markup())
  expect(tabs()).toEqual(['甲签', '乙签'])
  expect(new Set(markups).size).toBe(1)
})

it('换一个会话：侧边区的项收到的对象跟着变', async () => {
  stubRoom(1440)
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
  stubRoom(1440)
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

it('打开会话时侧边区缺省收着：停靠的侧边区标成收起、不可操作，对话头的控件没展开；按控件才展开', async () => {
  stubRoom(1440)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(panel()?.dataset['presentation']).toBe('docked')
  expect(folded()).toBe(true)
  expect(screen.getByTestId('status')).toBeTruthy()
  expect(control().getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(control())
  expect(folded()).toBe(false)
  expect(control().getAttribute('aria-expanded')).toBe('true')
})

it('停靠时收起与展开：收起后整个侧边区藏起来不卸下，对话头的控件再展开', async () => {
  stubRoom(1440)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  fireEvent.click(control())
  expect(panel()?.dataset['presentation']).toBe('docked')
  expect(panel()?.dataset['keyboardRegion']).toBe('side')
  expect(control().getAttribute('aria-expanded')).toBe('true')
  expect(control().getAttribute('aria-controls')).toBe(panel()?.id)
  expect(folded()).toBe(false)
  const fold = iconButton(panel()!, '收起侧边区', 'fold')
  expect(fold.querySelector('[data-icon="fold"]')?.hasAttribute('data-icon-reversed')).toBe(true)
  fireEvent.click(fold)
  expect(folded()).toBe(true)
  expect(screen.getByTestId('status')).toBeTruthy()
  expect(control().getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(control())
  expect(folded()).toBe(false)
  fireEvent.click(control())
  expect(folded()).toBe(true)
})

it('停靠的侧边区收起时留在格线轨道里滑走：不藏起元素，标成收起并且不可操作', async () => {
  stubRoom(1440)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  const sheet = () => panel()?.querySelector(':scope > .omne-session-side-sheet')
  expect(sheet()?.querySelector('[data-side-pane="status"]')).toBeTruthy()
  fireEvent.click(control())
  fireEvent.click(screen.getByRole('button', { name: '收起侧边区' }))
  expect(panel()?.hidden).toBe(false)
  expect(panel()?.dataset['open']).toBe('false')
  expect(sheet()).toBeTruthy()
})

it('对话区不小于 1160 时停靠，窄于 1160 收在对话头的控件后面；量的是对话区自己的宽度，不是窗口', async () => {
  const room = stubRoom(1160)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0, '状态')))
  expect(panel()?.dataset['presentation']).toBe('docked')
  expect(panel()?.previousElementSibling?.className).toBe('omne-session-main')
  fireEvent.click(control())
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1920)
  act(() => room.resize(1130))
  expect(panel()).toBeNull()
  expect(screen.queryByTestId('status')).toBeNull()
  expect(control().getAttribute('aria-expanded')).toBe('false')
  act(() => room.resize(1159))
  expect(panel()).toBeNull()
  act(() => room.resize(1160))
  expect(panel()?.dataset['presentation']).toBe('docked')
  expect(control().getAttribute('aria-expanded')).toBe('true')
})

it('门槛随字号档变：系数 1.25 时对话区 1300 收进墨框、1450 停靠；字号变了宽度不变也重新量', async () => {
  document.documentElement.style.setProperty('--omne-size', '1.25')
  const room = stubRoom(1300)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  expect(panel()).toBeNull()
  expect(control().getAttribute('aria-expanded')).toBe('false')
  act(() => room.resize(1449))
  expect(panel()).toBeNull()
  act(() => room.resize(1450))
  expect(panel()?.dataset['presentation']).toBe('docked')
  act(() => room.resize(1300))
  expect(panel()).toBeNull()
  await act(async () => {
    document.documentElement.style.setProperty('--omne-size', '1')
    document.documentElement.setAttribute('data-size', 'standard')
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(panel()?.dataset['presentation']).toBe('docked')
  document.documentElement.removeAttribute('data-size')
})

it('F6 走得到侧边区：停靠时与墨框里都是一个区；收起的停靠侧边区不算', async () => {
  const room = stubRoom(1440, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  fireEvent.click(control())
  act(() => void moveRegion('next'))
  expect(panel()?.contains(document.activeElement)).toBe(true)
  act(() => (document.activeElement as HTMLElement).blur())
  fireEvent.click(screen.getByRole('button', { name: '收起侧边区' }))
  expect(moveRegion('next')).toBe(false)
  expect(document.activeElement).toBe(document.body)
  act(() => room.resize(1100))
  fireEvent.click(control(), { detail: 1 })
  act(() => void moveRegion('next'))
  expect(panel()?.dataset['presentation']).toBe('bubble')
  expect(panel()?.contains(document.activeElement)).toBe(true)
})

const HEADER = { left: 240, top: 0, width: 900, height: 64 }
const SEAT = { left: 674, top: 16, width: 32, height: 32 }
const boxes = new Map([
  ['.omne-session-bar', HEADER],
  ['[data-figure-seat="header"]', SEAT],
])

it('窄时按对话头的控件展开淡墨框：盖在页面上，开在头部细线下 8，宽度不越出头部', async () => {
  stubRoom(1100, boxes)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0, '状态')))
  expect(panel()).toBeNull()
  fireEvent.click(control())
  const bubble = panel()!
  expect(bubble.dataset['presentation']).toBe('bubble')
  expect(bubble.dataset['keyboardRegion']).toBe('side')
  expect(bubble.dataset['inkStrength']).toBe('light')
  expect(bubble.classList.contains('omne-ink-bubble')).toBe(true)
  expect(bubble.style.top).toBe(`${HEADER.top + HEADER.height + 8}px`)
  expect(bubble.style.maxWidth).toBe(`${HEADER.width}px`)
  expect(bubble.style.maxHeight).toBe(`${800 - (HEADER.height + 8) - 8}px`)
  expect(control().getAttribute('aria-expanded')).toBe('true')
  expect(control().getAttribute('aria-controls')).toBe(bubble.id)
  expect(screen.getByTestId('status').closest('.omne-session-side')).toBe(bubble)
  expect(bubble.querySelector('.omne-session-side-title')?.textContent).toBe('状态')
  expect(document.querySelector('.omne-session-main')?.contains(bubble)).toBe(false)
})

it('墨框收起：Escape 收起并把焦点还给对话头的控件；点墨框外面收起；点墨框里面不收', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  fireEvent.click(control())
  const inside = screen.getByTestId('status')
  fireEvent.pointerDown(inside)
  expect(control().getAttribute('aria-expanded')).toBe('true')
  fireEvent.keyDown(inside, { key: 'Escape' })
  expect(control().getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(control())
  fireEvent.click(control())
  expect(control().getAttribute('aria-expanded')).toBe('true')
  fireEvent.pointerDown(document.querySelector('.omne-session-main')!)
  expect(control().getAttribute('aria-expanded')).toBe('false')
})

it('墨框里的项经 portal 打开的东西（菜单、下拉）按下不收；按在墨框与控件之外照样收', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'menu', ctx =>
    sessionSide.contribute(ctx.shell, {
      id: 'menu',
      order: 0,
      render: () => (
        <p data-testid="menu">{createPortal(<button type="button">一项</button>, document.body)}</p>
      ),
    }),
  )
  fireEvent.click(control())
  expect(control().getAttribute('aria-expanded')).toBe('true')
  const item = screen.getByRole('button', { name: '一项' })
  expect(panel()?.contains(item)).toBe(false)
  fireEvent.pointerDown(item)
  expect(control().getAttribute('aria-expanded')).toBe('true')
  fireEvent.pointerDown(document.querySelector('.omne-session-main')!)
  expect(control().getAttribute('aria-expanded')).toBe('false')
})

it('墨框开着时按对话头的控件：这一下不算在别处，控件自己的点按把墨框收起', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  fireEvent.click(control())
  fireEvent.pointerDown(control(), { button: 0 })
  expect(control().getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(control())
  expect(control().getAttribute('aria-expanded')).toBe('false')
})

/** Enter on the focused control: the browser's keyboard activation is a keydown, then a click. */
function openFromKeyboard(): void {
  act(() => control().focus())
  fireEvent.keyDown(control(), { key: 'Enter' })
  fireEvent.click(control())
}

async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
  })
}

it('从键盘打开墨框，焦点进到墨框里标着的地方；Escape 收起后回到对话头的控件', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0, '状态')))
  openFromKeyboard()
  await nextFrame()
  const marked = panel()?.querySelector('[data-initial-focus]')
  expect(marked?.classList.contains('omne-session-side-body')).toBe(true)
  expect(document.activeElement).toBe(marked)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(control().getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(control())
})

it('Escape 之后用指针按形：按下先放掉键盘给的焦点；指针打开的墨框不抢焦点', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  openFromKeyboard()
  await nextFrame()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(document.activeElement).toBe(control())
  fireEvent.pointerDown(control(), { button: 0 })
  expect(document.activeElement).not.toBe(control())
  fireEvent.click(control(), { detail: 1 })
  await nextFrame()
  expect(control().getAttribute('aria-expanded')).toBe('true')
  expect(panel()?.contains(document.activeElement)).toBe(false)
})

it('按画在座位上的形，外壳经 click() 转给控件：算指针，焦点放掉再像指针那样拿，墨框不抢焦点', async () => {
  stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  openFromKeyboard()
  await nextFrame()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  const blur = vi.spyOn(control(), 'blur')
  act(() => control().click())
  await nextFrame()
  expect(control().getAttribute('aria-expanded')).toBe('true')
  expect(blur).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(control())
  expect(panel()?.contains(document.activeElement)).toBe(false)
})

it('墨框开着时按控件上的 Escape 也收起；变宽时墨框收起，侧边区回到停靠', async () => {
  const room = stubRoom(1100, boxes)
  const { root } = await opened()
  await contribute(root, 'one', ctx => sessionSide.contribute(ctx.shell, side('status', 0)))
  fireEvent.click(control())
  fireEvent.keyDown(control(), { key: 'Escape' })
  expect(control().getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(control())
  act(() => room.resize(1440))
  expect(panel()?.dataset['presentation']).toBe('docked')
  act(() => room.resize(1100))
  expect(control().getAttribute('aria-expanded')).toBe('false')
})

it('宽窄之间切换时，选中的页签不变', async () => {
  const room = stubRoom(1440, boxes)
  const { root } = await opened()
  await contribute(root, 'two', ctx => {
    sessionSide.contribute(ctx.shell, side('a', 1, '甲签'))
    sessionSide.contribute(ctx.shell, side('b', 2, '乙签'))
  })
  fireEvent.click(control())
  fireEvent.click(screen.getByRole('button', { name: '乙签' }))
  act(() => room.resize(1100))
  fireEvent.click(control())
  expect(panel()?.dataset['presentation']).toBe('bubble')
  expect(screen.getByRole('button', { name: '乙签' }).getAttribute('aria-pressed')).toBe('true')
  expect(paneOf('b')?.hidden).toBe(false)
  act(() => room.resize(1440))
  expect(panel()?.dataset['presentation']).toBe('docked')
  expect(paneOf('b')?.hidden).toBe(false)
  expect(paneOf('a')?.hidden).toBe(true)
})

it('没有侧边区的内容时，对话头只有座位与名字，不是控件', async () => {
  stubRoom(1100, boxes)
  await opened()
  expect(screen.queryByRole('button', { name: 'Agent' })).toBeNull()
  const seat = document.querySelector('.omne-session-bar [data-figure-seat="header"]')
  expect(seat?.closest('.omne-session-figure')?.textContent).toBe('Agent')
})

it('经带类型的点往 session.dock 放的项，出现在转写的末尾，收到解回来的会话', async () => {
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
  const dock = typed.closest('.omne-session-dock')
  expect(dock?.parentElement?.classList.contains('omne-conversation')).toBe(true)
  expect(dock?.parentElement?.lastElementChild).toBe(dock)
})
