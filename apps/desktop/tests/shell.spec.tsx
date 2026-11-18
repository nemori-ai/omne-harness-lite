// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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
import { assetsProtocol } from '@omne-harness/assets-protocol'
import {
  assetGovernanceKey,
  assetsCategoryPage,
  assetsUiModule,
} from '@omne-harness/assets-ui/cordis'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import type { ResolvedTheme, ThemeChoice } from '@omne-harness/ui-kit'
import type { Connectivity } from '../src/page/connectivity.ts'
import { ITEM_FAILED_TEXT } from '../src/page/shell/item.tsx'
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
const TENANT_TEXT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

async function setup(
  options: {
    login?: ShellLoginState
    modules?: readonly Plugin.Object[]
    logout?: LogoutResult
    connectivity?: Connectivity
    missingAtHost?: readonly string[]
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
  render(
    <Shell
      appName="omne"
      state={state}
      connectivity={connectivity}
      theme={theme}
      {...(options.missingAtHost === undefined ? {} : { missingAtHost: options.missingAtHost })}
    />,
  )
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

  it.each(['signed-out', 'signed-in'] as const)(
    '%s 时页面宿主少了页面要用的协议：主区上方写宿主的版本旧了、需要重启，列出少的那几样；不少时不写',
    async login => {
      await setup({ login, missingAtHost: ['human-intervention/v1'] })
      expect(screen.getByRole('alert').textContent).toBe(
        '页面宿主的版本旧了，需要重启。它不认得这个页面要用的：human-intervention/v1。',
      )
      cleanup()
      await setup({ login, missingAtHost: [] })
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

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

describe('外壳：宿主自己排版', () => {
  const labelled = (id: string, anchor: string, order: number, label?: string) =>
    defineUiModule({
      name: `arranged-${id}`,
      inject: [],
      apply(shell) {
        shell.contribute('attached', {
          id,
          order,
          anchor,
          ...(label === undefined ? {} : { label }),
          render: ({ scope, subject }) => (
            <p data-attached={id} data-scope={scope ?? ''} data-subject={subject}>
              {`附着${id}`}
            </p>
          ),
        })
      },
    })
  const tabsPage = (anchor: string, subject: string) =>
    defineUiModule({
      name: 'tabs-page',
      inject: [],
      apply(shell) {
        shell.contribute('pages', {
          id: 'host',
          title: '宿主',
          order: 0,
          render: (): ReactNode =>
            shell.arranged(anchor, subject, entries => (
              <ul data-tabs={entries.length}>
                {entries.map(entry => (
                  <li key={entry.id} data-tab={entry.id} data-label={entry.label ?? ''}>
                    {entry.node}
                  </li>
                ))}
              </ul>
            )),
        })
      },
    })
  const tabs = () =>
    [...document.querySelectorAll<HTMLElement>('[data-tab]')].map(
      node => `${node.dataset['tab']}:${node.dataset['label']}`,
    )

  it('排版函数收到每一项的标识、标签与渲染结果，次序与附着位置相同', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [
        labelled('late', 'a', 2, '晚'),
        labelled('other', 'b', 0),
        labelled('early', 'a', 1),
        tabsPage('a', 's1'),
      ],
    })
    act(() => t.state.scope.set('tenant-x'))
    expect(tabs()).toEqual(['early:', 'late:晚'])
    const late = document.querySelector<HTMLElement>('[data-tab="late"] [data-attached="late"]')!
    expect(late.dataset['subject']).toBe('s1')
    expect(late.dataset['scope']).toBe('tenant-x')
  })

  it('没有名字相同的项时排版函数收到空表', async () => {
    await setup({ login: 'signed-in', modules: [labelled('x', 'b', 0), tabsPage('a', 's1')] })
    expect(document.querySelector<HTMLElement>('[data-tabs]')?.dataset['tabs']).toBe('0')
    expect(tabs()).toEqual([])
  })

  it('宿主画出之后放进一项、撤下一项，排版跟着重画', async () => {
    const t = await setup({ login: 'signed-in', modules: [tabsPage('a', 's1')] })
    expect(tabs()).toEqual([])
    const fiber = t.root.plugin(labelled('x', 'a', 0, '甲'))
    await act(async () => {
      await fiber
    })
    expect(tabs()).toEqual(['x:甲'])
    await act(async () => {
      await fiber.dispose()
    })
    expect(tabs()).toEqual([])
  })

  it('贡献方依赖的服务不在时它不加载；服务出现，它的项出现；服务撤下，只有它的项没有了；服务回来，项回来，次序不变', async () => {
    const DEPENDED = 'fake:contributor-protocol'
    const dependent = defineUiModule({
      name: 'dependent-contributor',
      inject: [DEPENDED],
      apply(shell) {
        shell.contribute('attached', {
          id: 'dependent',
          order: 1,
          anchor: 'a',
          label: '依赖协议的',
          render: () => <p data-attached="dependent">依赖协议的一项</p>,
        })
      },
    })
    const t = await setup({
      login: 'signed-in',
      modules: [dependent, labelled('always', 'a', 2, '一直在'), tabsPage('a', 's1')],
    })
    expect(tabs()).toEqual(['always:一直在'])
    const withdraw = await t.provide(DEPENDED)
    expect(tabs()).toEqual(['dependent:依赖协议的', 'always:一直在'])
    await withdraw()
    expect(tabs()).toEqual(['always:一直在'])
    expect(document.querySelector('[data-attached="dependent"]')).toBeNull()
    await t.provide(DEPENDED)
    expect(tabs()).toEqual(['dependent:依赖协议的', 'always:一直在'])
  })

  it('三个插件按三种次序加载，排版出来逐字相同', async () => {
    const modules = [
      labelled('one', 'a', 1, '一'),
      labelled('two', 'a', 2, '二'),
      tabsPage('a', 's1'),
    ]
    const markups: string[] = []
    for (const order of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ]) {
      await setup({ login: 'signed-in', modules: order.map(index => modules[index]!) })
      markups.push(document.querySelector('[data-tabs]')?.outerHTML ?? '')
      cleanup()
    }
    expect(markups[0]).toContain('data-tab="one"')
    expect(new Set(markups).size).toBe(1)
  })

  it('租户变了，排版里的项跟着重渲染', async () => {
    const t = await setup({
      login: 'signed-in',
      modules: [labelled('x', 'a', 0), tabsPage('a', 's1')],
    })
    act(() => t.state.scope.set('t1'))
    expect(document.querySelector<HTMLElement>('[data-attached="x"]')?.dataset['scope']).toBe('t1')
    act(() => t.state.scope.set('t2'))
    expect(document.querySelector<HTMLElement>('[data-attached="x"]')?.dataset['scope']).toBe('t2')
  })
})

describe('外壳：一项坏了只坏这一项', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const boom = (): never => {
    throw new Error('boom')
  }
  function Boom(): ReactNode {
    return boom()
  }
  const failed = () => [...document.querySelectorAll('.shell-item-failed')]
  const attachedModule = (id: string, anchor: string, order: number, render: () => ReactNode) =>
    defineUiModule({
      name: `attached-${id}`,
      inject: [],
      apply(shell) {
        shell.contribute('attached', { id, order, anchor, render })
      },
    })
  const good = (id: string) => () => <p data-attached={id}>{`附着${id}`}</p>
  const attachedIds = () =>
    [...document.querySelectorAll('[data-attached]')].map(node =>
      node.getAttribute('data-attached'),
    )
  const pageModule = (id: string, order: number, render: () => ReactNode) =>
    defineUiModule({
      name: `page-${id}`,
      inject: [],
      apply(shell) {
        shell.contribute('pages', { id, title: `页${id}`, order, render })
      },
    })

  it('附着的一项的渲染函数抛出：只有它显示读不出，同一个位置里别的项与宿主的页照常', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        attachedModule('bad', 'a', 0, boom),
        attachedModule('good', 'a', 1, good('good')),
        pageModule('host', 0, () => null),
        defineUiModule({
          name: 'host-attached',
          inject: [],
          apply(shell) {
            shell.contribute('sidebar', {
              id: 'host',
              order: 0,
              render: () => shell.attached('a', 's1'),
            })
          },
        }),
      ],
    })
    expect(ITEM_FAILED_TEXT).toBe('这一块读不出')
    expect(failed().map(node => node.textContent)).toEqual(['这一块读不出'])
    expect(attachedIds()).toEqual(['good'])
    expect(navTitles()).toEqual(['页host'])
  })

  it('附着的一项返回的组件在渲染当中抛出：也只坏这一项', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        attachedModule('bad', 'a', 0, () => <Boom />),
        attachedModule('good', 'a', 1, good('good')),
        pageModule('host', 0, () => null),
        defineUiModule({
          name: 'host-attached',
          inject: [],
          apply(shell) {
            shell.contribute('sidebar', {
              id: 'host',
              order: 0,
              render: () => shell.attached('a', 's1'),
            })
          },
        }),
      ],
    })
    expect(failed()).toHaveLength(1)
    expect(attachedIds()).toEqual(['good'])
  })

  it('经排版函数拿到的一项抛出：宿主的排版照常，只有这一项的位置上显示读不出', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        attachedModule('bad', 'a', 0, boom),
        attachedModule('good', 'a', 1, good('good')),
        defineUiModule({
          name: 'host-arranged',
          inject: [],
          apply(shell) {
            shell.contribute('pages', {
              id: 'host',
              title: '宿主',
              order: 0,
              render: (): ReactNode =>
                shell.arranged('a', 's1', entries => (
                  <ul>
                    {entries.map(entry => (
                      <li key={entry.id} data-tab={entry.id}>
                        {entry.node}
                      </li>
                    ))}
                  </ul>
                )),
            })
          },
        }),
      ],
    })
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-tab]')].map(node => node.dataset['tab']),
    ).toEqual(['bad', 'good'])
    expect(document.querySelector('[data-tab="bad"] .shell-item-failed')).not.toBeNull()
    expect(document.querySelector('[data-tab="good"] [data-attached="good"]')).not.toBeNull()
    expect(failed()).toHaveLength(1)
  })

  it('一页抛出：只有这一页读不出，导航、别的页与侧栏区照常', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        pageModule('bad', 0, boom),
        pageModule('fine', 1, () => <p data-fine="">好的一页</p>),
        fakeSidebar({ id: 'side', order: 0, text: '侧栏占位' }),
      ],
    })
    expect(navTitles()).toEqual(['页bad', '页fine'])
    expect(section('bad')?.querySelector('.shell-item-failed')?.textContent).toBe(ITEM_FAILED_TEXT)
    expect(section('fine')?.querySelector('[data-fine]')).not.toBeNull()
    expect(document.querySelector('[data-placeholder="侧栏占位"]')).not.toBeNull()
    expect(failed()).toHaveLength(1)
  })

  it('资产页上一个类别的页面抛出：只有它那一页读不出，页签、别的类别的页面与设置页照常', async () => {
    const animate = Element.prototype.animate
    Object.assign(Element.prototype, {
      animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
    })
    onTestFinished(() => void Object.assign(Element.prototype, { animate }))
    const assets = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })
    const client = {
      'list-settings': async () => ({
        outcome: 'succeeded',
        body: { items: [], next: null, completeness: 'complete' },
      }),
    }
    const categoryPage = (id: string, order: number, render: () => ReactNode) =>
      defineUiModule({
        name: `category-${id}`,
        inject: [],
        apply(shell) {
          assetsCategoryPage.contribute(shell, { id, order, label: id, render })
        },
      })
    const t = await setup({
      login: 'signed-in',
      modules: [
        { name: 'fake-assets', apply: (ctx: Context) => void ctx.reflect.provide(assets, client) },
        assetsUiModule,
        categoryPage('bad', 0, boom),
        categoryPage('good', 1, () => <p data-category="good">好的类别</p>),
      ],
    })
    await act(async () => {
      t.state.scope.set(TENANT_TEXT)
      await settle()
    })
    expect(navTitles()).toEqual(['资产', '设置'])
    const page = section('assets')!
    expect([...page.querySelectorAll('[role=tab]')].map(tab => tab.textContent)).toEqual([
      'bad',
      'good',
    ])
    expect(failed().map(node => node.textContent)).toEqual([ITEM_FAILED_TEXT])
    expect(page.querySelector('[role=tabpanel]:not([hidden]) .shell-item-failed')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'good' }))
    expect(
      page.querySelector('[role=tabpanel]:not([hidden]) [data-category="good"]'),
    ).not.toBeNull()
    expect(failed()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    await act(async () => {
      await settle()
    })
    expect(section('settings')?.textContent).toContain('这一层还没有不属于资产的设置。')
  })

  it('侧栏区的一项抛出：只有它读不出，别的侧栏项与页面照常', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        defineUiModule({
          name: 'bad-side',
          inject: [],
          apply(shell) {
            shell.contribute('sidebar', { id: 'bad', order: 0, render: boom })
          },
        }),
        fakeSidebar({ id: 'side', order: 1, text: '侧栏占位' }),
        pageModule('fine', 0, () => <p data-fine="">好的一页</p>),
      ],
    })
    expect(
      document.querySelector('.shell-sidebar-item[data-item="bad"] .shell-item-failed'),
    ).not.toBeNull()
    expect(document.querySelector('[data-placeholder="侧栏占位"]')).not.toBeNull()
    expect(section('fine')?.querySelector('[data-fine]')).not.toBeNull()
    expect(failed()).toHaveLength(1)
  })

  it('登录门抛出：登录之外的页面还在，门的位置上显示读不出', async () => {
    await setup({
      modules: [
        defineUiModule({
          name: 'bad-gate',
          inject: [],
          apply(shell) {
            shell.contribute('gate', { id: 'bad.gate', render: boom })
          },
        }),
      ],
    })
    expect(document.querySelector('.shell-gate .shell-item-failed')?.textContent).toBe(
      ITEM_FAILED_TEXT,
    )
    expect(document.querySelector('.shell-brand-outside')?.textContent).toBe('omne')
  })

  it('页面的小标记抛出：标记不画，导航与页面照常', async () => {
    await setup({
      login: 'signed-in',
      modules: [
        defineUiModule({
          name: 'bad-badge',
          inject: [],
          apply(shell) {
            shell.contribute('pages', {
              id: 'badged',
              title: '待办',
              order: 0,
              badge: boom,
              render: () => <p data-fine="">好的一页</p>,
            })
          },
        }),
      ],
    })
    expect(navTitles()).toEqual(['待办'])
    expect(document.querySelector('.shell-nav-badge')?.textContent).toBe('')
    expect(section('badged')?.querySelector('[data-fine]')).not.toBeNull()
    expect(failed()).toHaveLength(0)
  })

  it('失败之后换了对象会重试一次；对象与租户都没变的重画不重试', async () => {
    let calls = 0
    const t = await setup({
      login: 'signed-in',
      modules: [
        defineUiModule({
          name: 'picky-real',
          inject: [],
          apply(shell) {
            shell.contribute('attached', {
              id: 'real',
              order: 1,
              anchor: 'a',
              render: ({ subject }) => {
                calls += 1
                if (subject === 's1') throw new Error('boom')
                return <p data-attached="real">{subject}</p>
              },
            })
          },
        }),
      ],
    })
    const view = render(<>{t.service.attached('a', 's1')}</>)
    expect(view.container.querySelectorAll('.shell-item-failed')).toHaveLength(1)
    const afterFailure = calls
    view.rerender(<>{t.service.attached('a', 's1')}</>)
    expect(calls).toBe(afterFailure)
    expect(view.container.querySelectorAll('.shell-item-failed')).toHaveLength(1)
    view.rerender(<>{t.service.attached('a', 's2')}</>)
    expect(view.container.querySelector('[data-attached="real"]')?.textContent).toBe('s2')
    expect(view.container.querySelectorAll('.shell-item-failed')).toHaveLength(0)
  })

  it('失败之后租户每换一次重试一次：从没有到有，从一个到另一个', async () => {
    const seen: (string | undefined)[] = []
    const t = await setup({
      login: 'signed-in',
      modules: [
        pageModule('host', 0, () => null),
        defineUiModule({
          name: 'tenant-picky',
          inject: [],
          apply(shell) {
            shell.contribute('sidebar', {
              id: 'picky',
              order: 0,
              render: ({ scope }) => {
                seen.push(scope)
                if (scope !== 't2') throw new Error('boom')
                return <p data-side={scope}>{scope}</p>
              },
            })
          },
        }),
      ],
    })
    expect(failed()).toHaveLength(1)
    expect(new Set(seen)).toEqual(new Set([undefined]))
    act(() => t.state.scope.set('t1'))
    expect(failed()).toHaveLength(1)
    expect(new Set(seen)).toEqual(new Set([undefined, 't1']))
    act(() => t.state.scope.set('t2'))
    expect(failed()).toHaveLength(0)
    expect(document.querySelector('[data-side="t2"]')).not.toBeNull()
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

describe('资产页：类别带来自己的页面（MCP）', () => {
  const ASSETS = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })
  const CONTEXT7 = { kind: 'asset', category: 'mcp', name: 'context7' }
  const declaration = (title: string) => ({
    title,
    purpose: `${title}的用途。`,
    appliesAt: '下一次连接起生效。',
    clearEffect: '这一层不再提供这个值。',
    group: { id: 'context7', title: 'context7', description: 'context7 的设置' },
  })
  const items = [
    {
      kind: 'permission',
      owner: CONTEXT7,
      item: 'call-actions',
      revision: '1',
      declaration: declaration('调用这个接入点的动作'),
      choices: [
        { value: 'deny', label: '禁止', description: '不允许调用。', permitsOperation: false },
        { value: 'ask', label: '询问', description: '每次调用先问人。', permitsOperation: true },
        { value: 'auto', label: '自动', description: '不需要人批准。', permitsOperation: true },
      ],
      default: 'ask',
      own: null,
      effective: { kind: 'value', value: 'ask', source: 'default' },
      bound: null,
      editable: { kind: 'yes' },
    },
    {
      kind: 'ordinary',
      owner: CONTEXT7,
      item: 'target',
      revision: '1',
      declaration: declaration('连接目标'),
      valueSchema: { kind: 'object', entries: [] },
      default: { kind: 'unset' },
      own: { kind: 'unset' },
      effective: { value: { kind: 'unset' }, source: null },
      lockedBy: null,
      editable: { kind: 'no', reason: 'locked' },
    },
  ]
  const fakeAssets: Plugin.Object = {
    name: 'fake-assets',
    apply: (ctx: Context) =>
      void ctx.reflect.provide(ASSETS, {
        'list-settings': async () => ({
          outcome: 'succeeded',
          body: { items, next: null, completeness: 'complete' },
        }),
      }),
  }
  const mcpUiModule = createMcpUiModule({
    page: assetsCategoryPage,
    governance: assetGovernanceKey,
  })

  beforeEach(() => {
    const animate = Element.prototype.animate
    Object.assign(Element.prototype, {
      animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
    })
    onTestFinished(() => void Object.assign(Element.prototype, { animate }))
  })

  async function opened(modules: readonly Plugin.Object[]) {
    const t = await setup({ login: 'signed-in', modules })
    await act(async () => {
      t.state.scope.set(TENANT_TEXT)
      await settle()
      await settle()
    })
    return t
  }

  const page = () => section('assets')!
  const tabTexts = () => [...page().querySelectorAll('[role=tab]')].map(tab => tab.textContent)
  const shownPanel = () => page().querySelector('[role=tabpanel]:not([hidden])')!

  it('MCP 的界面模块在：MCP 这一类画它自己的页面，不画通用的；权限它自己画，别的设置项用默认部件', async () => {
    await opened([fakeAssets, assetsUiModule, mcpUiModule])
    expect(tabTexts()).toEqual(['MCP'])
    const panel = shownPanel()
    expect(panel.querySelector('.mcp-page')).not.toBeNull()
    expect(panel.querySelector('.assets-category')).toBeNull()
    expect(
      screen
        .getByRole('group', { name: '调用这个接入点的动作' })
        .querySelector('[aria-pressed="true"]')?.textContent,
    ).toBe('询问')
    expect(
      [...panel.querySelectorAll('.assets-setting-title')].map(title => title.textContent),
    ).toEqual(['连接目标'])
  })

  it('MCP 的界面模块撤下：这一类回到通用的页面；它回来，又画它自己的', async () => {
    const t = await opened([fakeAssets, assetsUiModule])
    expect(tabTexts()).toEqual(['mcp'])
    expect(shownPanel().querySelector('.assets-category')).not.toBeNull()
    const fiber = t.root.plugin(mcpUiModule)
    await act(async () => {
      await fiber
      await settle()
    })
    expect(tabTexts()).toEqual(['MCP'])
    expect(shownPanel().querySelector('.mcp-page')).not.toBeNull()
    await act(async () => {
      await fiber.dispose()
      await settle()
    })
    expect(tabTexts()).toEqual(['mcp'])
    expect(shownPanel().querySelector('.assets-category')).not.toBeNull()
    expect(page().querySelector('.mcp-page')).toBeNull()
  })

  it('资产协议、资产的界面模块、MCP 的界面模块按三种次序加载，资产页逐字相同', async () => {
    const modules = [fakeAssets, assetsUiModule, mcpUiModule]
    const markups: string[] = []
    for (const order of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ]) {
      await opened(order.map(index => modules[index]!))
      markups.push(page().outerHTML)
      cleanup()
    }
    expect(markups[0]).toContain('mcp-page')
    expect(new Set(markups).size).toBe(1)
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
