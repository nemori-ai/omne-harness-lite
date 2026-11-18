import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { openLoginSession } from '../src/main-core/index.ts'
import { memoryCredentialStore } from '../src/main-core/index.ts'
import { createWebHost, type WebHost } from '../src/web-host/server.ts'
import { listenFetchable } from './support/listen.ts'
import {
  PROOF_SENTINEL,
  answered,
  fakeServer,
  issued,
  settle,
  value,
  type FakeServer,
} from './support/fake-server.ts'

const hosts: WebHost[] = []
const seenByPage: string[] = []

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
})

async function start(
  options: { log?: string[]; pageRoot?: string } = {},
): Promise<{ base: string; server: FakeServer }> {
  const server = fakeServer()
  const session = await openLoginSession({
    connect: server.connect,
    store: memoryCredentialStore(),
    contracts: [identityProtocol, sessionProtocol],
  })
  const { log, pageRoot } = options
  const { host, port } = await listenFetchable(() =>
    createWebHost({
      session,
      ...(log === undefined ? {} : { log: (line: string) => void log.push(line) }),
      ...(pageRoot === undefined ? {} : { pageRoot }),
    }),
  )
  hosts.push(host)
  return { base: `http://127.0.0.1:${port}`, server }
}

async function post(base: string, path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  })
  return response
}

async function postText(base: string, path: string, body: unknown): Promise<string> {
  const text = await (await post(base, path, body)).text()
  seenByPage.push(text)
  return text
}

const events = (text: string): unknown[] =>
  text
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.slice('data: '.length)))

async function firstEvents(response: Response, count: number, abort: AbortController) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (events(text).length < count) {
    const chunk = await reader.read()
    if (chunk.done) break
    text += chunk.value
  }
  seenByPage.push(text)
  abort.abort()
  return events(text)
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

/** A page's one event stream; `next` gives the events of the observations on it, in order. */
async function pageEvents(base: string, page = 'page-1') {
  const abort = new AbortController()
  const response = await fetch(`${base}/bridge/events?page=${page}`, { signal: abort.signal })
  expect(response.headers.get('content-type')).toBe('text/event-stream')
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  let taken = 0
  return {
    page,
    attach: (id: string, request: unknown = OBSERVE) =>
      post(base, '/bridge/observe', { page, id, request: JSON.stringify(request) }),
    async next(count: number): Promise<{ id: string; event: unknown }[]> {
      while (events(text).length < taken + count) {
        const chunk = await reader.read()
        if (chunk.done) break
        text += chunk.value
      }
      seenByPage.push(text)
      const got = events(text).slice(taken, taken + count) as { id: string; event: string }[]
      taken += got.length
      return got.map(item => ({ id: item.id, event: JSON.parse(item.event) }))
    },
    close: () => abort.abort(),
  }
}

async function cancelled(stream: (request: { signal: AbortSignal }) => void, server: FakeServer) {
  let done = false
  server.stream('session/v1 observe-session', async function* (request) {
    try {
      stream(request)
      yield value({ kind: 'state', n: 1 })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      return { kind: 'aborted' }
    } finally {
      done = true
    }
  })
  return async () => {
    for (let i = 0; i < 50 && !done; i += 1) await new Promise(r => setTimeout(r, 10))
    return done
  }
}

describe('宿主的通道', () => {
  it('调用：转发一次调用，答复是传输的三种结果之一', async () => {
    const { base, server } = await start()
    server.answer('session/v1 read-history', () => answered('succeeded', { entries: [] }))
    expect(JSON.parse(await postText(base, '/bridge/call', CALL))).toEqual({
      kind: 'answered',
      outcome: 'succeeded',
      body: { entries: [] },
    })
    expect(server.seen[0]).toEqual({
      target: 'session/v1 read-history',
      credentials: {},
      body: CALL.body,
    })
    server.answer('session/v1 read-history', () => ({ kind: 'uncertain' }))
    expect(JSON.parse(await postText(base, '/bridge/call', CALL))).toEqual({ kind: 'uncertain' })
    server.answer('session/v1 read-history', () => ({ kind: 'not-sent' }))
    expect(JSON.parse(await postText(base, '/bridge/call', CALL))).toEqual({ kind: 'not-sent' })
  })

  it('调用：带凭据的操作答「没发出」', async () => {
    const { base, server } = await start()
    const text = await postText(base, '/bridge/call', {
      ...CALL,
      protocol: { name: 'identity', major: 1 },
      operation: 'issue-login',
      body: { loginIdentifier: 'alice', credential: 'pw' },
    })
    expect(JSON.parse(text)).toEqual({ kind: 'not-sent' })
    expect(server.seen).toEqual([])
  })

  it('调用：宿主不认识的协议与没有声明的操作答「没发出」', async () => {
    const { base, server } = await start()
    server.answer('elsewhere/v1 ../../identity/v1/issue-login', () => issued())
    const text = await postText(base, '/bridge/call', {
      ...CALL,
      protocol: { name: 'elsewhere', major: 1 },
      operation: '../../identity/v1/issue-login',
      body: { loginIdentifier: 'alice', credential: 'pw' },
    })
    expect(JSON.parse(text)).toEqual({ kind: 'not-sent' })
    expect(server.seen).toEqual([])
  })

  it('观察：挂在这一页的事件流上，一帧一个事件，最后一个事件是怎样结束的', async () => {
    const { base, server } = await start()
    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'state', n: 1 })
      yield value({ kind: 'state', n: 2 })
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    const page = await pageEvents(base)
    expect((await page.attach('o-1')).status).toBe(200)
    expect(await page.next(3)).toEqual([
      { id: 'o-1', event: { kind: 'frame', frame: { kind: 'state', n: 1 } } },
      { id: 'o-1', event: { kind: 'frame', frame: { kind: 'state', n: 2 } } },
      { id: 'o-1', event: { kind: 'end', end: { kind: 'ended', reason: 'refresh-exhausted' } } },
    ])
    page.close()
  })

  it('观察：被拒也以结束事件答复', async () => {
    const { base } = await start()
    const page = await pageEvents(base)
    await page.attach('o-1')
    expect(await page.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'end', end: { kind: 'refused', outcome: 'basis-unavailable' } } },
    ])
    page.close()
  })

  it('观察：这一页没有事件流时不转发，答 409；页面认作没发出', async () => {
    const { base, server } = await start()
    const response = await post(base, '/bridge/observe', {
      page: 'nobody',
      id: 'o-1',
      request: JSON.stringify(OBSERVE),
    })
    expect(response.status).toBe(409)
    expect(server.seen.some(item => item.target.includes('observe-session'))).toBe(false)
  })

  it('观察：一页的十条观察走同一条事件流，各按标识分开；停一条只停它', async () => {
    const { base, server } = await start()
    const settled = await cancelled(() => undefined, server)
    const page = await pageEvents(base)
    for (let id = 0; id < 10; id += 1) expect((await page.attach(`o-${id}`)).status).toBe(200)
    const first = await page.next(10)
    expect(new Set(first.map(item => item.id)).size).toBe(10)
    await post(base, '/bridge/unobserve', { page: page.page, id: 'o-3' })
    expect(await settled()).toBe(true)
    expect((await post(base, '/bridge/call', CALL)).status).toBe(200)
    page.close()
  })

  it('观察：页面的事件流断开，就取消挂在上面的全部观察', async () => {
    const { base, server } = await start()
    const settled = await cancelled(() => undefined, server)
    const page = await pageEvents(base)
    await page.attach('o-1')
    expect(await page.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'frame', frame: { kind: 'state', n: 1 } } },
    ])
    page.close()
    expect(await settled()).toBe(true)
  })

  it('登录成功：答复只有结果', async () => {
    const { base } = await start()
    const text = await postText(base, '/bridge/login', {
      loginIdentifier: 'alice',
      credential: 'pw',
    })
    expect(JSON.parse(text)).toEqual({ result: 'signed-in' })
  })

  it('登录失败：答复只有结果', async () => {
    const { base, server } = await start()
    server.answer('identity/v1 issue-login', () => answered('uniform-auth-failure'))
    const text = await postText(base, '/bridge/login', {
      loginIdentifier: 'alice',
      credential: 'pw',
    })
    expect(JSON.parse(text)).toEqual({ result: 'auth-failed' })
  })

  it('登录状态流：先给当前状态，变了再给', async () => {
    const { base } = await start()
    const abort = new AbortController()
    const stream = await fetch(`${base}/bridge/login-state`, { signal: abort.signal })
    const states = firstEvents(stream, 3, abort)
    await settle()
    await postText(base, '/bridge/login', { loginIdentifier: 'alice', credential: 'pw' })
    const protocols = [
      { name: 'identity', major: 1 },
      { name: 'session', major: 1 },
    ]
    expect(await states).toEqual([
      { state: 'signed-out', protocols },
      { state: 'signing-in', protocols },
      { state: 'signed-in', protocols },
    ])
  })

  it('退出：答复只有结果', async () => {
    const { base } = await start()
    await postText(base, '/bridge/login', { loginIdentifier: 'alice', credential: 'pw' })
    expect(JSON.parse(await postText(base, '/bridge/logout', {}))).toEqual({ result: 'signed-out' })
  })

  it('只收同源：不是 JSON，或 Origin 不是自己，就拒绝', async () => {
    const { base } = await start()
    const plain = await fetch(`${base}/bridge/logout`, { method: 'POST', body: '{}' })
    expect(plain.status).toBe(403)
    const foreign = await fetch(`${base}/bridge/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: '{}',
    })
    expect(foreign.status).toBe(403)
  })

  it('Host 只看是不是回环地址：转发过的端口照收，别的名字拒绝', async () => {
    const { base } = await start()
    const port = Number(new URL(base).port)
    const statusWith = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/', headers: { host } }, res => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.end()
      })
    const own = await statusWith(`127.0.0.1:${port}`)
    expect(own).not.toBe(403)
    expect(await statusWith('localhost:54321')).toBe(own)
    expect(await statusWith('127.0.0.1:54321')).toBe(own)
    expect(await statusWith('[::1]:54321')).toBe(own)
    expect(await statusWith(`evil.example:${port}`)).toBe(403)
    expect(await statusWith(`127.0.0.1.evil.example:${port}`)).toBe(403)
  })

  it('登录证明不出现在宿主给页面的任何答复里', async () => {
    const { base, server } = await start()
    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'state' })
      return { kind: 'ended', reason: 'denied' }
    })
    await postText(base, '/bridge/login', { loginIdentifier: 'alice', credential: 'pw' })
    await postText(base, '/bridge/call', CALL)
    await postText(base, '/bridge/call', {
      ...CALL,
      protocol: { name: 'identity', major: 1 },
      operation: 'issue-login',
      body: { loginIdentifier: 'alice', credential: 'pw' },
    })
    server.answer('elsewhere/v1 ../../identity/v1/issue-login', () => issued())
    await postText(base, '/bridge/call', {
      ...CALL,
      protocol: { name: 'elsewhere', major: 1 },
      operation: '../../identity/v1/issue-login',
      body: { loginIdentifier: 'alice', credential: 'pw' },
    })
    const page = await pageEvents(base)
    seenByPage.push(await (await page.attach('o-1')).text())
    await page.next(2)
    page.close()
    await postText(base, '/bridge/logout', {})
    expect(server.seen.some(item => item.credentials.proof === PROOF_SENTINEL)).toBe(true)
    expect(seenByPage.length).toBeGreaterThan(10)
    for (const text of seenByPage) expect(text).not.toContain(PROOF_SENTINEL)
  })
})

describe('宿主的通道：一页一条事件流的边界', () => {
  const until = async (check: () => Promise<boolean> | boolean) => {
    for (let i = 0; i < 100; i += 1) {
      if (await check()) return true
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return false
  }
  const observeStatus = async (base: string, page: string, id = 'o-x') =>
    (await post(base, '/bridge/observe', { page, id, request: JSON.stringify(OBSERVE) })).status

  /** Each observation yields one frame and then waits; `aborted()` counts the ones the host stopped. */
  function held(server: FakeServer) {
    let aborted = 0
    server.stream('session/v1 observe-session', async function* (request) {
      yield value({ kind: 'state' })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      aborted += 1
      return { kind: 'aborted' }
    })
    return () => aborted
  }

  it('事件流要说是哪一页：没给或给空都答 400', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/bridge/events`)).status).toBe(400)
    expect((await fetch(`${base}/bridge/events?page=`)).status).toBe(400)
  })

  it('同一页再开一条事件流就换成新的；旧的断开不带走新的，新的断开之后这一页没有事件流', async () => {
    const { base, server } = await start()
    held(server)
    const old = await pageEvents(base, 'p')
    const fresh = await pageEvents(base, 'p')
    expect(await old.next(1)).toEqual([])
    expect((await fresh.attach('o-1')).status).toBe(200)
    expect(await fresh.next(1)).toEqual([
      { id: 'o-1', event: { kind: 'frame', frame: { kind: 'state' } } },
    ])
    fresh.close()
    expect(await until(async () => (await observeStatus(base, 'p')) === 409)).toBe(true)
  })

  it('事件流断开时，只把还挂着的观察记一行；自己结束了的不算', async () => {
    const log: string[] = []
    const { base, server } = await start({ log })
    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'state' })
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    const ended = await pageEvents(base, 'ended')
    await ended.attach('o-1')
    await ended.next(2)
    ended.close()
    const empty = await pageEvents(base, 'empty')
    empty.close()
    held(server)
    const live = await pageEvents(base, 'live')
    await live.attach('o-1')
    await live.next(1)
    live.close()
    expect(await until(() => log.some(line => line.startsWith('page stream closed')))).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(log.filter(line => line.startsWith('page stream closed'))).toEqual([
      'page stream closed with 1 observation(s) on it',
    ])
  })

  it('同一标识再挂一次就换成新的；停这个标识停的是新的，停下的观察不记作结束', async () => {
    const log: string[] = []
    const { base, server } = await start({ log })
    const aborted = held(server)
    const page = await pageEvents(base)
    expect(await (await page.attach('o-1')).text()).toBe('{}')
    await page.next(1)
    await page.attach('o-1')
    await page.next(1)
    expect(await until(() => aborted() === 1)).toBe(true)
    const stop = await post(base, '/bridge/unobserve', { page: page.page, id: 'o-1' })
    expect(await stop.text()).toBe('{}')
    expect(await until(() => aborted() === 2)).toBe(true)
    page.close()
    expect(log.filter(line => line.includes('ended'))).toEqual([])
  })

  it('读不出的观察与停止答 400；停一页没有的观察照答成功；没有事件流的观察记一行', async () => {
    const log: string[] = []
    const { base } = await start({ log })
    expect((await post(base, '/bridge/observe', { page: 'p' })).status).toBe(400)
    expect((await post(base, '/bridge/unobserve', { page: 'p' })).status).toBe(400)
    const stop = await post(base, '/bridge/unobserve', { page: 'nobody', id: 'o-1' })
    expect([stop.status, await stop.text()]).toEqual([200, '{}'])
    const page = await pageEvents(base, 'p')
    const unknown = await post(base, '/bridge/unobserve', { page: 'p', id: 'o-unknown' })
    expect([unknown.status, await unknown.text()]).toEqual([200, '{}'])
    page.close()
    const refused = await post(base, '/bridge/observe', {
      page: 'nobody',
      id: 'o-1',
      request: JSON.stringify(OBSERVE),
    })
    expect([refused.status, await refused.text()]).toEqual([409, 'no event stream'])
    expect(log).toEqual(['observation refused: the page has no event stream'])
  })

  it('GET 不在桥下的路径给页面文件，桥下没有的路径与别的方法答 404', async () => {
    const pageRoot = mkdtempSync(join(tmpdir(), 'web-host-page-'))
    writeFileSync(join(pageRoot, 'index.html'), '<p>page</p>')
    mkdirSync(join(pageRoot, 'bridge'))
    writeFileSync(join(pageRoot, 'bridge', 'shadow.html'), '<p>shadow</p>')
    try {
      const { base } = await start({ pageRoot })
      const index = await fetch(`${base}/`)
      expect([index.status, await index.text()]).toEqual([200, '<p>page</p>'])
      expect((await fetch(`${base}/bridge/shadow.html`)).status).toBe(404)
      const posted = await fetch(`${base}/index.html`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      expect(posted.status).toBe(404)
    } finally {
      rmSync(pageRoot, { recursive: true, force: true })
    }
  })

  it('拒绝时记一行：方法、路径，以及请求带来的 Host 与 Origin', async () => {
    const log: string[] = []
    const { base } = await start({ log })
    const host = new URL(base).host
    await fetch(`${base}/bridge/logout`, { method: 'POST', body: '{}' })
    await fetch(`${base}/bridge/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: '{}',
    })
    expect(log).toEqual([
      `refused POST /bridge/logout: host=${host} origin=`,
      `refused POST /bridge/logout: host=${host} origin=http://evil.example`,
    ])
  })
})
