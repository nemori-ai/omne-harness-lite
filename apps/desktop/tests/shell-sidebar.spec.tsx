// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { PageItem, SidebarItem } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { bindRegionKeys } from '../src/page/shell/keys.ts'
import { activeSeat } from '../src/page/shell/seats.ts'
import { SHEET_LABEL } from '../src/page/shell/sidebar.tsx'
import { bindSizeKeys } from '../src/page/shell/size.ts'
import { WINDOW_CHROME_ATTRIBUTE, markWindowChrome } from '../src/page/shell/window-chrome.ts'
import { current, home, navTitles, section, settle, setup } from './support/shell-setup.tsx'

beforeEach(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type Page = Pick<PageItem, 'id' | 'title' | 'order'> & Partial<Pick<PageItem, 'group' | 'icon'>>
type Side = Pick<SidebarItem, 'id' | 'order'> &
  Partial<Pick<SidebarItem, 'group'>> & {
    text: string
    rail?: string
  }

const pagesOf = (...pages: readonly Page[]) =>
  defineUiModule({
    name: `pages-${pages.map(page => page.id).join('-')}`,
    needs: {},
    apply(shell) {
      for (const page of pages)
        shell.contribute('pages', {
          icon: 'topics',
          ...page,
          render: () => <p data-placeholder={page.id}>{`${page.title}占位`}</p>,
        })
    },
  })

const sideOf = (...items: readonly Side[]) =>
  defineUiModule({
    name: `side-${items.map(item => item.id).join('-')}`,
    needs: {},
    apply(shell) {
      for (const { text, rail, ...item } of items)
        shell.contribute('sidebar', {
          ...item,
          render: () => <p data-side-text={item.id}>{text}</p>,
          ...(rail === undefined ? {} : { rail: () => <p data-side-rail={item.id}>{rail}</p> }),
        })
    },
  })

const PAGES = pagesOf(
  { id: 'first', title: '对话', order: 0, icon: 'conversation' },
  { id: 'notes', title: '资料', order: 1, icon: 'material' },
  { id: 'later', title: '日程', order: 2, icon: 'time' },
  { id: 'settings', title: '设置', order: 10, icon: 'settings', group: 'utility' },
  { id: 'usage', title: '用量', order: 11, icon: 'overview', group: 'utility' },
)

const nextFrame = () =>
  act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    await settle()
  })

describe('外壳：家与一处选中', () => {
  it('家只有形的座位，不写应用名；它的可访问名称是应用名', async () => {
    await setup({ login: 'signed-in', modules: [PAGES] })
    const place = home()!
    expect(place.querySelector('[data-figure-seat="home"]')).not.toBeNull()
    expect(place.textContent).toBe('')
    expect(place.getAttribute('aria-label')).toBe('omne')
    expect(document.querySelector('.shell-sidebar')!.textContent).not.toContain('omne')
  })

  it('次序最前的一页由家代表，它在导航里没有自己的一行', async () => {
    await setup({ login: 'signed-in', modules: [PAGES] })
    expect(navTitles()).toEqual(['资料', '日程', '设置', '用量'])
    expect(document.querySelector('.shell-nav-link[data-page="first"]')).toBeNull()
    expect(current()).toBe('家')
    expect(section('first')!.hidden).toBe(false)
  })

  it('任何时候恰好一处被选中：家、导航的一行或底部的一行；家被选中时没有一行被选中', async () => {
    await setup({ login: 'signed-in', modules: [PAGES] })
    const selected = () => [...document.querySelectorAll('[data-selected="true"]')]
    expect(current()).toBe('家')
    expect(selected()).toEqual([home()])
    fireEvent.click(screen.getByRole('link', { name: '资料' }))
    expect(current()).toBe('资料')
    expect(selected()).toHaveLength(1)
    expect(home()!.getAttribute('aria-current')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: '设置' }))
    expect(current()).toBe('设置')
    expect(selected()).toHaveLength(1)
    fireEvent.click(home()!)
    expect(current()).toBe('家')
    expect(selected()).toEqual([home()])
  })

  it('导航的行与家是链到页面的链接；按下只在外壳里换页，窗口的地址不动', async () => {
    await setup({ login: 'signed-in', modules: [PAGES] })
    const before = window.location.href
    const row = screen.getByRole('link', { name: '日程' })
    expect(row.getAttribute('href')).toBe('#later')
    expect(home()!.getAttribute('href')).toBe('#first')
    const pressed = new MouseEvent('click', { bubbles: true, cancelable: true })
    act(() => void row.dispatchEvent(pressed))
    expect(pressed.defaultPrevented).toBe(true)
    expect(current()).toBe('日程')
    fireEvent.click(home()!)
    expect(window.location.href).toBe(before)
  })

  it('导航的每一行有图标；不认识的图标名画「未知」的字形', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        pagesOf(
          { id: 'first', title: '对话', order: 0 },
          { id: 'odd', title: '怪的', order: 1, icon: 'no-such-icon' },
        ),
      ],
    })
    const row = document.querySelector('.shell-nav-link[data-page="odd"]')!
    expect(row.querySelector('svg[data-icon="unknown"]')).not.toBeNull()
  })
})

describe('外壳：放不下时滚', () => {
  const revealed = () => {
    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined)
    return () =>
      reveal.mock.contexts.flatMap((row, at) =>
        row instanceof HTMLElement && row.matches('.shell-nav-link')
          ? [[row.textContent, reveal.mock.calls[at]![0]]]
          : [],
      )
  }

  it('换页时选中的一行进到视野里，只在它的那一段里上下挪', async () => {
    const seen = revealed()
    await setup({ login: 'signed-in', modules: [PAGES] })
    expect(seen()).toEqual([])
    fireEvent.click(screen.getByRole('link', { name: '日程' }))
    fireEvent.click(screen.getByRole('link', { name: '用量' }))
    fireEvent.click(home()!)
    expect(seen()).toEqual([
      ['日程', { block: 'nearest', inline: 'nearest' }],
      ['用量', { block: 'nearest', inline: 'nearest' }],
    ])
  })

  it('侧栏区 primary 段的项在自己的一段里滚，导航的行不在那一段里', async () => {
    await setup({
      login: 'signed-in',
      modules: [PAGES, sideOf({ id: 'list', order: 0, text: '会话列表' })],
    })
    const segment = document.querySelector<HTMLElement>('.shell-sidebar-primary')!
    expect(segment.querySelector('[data-side-text="list"]')).not.toBeNull()
    expect(segment.querySelector('.shell-nav')).toBeNull()
    expect(segment.closest('.shell-navigation-main')?.querySelector('.shell-nav')).not.toBeNull()
  })

  it('窗口或字号档变了，选中的一行回到视野里', async () => {
    const watched = new Map<Element, () => void>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly changed: () => void
        constructor(changed: () => void) {
          this.changed = changed
        }
        observe(target: Element) {
          watched.set(target, this.changed)
        }
        unobserve() {}
        disconnect() {}
      },
    )
    const seen = revealed()
    await setup({ login: 'signed-in', modules: [PAGES] })
    fireEvent.click(screen.getByRole('link', { name: '日程' }))
    const before = seen().length
    act(() => watched.get(document.querySelector('.shell-navigation-content')!)?.())
    expect(seen().slice(before)).toEqual([['日程', { block: 'nearest', inline: 'nearest' }]])
  })
})

describe('外壳：侧栏的两段', () => {
  const twoSegments = () =>
    setup({
      login: 'signed-in',
      modules: [
        PAGES,
        sideOf(
          { id: 'list', order: 0, text: '会话列表' },
          { id: 'account', order: 1, text: '账号块', group: 'utility' },
        ),
      ],
    })

  it('primary 段在上面；底部两行：utility 段的页面排成一行，下一行左边是侧栏区的 utility 项，右边是「外观」', async () => {
    await twoSegments()
    const top = document.querySelector<HTMLElement>('.shell-navigation-main')!
    const foot = document.querySelector<HTMLElement>('.shell-secondary')!
    const primary = within(top).getByRole('navigation', { name: '页面' })
    expect(
      within(primary)
        .getAllByRole('link')
        .map(row => row.textContent),
    ).toEqual(['资料', '日程'])
    expect(top.querySelector('[data-side-text="list"]')).not.toBeNull()
    expect(top.querySelector('[data-item="account"]')).toBeNull()
    const grid = within(foot).getByRole('navigation', { name: '次要页面' })
    expect(grid.classList.contains('shell-utility-nav')).toBe(true)
    expect(
      within(grid)
        .getAllByRole('link')
        .map(cell => cell.textContent),
    ).toEqual(['设置', '用量'])
    const last = foot.lastElementChild as HTMLElement
    expect(last.classList.contains('shell-footer-row')).toBe(true)
    expect([...last.children].map(side => side.className)).toEqual([
      'shell-footer-items',
      expect.stringContaining('shell-appearance'),
    ])
    expect(last.firstElementChild!.querySelector('[data-side-text="account"]')).not.toBeNull()
    expect(last.lastElementChild).toBe(screen.getByRole('button', { name: '外观' }))
  })

  it('那一行的每一项是图标加名字的安静钮，不在导航行滑动的底里；选中的一项自己画底，侧栏里仍恰好一处选中', async () => {
    await twoSegments()
    const grid = screen.getByRole('navigation', { name: '次要页面' })
    for (const cell of within(grid).getAllByRole('link')) {
      expect(cell.parentElement).toBe(grid)
      expect(cell.querySelector('svg')).not.toBeNull()
      expect(cell.querySelector('.shell-link-label')?.textContent).toBe(cell.textContent)
      expect(cell.getAttribute('data-control')).toBe('row')
      expect(cell.hasAttribute('data-glide-row')).toBe(false)
    }
    expect(grid.querySelector('[data-glide-menu]')).toBeNull()
    const selected = () => [...document.querySelectorAll('[data-selected="true"]')]
    fireEvent.click(within(grid).getByRole('link', { name: '用量' }))
    expect(current()).toBe('用量')
    expect(selected()).toEqual([within(grid).getByRole('link', { name: '用量' })])
    fireEvent.click(screen.getByRole('link', { name: '资料' }))
    expect(selected()).toEqual([screen.getByRole('link', { name: '资料' })])
  })

  it('「外观」是一个图标钮：名字与提示都是「外观」，不写字', async () => {
    await twoSegments()
    const appearance = screen.getByRole('button', { name: '外观' })
    expect(appearance.textContent).toBe('')
    expect(appearance.querySelector('svg')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Tab' })
    await act(async () => {
      appearance.focus()
    })
    expect((await screen.findByRole('tooltip')).textContent).toBe('外观')
  })
})

describe('外壳：窄条', () => {
  it('折成窄条：侧栏区画给了的 rail，没给的不画；名字还在，只是看不见', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        PAGES,
        sideOf(
          { id: 'list', order: 0, text: '会话列表' },
          { id: 'account', order: 1, text: '账号块', group: 'utility', rail: '账号的圆' },
        ),
      ],
    })
    const counts = () =>
      document.querySelector('.shell-navigation-content')!.hasAttribute('data-count-dots')
    expect(counts()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    await nextFrame()
    const sidebar = document.querySelector<HTMLElement>('.shell-sidebar')!
    expect(sidebar.dataset['width']).toBe('rail')
    expect(sidebar.dataset['labels']).toBe('hidden')
    expect(counts()).toBe(true)
    expect(document.querySelector('[data-side-rail="account"]')?.textContent).toBe('账号的圆')
    expect(document.querySelector('[data-side-text]')).toBeNull()
    expect(document.querySelector('[data-item="list"]')).toBeNull()
    expect(screen.getByRole('link', { name: '资料' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '展开侧栏' }))
    expect(document.querySelector('[data-side-text="list"]')?.textContent).toBe('会话列表')
    expect(document.querySelector('[data-side-text="account"]')?.textContent).toBe('账号块')
    expect(document.querySelector('[data-side-rail]')).toBeNull()
    expect(counts()).toBe(false)
  })
})

describe('外壳：窄窗口的抽屉', () => {
  function windowWidth(wide: boolean) {
    const listeners = new Set<() => void>()
    let matches = wide
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query.includes('min-width: 768px') ? matches : false
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }))
    return (next: boolean) =>
      act(() => {
        matches = next
        for (const listener of Array.from(listeners)) listener()
      })
  }

  it('窄于 768：导航在从右边进来的抽屉里，带遮罩；换页自己关上', async () => {
    windowWidth(false)
    await setup({ login: 'signed-in', modules: [PAGES] })
    expect(navTitles()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    const sheet = await screen.findByRole('dialog', { name: 'omne' })
    expect(sheet.getAttribute('data-side')).toBe('right')
    expect(document.querySelector('[data-slot="sheet-overlay"]')).not.toBeNull()
    expect(within(sheet).getByRole('link', { name: 'omne' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('link', { name: '资料' }))
    expect(current()).toBeUndefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(section('notes')!.hidden).toBe(false)
  })

  it('抽屉打开时，选中的一行进到视野里', async () => {
    windowWidth(false)
    await setup({ login: 'signed-in', modules: [PAGES] })
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('link', { name: '用量' }))
    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    const row = within(await screen.findByRole('dialog')).getByRole('link', { name: '用量' })
    expect(reveal.mock.contexts).toEqual([row])
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })

  it('抽屉开着时，后面的页面不可用，形只能坐抽屉里的家；关上就还原', async () => {
    windowWidth(false)
    await setup({ login: 'signed-in', modules: [PAGES] })
    const main = screen.getByRole('main')
    expect(main.inert).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    await screen.findByRole('dialog')
    expect(main.inert).toBe(true)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await act(async () => {
      await settle()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(main.inert).toBe(false)
  })

  it('抽屉里的家等抽屉进来停稳了才是形的座位', async () => {
    windowWidth(false)
    vi.spyOn(Element.prototype, 'getAnimations').mockImplementation(function (this: Element) {
      return this.matches('[data-slot="sheet-content"]')
        ? [{ playState: 'running' } as unknown as Animation]
        : []
    })
    await setup({ login: 'signed-in', modules: [PAGES] })
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    const sheet = await screen.findByRole('dialog')
    const place = within(sheet).getByRole('link', { name: 'omne' })
    expect(place.querySelector('[data-figure-seat]')).toBeNull()
    fireEvent.animationEnd(place)
    expect(place.querySelector('[data-figure-seat]')).toBeNull()
    fireEvent.animationEnd(sheet)
    expect(place.querySelector('[data-figure-seat="home"]')).not.toBeNull()
  })

  it('抽屉关着时，家站在页面上抽屉的开关旁边，形坐在那里；抽屉进来停稳了，家是抽屉里的那一个；抽屉一走，回到页面上的家', async () => {
    windowWidth(false)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const side = this.dataset['figureSeat'] === undefined ? 0 : 32
      return { left: 0, top: 0, width: side, height: side, right: side, bottom: side } as DOMRect
    })
    vi.spyOn(Element.prototype, 'getAnimations').mockImplementation(function (this: Element) {
      return this.matches('[data-slot="sheet-content"]')
        ? [{ playState: 'running' } as unknown as Animation]
        : []
    })
    await setup({ login: 'signed-in', modules: [PAGES] })
    const corner = document.querySelector<HTMLElement>('.shell-sidebar[data-width="sheet"]')!
    const toggle = within(corner).getByRole('button', { name: SHEET_LABEL })
    const onPage = within(corner).getByRole('link', { name: 'omne' })
    expect([...corner.children]).toEqual([onPage, toggle])
    const pageSeat = () => onPage.querySelector('[data-figure-seat="home"]')
    expect(pageSeat()).not.toBeNull()
    expect(activeSeat()).toBe(pageSeat())
    fireEvent.click(toggle)
    const sheet = await screen.findByRole('dialog')
    expect(activeSeat()).toBe(pageSeat())
    fireEvent.animationEnd(sheet)
    const inSheet = within(sheet).getByRole('link', { name: 'omne' })
    expect(pageSeat()).toBeNull()
    expect(activeSeat()).toBe(inSheet.querySelector('[data-figure-seat="home"]'))
    fireEvent.keyDown(sheet, { key: 'Escape' })
    await act(async () => {
      await settle()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(activeSeat()).toBe(pageSeat())
    expect(pageSeat()).not.toBeNull()
  })

  it('抽屉里点当前的那一页也关上', async () => {
    windowWidth(false)
    await setup({ login: 'signed-in', modules: [PAGES] })
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    const sheet = await screen.findByRole('dialog', { name: 'omne' })
    fireEvent.click(within(sheet).getByRole('link', { name: 'omne' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('窗口变宽越过 768：抽屉自己关上，回到侧栏', async () => {
    const resize = windowWidth(false)
    await setup({ login: 'signed-in', modules: [PAGES] })
    fireEvent.click(screen.getByRole('button', { name: SHEET_LABEL }))
    await screen.findByRole('dialog', { name: 'omne' })
    resize(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(navTitles()).toEqual(['资料', '日程', '设置', '用量'])
    resize(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('外壳：外观', () => {
  const openAppearance = async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: '外观' }), {
      button: 0,
      ctrlKey: false,
    })
    return screen.findByRole('menu')
  }
  const checked = (menu: HTMLElement) =>
    within(menu)
      .getAllByRole('menuitemradio')
      .filter(item => item.getAttribute('aria-checked') === 'true')
      .map(item => item.textContent)

  it('平样式的菜单：主题三选一、字号档四选一，每个选项自己就是回执', async () => {
    const t = await setup({ login: 'signed-in', modules: [PAGES] })
    let menu = await openAppearance()
    expect(menu.getAttribute('data-slot')).toBe('dropdown-menu-content')
    expect(menu.closest('.omne-ink-bubble')).toBeNull()
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map(item => item.textContent),
    ).toEqual(['浅色', '深色', '跟随系统', '小楷', '中楷', '大楷', '老花'])
    expect(checked(menu)).toEqual(['跟随系统', '中楷'])
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '深色' }))
    expect(t.chosen).toEqual(['dark'])
    menu = await openAppearance()
    expect(checked(menu)).toEqual(['深色', '中楷'])
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '老花' }))
    expect(t.size.current()).toBe('reading')
    expect(t.sizeRoot.dataset.size).toBe('reading')
  })

  it('⌘= ⌘- ⌘0 在页面里调字号档，菜单跟着', async () => {
    const t = await setup({ login: 'signed-in', modules: [PAGES] })
    const unbind = bindSizeKeys(window, t.size, 'mac')
    act(() => void fireEvent.keyDown(window, { key: '=', metaKey: true }))
    expect(checked(await openAppearance())).toEqual(['跟随系统', '大楷'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    act(() => void fireEvent.keyDown(window, { key: '0', metaKey: true }))
    expect(t.size.current()).toBe('medium')
    unbind()
  })

  it('Escape 关上菜单，焦点回到「外观」', async () => {
    await setup({ login: 'signed-in', modules: [PAGES] })
    const trigger = screen.getByRole('button', { name: '外观' })
    trigger.focus()
    const menu = await openAppearance()
    fireEvent.keyDown(menu, { key: 'Escape' })
    await act(async () => {
      await settle()
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('外壳：键盘', () => {
  const sided = defineUiModule({
    name: 'sided',
    needs: {},
    apply(shell) {
      shell.contribute('pages', {
        id: 'first',
        title: '对话',
        order: 0,
        icon: 'conversation',
        render: () => (
          <div>
            <button type="button">正文里的键</button>
            <button type="button">正文里的第二个键</button>
            <div data-keyboard-region="side">
              <button type="button">侧边区的键</button>
            </div>
          </div>
        ),
      })
      shell.contribute('pages', {
        id: 'other',
        title: '别的',
        order: 1,
        icon: 'topics',
        render: () => (
          <div data-keyboard-region="side">
            <button type="button">藏着的侧边区</button>
          </div>
        ),
      })
    },
  })
  const region = () =>
    (document.activeElement as HTMLElement)
      .closest('[data-keyboard-region]')
      ?.getAttribute('data-keyboard-region')
  const press = (shiftKey = false) =>
    act(() => void fireEvent.keyDown(window, { key: 'F6', shiftKey }))

  it('页面开头有跳到正文的链接，指向唯一的主区', async () => {
    const t = await setup({ login: 'signed-out' })
    const skip = () => screen.getByRole('link', { name: '跳到正文' })
    expect(skip().getAttribute('href')).toBe('#shell-content')
    expect(document.getElementById('shell-content')?.tagName).toBe('MAIN')
    act(() => t.login.set('signed-in'))
    expect(skip().getAttribute('href')).toBe('#shell-content')
    expect(document.getElementById('shell-content')).toBe(screen.getByRole('main'))
  })

  it('侧栏与主区用共用件的区域标记，外壳不另起一种', async () => {
    await setup({ login: 'signed-in', modules: [sided] })
    expect(document.querySelector('.shell-sidebar')?.getAttribute('data-keyboard-region')).toBe(
      'sidebar',
    )
    expect(screen.getByRole('main').getAttribute('data-keyboard-region')).toBe('main')
  })

  it('F6 在侧栏、正文与侧边区之间走，Shift+F6 往回；藏着的页里的侧边区不算', async () => {
    await setup({ login: 'signed-in', modules: [sided] })
    press()
    expect(region()).toBe('sidebar')
    press()
    expect(region()).toBe('main')
    press()
    expect(document.activeElement?.textContent).toBe('侧边区的键')
    press()
    expect(region()).toBe('sidebar')
    press(true)
    expect(document.activeElement?.textContent).toBe('侧边区的键')
    press(true)
    expect(region()).toBe('main')
  })

  it('回到一个区时，焦点回到它在这个区里最后待的地方', async () => {
    await setup({ login: 'signed-in', modules: [sided] })
    act(() => screen.getByRole('button', { name: '正文里的第二个键' }).focus())
    press()
    expect(document.activeElement?.textContent).toBe('侧边区的键')
    press(true)
    expect(document.activeElement?.textContent).toBe('正文里的第二个键')
  })

  it('一个区都没有时 F6 什么都不做', () => {
    document.body.innerHTML = '<button>外面</button>'
    const unbind = bindRegionKeys(window)
    fireEvent.keyDown(window, { key: 'F6' })
    expect(document.activeElement).toBe(document.body)
    unbind()
    document.body.innerHTML = ''
  })
})

describe('外壳：窗口', () => {
  it('只在应用自己的 macOS 窗口里标上隐藏的标题栏；浏览器里与别的平台不标', () => {
    const root = document.createElement('html')
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit Chrome/130 Electron/39.0.0'
    markWindowChrome(root, mac)
    expect(root.getAttribute(WINDOW_CHROME_ATTRIBUTE)).toBe('mac-inset')
    markWindowChrome(root, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Chrome/130')
    expect(root.hasAttribute(WINDOW_CHROME_ATTRIBUTE)).toBe(false)
    markWindowChrome(root, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Electron/39.0.0')
    expect(root.hasAttribute(WINDOW_CHROME_ATTRIBUTE)).toBe(false)
  })

  it('工作区顶上与登录门上方各有一条可拖的条，侧栏顶上留出窗口按钮的位置', async () => {
    const t = await setup({ login: 'signed-out' })
    expect(document.querySelector('.shell-outside > .shell-drag-strip')).not.toBeNull()
    act(() => t.login.set('signed-in'))
    expect(document.querySelector('.shell-workspace > .shell-drag-strip')).not.toBeNull()
    expect(document.querySelector('.shell-sidebar > .shell-window-strip')).not.toBeNull()
  })
})
