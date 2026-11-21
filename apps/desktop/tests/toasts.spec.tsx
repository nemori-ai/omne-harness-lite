// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Toast } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { FigureSeat } from '@omne-harness/ui-kit'
import { createToldBoard } from '../src/page/shell/state.ts'
import { toldLineCap, toldText } from '../src/page/shell/told.tsx'
import { current, home, setup } from './support/shell-setup.tsx'

type Rect = Readonly<{ left: number; top: number; width: number; height: number }>
const rect = ({ left, top, width, height }: Rect): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

/** Where things are drawn: happy-dom lays nothing out, so seats and the fold control get boxes here. */
const HOME_SEAT: Rect = { left: 12, top: 36, width: 32, height: 32 }
const HEADER_SEAT: Rect = { left: 600, top: 20, width: 32, height: 32 }
const FOLD: Rect = { left: 228, top: 36, width: 32, height: 32 }
/** The note's own box (ink.css at the middle size): its padding above and below, and one line of its words. */
const NOTE_PADDING = { top: 8, bottom: 9 }
const NOTE_LINE = 21
/** The note's top: 20px above the figure's middle at home (the kit's `BESIDE.level`). */
const NOTE_TOP = HOME_SEAT.top + HOME_SEAT.height / 2 - 20
/** Where the first row of the navigation starts, and how many lines the words would need; each test may move them. */
let firstRowTop = 400
let wordsNeed = 6

beforeEach(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.closest('[hidden]') !== null) return rect({ left: 0, top: 0, width: 0, height: 0 })
    const seat = this.dataset['figureSeat']
    if (seat === 'home') return rect(HOME_SEAT)
    if (seat === 'header') return rect(HEADER_SEAT)
    if (this.classList.contains('shell-fold')) return rect(FOLD)
    if (this.classList.contains('shell-nav-link'))
      return rect({ left: 8, top: firstRowTop, width: 240, height: 40 })
    return rect({ left: 0, top: 0, width: 0, height: 0 })
  })
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('omne-told-note-words') ? wordsNeed * NOTE_LINE : 0
  })
  const style = document.createElement('style')
  style.dataset['test'] = 'told-note'
  style.textContent = `.omne-told-note { padding: ${NOTE_PADDING.top}px 14px ${NOTE_PADDING.bottom}px; }
    .omne-told-note-words { line-height: ${NOTE_LINE}px; }`
  document.head.append(style)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.head.querySelector('style[data-test="told-note"]')?.remove()
  firstRowTop = 400
  wordsNeed = 6
})

const pages = (seen: (string | undefined)[]) =>
  defineUiModule({
    name: 'pages',
    inject: [],
    apply(shell) {
      shell.contribute('pages', {
        id: 'first',
        title: '首页',
        order: 0,
        icon: 'topics',
        render: () => null,
      })
      shell.contribute('pages', {
        id: 'inbox',
        title: '收件箱',
        order: 1,
        icon: 'mail',
        render: ({ subject }) => {
          seen.push(subject)
          return <p data-subject={subject ?? ''}>收件箱</p>
        },
      })
    },
  })

/** A page whose header holds a seat of its own, the way a conversation page does. */
const headed = defineUiModule({
  name: 'headed',
  inject: [],
  apply(shell) {
    shell.contribute('pages', {
      id: 'headed',
      title: '有头的页',
      order: 2,
      icon: 'conversation',
      render: () => (
        <header>
          <FigureSeat name="header" priority={2} />
        </header>
      ),
    })
  },
})

async function signedIn() {
  const seen: (string | undefined)[] = []
  const t = await setup({ login: 'signed-in', modules: [pages(seen), headed] })
  const m = await t.module('m')
  return { ...t, m, seen }
}

const toast = (id: string, more: Partial<Toast> = {}): Toast => ({
  id,
  tone: 'attention',
  title: `提示 ${id}`,
  ...more,
})
const note = () => document.querySelector<HTMLElement>('.omne-told-note')
const words = () => note()?.querySelector('.omne-told-note-words')?.textContent
const putAway = () => note() === null || note()!.hasAttribute('inert')

describe('外壳：瞬时提示画成告知笺', () => {
  it('形坐在家、侧栏展开时写在家旁，只写最新的一条，后来的替换前面的', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a', { body: '一行正文' })))
    expect(words()).toBe('提示 a：一行正文')
    expect(note()!.closest('.shell-sidebar')).not.toBeNull()
    act(() => t.m.shell.toast(toast('b')))
    expect(words()).toBe('提示 b')
    expect(document.querySelectorAll('.omne-told-note:not([inert])')).toHaveLength(1)
  })

  it('同一个模块再交同一个标识：原地替换字，不另写一张', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a', { title: '旧的' })))
    const first = t.state.told.said()!.key
    act(() => t.m.shell.toast(toast('a', { title: '新的' })))
    expect(words()).toBe('新的')
    expect(t.state.told.said()!.key).toBe(first)
  })

  it('侧栏折着时不写，也不排队：再展开时什么都没有', async () => {
    const t = await signedIn()
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    act(() => t.m.shell.toast(toast('a')))
    expect(note()).toBeNull()
    expect(t.state.told.said()).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: '展开侧栏' }))
    expect(note()).toBeNull()
  })

  it('写着的时候侧栏折起来：告知笺收起，再展开也不回来', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    expect(words()).toBe('提示 a')
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    expect(t.state.told.said()).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: '展开侧栏' }))
    expect(t.state.told.said()).toBeUndefined()
  })

  it('形不在家（坐在一页的头上）时不写', async () => {
    const t = await signedIn()
    act(() => t.service.navigate('headed'))
    act(() => t.m.shell.toast(toast('a')))
    expect(note()).toBeNull()
    expect(t.state.told.said()).toBeUndefined()
  })

  it('点告知笺去动作指的页并带上对象，墨卷回口里；从导航切页不带对象', async () => {
    const t = await signedIn()
    act(() =>
      t.m.shell.toast(toast('a', { action: { label: '去看看', page: 'inbox', subject: 'n-7' } })),
    )
    expect(current()).toBe('家')
    fireEvent.click(screen.getByRole('button', { name: '提示 a' }))
    expect(current()).toBe('收件箱')
    expect(document.querySelector('[data-subject]')?.getAttribute('data-subject')).toBe('n-7')
    expect(t.state.told.said()).toBeUndefined()
    expect(putAway()).toBe(true)
    fireEvent.click(home()!)
    fireEvent.click(screen.getByRole('link', { name: '收件箱' }))
    expect(document.querySelector('[data-subject]')?.getAttribute('data-subject')).toBe('')
  })

  it('人自己去了动作指的那一页：告知笺收起', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a', { action: { label: '去看看', page: 'inbox' } })))
    fireEvent.click(screen.getByRole('link', { name: '收件箱' }))
    expect(t.state.told.said()).toBeUndefined()
    expect(putAway()).toBe(true)
  })

  it('没有动作的提示，点它只收起，当前页不变', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    fireEvent.click(screen.getByRole('button', { name: '提示 a' }))
    expect(current()).toBe('家')
    expect(t.state.told.said()).toBeUndefined()
  })

  it('动作要去的页不在：点它只收起，当前页不变', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a', { action: { label: '去看看', page: 'absent' } })))
    fireEvent.click(screen.getByRole('button', { name: '提示 a' }))
    expect(current()).toBe('家')
    expect(t.state.told.said()).toBeUndefined()
  })

  it('告知笺没有计时器：放多久都还在', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    act(() => void vi.advanceTimersByTime(10 * 60 * 1000))
    expect(words()).toBe('提示 a')
    expect(t.state.told.said()).toBeDefined()
  })

  it('模块卸载时它的告知笺撤掉；别的模块交来的不动', async () => {
    const t = await signedIn()
    const other = await t.module('other')
    act(() => t.m.shell.toast(toast('a')))
    act(() => other.shell.toast(toast('b')))
    await act(async () => {
      await t.m.fiber.dispose()
    })
    expect(t.state.told.said()?.toast.id).toBe('b')
    expect(putAway()).toBe(false)
    await act(async () => {
      await other.fiber.dispose()
    })
    expect(t.state.told.said()).toBeUndefined()
  })

  it('不写的提示不算进待答数', async () => {
    const t = await signedIn()
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    act(() => t.m.shell.toast(toast('a')))
    expect(t.state.figure.merged({ foreground: undefined, pages: [] }).waiting).toBe(0)
  })

  it('宽度限在侧栏里：从笺的左边到折叠钮前一个行内间距', async () => {
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    const wrapper = document.querySelector<HTMLElement>('.shell-told')!
    const start = HOME_SEAT.left + HOME_SEAT.width / 2 + 56 / 2 + 2
    expect(wrapper.style.maxWidth).toBe(`${FOLD.left - start}px`)
  })
})

describe('告知笺的行数上限（OD-20）', () => {
  const lines = () => note()?.style.getPropertyValue('--omne-told-lines')

  it('给定空地算出能写的整行数：先去掉笺自己的上下内边距', () => {
    const padding = NOTE_PADDING.top + NOTE_PADDING.bottom
    expect(toldLineCap(padding + 4 * NOTE_LINE, NOTE_LINE, padding)).toBe(4)
    expect(toldLineCap(padding + 4 * NOTE_LINE - 1, NOTE_LINE, padding)).toBe(3)
    expect(toldLineCap(padding + 3 * NOTE_LINE, NOTE_LINE, padding)).toBe(3)
  })

  it('空地再小也不少于两行', () => {
    const padding = NOTE_PADDING.top + NOTE_PADDING.bottom
    expect(toldLineCap(padding + 2 * NOTE_LINE, NOTE_LINE, padding)).toBe(2)
    expect(toldLineCap(padding + NOTE_LINE, NOTE_LINE, padding)).toBe(2)
    expect(toldLineCap(0, NOTE_LINE, padding)).toBe(2)
    expect(toldLineCap(-40, NOTE_LINE, padding)).toBe(2)
  })

  it('外壳按笺的上沿到导航第一行的空地给上限：要六行的字收在两行（其余是省略号），下沿不过第一行', async () => {
    const padding = NOTE_PADDING.top + NOTE_PADDING.bottom
    firstRowTop = NOTE_TOP + padding + 2 * NOTE_LINE + 10
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    expect(lines()).toBe('2')
    expect(NOTE_TOP + padding + Number(lines()) * NOTE_LINE).toBeLessThanOrEqual(firstRowTop)
  })

  it('空地够写三行时写三行；空地更大时仍照笺自己的规矩（最多三行）', async () => {
    const padding = NOTE_PADDING.top + NOTE_PADDING.bottom
    firstRowTop = NOTE_TOP + padding + 3 * NOTE_LINE
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    expect(lines()).toBe('3')
    cleanup()
    firstRowTop = 400
    const roomy = await signedIn()
    act(() => roomy.m.shell.toast(toast('b')))
    expect(lines()).toBe('3')
  })

  it('空地比两行还小：仍写两行，不写一行', async () => {
    firstRowTop = NOTE_TOP + NOTE_LINE
    const t = await signedIn()
    act(() => t.m.shell.toast(toast('a')))
    expect(lines()).toBe('2')
  })
})

describe('告知笺的存放', () => {
  const owner = {}
  it('没有地方写时丢掉，不排队', () => {
    const board = createToldBoard()
    board.show(owner, toast('a'))
    expect(board.said()).toBeUndefined()
    board.room(true)
    expect(board.said()).toBeUndefined()
    board.show(owner, toast('b'))
    expect(board.said()?.toast.id).toBe('b')
  })

  it('没了地方就收起；撤下只撤自己交的；点掉就没有', () => {
    const board = createToldBoard()
    const other = {}
    board.room(true)
    board.show(owner, toast('a'))
    board.withdraw(other)
    expect(board.said()?.toast.id).toBe('a')
    board.withdraw(owner)
    expect(board.said()).toBeUndefined()
    board.show(owner, toast('b'))
    board.dismiss()
    expect(board.said()).toBeUndefined()
    board.show(owner, toast('c'))
    board.room(false)
    expect(board.said()).toBeUndefined()
  })

  it('两个模块用同一个标识：是两张，不是同一张', () => {
    const board = createToldBoard()
    board.room(true)
    board.show(owner, toast('a'))
    const first = board.said()!.key
    board.show({}, toast('a'))
    expect(board.said()!.key).not.toBe(first)
  })

  it('告知笺的字：标题，有正文时接在冒号后面', () => {
    expect(toldText(toast('a'))).toBe('提示 a')
    expect(toldText(toast('a', { body: '一行' }))).toBe('提示 a：一行')
  })
})
