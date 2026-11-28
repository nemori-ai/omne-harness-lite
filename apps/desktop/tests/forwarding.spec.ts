import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import {
  accessProtocol,
  defineProtocol,
  ruleCodec,
  type ProtocolContract,
} from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { STREAM_BACKLOG_BYTES, createForwarding, type Forwarding } from '../src/forwarding/app.ts'
import { LOGIN_COOKIE, readCookieLogin } from '../src/forwarding/login-cookie.ts'
import { createForwardingRules } from '../src/forwarding/rules.ts'
import { WIRE_LIMITS } from '../src/shared/wire.ts'
import {
  LOGIN_ID,
  PROOF_SENTINEL,
  TENANT_TEXT,
  answered,
  fakeServer,
  gate,
  settle,
  value,
  type FakeServer,
} from './support/fake-server.ts'

const ORIGIN = 'http://app.desktop'
const opened: Forwarding[] = []
afterEach(() => {
  for (const forwarding of opened.splice(0)) forwarding.close()
})

function forwardingOver(
  server: FakeServer,
  lines: string[] = [],
  more: readonly ProtocolContract[] = [],
): Forwarding {
  const forwarding = createForwarding({
    rules: createForwardingRules({
      connect: server.connect,
      contracts: [accessProtocol, identityProtocol, sessionProtocol, ...more],
    }),
    readPageFile: async segments =>
      segments.join('/') === 'index.html' ? new TextEncoder().encode('<p>page</p>') : undefined,
    log: line => lines.push(line),
  })
  opened.push(forwarding)
  return forwarding
}

/** A browser's part: keeps the cookie the answers set and sends it back. */
function browser(forwarding: Forwarding) {
  let cookie: string | undefined
  const seenByPage: string[] = []
  const setCookies: string[] = []
  async function send(request: Request): Promise<Response> {
    if (cookie !== undefined) request.headers.set('cookie', `${LOGIN_COOKIE}=${cookie}`)
    const response = await forwarding.fetch(request)
    for (const header of response.headers.getSetCookie()) {
      setCookies.push(header)
      const [pair, ...attributes] = header.split(';').map(part => part.trim())
      const value = pair!.slice(LOGIN_COOKIE.length + 1)
      const expired = attributes.some(part => /^max-age=0$/i.test(part))
      cookie = expired || value === '' ? undefined : value
    }
    return response
  }
  return {
    get cookie() {
      return cookie
    },
    set cookie(next: string | undefined) {
      cookie = next
    },
    setCookies,
    seenByPage,
    get: (path: string, signal?: AbortSignal) =>
      send(new Request(`${ORIGIN}${path}`, signal === undefined ? {} : { signal })),
    async post(path: string, body: unknown = {}, signal?: AbortSignal) {
      return send(
        new Request(`${ORIGIN}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: typeof body === 'string' ? body : JSON.stringify(body),
          ...(signal === undefined ? {} : { signal }),
        }),
      )
    },
    async json(path: string, body: unknown = {}): Promise<unknown> {
      const text = await (await this.post(path, body)).text()
      seenByPage.push(text)
      return JSON.parse(text)
    },
    login() {
      return this.json('/bridge/login', { loginIdentifier: 'alice', credential: 'pw' })
    },
  }
}

function start(more: readonly ProtocolContract[] = []) {
  const server = fakeServer()
  const lines: string[] = []
  const forwarding = forwardingOver(server, lines, more)
  return { server, lines, forwarding, page: browser(forwarding) }
}

const CALL = {
  protocol: { name: 'session', major: 1 },
  operation: 'read-history',
  messageId: 'm-1',
  body: { tenant: 't', session: 's' },
}
const OBSERVE = {
  protocol: { name: 'session', major: 1 },
  observation: 'observe-session',
  messageId: 'm-2',
  open: { session: 's' },
}
const AVAILABILITY = {
  protocol: { name: 'access', major: 1 },
  observation: 'availability',
  messageId: 'm-3',
  open: {},
}

/** Reads `data:` events off an event stream as they come. */
function reading(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  let taken = 0
  const parsed = (): { id: string; event: string }[] =>
    text
      .split('\n\n')
      .filter(chunk => chunk.startsWith('data: '))
      .map(chunk => JSON.parse(chunk.slice('data: '.length)))
  return {
    async next(count: number): Promise<{ id: string; event: unknown }[]> {
      while (parsed().length < taken + count) {
        const chunk = await reader.read()
        if (chunk.done) break
        text += chunk.value
      }
      const got = parsed().slice(taken, taken + count)
      taken += got.length
      return got.map(item => ({ id: item.id, event: JSON.parse(item.event) }))
    },
    cancel: () => reader.cancel(),
    text: () => text,
  }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise(r => setTimeout(r, 5))
  expect(check()).toBe(true)
}

type Page = ReturnType<typeof browser>
const attach = (page: Page, id: string, request: unknown = OBSERVE, pageId = 'p') =>
  page.post('/bridge/observe', { page: pageId, id, request: JSON.stringify(request) })

describe('登录 cookie', () => {
  it('登录成功：签发一枚页面读不到的 cookie，正文只有结果', async () => {
    const { page } = start()
    expect(await page.login()).toEqual({ result: 'signed-in' })
    expect(page.setCookies).toHaveLength(1)
    const header = page.setCookies[0]!
    expect(header).toMatch(/; HttpOnly/i)
    expect(header).toMatch(/; SameSite=Strict/i)
    expect(header).toMatch(/; Path=\/bridge\//i)
    expect(header).toMatch(/; Max-Age=31536000/i)
    expect(readCookieLogin(page.cookie!)).toMatchObject({
      proof: PROOF_SENTINEL,
      tenant: TENANT_TEXT,
    })
    expect(page.seenByPage.join('')).not.toContain(PROOF_SENTINEL)
  })

  it('登录失败与结果未知：不签发 cookie，结果如实交给页面', async () => {
    const { page, server } = start()
    server.answer('identity/v1 issue-login', () => answered('uniform-auth-failure'))
    expect(await page.login()).toEqual({ result: 'auth-failed' })
    server.answer('identity/v1 issue-login', () => answered('unknown'))
    expect(await page.login()).toEqual({ result: 'unknown' })
    server.answer('identity/v1 issue-login', () => {
      throw new Error('boom')
    })
    expect(await page.login()).toEqual({ result: 'unknown' })
    expect(page.setCookies).toEqual([])
  })

  it('已经带着 cookie 再登录：答不可用，不向服务端发登录', async () => {
    const { page, server } = start()
    await page.login()
    const before = server.seen.length
    expect(await page.login()).toEqual({ result: 'unavailable' })
    expect(server.seen).toHaveLength(before)
  })

  it('退出：成功、结果不确定、调用抛出，三种都清掉 cookie', async () => {
    for (const [answer, result] of [
      [() => answered('succeeded'), 'signed-out'],
      [() => answered('no-change'), 'signed-out'],
      [() => answered('unknown'), 'unknown'],
      [
        () => {
          throw new Error('boom')
        },
        'unknown',
      ],
    ] as const) {
      const { page, server } = start()
      await page.login()
      server.answer('identity/v1 revoke-login', answer)
      expect(await page.json('/bridge/logout')).toEqual({ result })
      expect(page.cookie).toBeUndefined()
      const revoke = server.seen.find(item => item.target === 'identity/v1 revoke-login')
      expect(revoke?.body).toEqual({ targetLoginId: LOGIN_ID })
    }
  })

  it('没有 cookie 时退出：直接答已经退出，不问服务端', async () => {
    const { page, server } = start()
    expect(await page.json('/bridge/logout')).toEqual({ result: 'signed-out' })
    expect(server.seen).toEqual([])
  })

  it('读不出的 cookie 当作没有，并在这次答复里清掉', async () => {
    for (const bad of ['not base64!', Buffer.from('{}').toString('base64url'), 'x'.repeat(5000)]) {
      const { page, server } = start()
      page.cookie = bad
      expect(await page.json('/bridge/login-standing')).toMatchObject({ state: 'signed-out' })
      expect(page.cookie).toBeUndefined()
      expect(server.seen).toEqual([])
    }
  })

  it('页面一侧的契约修订号随桥的消息到转发层，再随请求到服务端；没带的不带', async () => {
    const { page, server } = start()
    await page.login()
    await page.json('/bridge/call', { ...CALL, revision: 3 })
    await page.json('/bridge/call', CALL)
    const carried = server.seen.filter(item => item.target === 'session/v1 read-history')
    expect(carried.map(item => item.revision)).toEqual([3, undefined])
    expect((await page.post('/bridge/call', { ...CALL, revision: 0 })).status).toBe(400)
  })

  it('转发层不记登录：同一枚 cookie 交给另一个新建的转发层，答复相同', async () => {
    const { page, server } = start()
    await page.login()
    const other = browser(forwardingOver(server))
    other.cookie = page.cookie
    expect(await other.json('/bridge/login-standing')).toEqual(
      await page.json('/bridge/login-standing'),
    )
    expect(await other.json('/bridge/call', CALL)).toEqual(await page.json('/bridge/call', CALL))
    const carried = server.seen.filter(item => item.target === 'session/v1 read-history')
    expect(carried.map(item => item.credentials)).toEqual([
      { proof: PROOF_SENTINEL },
      { proof: PROOF_SENTINEL },
    ])
  })
})

describe('登录状态', () => {
  it('没有 cookie：未登录，并说出认识的协议', async () => {
    const { page } = start()
    expect(await page.json('/bridge/login-standing')).toEqual({
      state: 'signed-out',
      protocols: [
        { name: 'access', major: 1 },
        { name: 'identity', major: 1 },
        { name: 'session', major: 1 },
      ],
    })
  })

  it('服务端认：已登录；答 denied：清掉 cookie 并说已失效；别的结果：已登录但没有核实', async () => {
    const { page, server } = start()
    await page.login()
    expect(await page.json('/bridge/login-standing')).toMatchObject({ state: 'signed-in' })
    server.answer('identity/v1 query-current-tenant', () => answered('basis-unavailable'))
    expect(await page.json('/bridge/login-standing')).toMatchObject({
      state: 'signed-in',
      note: 'unverified',
    })
    expect(page.cookie).toBeDefined()
    server.answer('identity/v1 query-current-tenant', () => answered('denied'))
    expect(await page.json('/bridge/login-standing')).toMatchObject({
      state: 'signed-out',
      note: 'expired',
    })
    expect(page.cookie).toBeUndefined()
  })

  it('一次调用答 denied 不清 cookie', async () => {
    const { page, server } = start()
    await page.login()
    server.answer('session/v1 read-history', () => answered('denied'))
    expect(await page.json('/bridge/call', CALL)).toMatchObject({ outcome: 'denied' })
    expect(page.cookie).toBeDefined()
  })

  it('同一个证明并发地问：只查一次', async () => {
    const { page, server } = start()
    await page.login()
    const release = gate<void>()
    server.answer('identity/v1 query-current-tenant', async () => {
      await release.promise
      return answered('succeeded', { tenantId: TENANT_TEXT })
    })
    const both = [page.json('/bridge/login-standing'), page.json('/bridge/login-standing')]
    await settle()
    release.open()
    await Promise.all(both)
    expect(
      server.seen.filter(item => item.target === 'identity/v1 query-current-tenant'),
    ).toHaveLength(1)
  })
})

describe('转发规则', () => {
  it('没有 cookie：不带凭据发出；带着 cookie：按契约带登录证明', async () => {
    const { page, server } = start()
    await page.json('/bridge/call', CALL)
    await page.login()
    await page.json('/bridge/call', CALL)
    const sent = server.seen.filter(item => item.target === 'session/v1 read-history')
    expect(sent.map(item => item.credentials)).toEqual([{}, { proof: PROOF_SENTINEL }])
  })

  it('不认识的协议、没声明的名字、携带凭据的操作：答没发出，什么都不发', async () => {
    const { page, server } = start()
    await page.login()
    const before = server.seen.length
    for (const call of [
      { ...CALL, protocol: { name: 'nothing', major: 1 } },
      { ...CALL, protocol: { name: 'session', major: 2 } },
      { ...CALL, operation: 'no-such-operation' },
      {
        protocol: { name: 'identity', major: 1 },
        operation: 'issue-login',
        messageId: 'm-9',
        body: { loginIdentifier: 'alice', credential: 'pw' },
      },
    ])
      expect(await page.json('/bridge/call', call)).toEqual({ kind: 'not-sent' })
    const scoped = (item: { target: string }) => item.target === 'access/v1 scoped'
    expect(server.seen.slice(before).filter(item => !scoped(item))).toEqual([])
    expect(page.seenByPage.join('')).not.toContain(PROOF_SENTINEL)
  })
})

const empty = ruleCodec({ kind: 'object', fields: {} })
const probe = defineProtocol({
  name: 'probe',
  major: 1,
  operations: {
    open: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
    mine: {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
    secret: {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
      carriesCredential: true,
    },
  },
  observations: {},
})

const WEATHER = {
  name: 'weather',
  major: 1,
  operations: {
    look: {
      effect: 'read',
      limit: 'small',
      body: { kind: 'object', fields: {} },
      result: { kind: 'text' },
    },
  },
}
const call = (name: string, operation: string) => ({
  protocol: { name, major: 1 },
  operation,
  messageId: `m-${name}-${operation}`,
  body: {},
})
const tellsWeather = (server: FakeServer) =>
  server.answer('access/v1 scoped', () =>
    answered('succeeded', { protocols: [{ name: 'weather', major: 1, contract: WEATHER }] }),
  )

describe('清单之外的目标：这份登录的租户自己的协议（DT-64）', () => {
  it('目标六种乘有没有登录：只有服务端的答复里有、请求又带着登录时，才带登录证明与行事租户转发', async () => {
    const targets = {
      '在清单里，不要身份': call('probe', 'open'),
      '在清单里，要行事租户': call('probe', 'mine'),
      '在清单里，标了携带凭据': call('probe', 'secret'),
      '不在清单里，在答复里': call('weather', 'look'),
      '不在清单里，不在答复里': call('notes', 'look'),
      '不在清单里，读不出': call('weather', 'look'),
    }
    const outcomes: Record<string, unknown> = {}
    for (const signedIn of [false, true])
      for (const [row, request] of Object.entries(targets)) {
        const { page, server } = start([probe])
        if (row === '不在清单里，读不出')
          server.answer('access/v1 scoped', () => answered('basis-unavailable'))
        else tellsWeather(server)
        if (signedIn) await page.login()
        const report = (await page.json('/bridge/call', request)) as { kind: string }
        const target = `${request.protocol.name}/v1 ${request.operation}`
        const sent = server.seen.filter(item => item.target === target)
        outcomes[`${row}，${signedIn ? '带着登录' : '没带登录'}`] =
          report.kind === 'not-sent' ? '没发出' : sent.map(item => item.credentials)
      }
    const both = { proof: PROOF_SENTINEL, tenant: TENANT_TEXT }
    expect(outcomes).toEqual({
      '在清单里，不要身份，没带登录': [{}],
      '在清单里，要行事租户，没带登录': [{}],
      '在清单里，标了携带凭据，没带登录': '没发出',
      '不在清单里，在答复里，没带登录': '没发出',
      '不在清单里，不在答复里，没带登录': '没发出',
      '不在清单里，读不出，没带登录': '没发出',
      '在清单里，不要身份，带着登录': [{}],
      '在清单里，要行事租户，带着登录': [both],
      '在清单里，标了携带凭据，带着登录': '没发出',
      '不在清单里，在答复里，带着登录': [both],
      '不在清单里，不在答复里，带着登录': '没发出',
      '不在清单里，读不出，带着登录': '没发出',
    })
  })

  it('页面自称一份协议是它的不算数：正文与头里怎么说，服务端的答复里没有就不转发', async () => {
    const { page, server } = start()
    server.answer('access/v1 scoped', () => answered('succeeded', { protocols: [] }))
    await page.login()
    const claimed = {
      ...call('weather', 'look'),
      tenant: TENANT_TEXT,
      scoped: true,
      mine: ['weather'],
    }
    expect(await page.json('/bridge/call', claimed)).toEqual({ kind: 'not-sent' })
    const response = await page.post('/bridge/call', claimed)
    expect(await response.json()).toEqual({ kind: 'not-sent' })
    expect(server.seen.filter(item => item.target === 'weather/v1 look')).toEqual([])
  })

  it('清单之外的观察答没发出，带着登录也一样，也不去读答复', async () => {
    const { page, server } = start()
    tellsWeather(server)
    await page.login()
    const events = reading(await page.get('/bridge/events?page=p'))
    const watch = {
      protocol: { name: 'weather', major: 1 },
      observation: 'watch',
      messageId: 'w',
      open: {},
    }
    expect((await attach(page, 'o-1', watch)).status).toBe(200)
    expect(await events.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'end', end: { kind: 'not-sent' } } },
    ])
    expect(server.seen.filter(item => item.target !== 'identity/v1 issue-login')).toEqual([])
    await events.cancel()
  })

  it('答复按登录证明记着；没有命中时至多重读一次；可用性里的 scoped 变了就不再记着', async () => {
    const { page, server } = start()
    tellsWeather(server)
    const frames: unknown[] = []
    let wake = (): void => undefined
    const push = (...more: unknown[]): void => {
      frames.push(...more)
      wake()
    }
    server.stream('access/v1 availability', async function* (request) {
      for (;;) {
        while (frames.length === 0) {
          await new Promise<void>(resolve => {
            wake = resolve
            request.signal.addEventListener('abort', () => resolve())
          })
          if (request.signal.aborted) return { kind: 'aborted' }
        }
        yield value(frames.shift())
      }
    })
    await page.login()
    const reads = () => server.seen.filter(item => item.target === 'access/v1 scoped').length
    await page.json('/bridge/call', call('weather', 'look'))
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    expect(await page.json('/bridge/call', call('notes', 'look'))).toEqual({ kind: 'not-sent' })
    expect(reads()).toBe(2)
    const events = reading(await page.get('/bridge/events?page=p'))
    const snapshot = (scoped: number) => ({
      kind: 'snapshot',
      revision: 1,
      protocols: [],
      conflicts: [],
      scoped,
    })
    expect((await attach(page, 'a-1', AVAILABILITY)).status).toBe(200)
    push(snapshot(4), snapshot(4))
    await events.next(2)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(3)
    push(snapshot(5))
    await events.next(1)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(4)
    await events.cancel()
    await settle()
    const again = reading(await page.get('/bridge/events?page=q'))
    expect((await attach(page, 'a-2', AVAILABILITY, 'q')).status).toBe(200)
    push(snapshot(5))
    await again.next(1)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(5)
    await again.cancel()
  })
})

describe('清单之外的目标：记着的答复跟着登录与可用性走（DT-64）', () => {
  it('退出之后这份登录记着的答复不留：再登录同一个证明，调它的协议要重读一次', async () => {
    const { page, server } = start()
    tellsWeather(server)
    server.answer('identity/v1 revoke-login', () => answered('succeeded'))
    const reads = () => server.seen.filter(item => item.target === 'access/v1 scoped').length
    await page.login()
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    expect(await page.json('/bridge/logout')).toEqual({ result: 'signed-out' })
    await page.login()
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(2)
  })

  it('同一个订阅里，scoped 没变的帧不清记着的答复；可用性的流结束时，结束原样交给页面', async () => {
    const { page, server } = start()
    tellsWeather(server)
    const snapshot = { kind: 'snapshot', revision: 1, protocols: [], conflicts: [], scoped: 4 }
    let next = (): void => undefined
    server.stream('access/v1 availability', async function* () {
      yield value(snapshot)
      await new Promise<void>(resolve => (next = resolve))
      yield value(snapshot)
      await new Promise<void>(resolve => (next = resolve))
      return { kind: 'ended', reason: 'the server stops' } as const
    })
    const reads = () => server.seen.filter(item => item.target === 'access/v1 scoped').length
    await page.login()
    const events = reading(await page.get('/bridge/events?page=p'))
    expect((await attach(page, 'a-1', AVAILABILITY)).status).toBe(200)
    await events.next(1)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    next()
    await events.next(1)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    next()
    expect(await events.next(1)).toEqual([
      { id: 'a-1', event: { kind: 'end', end: { kind: 'ended', reason: 'the server stops' } } },
    ])
    await events.cancel()
  })

  it('清单里别的观察的帧不当成可用性读：帧里写着 scoped 变了，记着的答复照旧', async () => {
    const { page, server } = start()
    tellsWeather(server)
    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'snapshot', revision: 1, protocols: [], conflicts: [], scoped: 9 })
      return { kind: 'ended', reason: 'done' } as const
    })
    const reads = () => server.seen.filter(item => item.target === 'access/v1 scoped').length
    await page.login()
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    const events = reading(await page.get('/bridge/events?page=p'))
    expect((await attach(page, 'o-1', OBSERVE)).status).toBe(200)
    await events.next(2)
    await page.json('/bridge/call', call('weather', 'look'))
    expect(reads()).toBe(1)
    await events.cancel()
  })
})

describe('来源', () => {
  it('POST 不带 Origin、带别的 Origin、不是 JSON：都拒绝，记一行', async () => {
    const { forwarding, server, lines } = start()
    const post = (headers: Record<string, string>) =>
      forwarding.fetch(
        new Request(`${ORIGIN}/bridge/call`, { method: 'POST', headers, body: '{}' }),
      )
    expect((await post({ 'content-type': 'application/json' })).status).toBe(403)
    expect(
      (await post({ 'content-type': 'application/json', origin: 'http://app.desktop:3000' }))
        .status,
    ).toBe(403)
    expect((await post({ 'content-type': 'text/plain', origin: ORIGIN })).status).toBe(403)
    expect(server.seen).toEqual([])
    expect(lines[0]).toBe('refused POST /bridge/call: origin=')
  })

  it('每一个有效果的路径都只收 POST', async () => {
    const { page } = start()
    for (const path of ['call', 'observe', 'unobserve', 'login', 'logout', 'login-standing'])
      expect((await page.get(`/bridge/${path}`)).status, path).toBe(404)
  })

  it('桥下没有的路径答 404；桥外的 GET 是页面文件，带内容安全策略', async () => {
    const { page } = start()
    expect((await page.get('/bridge/nothing')).status).toBe(404)
    expect((await page.post('/bridge/events')).status).toBe(404)
    const file = await page.get('/')
    expect(await file.text()).toBe('<p>page</p>')
    expect(file.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect((await page.get('/missing.js')).status).toBe(404)
  })

  it('正文超过上限答 413，只记种类', async () => {
    const { page, lines } = start()
    const large = 'x'.repeat(WIRE_LIMITS.maxBytes + 1)
    expect((await page.post('/bridge/call', large)).status).toBe(413)
    expect(lines).toEqual(['request failed: POST /bridge/call (too large)'])
  })
})

describe('一页一条事件流', () => {
  it('事件流的响应头在上游有任何动静之前就返回', async () => {
    const { page, server } = start()
    const response = await page.get('/bridge/events?page=p')
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(server.seen).toEqual([])
    expect((await page.get('/bridge/events')).status).toBe(400)
  })

  it('开观察：登记之后立刻答复；一帧一个事件，最后一个事件是怎样结束的', async () => {
    const { page, server } = start()
    const first = gate<void>()
    server.stream('session/v1 observe-session', async function* () {
      await first.promise
      yield value({ kind: 'state', n: 1 })
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    const events = reading(await page.get('/bridge/events?page=p'))
    expect((await attach(page, 'o-1')).status).toBe(200)
    first.open()
    expect(await events.next(2)).toEqual([
      { id: 'o-1', event: { kind: 'frame', frame: { kind: 'state', n: 1 } } },
      { id: 'o-1', event: { kind: 'end', end: { kind: 'ended', reason: 'refresh-exhausted' } } },
    ])
  })

  it('这一页没有事件流时开观察答 409，什么都不转发', async () => {
    const { page, server, lines } = start()
    expect((await attach(page, 'o-1')).status).toBe(409)
    expect(server.seen).toEqual([])
    expect(lines).toEqual(['observation refused: the page has no event stream'])
  })

  async function observing() {
    const started = start()
    let aborted = 0
    const live = async function* (request: { signal: AbortSignal }) {
      yield value({ kind: 'state', n: 1 })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      aborted += 1
      return { kind: 'aborted' } as const
    }
    started.server.stream('session/v1 observe-session', live)
    started.server.stream('access/v1 availability', live)
    await started.page.login()
    const events = reading(await started.page.get('/bridge/events?page=p'))
    await attach(started.page, 'o-1')
    await attach(started.page, 'a-1', AVAILABILITY)
    expect(await events.next(2)).toHaveLength(2)
    return { ...started, events, aborted: () => aborted }
  }

  it('页面取消事件流：挂在上面的观察全部取消，这一页再没有事件流', async () => {
    const { page, events, aborted, lines } = await observing()
    await events.cancel()
    await until(() => aborted() === 2)
    expect(lines).toContain('page stream closed with 2 observation(s) on it')
    expect((await attach(page, 'o-3')).status).toBe(409)
  })

  it('停一条只停它', async () => {
    const { page, aborted } = await observing()
    await page.post('/bridge/unobserve', { page: 'p', id: 'o-1' })
    await until(() => aborted() === 1)
    await settle()
    expect(aborted()).toBe(1)
  })

  it('退出：用这份证明开的观察以 denied 结束，不要身份的观察照常', async () => {
    const { page, events, aborted } = await observing()
    await page.json('/bridge/logout')
    expect(await events.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'end', end: { kind: 'ended', reason: 'denied' } } },
    ])
    await settle()
    expect(aborted()).toBe(1)
  })

  it('登录确认失效：用这份证明开的观察同样结束', async () => {
    const { page, server, events } = await observing()
    server.answer('identity/v1 query-current-tenant', () => answered('denied'))
    await page.json('/bridge/login-standing')
    expect(await events.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'end', end: { kind: 'ended', reason: 'denied' } } },
    ])
  })

  it('调用在途时页面放弃：上游的调用被取消', async () => {
    const { page, server } = start()
    let signal: AbortSignal | undefined
    const entered = gate<void>()
    server.answer(
      'session/v1 read-history',
      () =>
        new Promise(resolve => {
          entered.open()
          setTimeout(() => resolve(answered('succeeded')), 2_000)
        }),
    )
    const original = server.connect
    const forwarding = createForwarding({
      rules: createForwardingRules({
        connect: credentials => {
          const transport = original(credentials)
          return {
            call: request => {
              signal = request.signal
              return transport.call(request)
            },
            observe: request => transport.observe(request),
          }
        },
        contracts: [sessionProtocol],
      }),
    })
    opened.push(forwarding)
    const gone = new AbortController()
    void browser(forwarding)
      .post('/bridge/call', CALL, gone.signal)
      .catch(() => {})
    await entered.promise
    expect(signal?.aborted).toBe(false)
    gone.abort()
    expect(signal?.aborted).toBe(true)
    void page
  })

  it('页面不读：转发层为这条流攒的字节有上限，上游不再被取帧', async () => {
    const { page, server } = start()
    const frame = 'x'.repeat(64 * 1024)
    let pulled = 0
    server.stream('session/v1 observe-session', async function* (request) {
      while (!request.signal.aborted) {
        pulled += 1
        yield value({ pad: frame })
        await settle()
      }
      return { kind: 'aborted' }
    })
    const response = await page.get('/bridge/events?page=p')
    await attach(page, 'o-1')
    await new Promise(resolve => setTimeout(resolve, 300))
    const atPause = pulled
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(pulled).toBe(atPause)
    expect(atPause * frame.length).toBeLessThanOrEqual(STREAM_BACKLOG_BYTES + frame.length)
    expect((atPause - 1) * frame.length).toBeLessThanOrEqual(STREAM_BACKLOG_BYTES)
    // Reading lets it go on.
    const events = reading(response)
    await events.next(atPause)
    await until(() => pulled > atPause)
    await events.cancel()
  })
})

describe('来源检查盖住每一条路径', () => {
  it('开观察、停观察、登录、退出、问登录状态：不带 Origin 都被拒绝', async () => {
    const { forwarding, server } = start()
    for (const path of ['call', 'observe', 'unobserve', 'login', 'logout', 'login-standing']) {
      const answer = await forwarding.fetch(
        new Request(`${ORIGIN}/bridge/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
      )
      expect(answer.status, path).toBe(403)
    }
    expect(server.seen).toEqual([])
  })
})
