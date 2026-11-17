import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { memoryCredentialStore, openLoginSession } from '../src/main-core/index.ts'
import { createWebHost } from '../src/web-host/server.ts'
import { listenFetchable } from './support/listen.ts'
import {
  connectPageBridge,
  httpHostChannel,
  ipcHostChannel,
  type PageBridge,
} from '../src/page/bridge.ts'
import type { HostChannel } from '../src/shared/host-bridge.ts'
import { missingAtHost } from '../src/shared/wire.ts'
import { serviceOf, startClientTree, type ClientTree } from '../src/page/tree.ts'
import { omneHostOver } from './support/ipc.ts'
import { PROOF_SENTINEL, answered, fakeServer, settle, value } from './support/fake-server.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type Carrier = 'http' | 'ipc'

async function start(carrier: Carrier) {
  const server = fakeServer()
  const session = await openLoginSession({
    connect: server.connect,
    store: memoryCredentialStore(),
    contracts: [accessProtocol, identityProtocol, sessionProtocol],
  })
  let channel: HostChannel
  if (carrier === 'http') {
    const { host, port } = await listenFetchable(() => createWebHost({ session }))
    cleanups.push(() => host.close())
    channel = httpHostChannel(`http://127.0.0.1:${port}`)
  } else channel = ipcHostChannel(omneHostOver(session))
  const bridge: PageBridge = await connectPageBridge(channel)
  cleanups.push(() => bridge.close())
  return { server, bridge }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise(r => setTimeout(r, 10))
  expect(check()).toBe(true)
}

describe.each<Carrier>(['http', 'ipc'])('页面的桥对着真的宿主，经 %s 通道', carrier => {
  it('宿主经登录状态一并说出它转发的协议；页面拿自己的清单比，少了哪几样就是宿主旧了', async () => {
    const { bridge } = await start(carrier)
    expect(bridge.hostProtocols()).toEqual([
      { name: accessProtocol.name, major: accessProtocol.major },
      { name: 'identity', major: 1 },
      { name: 'session', major: 1 },
    ])
    expect(missingAtHost([identityProtocol, sessionProtocol], bridge.hostProtocols())).toEqual([])
    expect(
      missingAtHost(
        [sessionProtocol, { name: 'human-intervention', major: 1 }],
        bridge.hostProtocols(),
      ),
    ).toEqual([{ name: 'human-intervention', major: 1 }])
  })

  it('登录、调用、观察与登录状态都经桥走通，登录证明不进页面', async () => {
    const { server, bridge } = await start(carrier)
    expect(bridge.loginState.state()).toBe('signed-out')
    const states: string[] = []
    bridge.loginState.subscribe(state => states.push(state))

    expect(await bridge.login({ loginIdentifier: 'alice', credential: 'pw' })).toBe('signed-in')
    await until(() => bridge.loginState.state() === 'signed-in')
    expect(states).toEqual(['signing-in', 'signed-in'])

    const identity = createClient(identityProtocol, bridge.transport)
    const tenant = await identity['query-current-tenant']({})
    expect(tenant.outcome).toBe('succeeded')
    expect(server.seen.at(-1)?.credentials.proof).toBe(PROOF_SENTINEL)
    expect(await identity['issue-login']({ loginIdentifier: 'a', credential: 'b' })).toEqual({
      outcome: 'unavailable',
    })

    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'refreshing' })
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    const frames = bridge.transport.observe({
      protocol: { name: 'session', major: 1 },
      observation: 'observe-session',
      messageId: 'm-1',
      open: value({}),
      signal: new AbortController().signal,
    })
    expect(await frames.next()).toEqual({ done: false, value: value({ kind: 'refreshing' }) })
    expect(await frames.next()).toEqual({
      done: true,
      value: { kind: 'ended', reason: 'refresh-exhausted' },
    })

    expect(await bridge.logout()).toBe('signed-out')
    await until(() => bridge.loginState.state() === 'signed-out')
  })

  it('客户端的树经桥跟着可用性：协议开放时树上出现协议客户端', async () => {
    const { server, bridge } = await start(carrier)
    server.stream('access/v1 availability', async function* (request) {
      yield value({
        kind: 'snapshot',
        revision: 1,
        protocols: [
          { name: 'access', major: 1 },
          { name: 'identity', major: 1 },
        ],
      })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      return { kind: 'aborted' }
    })
    server.answer('identity/v1 query-current-tenant', () => answered('denied'))
    const tree: ClientTree = await startClientTree({
      transport: bridge.transport,
      login: bridge.loginState,
      protocols: [identityProtocol, sessionProtocol],
    })
    cleanups.push(() => tree.dispose())
    const services = new Map<string, unknown>()
    tree.watch(serviceOf(identityProtocol), item => services.set('identity', item))
    tree.watch(serviceOf(sessionProtocol), item => services.set('session', item))
    await until(() => services.get('identity') !== undefined)
    await settle()
    expect(services.get('session')).toBeUndefined()
  })
})

describe('桥的本地答法：不论哪种通道', () => {
  const REQUEST = {
    protocol: { name: 'session', major: 1 },
    operation: 'read-history',
    messageId: 'm',
    body: value({}),
  }
  const OBSERVE = {
    protocol: { name: 'session', major: 1 },
    observation: 'observe-session',
    messageId: 'm',
    open: value({}),
  }

  async function over(overrides: Partial<HostChannel>): Promise<PageBridge> {
    const channel: HostChannel = {
      call: () => Promise.reject(new Error('unused')),
      observe: () => Promise.reject(new Error('unused')),
      login: () => Promise.reject(new Error('unused')),
      logout: () => Promise.reject(new Error('unused')),
      async *loginState(signal) {
        yield JSON.stringify({ state: 'signed-out' })
        await new Promise(resolve => signal.addEventListener('abort', resolve))
      },
      ...overrides,
    }
    const bridge = await connectPageBridge(channel)
    cleanups.push(() => bridge.close())
    return bridge
  }

  const aborted = (): AbortSignal => AbortSignal.abort()

  it('宿主的登录状态里没有协议这一栏（比页面旧的宿主）：页面要用的全算宿主不认得', async () => {
    const bridge = await over({})
    expect(bridge.hostProtocols()).toBeNull()
    expect(missingAtHost([sessionProtocol], bridge.hostProtocols())).toEqual([sessionProtocol])
  })

  it('调用：没发出、不确定、已经取消', async () => {
    const refused = await over({ call: () => Promise.resolve({ refused: true }) })
    expect(await refused.transport.call(REQUEST)).toEqual({ kind: 'not-sent' })
    const thrown = await over({ call: () => Promise.reject(new Error('x')) })
    expect(await thrown.transport.call(REQUEST)).toEqual({ kind: 'uncertain' })
    const unread = await over({ call: () => Promise.resolve({ text: 'not json' }) })
    expect(await unread.transport.call(REQUEST)).toEqual({ kind: 'uncertain' })
    expect(await refused.transport.call({ ...REQUEST, signal: aborted() })).toEqual({
      kind: 'not-sent',
    })
  })

  it('观察：没发出、不确定、已取消、流断了', async () => {
    const run = async (bridge: PageBridge, signal = new AbortController().signal) => {
      const frames = bridge.transport.observe({ ...OBSERVE, signal })
      return (await frames.next()).value
    }
    const refused = await over({ observe: () => Promise.resolve({ refused: true }) })
    expect(await run(refused)).toEqual({ kind: 'not-sent' })
    const thrown = await over({ observe: () => Promise.reject(new Error('x')) })
    expect(await run(thrown)).toEqual({ kind: 'uncertain' })
    expect(await run(thrown, aborted())).toEqual({ kind: 'aborted' })
    const broken = await over({
      observe: () =>
        Promise.resolve({
          stream: (async function* () {})(),
        }),
    })
    expect(await run(broken)).toEqual({ kind: 'uncertain' })
    expect(await run(broken, aborted())).toEqual({ kind: 'aborted' })
  })

  it('登录：被拒答不可用，抛出或读不出答未知；退出被拒答未知', async () => {
    const refused = await over({
      login: () => Promise.resolve({ refused: true }),
      logout: () => Promise.resolve({ refused: true }),
    })
    expect(await refused.login({ loginIdentifier: 'a', credential: 'b' })).toBe('unavailable')
    expect(await refused.logout()).toBe('unknown')
    const broken = await over({
      login: () => Promise.reject(new Error('x')),
      logout: () => Promise.resolve({ text: '{"result":"nonsense"}' }),
    })
    expect(await broken.login({ loginIdentifier: 'a', credential: 'b' })).toBe('unknown')
    expect(await broken.logout()).toBe('unknown')
  })

  it('进程间的通道：取消观察时关掉宿主那一头，关掉的观察不再给事件', async () => {
    const closed: string[] = []
    let push: (event: string) => void = () => {}
    const channel = ipcHostChannel({
      call: () => Promise.reject(new Error('unused')),
      login: () => Promise.reject(new Error('unused')),
      logout: () => Promise.reject(new Error('unused')),
      loginState: () => Promise.resolve(undefined),
      observe: (_request, listener) => {
        push = listener
        return Promise.resolve({ close: () => closed.push('closed') })
      },
    })
    const controller = new AbortController()
    const opening = await channel.observe('{}', controller.signal)
    if ('refused' in opening) throw new Error('refused')
    push('one')
    expect(await opening.stream.next()).toEqual({ done: false, value: 'one' })
    const waiting = opening.stream.next()
    controller.abort()
    expect(await waiting).toEqual({ done: true, value: undefined })
    expect(closed).toEqual(['closed'])
    push('late')
    expect(await opening.stream.next()).toEqual({ done: true, value: undefined })
  })
})
