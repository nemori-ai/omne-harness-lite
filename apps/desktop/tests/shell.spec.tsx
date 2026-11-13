// @vitest-environment happy-dom
// The shell and the login screen through the assembly (SPEC.md「页面」), with a fake bridge and a
// fake tree: the login gate, the two fallbacks, the form that clears, plain failure text, the
// current tenant handed to the session workspace, and signing out.
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LoginState } from '@omne-harness/client-assembly/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { HostBridge, LoginCredentials, LoginResult } from '../src/shared/host-bridge.ts'
import { assemble } from '../src/page/assembly.tsx'
import { Shell } from '../src/page/shell/shell.tsx'
import type { Connectivity } from '../src/page/connectivity.ts'
import type { ClientTree } from '../src/page/tree.ts'
import { TENANT_TEXT } from './support/fake-server.ts'

afterEach(() => cleanup())

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

function fakeTree(initial: Record<string, unknown>) {
  const services = new Map(Object.entries(initial))
  const watchers = new Map<string, Set<(value: unknown) => void>>()
  const tree: ClientTree = {
    watch(name, listener) {
      const set = watchers.get(name) ?? new Set()
      watchers.set(name, set)
      set.add(listener)
      if (services.get(name) !== undefined) listener(services.get(name))
      return () => set.delete(listener)
    },
    dispose: async () => {},
  }
  return {
    tree,
    set(name: string, value: unknown) {
      services.set(name, value)
      for (const listener of watchers.get(name) ?? []) listener(value)
    },
  }
}

function setup(options: { login?: LoginState; withIdentity?: boolean; loginResult?: LoginResult }) {
  const login = source<LoginState>(options.login ?? 'signed-out')
  const connectivity = source<Connectivity>('connected')
  const handedOver: LoginCredentials[] = []
  let loggedOut = 0
  const bridge: HostBridge = {
    transport: {
      call: async () => ({ kind: 'not-sent' }),
      async *observe() {
        return { kind: 'not-sent' }
      },
    },
    loginState: { state: login.current, subscribe: login.subscribe },
    login: async credentials => {
      handedOver.push(credentials)
      return options.loginResult ?? 'signed-in'
    },
    logout: async () => {
      loggedOut += 1
      login.set('signed-out')
      return 'signed-out'
    },
  }
  const tenant = tenantCodec.parse(TENANT_TEXT)
  if (!tenant.ok) throw new Error('fixture')
  const identity = {
    'query-current-tenant': async () => ({
      outcome: 'succeeded',
      body: { tenantId: tenant.value },
    }),
    'register-and-activate': async () => ({ outcome: 'not-loginable', body: {} }),
  }
  const services: Record<string, unknown> = { 'protocol:session/v1': {} }
  if (options.withIdentity !== false) services['protocol:identity/v1'] = identity
  const tree = fakeTree(services)
  const regions = assemble(bridge)
  render(
    <Shell
      appName="omne"
      bridge={bridge}
      tree={tree.tree}
      connectivity={connectivity}
      gate={regions.gate}
      workspace={regions.workspace}
    />,
  )
  return { login, connectivity, handedOver, tree, loggedOut: () => loggedOut }
}

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement

async function fillAndSubmit(identifier: string, secret: string): Promise<void> {
  fireEvent.change(input('loginIdentifier'), { target: { value: identifier } })
  fireEvent.change(input('credential'), { target: { value: secret } })
  await act(async () => {
    fireEvent.submit(input('credential').closest('form')!)
  })
}

describe('外壳', () => {
  it('没登录只显示登录门', () => {
    setup({})
    expect(screen.getByRole('heading', { name: '登录' })).toBeTruthy()
    expect(screen.queryByText('退出登录')).toBeNull()
  })

  it('登录门要的协议没挂着时显示「这项能力暂时不可用」', () => {
    const t = setup({ withIdentity: false })
    expect(screen.getByText('这项能力暂时不可用')).toBeTruthy()
    act(() => t.tree.set('protocol:identity/v1', { 'query-current-tenant': async () => ({}) }))
    expect(screen.queryByText('这项能力暂时不可用')).toBeNull()
  })

  it('连不上服务时显示「连不上服务」', () => {
    const t = setup({})
    act(() => t.connectivity.set('disconnected'))
    expect(screen.getAllByText(/连不上服务/).length).toBeGreaterThan(0)
  })

  it('登录：交出凭据之后表单清空，凭据经桥交出', async () => {
    const t = setup({ loginResult: 'signed-in' })
    await fillAndSubmit('alice', 'secret-pw')
    expect(t.handedOver).toEqual([{ loginIdentifier: 'alice', credential: 'secret-pw' }])
    expect(input('loginIdentifier').value).toBe('')
    expect(input('credential').value).toBe('')
  })

  it('登录失败如实显示', async () => {
    setup({ loginResult: 'auth-failed' })
    await fillAndSubmit('alice', 'wrong')
    expect(screen.getByRole('alert').textContent).toBe('登录名或密码不对。')
  })

  it('注册失败如实显示，表单同样清空', async () => {
    setup({})
    fireEvent.click(screen.getByRole('tab', { name: '第一次使用' }))
    await fillAndSubmit('alice', 'pw')
    expect(screen.getByRole('alert').textContent).toContain('这个登录名不能注册')
    expect(input('credential').value).toBe('')
  })

  it('登录之后取当前租户交给会话界面，顶栏显示租户，可以退出登录', async () => {
    const t = setup({ login: 'signed-in' })
    await act(async () => {})
    const workspace = screen.getByTestId('session-workspace')
    expect(workspace.getAttribute('data-tenant')).toBe(TENANT_TEXT)
    expect(screen.getByText(/^租户 /)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('退出登录'))
    })
    expect(t.loggedOut()).toBe(1)
    expect(screen.getByRole('heading', { name: '登录' })).toBeTruthy()
  })
})
