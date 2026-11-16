// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import {
  createSlotStore,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type SlotName,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { ACCOUNT_ID, GATE_ID, IDENTITY_CLIENT, identityUiModule } from '../src/module.tsx'
import { TENANT_TEXT, loginSource, settle, tenantId } from './support.ts'

afterEach(() => cleanup())

type Calls = { logins: unknown[]; logouts: number; scopes: (string | undefined)[] }

class TestShell extends ShellService {
  readonly store = createSlotStore()
  readonly login: ShellLogin
  readonly scope: ScopeSource
  constructor(ctx: Context, config: { login: ShellLogin; scope: ScopeSource }) {
    super(ctx)
    this.login = config.login
    this.scope = config.scope
  }
  navigate(): void {}
  attached(anchor: string, subject: string): ReactNode {
    return this.store
      .items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => item.render({ scope: this.scope.get(), subject }))
  }
  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
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
  const root = new Context()
  await root.plugin(TestShell, { login, scope })
  const shell = root.get('shell') as unknown as TestShell
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
    expect(t.shell.store.items('gate')).toEqual([])
    const withdraw = t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    expect(t.shell.store.items('gate').map(item => item.id)).toEqual([GATE_ID])
    expect(t.shell.store.items('sidebar').map(item => [item.id, item.order])).toEqual([
      [ACCOUNT_ID, 1000],
    ])
    expect(t.shell.store.items('pages')).toEqual([])
    withdraw()
    await settle()
    expect(t.shell.store.items('gate')).toEqual([])
    expect(t.shell.store.items('sidebar')).toEqual([])
  })

  it('服务名照客户端装配的取法', () => {
    expect(IDENTITY_CLIENT).toBe('protocol:identity/v1')
  })

  it('登录门经外壳的登录交出凭据', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    render(<>{t.shell.store.items('gate')[0]!.render({})}</>)
    const field = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement
    fireEvent.change(field('loginIdentifier'), { target: { value: 'alice' } })
    fireEvent.change(field('credential'), { target: { value: 'pw' } })
    await act(async () => {
      fireEvent.submit(field('credential').closest('form')!)
    })
    expect(t.calls.logins).toEqual([{ loginIdentifier: 'alice', credential: 'pw' }])
  })

  it('账号块查到当前租户就设给外壳并显示，退出经外壳的退出', async () => {
    const t = await setup()
    t.root.reflect.provide(IDENTITY_CLIENT, t.client)
    await settle()
    await act(async () => {
      render(<>{t.shell.store.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    expect(t.calls.scopes).toEqual([TENANT_TEXT])
    expect(screen.getByText('租户 org_0000…0000').getAttribute('title')).toBe(TENANT_TEXT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    })
    expect(t.calls.logouts).toBe(1)
  })

  it('账号块查不到时显示原因与重试，重试查到就显示', async () => {
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
      render(<>{t.shell.store.items('sidebar')[0]!.render({ scope: undefined })}</>)
    })
    expect(screen.getByText('没有收到可信的答复，读不到当前租户。')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重试' }))
    })
    expect(screen.getByText('租户 org_0000…0000')).toBeTruthy()
  })
})
