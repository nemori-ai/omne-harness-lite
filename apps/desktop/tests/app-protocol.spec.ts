import { describe, expect, it } from 'vitest'
import { serveAppProtocol, type AppProtocolSession } from '../src/main/app-protocol.ts'
import { APP_ORIGIN, INTERNAL_ORIGIN } from '../src/main/app-url.ts'
import { COOKIE_JAR_ORIGIN, createCookieJar } from '../src/main/cookie-jar.ts'
import type { Logger } from '../src/main/log.ts'
import { REQUEST_STAMP } from '../src/main/mapping.ts'
import { PortClosedError } from '../src/port-fetch/index.ts'
import { fakeCookieStore } from './support/cookie-store.ts'
import { gate } from './support/fake-server.ts'

type Stamp = Parameters<Parameters<AppProtocolSession['webRequest']['onBeforeSendHeaders']>[1]>[0]

/** Electron's side: stamps a request the way the network stack does, then runs the handler. */
function fakeElectron() {
  let handler: (request: Request) => Promise<Response> = () => Promise.reject(new Error('unset'))
  let stamp: (
    details: Stamp,
    next: (out: { requestHeaders: Record<string, string> }) => void,
  ) => void = () => {}
  let failed: (details: { id: number }) => void = () => {}
  let filter: { urls: string[] } | undefined
  let nextId = 1
  const session: AppProtocolSession = {
    protocol: {
      handle: (_scheme, given) => {
        handler = given
      },
    },
    webRequest: {
      onBeforeSendHeaders: (given, listener) => {
        filter = given
        stamp = listener
      },
      onErrorOccurred: listener => {
        failed = listener
      },
      onCompleted: () => {},
    },
  }
  return {
    session,
    filter: () => filter,
    direct: (request: Request) => handler(request),
    /** Sends a request through the stamp, then to the handler. `cancelFirst` gives it up before dispatch. */
    send(url: string, init: RequestInit = {}, cancelFirst = false, resourceType = 'xhr') {
      const id = nextId++
      let stamped: Record<string, string> = {}
      stamp(
        { id, resourceType, requestHeaders: Object.fromEntries(new Headers(init.headers)) },
        out => {
          stamped = out.requestHeaders
        },
      )
      if (cancelFirst) failed({ id })
      return {
        stamped,
        answer: handler(new Request(url, { ...init, headers: stamped })),
        cancel: () => failed({ id }),
      }
    },
  }
}

function serve(upstream?: (request: Request) => Promise<Response>) {
  const electron = fakeElectron()
  const logged: { level: string; msg: string; data: Record<string, unknown> }[] = []
  const level =
    (name: string) =>
    (data: Record<string, unknown>, msg: string): void =>
      void logged.push({ level: name, msg, data })
  const log: Logger = {
    debug: level('debug'),
    info: level('info'),
    warn: level('warn'),
    error: level('error'),
  }
  const seen: Request[] = []
  const store = fakeCookieStore()
  serveAppProtocol(electron.session, {
    upstream: async request => {
      seen.push(request)
      return upstream === undefined ? new Response('forwarded') : upstream(request)
    },
    cookies: createCookieJar({ store, hosts: ['app.desktop'], log }),
    log,
  })
  return { ...electron, logged, seen, store }
}

const POST = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }

describe('应用协议：映射与来源', () => {
  it('只盯应用自己的地址', () => {
    expect(serve().filter()).toEqual({ urls: [`${APP_ORIGIN}/*`] })
  })

  it('请求映射到内部的源，路径与查询原样', async () => {
    const { send, seen } = serve()
    expect(await (await send(`${APP_ORIGIN}/bridge/events?page=p`).answer).text()).toBe('forwarded')
    expect(seen[0]!.url).toBe(`${INTERNAL_ORIGIN}/bridge/events?page=p`)
  })

  it('主机名不是应用自己的就拒绝，不转发', async () => {
    const { send, seen, logged } = serve()
    expect((await send('omne-app://elsewhere/bridge/call', POST).answer).status).toBe(403)
    expect(seen).toEqual([])
    expect(logged.map(line => line.msg)).toEqual(['refused: not the app host'])
  })

  it('页面自带的 Origin、Cookie 与盖章的头不被采信；非 GET 的请求补上内部源的 Origin', async () => {
    const { send, seen } = serve()
    const forged = {
      ...POST,
      headers: {
        ...POST.headers,
        origin: 'https://evil.example',
        cookie: 'omne_login=forged',
        'X-Omne-Request': 'forged',
      },
    }
    const { stamped } = send(`${APP_ORIGIN}/bridge/call`, forged)
    const stamps = Object.entries(stamped).filter(([name]) => name.toLowerCase() === REQUEST_STAMP)
    expect(stamps).toHaveLength(1)
    expect(stamps[0]![1]).not.toBe('forged')
    await send(`${APP_ORIGIN}/`).answer
    const [post, get] = seen as [Request, Request]
    expect(post.headers.get('origin')).toBe(INTERNAL_ORIGIN)
    expect(post.headers.get('cookie')).toBeNull()
    expect(post.headers.get(REQUEST_STAMP)).toBeNull()
    expect(await post.text()).toBe('{}')
    expect(get.headers.get('origin')).toBeNull()
  })
})

describe('应用协议：cookie 罐', () => {
  it('答复里的 Set-Cookie 存进罐里，不交给页面；下一个请求带上它', async () => {
    const { send, seen, store } = serve(async request =>
      new URL(request.url).pathname === '/bridge/login'
        ? new Response('{}', {
            headers: { 'set-cookie': 'omne_login=abc; Path=/bridge/; HttpOnly; Max-Age=60' },
          })
        : new Response('ok'),
    )
    const login = await send(`${APP_ORIGIN}/bridge/login`, POST).answer
    expect(login.headers.get('set-cookie')).toBeNull()
    expect(await store.get({ url: `${COOKIE_JAR_ORIGIN}/bridge/call` })).toMatchObject([
      { name: 'omne_login', value: 'abc', httpOnly: true },
    ])
    await send(`${APP_ORIGIN}/bridge/call`, POST).answer
    expect(seen[1]!.headers.get('cookie')).toBe('omne_login=abc')
    // The cookie's path: a page file request does not carry it.
    await send(`${APP_ORIGIN}/index.html`).answer
    expect(seen[2]!.headers.get('cookie')).toBeNull()
  })

  it('Max-Age=0 的 Set-Cookie 把罐里的那一枚删掉', async () => {
    const { send, seen } = serve(async request => {
      const path = new URL(request.url).pathname
      const cookie =
        path === '/bridge/login'
          ? 'omne_login=abc; Path=/bridge/; HttpOnly; Max-Age=60'
          : path === '/bridge/logout'
            ? 'omne_login=; Path=/bridge/; Max-Age=0'
            : undefined
      return new Response('{}', cookie === undefined ? {} : { headers: { 'set-cookie': cookie } })
    })
    await send(`${APP_ORIGIN}/bridge/login`, POST).answer
    await send(`${APP_ORIGIN}/bridge/logout`, POST).answer
    await send(`${APP_ORIGIN}/bridge/call`, POST).answer
    expect(seen[2]!.headers.get('cookie')).toBeNull()
  })
})

describe('应用协议：页面放弃请求与失败', () => {
  it('响应头之前放弃：这次请求的信号中止；地址相同的另一个请求不受影响', async () => {
    const release = gate<void>()
    const { send, seen } = serve(async () => {
      await release.promise
      return new Response('forwarded')
    })
    const first = send(`${APP_ORIGIN}/bridge/call`, POST)
    const second = send(`${APP_ORIGIN}/bridge/call`, POST)
    await new Promise(resolve => setTimeout(resolve, 0))
    first.cancel()
    expect(seen.map(request => request.signal.aborted)).toEqual([true, false])
    release.open()
    expect((await first.answer).type).toBe('error')
    expect((await second.answer).status).toBe(200)
  })

  it('还没到处理函数就放弃了：不转发', async () => {
    const { send, seen } = serve()
    expect((await send(`${APP_ORIGIN}/bridge/call`, POST, true).answer).type).toBe('error')
    expect(seen).toEqual([])
  })

  it('没有盖过章的请求照常转发', async () => {
    const { direct, seen } = serve()
    expect((await direct(new Request(`${APP_ORIGIN}/bridge/call`, POST))).status).toBe(200)
    expect(seen[0]!.signal.aborted).toBe(false)
  })

  it('utility 进程不在：答 503；别的失败答 500；日志里没有查询串', async () => {
    const closed = serve(() => Promise.reject(new PortClosedError('gone')))
    expect((await closed.send(`${APP_ORIGIN}/bridge/call?secret=1`, POST).answer).status).toBe(503)
    expect(JSON.stringify(closed.logged)).not.toContain('secret')
    const broken = serve(() => Promise.reject(new Error('boom')))
    expect((await broken.send(`${APP_ORIGIN}/bridge/call`, POST).answer).status).toBe(500)
  })

  it('页面自己的文档在 utility 进程不在时：算一次加载失败，交给窗口的恢复，不是一页 503 的文字', async () => {
    const closed = serve(() => Promise.reject(new PortClosedError('gone')))
    const document = await closed.send(`${APP_ORIGIN}/`, {}, false, 'mainFrame').answer
    expect(document.type).toBe('error')
    // Anything else of the page still gets the status, so the page reads it as "not known".
    expect(
      (await closed.send(`${APP_ORIGIN}/assets/app.js`, {}, false, 'script').answer).status,
    ).toBe(503)
    // A document that failed for another reason keeps its status.
    const broken = serve(() => Promise.reject(new Error('boom')))
    expect((await broken.send(`${APP_ORIGIN}/`, {}, false, 'mainFrame').answer).status).toBe(500)
  })
})
