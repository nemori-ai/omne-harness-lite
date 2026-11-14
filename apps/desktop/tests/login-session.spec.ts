// The login session (SPEC.md「登录会话」). One case per reachable cell of the table, named
// 「事件 × 状态」; then the refusal of credential-carrying operations and of undeclared targets,
// and the probe.
import { describe, expect, it } from 'vitest'
import type { LoginState } from '@omne-harness/client-assembly/cordis'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import type { CallReport } from '@omne-harness/sdk/core'
import { loginStateCodec } from '@omne-harness/legal-identity'
import {
  memoryCredentialStore,
  openLoginSession,
  type LoginSession,
  type StoredLogin,
} from '../src/main-core/index.ts'
import {
  LOGIN_ID,
  PROOF_SENTINEL,
  TENANT_TEXT,
  answered,
  fakeServer,
  gate,
  issued,
  settle,
  value,
  type FakeServer,
} from './support/fake-server.ts'

const IDENTITY = { name: 'identity', major: 1 }
const SESSION = { name: 'session', major: 1 }
const CREDENTIALS = { loginIdentifier: 'alice', credential: 'correct horse' }

function savedLogin(): StoredLogin {
  const loginId = loginStateCodec.parse(LOGIN_ID)
  if (!loginId.ok) throw new Error('fixture')
  return { proof: PROOF_SENTINEL, tenant: TENANT_TEXT, loginId: loginId.value }
}

type Opened = {
  readonly session: LoginSession
  readonly server: FakeServer
  readonly states: LoginState[]
  readonly store: ReturnType<typeof memoryCredentialStore>
}

async function open(options: { signedIn?: boolean } = {}): Promise<Opened> {
  const server = fakeServer()
  const store = memoryCredentialStore(options.signedIn === true ? savedLogin() : undefined)
  const session = await openLoginSession({
    connect: server.connect,
    store,
    contracts: [identityProtocol, sessionProtocol],
  })
  const states: LoginState[] = []
  session.subscribe(state => states.push(state))
  return { session, server, states, store }
}

const call = (session: LoginSession, operation = 'read-history', protocol = SESSION) =>
  session.transport.call({ protocol, operation, messageId: 'm-1', body: value({}) })

const targets = (server: FakeServer) => server.seen.map(item => item.target)

/** A signed-in session whose revoke answer waits for the test. */
async function signingOut(revoke = gate<CallReport>()) {
  const t = await open({ signedIn: true })
  t.server.answer('identity/v1 revoke-login', () => revoke.promise)
  const logout = t.session.logout()
  await settle()
  return { ...t, revoke, logout }
}

describe('登录会话全化表', () => {
  it('应用启动 × 未登录：读到登录证明就进「已登录」', async () => {
    const t = await open({ signedIn: true })
    expect(t.session.state()).toBe('signed-in')
  })

  it('应用启动 × 未登录：读不到留在「未登录」', async () => {
    const t = await open()
    expect(t.session.state()).toBe('signed-out')
  })

  it('页面请求登录 × 未登录：进「登录中」，发出登录操作', async () => {
    const t = await open()
    const held = gate<CallReport>()
    t.server.answer('identity/v1 issue-login', () => held.promise)
    const login = t.session.login(CREDENTIALS)
    await settle()
    expect(t.session.state()).toBe('signing-in')
    expect(t.server.seen).toEqual([
      { target: 'identity/v1 issue-login', credentials: {}, body: CREDENTIALS },
    ])
    held.open(answered('uniform-auth-failure'))
    await login
  })

  it('页面请求登录 × 登录中：拒绝', async () => {
    const t = await open()
    const held = gate<CallReport>()
    t.server.answer('identity/v1 issue-login', () => held.promise)
    const first = t.session.login(CREDENTIALS)
    await settle()
    expect(await t.session.login(CREDENTIALS)).toBe('unavailable')
    expect(targets(t.server)).toEqual(['identity/v1 issue-login'])
    held.open(answered('uniform-auth-failure'))
    await first
  })

  it('页面请求登录 × 已登录：拒绝', async () => {
    const t = await open({ signedIn: true })
    expect(await t.session.login(CREDENTIALS)).toBe('unavailable')
    expect(t.session.state()).toBe('signed-in')
    expect(t.server.seen).toEqual([])
  })

  it('页面请求登录 × 退出中：拒绝', async () => {
    const t = await signingOut()
    expect(await t.session.login(CREDENTIALS)).toBe('unavailable')
    expect(t.session.state()).toBe('signing-out')
    t.revoke.open(answered('succeeded'))
    await t.logout
  })

  it('登录的答复是成功 × 登录中：保存登录证明，进「已登录」，只告诉页面「登录成功」', async () => {
    const t = await open()
    const result = await t.session.login(CREDENTIALS)
    expect(result).toBe('signed-in')
    expect(t.states).toEqual(['signing-in', 'signed-in'])
    expect(await t.store.read()).toEqual(savedLogin())
  })

  it('登录的答复是其他结果 × 登录中：回「未登录」，如实告诉页面', async () => {
    const t = await open()
    t.server.answer('identity/v1 issue-login', () => answered('uniform-auth-failure'))
    expect(await t.session.login(CREDENTIALS)).toBe('auth-failed')
    t.server.answer('identity/v1 issue-login', () => answered('basis-unavailable'))
    expect(await t.session.login(CREDENTIALS)).toBe('unavailable')
    t.server.answer('identity/v1 issue-login', () => ({ kind: 'not-sent' }))
    expect(await t.session.login(CREDENTIALS)).toBe('unavailable')
    expect(t.session.state()).toBe('signed-out')
    expect(await t.store.read()).toBeUndefined()
  })

  it('登录的结果未知 × 登录中：回「未登录」，告诉页面未知', async () => {
    const t = await open()
    t.server.answer('identity/v1 issue-login', () => ({ kind: 'uncertain' }))
    expect(await t.session.login(CREDENTIALS)).toBe('unknown')
    t.server.answer('identity/v1 issue-login', () => answered('unknown'))
    expect(await t.session.login(CREDENTIALS)).toBe('unknown')
    expect(t.states).toEqual(['signing-in', 'signed-out', 'signing-in', 'signed-out'])
  })

  it('登录的调用抛错 × 登录中：回「未登录」，错误原样抛出，下一次登录照常', async () => {
    const t = await open()
    t.server.answer('identity/v1 issue-login', () => {
      throw new Error('transport broke')
    })
    await expect(t.session.login(CREDENTIALS)).rejects.toThrow('transport broke')
    expect(t.states).toEqual(['signing-in', 'signed-out'])
    t.server.answer('identity/v1 issue-login', () => issued())
    expect(await t.session.login(CREDENTIALS)).toBe('signed-in')
  })

  it('页面请求退出 × 未登录：直接答「已经退出」', async () => {
    const t = await open()
    expect(await t.session.logout()).toBe('signed-out')
    expect(t.server.seen).toEqual([])
    expect(t.states).toEqual([])
  })

  it('页面请求退出 × 登录中：拒绝', async () => {
    const t = await open()
    const held = gate<CallReport>()
    t.server.answer('identity/v1 issue-login', () => held.promise)
    const login = t.session.login(CREDENTIALS)
    await settle()
    expect(await t.session.logout()).toBe('unknown')
    expect(t.session.state()).toBe('signing-in')
    held.open(answered('uniform-auth-failure'))
    await login
  })

  it('页面请求退出 × 已登录：进「退出中」，发出注销操作', async () => {
    const t = await signingOut()
    expect(t.session.state()).toBe('signing-out')
    expect(t.server.seen).toEqual([
      {
        target: 'identity/v1 revoke-login',
        credentials: { proof: PROOF_SENTINEL },
        body: { targetLoginId: LOGIN_ID },
      },
    ])
    t.revoke.open(answered('succeeded'))
    await t.logout
  })

  it('页面请求退出 × 退出中：拒绝', async () => {
    const t = await signingOut()
    expect(await t.session.logout()).toBe('unknown')
    expect(targets(t.server)).toEqual(['identity/v1 revoke-login'])
    t.revoke.open(answered('succeeded'))
    await t.logout
  })

  it('注销的答复是成功或无变化 × 退出中：删掉登录证明，进「未登录」', async () => {
    const t = await signingOut()
    t.revoke.open(answered('succeeded'))
    expect(await t.logout).toBe('signed-out')
    expect(t.session.state()).toBe('signed-out')
    expect(await t.store.read()).toBeUndefined()

    const u = await signingOut()
    u.revoke.open(answered('no-change', {}))
    expect(await u.logout).toBe('signed-out')
    expect(await u.store.read()).toBeUndefined()
  })

  it('注销的答复是其他结果或结果未知 × 退出中：仍然删掉本机的登录证明，进「未登录」，告诉页面不确定', async () => {
    const t = await signingOut()
    t.revoke.open({ kind: 'uncertain' })
    expect(await t.logout).toBe('unknown')
    expect(t.session.state()).toBe('signed-out')
    expect(await t.store.read()).toBeUndefined()

    const u = await signingOut()
    u.revoke.open(answered('denied'))
    expect(await u.logout).toBe('unknown')
    expect(u.session.state()).toBe('signed-out')
  })

  it('注销的调用抛错 × 退出中：仍然删掉本机的登录证明，进「未登录」，错误原样抛出', async () => {
    const t = await open({ signedIn: true })
    t.server.answer('identity/v1 revoke-login', () => {
      throw new Error('transport broke')
    })
    await expect(t.session.logout()).rejects.toThrow('transport broke')
    expect(t.session.state()).toBe('signed-out')
    expect(await t.store.read()).toBeUndefined()
  })

  it('身份协议明确答复登录已失效 × 未登录：不变', async () => {
    const t = await open({ signedIn: true })
    const probe = gate<CallReport>()
    t.server.answer('session/v1 read-history', () => answered('denied'))
    t.server.answer('identity/v1 query-current-tenant', () => probe.promise)
    await call(t.session)
    expect(await t.session.logout()).toBe('signed-out')
    const before = [...t.states]
    probe.open(answered('denied'))
    await settle()
    expect(t.session.state()).toBe('signed-out')
    expect(t.states).toEqual(before)
  })

  it('身份协议明确答复登录已失效 × 已登录：删掉登录证明，进「未登录」，通知页面', async () => {
    const t = await open({ signedIn: true })
    t.server.answer('session/v1 read-history', () => answered('denied'))
    t.server.answer('identity/v1 query-current-tenant', () => answered('denied'))
    await call(t.session)
    await settle()
    expect(t.session.state()).toBe('signed-out')
    expect(t.states).toEqual(['signed-out'])
    expect(await t.store.read()).toBeUndefined()
  })

  it('身份协议明确答复登录已失效 × 退出中：删掉登录证明，进「未登录」', async () => {
    const t = await open({ signedIn: true })
    const probe = gate<CallReport>()
    const revoke = gate<CallReport>()
    t.server.answer('session/v1 read-history', () => answered('denied'))
    t.server.answer('identity/v1 query-current-tenant', () => probe.promise)
    t.server.answer('identity/v1 revoke-login', () => revoke.promise)
    await call(t.session)
    const logout = t.session.logout()
    await settle()
    expect(t.session.state()).toBe('signing-out')
    probe.open(answered('denied'))
    await settle()
    expect(t.session.state()).toBe('signed-out')
    expect(await t.store.read()).toBeUndefined()
    revoke.open(answered('succeeded'))
    expect(await logout).toBe('signed-out')
    expect(t.states).toEqual(['signing-out', 'signed-out'])
  })

  it('页面请求一次普通调用 × 未登录：不带登录证明发出', async () => {
    const t = await open()
    await call(t.session)
    expect(t.server.seen).toEqual([
      { target: 'session/v1 read-history', credentials: {}, body: {} },
    ])
  })

  it('页面请求一次普通调用 × 登录中：不带登录证明发出', async () => {
    const t = await open()
    const held = gate<CallReport>()
    t.server.answer('identity/v1 issue-login', () => held.promise)
    const login = t.session.login(CREDENTIALS)
    await settle()
    await call(t.session)
    expect(t.server.seen[1]).toEqual({
      target: 'session/v1 read-history',
      credentials: {},
      body: {},
    })
    held.open(answered('uniform-auth-failure'))
    await login
  })

  it('页面请求一次普通调用 × 已登录：带上登录证明发出', async () => {
    const t = await open({ signedIn: true })
    expect(await call(t.session)).toEqual(answered('succeeded'))
    expect(t.server.seen).toEqual([
      { target: 'session/v1 read-history', credentials: { proof: PROOF_SENTINEL }, body: {} },
    ])
  })

  it('已登录时只带操作的身份要求要的：acting-tenant 带行事租户，none 什么都不带', async () => {
    const t = await open({ signedIn: true })
    await call(t.session, 'create-session')
    await call(t.session, 'register-and-activate', IDENTITY)
    expect(t.server.seen.map(item => item.credentials)).toEqual([
      { proof: PROOF_SENTINEL, tenant: TENANT_TEXT },
      {},
    ])
  })

  it('页面请求一次普通调用 × 退出中：拒绝', async () => {
    const t = await signingOut()
    expect(await call(t.session)).toEqual({ kind: 'not-sent' })
    const frames = t.session.transport.observe({
      protocol: SESSION,
      observation: 'observe-session',
      messageId: 'm-2',
      open: value({}),
      signal: new AbortController().signal,
    })
    expect(await frames.next()).toEqual({ done: true, value: { kind: 'not-sent' } })
    expect(targets(t.server)).toEqual(['identity/v1 revoke-login'])
    t.revoke.open(answered('succeeded'))
    await t.logout
  })
})

describe('页面的调用不转发带凭据的操作', () => {
  it('契约标了 carriesCredential 的操作答「没发出」，不经服务端', async () => {
    const t = await open()
    expect(await call(t.session, 'issue-login', IDENTITY)).toEqual({ kind: 'not-sent' })
    expect(t.server.seen).toEqual([])
    // An operation of the same contract without the mark goes out.
    await call(t.session, 'register-and-activate', IDENTITY)
    expect(targets(t.server)).toEqual(['identity/v1 register-and-activate'])
  })
})

describe('页面的调用只转发宿主认识的契约声明的目标', () => {
  it('宿主不认识的协议答「没发出」，不经服务端', async () => {
    const t = await open({ signedIn: true })
    expect(await call(t.session, 'read-history', { name: 'elsewhere', major: 1 })).toEqual({
      kind: 'not-sent',
    })
    expect(await call(t.session, 'read-history', { name: 'session', major: 2 })).toEqual({
      kind: 'not-sent',
    })
    expect(t.server.seen).toEqual([])
  })

  it('没有声明的操作答「没发出」：带路径的操作名到不了签发登录', async () => {
    const t = await open({ signedIn: true })
    const elsewhere = { name: 'elsewhere', major: 1 }
    t.server.answer('elsewhere/v1 ../../identity/v1/issue-login', () => issued())
    expect(await call(t.session, '../../identity/v1/issue-login', elsewhere)).toEqual({
      kind: 'not-sent',
    })
    expect(await call(t.session, '../v1/issue-login', IDENTITY)).toEqual({ kind: 'not-sent' })
    expect(await call(t.session, 'no-such-operation')).toEqual({ kind: 'not-sent' })
    expect(t.server.seen).toEqual([])
  })

  it('没有声明的观察答「没发出」', async () => {
    const t = await open({ signedIn: true })
    const frames = t.session.transport.observe({
      protocol: SESSION,
      observation: 'observe-elsewhere',
      messageId: 'm-3',
      open: value({}),
      signal: new AbortController().signal,
    })
    expect(await frames.next()).toEqual({ done: true, value: { kind: 'not-sent' } })
    expect(t.server.seen).toEqual([])
  })
})

describe('登录失效的探测', () => {
  it('带登录的调用答 denied 之后调一次 query-current-tenant', async () => {
    const t = await open({ signedIn: true })
    t.server.answer('session/v1 read-history', () => answered('denied'))
    await call(t.session)
    await settle()
    expect(t.server.seen[1]).toEqual({
      target: 'identity/v1 query-current-tenant',
      credentials: { proof: PROOF_SENTINEL },
      body: {},
    })
    // The probe answered `succeeded`: the login stays; the next denied probes again.
    expect(t.session.state()).toBe('signed-in')
    await call(t.session)
    await settle()
    expect(targets(t.server).filter(item => item.endsWith('query-current-tenant'))).toHaveLength(2)
  })

  it('探测也答 denied 就回到未登录', async () => {
    const t = await open({ signedIn: true })
    t.server.answer('session/v1 read-history', () => answered('denied'))
    t.server.answer('identity/v1 query-current-tenant', () => answered('denied'))
    await call(t.session)
    await settle()
    expect(t.session.state()).toBe('signed-out')
  })

  it('同一时刻至多一次探测在途', async () => {
    const t = await open({ signedIn: true })
    const probe = gate<CallReport>()
    t.server.answer('session/v1 read-history', () => answered('denied'))
    t.server.answer('identity/v1 query-current-tenant', () => probe.promise)
    await Promise.all([call(t.session), call(t.session), call(t.session)])
    await settle()
    expect(targets(t.server).filter(item => item.endsWith('query-current-tenant'))).toHaveLength(1)
    probe.open(answered('succeeded', { tenantId: TENANT_TEXT }))
    await settle()
    await call(t.session)
    await settle()
    expect(targets(t.server).filter(item => item.endsWith('query-current-tenant'))).toHaveLength(2)
  })

  it('带登录的观察以 denied 被拒之后探测，被别的原因结束不探测', async () => {
    const t = await open({ signedIn: true })
    t.server.stream('session/v1 observe-session', async function* () {
      yield* []
      return { kind: 'refused', outcome: 'denied' }
    })
    const observe = () =>
      t.session.transport
        .observe({
          protocol: SESSION,
          observation: 'observe-session',
          messageId: 'm-3',
          open: value({}),
          signal: new AbortController().signal,
        })
        .next()
    await observe()
    await settle()
    expect(targets(t.server)).toEqual([
      'session/v1 observe-session',
      'identity/v1 query-current-tenant',
    ])
    t.server.stream('session/v1 observe-session', async function* () {
      yield* []
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    await observe()
    await settle()
    expect(targets(t.server).filter(item => item.endsWith('query-current-tenant'))).toHaveLength(1)
  })

  it('不带登录的调用答 denied 不探测', async () => {
    const t = await open()
    t.server.answer('session/v1 read-history', () => answered('denied'))
    await call(t.session)
    await settle()
    expect(targets(t.server)).toEqual(['session/v1 read-history'])
  })
})
