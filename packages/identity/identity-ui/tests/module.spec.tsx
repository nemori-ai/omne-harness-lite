// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import {
  type AttachedLayout,
  type ScopeSource,
  type ShellLogin,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { startShellOf } from '@omne-harness/shell-contract/testing'
import { ACCOUNT_ID, GATE_ID, IDENTITY_CLIENT, identityUiModule } from '../src/module.tsx'
import { TENANT_TEXT, deferred, loginSource, settle, tenantId } from './support.ts'

afterEach(() => cleanup())

/** The account's glyph, `contact` of the shared kit's icon set. */
const GLYPH = 'svg[data-icon="contact"]'

/** What a control's hint says: the tooltip that opens when the control takes the keyboard's focus. */
async function hint(control: HTMLElement): Promise<string | null> {
  fireEvent.keyDown(window, { key: 'Tab' })
  await act(async () => {
    control.focus()
  })
  const tooltip = (await screen.findByRole('tooltip')).textContent
  await act(async () => {
    control.blur()
  })
  return tooltip
}

/** Opens a menu as a pointer press does, and returns it. */
async function openMenu(trigger: HTMLElement): Promise<HTMLElement> {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  return screen.findByRole('menu')
}

type Calls = { logins: unknown[]; logouts: number; scopes: (string | undefined)[] }

class TestShell extends ShellService {
  readonly login: ShellLogin
  readonly scope: ScopeSource
  constructor(ctx: Context, config: { login: ShellLogin; scope: ScopeSource }) {
    super(ctx)
    this.login = config.login
    this.scope = config.scope
  }
  navigate(): void {}
  attached(anchor: string, subject: string): ReactNode {
    return this.items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => item.render({ scope: this.scope.get(), subject }))
  }
  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return layout(
      this.items('attached')
        .filter(item => item.anchor === anchor)
        .map(item => ({
          id: item.id,
          label: item.label,
          node: item.render({ scope: this.scope.get(), subject }),
        })),
    )
  }
}

async function setup() {
  const calls: Calls = { logins: [], logouts: 0, scopes: [] }
  const state = loginSource('signed-in')
  const login: ShellLogin = {
    state: state.state,
    subscribe: state.subscribe,
    login: async credentials => {
      calls.logins.push(credentials)
      return 'signed-in'
    },
    logout: async () => {
      calls.logouts += 1
      return 'signed-out'
    },
  }
  const scope: ScopeSource = {
    get: () => calls.scopes.at(-1),
    set: value => void calls.scopes.push(value),
    subscribe: () => () => undefined,
  }
  const { root, shell } = await startShellOf(TestShell, { login, scope })
  await root.plugin(identityUiModule)
  const client = {
    'query-current-tenant': async () => ({ outcome: 'succeeded', body: { tenantId: tenantId() } }),
    'register-and-activate': async () => ({ outcome: 'succeeded', body: {} }),
  }
  return { root, shell, calls, client }
}

describe('身份的界面模块', () => {
  it('身份协议的客户端出现时往登录门与侧栏区各放一项，消失时一起撤掉', async () => {
    const t = await setup()
    expect(t.shell.items('gate')).toEqual([])
    const withdraw = t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    expect(t.shell.items('gate').map(item => item.id)).toEqual([GATE_ID])
    expect(t.shell.items('sidebar').map(item => [item.id, item.order])).toEqual([
      [ACCOUNT_ID, 1000],
    ])
    expect(t.shell.items('pages')).toEqual([])
    withdraw()
    await settle()
    expect(t.shell.items('gate')).toEqual([])
    expect(t.shell.items('sidebar')).toEqual([])
  })

  it('服务名照客户端装配的取法', () => {
    expect(IDENTITY_CLIENT).toBe('protocol:identity/v1')
  })

  it('登录门经外壳的登录交出凭据', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    render(<>{t.shell.items('gate')[0]!.render({})}</>)
    const field = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement
    fireEvent.change(field('loginIdentifier'), { target: { value: 'alice' } })
    fireEvent.change(field('credential'), { target: { value: 'pw' } })
    await act(async () => {
      fireEvent.submit(field('credential').closest('form')!)
    })
    expect(t.calls.logins).toEqual([{ loginIdentifier: 'alice', credential: 'pw' }])
  })

  it('账号块查到当前租户就设给外壳；控件是账号的字形加组织的短写，提示写租户的全文', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    await act(async () => {
      render(<>{t.shell.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    expect(t.calls.scopes).toEqual([TENANT_TEXT])
    const control = screen.getByRole('button', { name: TENANT_TEXT })
    expect(control.querySelector(GLYPH)).toBeTruthy()
    expect(control.textContent).toBe('org_0000…0000')
    expect(control.querySelector('[data-loading-indicator]')).toBeNull()
    expect(await hint(control)).toBe(TENANT_TEXT)
  })

  it('账号块按下是平样式的菜单，里面的「退出登录」经外壳退出；按控件本身不退出', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    await act(async () => {
      render(<>{t.shell.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    const control = screen.getByRole('button', { name: TENANT_TEXT })
    fireEvent.click(control)
    expect(t.calls.logouts).toBe(0)
    const menu = await openMenu(control)
    expect(menu.getAttribute('data-slot')).toBe('dropdown-menu-content')
    expect(menu.closest('.omne-ink-bubble')).toBeNull()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['退出登录'])
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: '退出登录' }))
    })
    expect(t.calls.logouts).toBe(1)
  })

  it('账号块查着时字形在，短写的位置上是活动标记，提示写正在读取；查到就换成短写', async () => {
    const t = await setup()
    const answer = deferred<unknown>()
    t.root.reflect.provide(IDENTITY_CLIENT, { 'query-current-tenant': () => answer.promise })
    await settle()
    await act(async () => {
      render(<>{t.shell.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    const control = screen.getByRole('button', { name: '正在读取当前租户……' })
    expect(control.querySelector(GLYPH)).toBeTruthy()
    expect(control.querySelector('[data-loading-indicator]')).toBeTruthy()
    expect(control.textContent).toBe('')
    expect(await hint(control)).toBe('正在读取当前租户……')
    await act(async () => {
      answer.resolve({ outcome: 'succeeded', body: { tenantId: tenantId() } })
      await settle()
    })
    expect(control.querySelector('[data-loading-indicator]')).toBeNull()
    expect(control.textContent).toBe('org_0000…0000')
  })

  it('账号块查不到时控件里只有字形，控件上面一行通知写原因带重试，菜单照样能退出；重试查到就显示', async () => {
    const t = await setup()
    let answers = 0
    t.root.reflect.provide(IDENTITY_CLIENT, {
      'query-current-tenant': async () =>
        (answers += 1) === 1
          ? { outcome: 'uncertain', body: {} }
          : { outcome: 'succeeded', body: { tenantId: tenantId() } },
    })
    await settle()
    await act(async () => {
      render(<>{t.shell.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    const reason = '没有收到可信的答复，读不到当前租户。'
    const notice = screen.getByText(reason).closest<HTMLElement>('[data-tone]')!
    expect(notice.dataset['tone']).toBe('neutral')
    const control = screen.getByRole('button', { name: reason })
    expect(control.querySelector(GLYPH)).toBeTruthy()
    expect(control.textContent).toBe('')
    expect(control.querySelector('[data-loading-indicator]')).toBeNull()
    expect(notice.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const menu = await openMenu(control)
    expect(within(menu).getByRole('menuitem', { name: '退出登录' })).toBeTruthy()
    fireEvent.keyDown(menu, { key: 'Escape' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重试' }))
    })
    expect(screen.queryByText(reason)).toBeNull()
    expect(screen.getByRole('button', { name: TENANT_TEXT }).textContent).toBe('org_0000…0000')
  })

  it('账号块在侧栏底部的 utility 段；窄条里是一个圆：只有字形，提示写租户的全文，按下是同一个菜单；只画窄条时照样设租户', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    const [item] = t.shell.items('sidebar')
    expect(item?.group).toBe('utility')
    expect(item?.rail).toBeTypeOf('function')
    await act(async () => {
      render(<>{item!.rail!({ scope: undefined })}</>)
    })
    expect(t.calls.scopes).toEqual([TENANT_TEXT])
    const circle = screen.getByRole('button', { name: TENANT_TEXT })
    expect(circle.classList.contains('identity-account-rail')).toBe(true)
    expect(circle.querySelector(GLYPH)).toBeTruthy()
    expect(circle.textContent).toBe('')
    expect(await hint(circle)).toBe(TENANT_TEXT)
    fireEvent.click(circle)
    expect(t.calls.logouts).toBe(0)
    const menu = await openMenu(circle)
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: '退出登录' }))
    })
    expect(t.calls.logouts).toBe(1)
  })
})
