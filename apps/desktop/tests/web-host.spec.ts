// The web host's channels (SPEC.md「宿主给页面的通道」), against a fake server entry in this
// process. Every answer the page could read is kept, and the last case scans all of them for the
// login proof sentinel.
import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { openLoginSession } from '../src/main-core/index.ts'
import { memoryCredentialStore } from '../src/main-core/index.ts'
import { createWebHost, type WebHost } from '../src/web-host/server.ts'
import {
  PROOF_SENTINEL,
  answered,
  fakeServer,
  settle,
  value,
  type FakeServer,
} from './support/fake-server.ts'

const hosts: WebHost[] = []
/** Every answer body the page received in this file. */
const seenByPage: string[] = []

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
})

async function start(): Promise<{ base: string; server: FakeServer }> {
  const server = fakeServer()
  const session = await openLoginSession({
    connect: server.connect,
    store: memoryCredentialStore(),
    contracts: [identityProtocol, sessionProtocol],
  })
  const host = createWebHost({ session })
  hosts.push(host)
  const port = await host.listen(0)
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

/** Reads an SSE stream until `count` events came, then lets go of it. */
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

  it('观察：一帧一个事件，最后一个事件是怎样结束的', async () => {
    const { base, server } = await start()
    server.stream('session/v1 observe-session', async function* () {
      yield value({ kind: 'state', n: 1 })
      yield value({ kind: 'state', n: 2 })
      return { kind: 'ended', reason: 'refresh-exhausted' }
    })
    const response = await post(base, '/bridge/observe', OBSERVE)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const text = await response.text()
    seenByPage.push(text)
    expect(events(text)).toEqual([
      { kind: 'frame', frame: { kind: 'state', n: 1 } },
      { kind: 'frame', frame: { kind: 'state', n: 2 } },
      { kind: 'end', end: { kind: 'ended', reason: 'refresh-exhausted' } },
    ])
  })

  it('观察：被拒也以结束事件答复', async () => {
    const { base } = await start()
    const text = await (await post(base, '/bridge/observe', OBSERVE)).text()
    expect(events(text)).toEqual([
      { kind: 'end', end: { kind: 'refused', outcome: 'basis-unavailable' } },
    ])
  })

  it('观察：页面断开就取消观察', async () => {
    const { base, server } = await start()
    let cancelled = false
    server.stream('session/v1 observe-session', async function* (request) {
      try {
        yield value({ kind: 'state', n: 1 })
        await new Promise(resolve => request.signal.addEventListener('abort', resolve))
        return { kind: 'aborted' }
      } finally {
        cancelled = true
      }
    })
    const abort = new AbortController()
    const response = await post(base, '/bridge/observe', OBSERVE, abort.signal)
    expect(await firstEvents(response, 1, abort)).toEqual([
      { kind: 'frame', frame: { kind: 'state', n: 1 } },
    ])
    for (let i = 0; i < 50 && !cancelled; i += 1) await new Promise(r => setTimeout(r, 10))
    expect(cancelled).toBe(true)
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
    expect(await states).toEqual([
      { state: 'signed-out' },
      { state: 'signing-in' },
      { state: 'signed-in' },
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

  it('登录证明不出现在宿主给页面的任何答复里', async () => {
    // A signed-in host: calls, observations and the state stream all ran with the proof.
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
    seenByPage.push(await (await post(base, '/bridge/observe', OBSERVE)).text())
    await postText(base, '/bridge/logout', {})
    expect(server.seen.some(item => item.credentials.proof === PROOF_SENTINEL)).toBe(true)
    expect(seenByPage.length).toBeGreaterThan(10)
    for (const text of seenByPage) expect(text).not.toContain(PROOF_SENTINEL)
  })
})
