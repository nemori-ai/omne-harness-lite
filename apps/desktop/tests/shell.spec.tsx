// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type {
  LoginCredentials,
  LogoutResult,
  ShellLogin,
  ShellLoginState,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import type { ResolvedTheme, ThemeChoice } from '@omne-harness/ui-kit'
import type { Connectivity } from '../src/page/connectivity.ts'
import { DesktopShell, shellPlugin } from '../src/page/shell/service.ts'
import { NO_LOGIN_TEXT, Shell } from '../src/page/shell/shell.tsx'
import { LOGOUT_UNKNOWN_TEXT, createShellState } from '../src/page/shell/state.ts'
import { fakeGate, fakePage, fakeSidebar } from './support/fake-modules.tsx'

afterEach(() => cleanup())

const CHAT = 'fake:chat'
const SETTINGS = 'fake:settings'
const chatPage = fakePage({
  id: 'chat',
  title: '对话',
  order: 0,
  service: CHAT,
  icon: 'conversation',
})
const settingsPage = fakePage({ id: 'settings', title: '设置', order: 20, service: SETTINGS })

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    current: () => value,
    subscribe(listener: (value: T) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: T) {
      value = next
      for (const listener of Array.from(listeners)) listener(next)
    },
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function setup(
  options: {
    login?: ShellLoginState
    modules?: readonly Plugin.Object[]
    logout?: LogoutResult
    connectivity?: Connectivity
  } = {},
) {
  const login = source<ShellLoginState>(options.login ?? 'signed-out')
  const connectivity = source<Connectivity>(options.connectivity ?? 'connected')
  const handedOver: LoginCredentials[] = []
  const chosen: ThemeChoice[] = []
  const inner: ShellLogin = {
    state: login.current,
    subscribe: login.subscribe,
    login: async credentials => {
      handedOver.push(credentials)
      return 'signed-in'
    },
    logout: async () => {
      login.set('signing-out')
      await settle()
      login.set('signed-out')
      return options.logout ?? 'signed-out'
    },
  }
  const state = createShellState(inner)
  const root = new Context()
  await root.plugin(shellPlugin(state))
  for (const module of options.modules ?? [fakeGate(), chatPage, settingsPage])
    await root.plugin(module)
  const theme = {
    initial: 'light' as ResolvedTheme,
    select(choice: ThemeChoice): ResolvedTheme {
      chosen.push(choice)
      return choice === 'dark' ? 'dark' : 'light'
    },
  }
  render(<Shell appName="omne" state={state} connectivity={connectivity} theme={theme} />)
  const provide = async (name: string) => {
    let withdraw: () => void = () => {}
    await act(async () => {
      withdraw = root.reflect.provide(name, {})
      await settle()
    })
    return async () => {
      await act(async () => {
        withdraw()
        await settle()
      })
    }
  }
  const service = root.get('shell') as unknown as DesktopShell
  return { login, connectivity, state, root, provide, handedOver, chosen, service }
}

const navTitles = () =>
  [...document.querySelectorAll('.shell-nav-link')].map(link => link.textContent)
const current = () => document.querySelector('[aria-current="page"]')?.textContent
const section = (id: string) => document.querySelector<HTMLElement>(`section[data-page="${id}"]`)

describe('外壳：登录之外', () => {
  it('没登录只显示登录门里的那一项，不画侧栏与页面', async () => {
    const t = await setup()
    await t.provide(CHAT)
    expect(screen.getByText('登录门占位')).toBeTruthy()
    expect(screen.queryByText('对话占位')).toBeNull()
    expect(document.querySelector('.shell-sidebar')).toBeNull()
  })

  it('登录门空着时显示那句话；还在连接时先说正在连接', async () => {
    const t = await setup({ modules: [], connectivity: 'connecting' })
    expect(screen.getByText('正在连接服务……')).toBeTruthy()
    expect(screen.queryByText(NO_LOGIN_TEXT)).toBeNull()
    act(() => t.connectivity.set('connected'))
    expect(screen.getByText(NO_LOGIN_TEXT)).toBeTruthy()
  })

  it('正在退出时只显示「正在退出」', async () => {
    const t = await setup({ login: 'signed-in' })
    act(() => t.login.set('signing-out'))
    expect(screen.getByText('正在退出……')).toBeTruthy()
    expect(screen.queryByText('登录门占位')).toBeNull()
  })

  it('退出的结果不知道时，回到登录门显示那句话；下一次退出先清掉它', async () => {
    const t = await setup({ login: 'signed-in', logout: 'unknown' })
    await act(async () => {
      expect(await t.state.login.logout()).toBe('unknown')
    })
    expect(screen.getByText(LOGOUT_UNKNOWN_TEXT)).toBeTruthy()
    expect(screen.getByText('登录门占位')).toBeTruthy()
    act(() => t.login.set('signed-in'))
    const pending = t.state.login.logout()
    expect(t.state.notice.get()).toBeUndefined()
    await act(async () => {
      await pending
    })
  })

  it('退出的结果确认时不显示那句话', async () => {
    const t = await setup({ login: 'signed-in' })
    await act(async () => {
      await t.state.login.logout()
    })
    expect(screen.queryByText(LOGOUT_UNKNOWN_TEXT)).toBeNull()
  })

  it('登录经外壳原样交出凭据', async () => {
    const t = await setup()
    await t.state.login.login({ loginIdentifier: 'a', credential: 'b' })
    expect(t.handedOver).toEqual([{ loginIdentifier: 'a', credential: 'b' }])
  })
})

describe('外壳：连接', () => {
  it.each(['signed-out', 'signed-in'] as const)('%s 时连接断开，主区上方一条提示', async login => {
    const t = await setup({ login })
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => t.connectivity.set('disconnected'))
    expect(screen.getByRole('alert').textContent).toContain('连不上服务。正在按间隔重新连接')
  })

  it('侧栏显示连接状态', async () => {
    const t = await setup({ login: 'signed-in' })
    expect(document.querySelector('[data-connectivity]')?.textContent).toBe('已连接')
    act(() => t.connectivity.set('disconnected'))
    expect(document.querySelector('[data-connectivity]')?.textContent).toBe('连不上服务')
  })
})

describe('外壳：页面', () => {
  it('页面按次序列在侧栏，缺省显示次序最前的一页', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(SETTINGS)
    expect(navTitles()).toEqual(['设置'])
    await t.provide(CHAT)
    expect(navTitles()).toEqual(['对话', '设置'])
    expect(current()).toBe('对话')
    expect(section('chat')!.hidden).toBe(false)
    expect(section('settings')!.hidden).toBe(true)
  })

  it('切换只隐藏别的页面，不卸下', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    const chat = screen.getByText('对话占位')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(current()).toBe('设置')
    expect(section('chat')!.hidden).toBe(true)
    expect(document.body.contains(chat)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '对话' }))
    expect(screen.getByText('对话占位')).toBe(chat)
  })

  it('撤掉当前显示的页面，回到次序最前的一页；它回来也不抢回前面', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(CHAT)
    const withdraw = await t.provide(SETTINGS)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    await withdraw()
    expect(section('settings')).toBeNull()
    expect(current()).toBe('对话')
    await t.provide(SETTINGS)
    expect(current()).toBe('对话')
  })

  it('一页都没有时主区空着', async () => {
    const t = await setup({ login: 'signed-in' })
    const withdraw = await t.provide(CHAT)
    await withdraw()
    expect(document.querySelectorAll('section[data-page]')).toHaveLength(0)
    expect(current()).toBeUndefined()
  })

  it('navigate 把一页切到前面；标识不在时什么都不做', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(CHAT)
    await t.provide(SETTINGS)
    act(() => t.service.navigate('settings'))
    expect(current()).toBe('设置')
    act(() => t.service.navigate('absent'))
    expect(current()).toBe('设置')
  })

  it('外壳的服务也是读位置的接口', async () => {
    const t = await setup({ login: 'signed-in' })
    await t.provide(CHAT)
    expect(t.service.items('pages').map(page => page.id)).toEqual(['chat'])
    let changes = 0
    const stop = t.service.subscribe('pages', () => (changes += 1))
    await t.provide(SETTINGS)
    stop()
    expect(changes).toBe(1)
  })
})

describe('外壳：侧栏区与租户', () => {
  it('侧栏区的项按次序排在页面导航之后，收到当前租户', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [
        fakeSidebar({ id: 'b', order: 10, text: '账号占位' }),
        fakeSidebar({ id: 'a', order: 0, text: '列表占位' }),
      ],
    })
    const items = () =>
      [...document.querySelectorAll('.shell-sidebar-item')].map(item => item.textContent)
    expect(items()).toEqual(['列表占位', '账号占位'])
    act(() => t.state.scope.set('tenant-x'))
    expect(screen.getByText('列表占位').dataset['scope']).toBe('tenant-x')
  })

  it('登录状态离开「已登录」时外壳清空租户', async () => {
    const t = await setup({ login: 'signed-in' })
    t.state.scope.set('tenant-x')
    t.login.set('signed-in')
    expect(t.state.scope.get()).toBe('tenant-x')
    act(() => t.login.set('signing-out'))
    expect(t.state.scope.get()).toBeUndefined()
  })

  it('明暗切换交给主题控制器', async () => {
    const t = await setup({ login: 'signed-in' })
    fireEvent.click(screen.getByRole('button', { name: '换成深色' }))
    expect(t.chosen).toEqual(['dark'])
    fireEvent.click(screen.getByRole('button', { name: '换成浅色' }))
    expect(t.chosen).toEqual(['dark', 'light'])
  })
})

describe('外壳：附着位置与页面标记', () => {
  const attachedItem = (id: string, anchor: string, order = 0) =>
    defineUiModule({
      name: `attached-${id}`,
      inject: [],
      apply(shell) {
        shell.contribute('attached', {
          id,
          order,
          anchor,
          render: ({ scope, subject }) => (
            <p data-attached={id} data-scope={scope ?? ''} data-subject={subject}>
              {`附着${id}`}
            </p>
          ),
        })
      },
    })
  const hostPage = (anchor: string, subject: string) =>
    defineUiModule({
      name: 'host-page',
      inject: [],
      apply(shell) {
        shell.contribute('pages', {
          id: 'host',
          title: '宿主',
          order: 0,
          render: (): ReactNode => shell.attached(anchor, subject),
        })
      },
    })
  const attachedIds = () =>
    [...document.querySelectorAll('[data-attached]')].map(node =>
      node.getAttribute('data-attached'),
    )

  it('名字相同的项按次序出现在宿主页里，收到给的对象与当前租户', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [
        attachedItem('late', 'a', 2),
        attachedItem('other', 'b'),
        attachedItem('early', 'a', 1),
        hostPage('a', 's1'),
      ],
    })
    act(() => t.state.scope.set('tenant-x'))
    expect(attachedIds()).toEqual(['early', 'late'])
    const first = document.querySelector<HTMLElement>('[data-attached="early"]')!
    expect(first.dataset['subject']).toBe('s1')
    expect(first.dataset['scope']).toBe('tenant-x')
    expect(document.querySelector('.shell-page > p')?.parentElement?.children).toHaveLength(2)
  })

  it('没有名字相同的项时什么都不渲染', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [attachedItem('x', 'b'), hostPage('a', 's1')],
    })
    act(() => t.state.scope.set('tenant-x'))
    expect(document.querySelector('.shell-page')?.childElementCount).toBe(0)
  })

  it('项撤下后消失，放进来后出现', async () => {
    const module = attachedItem('x', 'a')
    const t = await setup({ login: 'signed-in', modules: [hostPage('a', 's1')] })
    expect(attachedIds()).toEqual([])
    const fiber = t.root.plugin(module)
    await act(async () => {
      await fiber
    })
    expect(attachedIds()).toEqual(['x'])
    await act(async () => {
      await fiber.dispose()
    })
    expect(attachedIds()).toEqual([])
  })

  it('租户变了，已经渲染的项跟着重渲染', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [attachedItem('x', 'a'), hostPage('a', 's1')],
    })
    act(() => t.state.scope.set('t1'))
    expect(document.querySelector<HTMLElement>('[data-attached="x"]')?.dataset['scope']).toBe('t1')
    act(() => t.state.scope.set('t2'))
    expect(document.querySelector<HTMLElement>('[data-attached="x"]')?.dataset['scope']).toBe('t2')
  })

  it('宿主不重渲染时，服务给出的元素自己也跟着租户的变化', async () => {
    const t = await setup({ login: 'signed-in', modules: [attachedItem('x', 'a')] })
    const view = render(<>{t.service.attached('a', 's1')}</>)
    const scopeOf = () =>
      view.container.querySelector<HTMLElement>('[data-attached="x"]')?.dataset['scope']
    expect(scopeOf()).toBe('')
    act(() => t.state.scope.set('t3'))
    expect(scopeOf()).toBe('t3')
  })

  it('页面项的标记出现在导航里标题之后，收到租户；标记为空时那个元素是空的', async () => {
    let text: string | null = '还有 2 张'
    const module = defineUiModule({
      name: 'badged',
      inject: [],
      apply(shell) {
        shell.contribute('pages', {
          id: 'badged',
          title: '待办',
          order: 0,
          badge: ({ scope }) => (text === null ? null : `${text}${scope ?? ''}`),
          render: () => null,
        })
        shell.contribute('pages', { id: 'plain', title: '无标记', order: 1, render: () => null })
      },
    })
    const t = await setup({ login: 'signed-in', modules: [module] })
    act(() => t.state.scope.set('x'))
    const links = [...document.querySelectorAll('.shell-nav-link')]
    expect(links[0]!.querySelector('.shell-nav-badge')?.textContent).toBe('还有 2 张x')
    expect(links[0]!.lastElementChild?.className).toBe('shell-nav-badge')
    expect(links[1]!.querySelector('.shell-nav-badge')).toBeNull()
    text = null
    act(() => t.state.scope.set('y'))
    const empty = document.querySelector('.shell-nav-badge')
    expect(empty).not.toBeNull()
    expect(empty?.textContent).toBe('')
  })
})

describe('外壳：地标', () => {
  it.each(['signed-out', 'signing-out', 'signed-in'] as const)(
    '%s 时主区地标恰好一个，登录之后侧栏是补充区并带页面导航',
    async login => {
      const t = await setup({ login })
      await t.provide(CHAT)
      await t.provide(SETTINGS)
      expect(screen.getAllByRole('main')).toHaveLength(1)
      if (login !== 'signed-in') return
      expect(
        screen
          .getByRole('complementary')
          .contains(screen.getByRole('navigation', { name: '页面' })),
      ).toBe(true)
    },
  )
})

describe('外壳：读位置的快照', () => {
  it('放进一项之后渲染次数有界，没有变化时不再渲染', async () => {
    let renders = 0
    const counted = defineUiModule({
      name: 'counted',
      inject: [CHAT],
      apply(shell) {
        shell.contribute('sidebar', {
          id: 'counted',
          order: 0,
          render: () => {
            renders += 1
            return '计数占位'
          },
        })
      },
    })
    const t = await setup({ login: 'signed-in', modules: [counted] })
    await t.provide(CHAT)
    expect(screen.getByText('计数占位')).toBeTruthy()
    expect(renders).toBeGreaterThan(0)
    expect(renders).toBeLessThanOrEqual(4)
    const settled = renders
    await act(async () => {
      await settle()
    })
    expect(renders).toBe(settled)
  })
})

describe('外壳：去掉界面模块', () => {
  it('装配里只留一个假界面模块，外壳照常运行', async () => {
    const t = await setup({ login: 'signed-out', modules: [chatPage] })
    expect(screen.getByText(NO_LOGIN_TEXT)).toBeTruthy()
    act(() => t.login.set('signed-in'))
    await t.provide(CHAT)
    expect(navTitles()).toEqual(['对话'])
    expect(screen.getByText('对话占位')).toBeTruthy()
  })
})
