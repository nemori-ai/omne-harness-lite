// The page's bridge against a real web host (in Node, with the same `fetch`), and the page's
// client tree on top of it: the client assembly's connection runs over the bridge.
import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { memoryCredentialStore, openLoginSession } from '../src/main-core/index.ts'
import { createWebHost } from '../src/web-host/server.ts'
import { listenFetchable } from './support/listen.ts'
import { connectPageBridge, type PageBridge } from '../src/page/bridge.ts'
import { serviceOf, startClientTree, type ClientTree } from '../src/page/tree.ts'
import { PROOF_SENTINEL, answered, fakeServer, settle, value } from './support/fake-server.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function start() {
  const server = fakeServer()
  const session = await openLoginSession({
    connect: server.connect,
    store: memoryCredentialStore(),
    contracts: [accessProtocol, identityProtocol, sessionProtocol],
  })
  const { host, port } = await listenFetchable(() => createWebHost({ session }))
  cleanups.push(() => host.close())
  const bridge: PageBridge = await connectPageBridge({ origin: `http://127.0.0.1:${port}` })
  cleanups.push(() => bridge.close())
  return { server, bridge }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise(r => setTimeout(r, 10))
  expect(check()).toBe(true)
}

describe('页面的桥对着真的宿主', () => {
  it('登录、调用、观察与登录状态都经桥走通，登录证明不进页面', async () => {
    const { server, bridge } = await start()
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
    // The credential-carrying operation is not forwarded: the page gets `unavailable`.
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
    const { server, bridge } = await start()
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
