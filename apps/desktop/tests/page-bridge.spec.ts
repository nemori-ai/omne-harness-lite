import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { createForwarding } from '../src/forwarding/app.ts'
import { createForwardingRules } from '../src/forwarding/rules.ts'
import { createStandalone, type Standalone } from '../src/standalone/server.ts'
import { actAsBrowser } from './support/browser-fetch.ts'
import { listenFetchable } from './support/listen.ts'
import { connectPageBridge, httpChannel, type PageBridge } from '../src/page/bridge.ts'
import type { ForwardingChannel } from '../src/shared/channel.ts'
import {
  missingAtForwarding,
  readForwardingProtocols,
  writeLoginStanding,
  writePageEvent,
} from '../src/shared/wire.ts'
import { serviceOf, startClientTree, type ClientTree } from '../src/page/tree.ts'
import {
  PROOF_SENTINEL,
  answered,
  fakeServer,
  gate,
  settle,
  value,
  type FakeServer,
} from './support/fake-server.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const standaloneOver = (server: FakeServer): Standalone =>
  createStandalone({
    forwarding: createForwarding({
      rules: createForwardingRules({
        connect: server.connect,
        contracts: [accessProtocol, identityProtocol, sessionProtocol],
      }),
    }),
  })

async function start() {
  const server = fakeServer()
  const { host, port } = await listenFetchable(() => standaloneOver(server))
  cleanups.push(() => host.close())
  cleanups.push(actAsBrowser())
  const channel = httpChannel(`http://127.0.0.1:${port}`)
  const bridge: PageBridge = await connectPageBridge(channel)
  cleanups.push(() => bridge.close())
  return { server, bridge }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise(r => setTimeout(r, 10))
  expect(check()).toBe(true)
}

describe('页面与转发层的协议清单怎样比', () => {
  it('同名而主版本不同，算转发层不认得', () => {
    expect(
      missingAtForwarding([{ name: 'session', major: 2 }], [{ name: 'session', major: 1 }]),
    ).toEqual([{ name: 'session', major: 2 }])
  })

  it('宿主清单里认不出是协议的一项略过，其余照读', () => {
    const state = JSON.parse(
      writeLoginStanding({ state: 'signed-out' }, [{ name: 'session', major: 1 }]),
    ) as {
      protocols: unknown[]
    }
    state.protocols.push(42, { name: 'identity' })
    expect(readForwardingProtocols(JSON.stringify(state))).toEqual([{ name: 'session', major: 1 }])
  })
})

describe('页面的桥对着真的宿主', () => {
  it('宿主经登录状态一并说出它转发的协议；页面拿自己的清单比，少了哪几样就是宿主旧了', async () => {
    const { bridge } = await start()
    expect(bridge.forwardingProtocols()).toEqual([
      { name: accessProtocol.name, major: accessProtocol.major },
      { name: 'identity', major: 1 },
      { name: 'session', major: 1 },
    ])
    expect(
      missingAtForwarding([identityProtocol, sessionProtocol], bridge.forwardingProtocols()),
    ).toEqual([])
    expect(
      missingAtForwarding(
        [sessionProtocol, { name: 'human-intervention', major: 1 }],
        bridge.forwardingProtocols(),
      ),
    ).toEqual([{ name: 'human-intervention', major: 1 }])
  })

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

describe('网页宿主的通道：一页的观察走同一条事件流', () => {
  async function opened() {
    const server = fakeServer()
    let aborted = 0
    server.stream('session/v1 observe-session', async function* (request) {
      yield value({ kind: 'state' })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      aborted += 1
      return { kind: 'aborted' }
    })
    const { host, port } = await listenFetchable(() => standaloneOver(server))
    const opens: string[] = []
    cleanups.push(actAsBrowser(path => opens.push(path)))
    const bridge = await connectPageBridge(httpChannel(`http://127.0.0.1:${port}`))
    cleanups.push(() => bridge.close())
    const observe = (signal: AbortSignal) =>
      bridge.transport.observe({
        protocol: { name: 'session', major: 1 },
        observation: 'observe-session',
        messageId: 'm',
        open: value({}),
        signal,
      })
    return { host, opens, observe, aborted: () => aborted }
  }

  it('八条观察只开一条事件流，各自收到自己的帧；停一条，宿主那一头只停它', async () => {
    const { host, opens, observe, aborted } = await opened()
    cleanups.push(() => host.close())
    const controllers = Array.from({ length: 8 }, () => new AbortController())
    const streams = controllers.map(controller => observe(controller.signal))
    for (const frames of streams)
      expect(await frames.next()).toEqual({ done: false, value: value({ kind: 'state' }) })
    expect(opens.filter(path => path === '/bridge/events')).toHaveLength(1)
    controllers[3]!.abort()
    expect(await streams[3]!.next()).toEqual({ done: true, value: { kind: 'aborted' } })
    await until(() => aborted() === 1)
  })

  it('事件流断了：上面的观察都答不确定；下一条观察重新开一条', async () => {
    const { host, opens, observe } = await opened()
    const first = observe(new AbortController().signal)
    expect((await first.next()).done).toBe(false)
    await host.close()
    expect(await first.next()).toEqual({ done: true, value: { kind: 'uncertain' } })
    expect(opens.filter(path => path === '/bridge/events')).toHaveLength(1)
    const second = observe(new AbortController().signal)
    expect(await second.next()).toEqual({ done: true, value: { kind: 'uncertain' } })
    expect(opens.filter(path => path === '/bridge/events')).toHaveLength(2)
  })
})

/** A web host the test scripts: it can refuse the event stream, hold an attach, and write any event. */
function scriptedHost() {
  const seen: string[] = []
  const streams: ServerResponse[] = []
  const attached: string[] = []
  let refuseEvents = 0
  let attachStatus = 200
  let held: Promise<void> = Promise.resolve()
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://host').pathname
      let body = ''
      for await (const chunk of request as AsyncIterable<Buffer>) body += chunk.toString('utf8')
      seen.push(`${request.method} ${path}`)
      if (path === '/bridge/events') {
        if (refuseEvents > 0) {
          refuseEvents -= 1
          return void response.writeHead(400).end('no')
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.flushHeaders()
        return void streams.push(response)
      }
      if (path === '/bridge/observe') {
        attached.push(String((JSON.parse(body) as { id: string }).id))
        await held
        return void response.writeHead(attachStatus).end('{}')
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })()
  })
  const host: Standalone = {
    listen: port =>
      new Promise(resolve =>
        server.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
      ),
    close: () =>
      new Promise(resolve => {
        for (const stream of streams) stream.destroy()
        server.close(() => resolve())
      }),
  }
  return {
    host,
    seen,
    attached,
    refuseEvents: (count: number) => void (refuseEvents = count),
    answerAttach: (status: number) => void (attachStatus = status),
    holdAttach: () => {
      let release = () => {}
      held = new Promise(resolve => (release = resolve))
      return release
    },
    write: (data: string) => void streams.at(-1)?.write(`data: ${data}\n\n`),
    drop: () => void streams.at(-1)?.end(),
  }
}

describe('网页宿主的通道：页面这一头怎样读事件流', () => {
  const REQUEST = '{"observe":"anything"}'

  async function channelOver() {
    const fake = scriptedHost()
    const { host, port } = await listenFetchable(() => fake.host)
    cleanups.push(() => host.close())
    let next = 0
    const channel = httpChannel(`http://127.0.0.1:${port}`, () => `id-${next++}`)
    const unobserved = () => fake.seen.filter(line => line === 'POST /bridge/unobserve').length
    return { fake, channel, unobserved }
  }

  const settle = () => new Promise(resolve => setTimeout(resolve, 50))

  it('通道：事件流断了之后再开成功，叫一次重连；第一次开不算', async () => {
    const { fake, channel } = await channelOver()
    let reconnects = 0
    channel.onReconnect?.(() => (reconnects += 1))
    await channel.observe(REQUEST, new AbortController().signal)
    expect(reconnects).toBe(0)
    fake.drop()
    await new Promise(resolve => setTimeout(resolve, 50))
    await channel.observe(REQUEST, new AbortController().signal)
    expect(reconnects).toBe(1)
  })

  it('宿主拒了事件流：这条观察不发出；下一条观察重新开流', async () => {
    const { fake, channel } = await channelOver()
    fake.refuseEvents(1)
    await expect(channel.observe(REQUEST, new AbortController().signal)).rejects.toThrow()
    expect(fake.attached).toEqual([])
    expect('stream' in (await channel.observe(REQUEST, new AbortController().signal))).toBe(true)
    expect(fake.seen.filter(line => line === 'GET /bridge/events')).toHaveLength(2)
    expect(fake.attached).toEqual(['id-2'])
  })

  it('读不出的事件与别的观察的事件略过；自己结束的观察不再叫宿主停；事件流不走缓存', async () => {
    const { fake, channel, unobserved } = await channelOver()
    const caches: (RequestCache | undefined)[] = []
    const fetching = globalThis.fetch
    globalThis.fetch = (input, init) => {
      if (new URL(String(input)).pathname === '/bridge/events') caches.push(init?.cache)
      return fetching(input, init)
    }
    cleanups.push(() => {
      globalThis.fetch = fetching
    })
    const opening = await channel.observe(REQUEST, new AbortController().signal)
    if (!('stream' in opening)) throw new Error('refused')
    fake.write('not json')
    fake.write(writePageEvent('someone-else', { frame: value({ n: 0 }) }))
    fake.write(writePageEvent('id-1', { frame: value({ n: 1 }) }))
    fake.write(writePageEvent('id-1', { end: { kind: 'ended', reason: 'refresh-exhausted' } }))
    expect(await opening.stream.next()).toEqual({
      done: false,
      value: '{"kind":"frame","frame":{"n":1}}',
    })
    expect((await opening.stream.next()).value).toContain('"end"')
    await opening.stream.return?.()
    await settle()
    expect(unobserved()).toBe(0)
    expect(caches).toEqual(['no-store'])
  })

  it('宿主答 409：观察算没发出，不再叫宿主停', async () => {
    const { fake, channel, unobserved } = await channelOver()
    fake.answerAttach(409)
    expect(await channel.observe(REQUEST, new AbortController().signal)).toEqual({ refused: true })
    await settle()
    expect(unobserved()).toBe(0)
  })

  it('宿主答 5xx：观察可能已经发出，不当作被拒', async () => {
    const { fake, channel } = await channelOver()
    fake.answerAttach(500)
    await expect(channel.observe(REQUEST, new AbortController().signal)).rejects.toThrow()
  })

  it('事件流断在一次挂接的途中：这条观察已经结束，不再叫宿主停', async () => {
    const { fake, channel, unobserved } = await channelOver()
    const release = fake.holdAttach()
    const opening = channel.observe(REQUEST, new AbortController().signal)
    await until(() => fake.attached.length === 1)
    fake.drop()
    await settle()
    release()
    const opened = await opening
    if (!('stream' in opened)) throw new Error('refused')
    expect(await opened.stream.next()).toEqual({ done: true, value: undefined })
    await settle()
    expect(unobserved()).toBe(0)
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

  async function over(overrides: Partial<ForwardingChannel>): Promise<PageBridge> {
    const channel: ForwardingChannel = {
      call: () => Promise.reject(new Error('unused')),
      observe: () => Promise.reject(new Error('unused')),
      login: () => Promise.reject(new Error('unused')),
      logout: () => Promise.reject(new Error('unused')),
      loginStanding: () => Promise.resolve({ text: JSON.stringify({ state: 'signed-out' }) }),
      ...overrides,
    }
    const bridge = await connectPageBridge(channel)
    cleanups.push(() => bridge.close())
    return bridge
  }

  const aborted = (): AbortSignal => AbortSignal.abort()

  it('宿主的登录状态里没有协议这一栏（比页面旧的宿主）：页面要用的全算宿主不认得', async () => {
    const bridge = await over({})
    expect(bridge.forwardingProtocols()).toBeNull()
    expect(missingAtForwarding([sessionProtocol], bridge.forwardingProtocols())).toEqual([
      sessionProtocol,
    ])
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

  const standing = (state: string, note?: string) => () =>
    Promise.resolve({ text: JSON.stringify(note === undefined ? { state } : { state, note }) })
  const CREDENTIALS = { loginIdentifier: 'a', credential: 'b' }

  it('登录状态归页面：登录中、已登录、退出中、未登录各经过一次', async () => {
    const bridge = await over({
      login: () => Promise.resolve({ text: '{"result":"signed-in"}' }),
      logout: () => Promise.resolve({ text: '{"result":"signed-out"}' }),
    })
    const states: string[] = []
    bridge.loginState.subscribe(state => states.push(state))
    expect(await bridge.login(CREDENTIALS)).toBe('signed-in')
    expect(await bridge.login(CREDENTIALS)).toBe('unavailable')
    expect(await bridge.logout()).toBe('signed-out')
    expect(await bridge.logout()).toBe('signed-out')
    expect(states).toEqual(['signing-in', 'signed-in', 'signing-out', 'signed-out'])
  })

  it('启动时转发层说已登录：页面直接是已登录', async () => {
    const bridge = await over({ loginStanding: standing('signed-in') })
    expect(bridge.loginState.state()).toBe('signed-in')
  })

  it('启动时问不到：不交出页面，按间隔重问，问到了才交出', async () => {
    let asked = 0
    let handed = false
    const pending = over({
      loginStanding: () => {
        asked += 1
        return asked < 3 ? Promise.reject(new Error('not ready')) : standing('signed-in')()
      },
    }).then(bridge => {
      handed = true
      return bridge
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(handed).toBe(false)
    expect((await pending).loginState.state()).toBe('signed-in')
    expect(asked).toBe(3)
  })

  it('认证失败：回未登录，不去问登录状态', async () => {
    let asked = 0
    const bridge = await over({
      login: () => Promise.resolve({ text: '{"result":"auth-failed"}' }),
      loginStanding: () => ((asked += 1), standing('signed-out')()),
    })
    expect(await bridge.login(CREDENTIALS)).toBe('auth-failed')
    expect(asked).toBe(1)
    expect(bridge.loginState.state()).toBe('signed-out')
  })

  it('登录的答复没有定论：问登录状态再定。cookie 已经签发时算登录成功', async () => {
    for (const login of [
      () => Promise.reject(new Error('the answer was lost')),
      () => Promise.resolve({ refused: true as const }),
      () => Promise.resolve({ text: '{"result":"unknown"}' }),
      () => Promise.resolve({ text: '{"result":"unavailable"}' }),
    ]) {
      let signedIn = false
      const bridge = await over({
        login: () => ((signedIn = true), login()),
        loginStanding: () => standing(signedIn ? 'signed-in' : 'signed-out')(),
      })
      expect(await bridge.login(CREDENTIALS)).toBe('signed-in')
      expect(bridge.loginState.state()).toBe('signed-in')
    }
  })

  it('登录的答复没有定论而转发层说未登录：如实交出原来的结果', async () => {
    const bridge = await over({ login: () => Promise.resolve({ refused: true }) })
    expect(await bridge.login(CREDENTIALS)).toBe('unavailable')
    const broken = await over({ login: () => Promise.reject(new Error('x')) })
    expect(await broken.login(CREDENTIALS)).toBe('unknown')
    expect(broken.loginState.state()).toBe('signed-out')
  })

  it('退出：被拒、抛出、读不出都答未知，页面照样回未登录', async () => {
    for (const logout of [
      () => Promise.resolve({ refused: true as const }),
      () => Promise.reject(new Error('x')),
      () => Promise.resolve({ text: '{"result":"nonsense"}' }),
    ]) {
      const bridge = await over({ loginStanding: standing('signed-in'), logout })
      expect(await bridge.logout()).toBe('unknown')
      expect(bridge.loginState.state()).toBe('signed-out')
    }
  })

  it('一次调用答 denied：问一次登录状态。转发层说已失效，页面回未登录并叫出提示', async () => {
    let expired = false
    let asked = 0
    const bridge = await over({
      loginStanding: () => {
        asked += 1
        return expired ? standing('signed-out', 'expired')() : standing('signed-in')()
      },
      call: () => Promise.resolve({ text: JSON.stringify(answered('denied')) }),
    })
    const shown: string[] = []
    bridge.onExpired(() => shown.push('expired'))
    await bridge.transport.call(REQUEST)
    await until(() => asked === 2)
    expect(bridge.loginState.state()).toBe('signed-in')
    expect(shown).toEqual([])
    expired = true
    await bridge.transport.call(REQUEST)
    await until(() => bridge.loginState.state() === 'signed-out')
    expect(shown).toEqual(['expired'])
    // Signed out: a further `denied` asks nothing.
    await bridge.transport.call(REQUEST)
    await settle()
    expect(asked).toBe(3)
  })

  it('一条观察以 denied 结束：同样问一次', async () => {
    let asked = 0
    const bridge = await over({
      loginStanding: () => ((asked += 1), standing('signed-in')()),
      observe: () =>
        Promise.resolve({
          stream: (async function* () {
            yield JSON.stringify({ kind: 'end', end: { kind: 'ended', reason: 'denied' } })
          })(),
        }),
    })
    const frames = bridge.transport.observe({ ...OBSERVE, signal: new AbortController().signal })
    expect(await frames.next()).toEqual({ done: true, value: { kind: 'ended', reason: 'denied' } })
    await until(() => asked === 2)
  })

  it('事件流断了又连上：已登录时问一次登录状态', async () => {
    let asked = 0
    let reconnect: () => void = () => {}
    const bridge = await over({
      loginStanding: () => ((asked += 1), standing('signed-in')()),
      onReconnect: listener => {
        reconnect = listener
        return () => {}
      },
    })
    reconnect()
    await until(() => asked === 2)
    expect(bridge.loginState.state()).toBe('signed-in')
  })

  it('事件流断了又连上：未登录时不问', async () => {
    let asked = 0
    let reconnect: () => void = () => {}
    await over({
      loginStanding: () => ((asked += 1), standing('signed-out')()),
      onReconnect: listener => {
        reconnect = listener
        return () => {}
      },
    })
    reconnect()
    await settle()
    expect(asked).toBe(1)
  })

  it('问登录状态的答复晚于退出：迟到的「已登录」不把页面带回已登录', async () => {
    const late = gate<void>()
    let asked = 0
    const bridge = await over({
      loginStanding: async () => {
        asked += 1
        if (asked === 2) await late.promise
        return standing('signed-in')()
      },
      call: () => Promise.resolve({ text: JSON.stringify(answered('denied')) }),
      logout: () => Promise.resolve({ text: '{"result":"signed-out"}' }),
    })
    await bridge.transport.call(REQUEST)
    await until(() => asked === 2)
    expect(await bridge.logout()).toBe('signed-out')
    late.open()
    await settle()
    expect(bridge.loginState.state()).toBe('signed-out')
  })
})
