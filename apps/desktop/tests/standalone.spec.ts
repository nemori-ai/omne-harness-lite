import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { createForwarding } from '../src/forwarding/app.ts'
import { LOGIN_COOKIE } from '../src/forwarding/login-cookie.ts'
import { createForwardingRules } from '../src/forwarding/rules.ts'
import { createStandalone, STANDALONE_WARNING, type Standalone } from '../src/standalone/server.ts'
import { PROOF_SENTINEL, fakeServer, value } from './support/fake-server.ts'
import { listenFetchable } from './support/listen.ts'

const hosts: Standalone[] = []
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
})

async function start() {
  const server = fakeServer()
  const lines: string[] = []
  const { host, port } = await listenFetchable(() =>
    createStandalone({
      forwarding: createForwarding({
        rules: createForwardingRules({
          connect: server.connect,
          contracts: [identityProtocol, sessionProtocol],
        }),
        readPageFile: async segments =>
          segments.join('/') === 'index.html' ? new TextEncoder().encode('<p>page</p>') : undefined,
        log: line => lines.push(line),
      }),
      log: line => lines.push(line),
    }),
  )
  hosts.push(host)
  const base = `http://127.0.0.1:${port}`
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, ...headers },
      body: JSON.stringify(body),
    })
  return { server, lines, base, port, post }
}

function withHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: '127.0.0.1', port, path: '/', headers: { host } }, response => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    sent.on('error', reject)
    sent.end()
  })
}

const OBSERVE = {
  protocol: { name: 'session', major: 1 },
  observation: 'observe-session',
  messageId: 'm-2',
  open: { session: 's' },
}

describe('独立转发进程', () => {
  it('启动时要打印的那句话说清它只用于开发与走查，cookie 会被发给本机别的端口', () => {
    expect(STANDALONE_WARNING).toContain('development and walk-throughs only')
    expect(STANDALONE_WARNING).toContain('any port of this machine')
  })

  it('Host 只看是不是回环名字：转发过的端口照收，别的名字拒绝并记一行', async () => {
    const { port, lines } = await start()
    expect(await withHost(port, `127.0.0.1:${port}`)).toBe(200)
    expect(await withHost(port, 'localhost:9999')).toBe(200)
    expect(await withHost(port, '[::1]:1')).toBe(200)
    expect(await withHost(port, 'evil.example')).toBe(403)
    expect(lines).toEqual(['refused GET /: host=evil.example'])
  })

  it('经真的 HTTP：登录签发 cookie，带着它的调用带上登录证明；页面文件照发', async () => {
    const { server, base, post } = await start()
    const login = await post('/bridge/login', { loginIdentifier: 'alice', credential: 'pw' })
    const cookie = login.headers.getSetCookie()[0]!
    expect(cookie).toMatch(new RegExp(`^${LOGIN_COOKIE}=[A-Za-z0-9_-]+; `))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(await login.text()).toBe('{"result":"signed-in"}')
    const call = {
      protocol: { name: 'session', major: 1 },
      operation: 'read-history',
      messageId: 'm-1',
      body: { tenant: 't', session: 's' },
    }
    await post('/bridge/call', call, { cookie: cookie.split(';')[0]! })
    expect(server.seen.at(-1)?.credentials).toEqual({ proof: PROOF_SENTINEL })
    expect(await (await fetch(`${base}/`)).text()).toBe('<p>page</p>')
  })

  it('另一个端口上的页面发来的 POST 被拒绝：Origin 的端口不同', async () => {
    const { server, post, port } = await start()
    const answer = await post('/bridge/logout', {}, { origin: `http://127.0.0.1:${port + 1}` })
    expect(answer.status).toBe(403)
    expect(server.seen).toEqual([])
  })

  it('页面断开连接：开着的事件流与上面的观察被取消', async () => {
    const { server, base, post } = await start()
    let aborted = false
    server.stream('session/v1 observe-session', async function* (request) {
      yield value({ kind: 'state', n: 1 })
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      aborted = true
      return { kind: 'aborted' }
    })
    const abort = new AbortController()
    const events = await fetch(`${base}/bridge/events?page=p`, { signal: abort.signal })
    await post('/bridge/observe', { page: 'p', id: 'o-1', request: JSON.stringify(OBSERVE) })
    await events.body!.getReader().read()
    abort.abort()
    for (let i = 0; i < 100 && !aborted; i += 1) await new Promise(r => setTimeout(r, 10))
    expect(aborted).toBe(true)
  })
})
