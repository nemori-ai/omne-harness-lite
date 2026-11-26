import type { WindowBackend } from '@omne-harness/screen'
import {
  pngOf,
  windowBackendOfScene,
  type SceneWindow,
  type WindowScene,
} from '@omne-harness/screen/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deviceFigure,
  POINTER_POLL_MS,
  type DeviceFigure,
  type DeviceFigureDeps,
  type FigureWindowsDeps,
  type Point,
  type Rect,
} from '../src/main/device-figure.ts'
import { deviceScreenRoute } from '../src/main/device-screen.ts'
import { firstRoute } from '../src/main/app-protocol.ts'

const electron = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  class Emitter {
    readonly listeners = new Map<string, Listener[]>()
    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }
    once(event: string, listener: Listener) {
      return this.on(event, listener)
    }
    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
    }
  }
  const made: FakeWindow[] = []
  class FakeWindow extends Emitter {
    readonly calls: string[] = []
    readonly webContents = Object.assign(new Emitter(), {
      setWindowOpenHandler: () => undefined,
      session: {
        setPermissionRequestHandler: () => undefined,
        setPermissionCheckHandler: () => undefined,
      },
    })
    constructor(readonly options: unknown) {
      super()
      made.push(this)
    }
    setAlwaysOnTop(...args: unknown[]) {
      this.calls.push(`setAlwaysOnTop ${JSON.stringify(args)}`)
    }
    setVisibleOnAllWorkspaces(...args: unknown[]) {
      this.calls.push(`setVisibleOnAllWorkspaces ${JSON.stringify(args)}`)
    }
    loadURL(url: string) {
      this.calls.push(`loadURL ${url}`)
      return Promise.resolve()
    }
  }
  return { FakeWindow, made }
})

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: electron.FakeWindow,
  dialog: {},
  protocol: {},
  screen: {},
  shell: {},
}))

const APP = 'omne-app://app'
const MAIN = { x: 0, y: 0, width: 1440, height: 900 }
const SIDE = { x: 1440, y: 0, width: 1920, height: 1080 }
const CONTENT = { x: 100, y: 80, width: 1000, height: 700 }
const FIGURE = { x: 200, y: 200, width: 80, height: 80 }
const BUBBLE = { x: 300, y: 150, width: 240, height: 120 }
const IN_FIGURE = { x: 240, y: 240 }
const OUTSIDE = { x: 600, y: 600 }

const contains = (rect: Rect, at: Point) =>
  at.x >= rect.x && at.y >= rect.y && at.x < rect.x + rect.width && at.y < rect.y + rect.height

const NO_WINDOWS: FigureWindowsDeps = {
  backend: async () => undefined,
  requestAccess: async () => undefined,
  ownPid: 1,
  now: () => 0,
}

/** Records every call on the desk windows it makes and on the main window; ticks the pointer poll by hand. */
function harness(leave = true, windows = NO_WINDOWS) {
  const log: string[] = []
  const gone: (() => void)[] = []
  const state = {
    cursor: { x: 10, y: 10 } as Point,
    visible: true,
    tick: null as (() => void) | null,
    screen: null as Rect | null,
  }
  const deps: DeviceFigureDeps = {
    leave,
    open(whenGone) {
      gone.push(whenGone)
      const id = gone.length
      log.push(`open #${id}`)
      return {
        showInactive: () => void log.push(`show #${id}`),
        hide: () => void log.push(`hide #${id}`),
        destroy: () => void log.push(`destroy #${id}`),
        setBounds: ({ x, y, width, height }) =>
          void log.push(`bounds #${id} ${x},${y},${width},${height}`),
        setIgnoreMouseEvents: ignore => void log.push(`ignore #${id} ${ignore}`),
        setFocusable: focusable => void log.push(`focusable #${id} ${focusable}`),
        focus: () => void log.push(`focus #${id}`),
      }
    },
    main: {
      content: () => CONTENT,
      visible: () => state.visible,
      front: () => void log.push('front'),
    },
    cursor: () => state.cursor,
    screenAt: at => state.screen ?? (contains(SIDE, at) ? SIDE : MAIN),
    every(ms, tick) {
      log.push(`poll ${ms}`)
      state.tick = tick
      return () => {
        log.push('stop poll')
        state.tick = null
      }
    },
    windows,
  }
  const figure = deviceFigure(deps)
  const call = (method: string, path: string, body?: unknown) =>
    figure.route(
      new Request(`${APP}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  const status = async (method: string, path: string, body?: unknown) =>
    (await call(method, path, body))?.status
  return {
    log,
    state,
    figure,
    call,
    status,
    deskGone: (window: number) => gone[window - 1]!(),
    tick: () => state.tick?.(),
    /** Takes the log written since the last take. */
    take: () => log.splice(0),
  }
}

type Harness = ReturnType<typeof harness>

/** The lease's stream read line by line: each line one JSON object; `'closed'` once the stream ends. */
function linesOf(response: Response | undefined) {
  const reader = response!.body!.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  return {
    async next(): Promise<unknown> {
      while (!buffered.includes('\n')) {
        const { done, value } = await reader.read()
        if (done) return 'closed'
        buffered += decoder.decode(value, { stream: true })
      }
      const at = buffered.indexOf('\n')
      const line = buffered.slice(0, at)
      buffered = buffered.slice(at + 1)
      return JSON.parse(line)
    },
    abandon: () => reader.cancel(),
  }
}

/** Opens a lease and reads its first line. */
async function opened(h: Harness) {
  const response = await h.call('POST', '/device/figure/lease')
  const lines = linesOf(response)
  const first = (await lines.next()) as { lease: number; facts: unknown }
  return { response, lines, first, lease: first.lease }
}

/** Opens a lease whose desk reported its first `hot`, the cursor away from it. */
async function shown(h: Harness) {
  h.state.cursor = OUTSIDE
  const open = await opened(h)
  expect(
    await h.status('POST', `/device/figure/hot?lease=${open.lease}`, { rects: [FIGURE] }),
  ).toBe(204)
  return open
}

const mode = (lease: number, hold: boolean, keys: boolean) =>
  [`/device/figure/mode?lease=${lease}`, { hold, keys }] as const
const hot = (lease: number, ...rects: Rect[]) =>
  [`/device/figure/hot?lease=${lease}`, { rects }] as const

describe('桌面层的路由', () => {
  it('只认 /device/figure 之下，别的路径留给后面的路由', () => {
    const h = harness()
    expect(h.call('GET', '/device/screen')).toBeUndefined()
    expect(h.call('GET', '/device/figures')).toBeUndefined()
    expect(h.call('GET', '/bridge/login-standing')).toBeUndefined()
  })

  it('macOS 上答能离开、读不了窗口', async () => {
    const answer = await harness().call('GET', '/device/figure')
    expect(answer?.status).toBe(200)
    expect(await answer?.json()).toEqual({ leave: true, read: false })
  })

  it('不是 macOS 时答不能离开，/device/figure 下别的路径都答 404，窗口一样不动', async () => {
    const h = harness(false)
    expect(await (await h.call('GET', '/device/figure'))?.json()).toEqual({
      leave: false,
      read: false,
    })
    expect(await h.status('POST', '/device/figure/lease')).toBe(404)
    expect(await h.status('POST', ...mode(1, true, false))).toBe(404)
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(404)
    expect(await h.status('POST', '/device/figure/front')).toBe(404)
    expect(h.log).toEqual([])
  })

  it('这一程不做读窗口：own、window、read 与别的路径答 404', async () => {
    const h = harness()
    const { lease } = await opened(h)
    h.take()
    expect(await h.status('GET', '/device/figure/own?x=1&y=1')).toBe(404)
    expect(await h.status('GET', '/device/figure/window?x=1&y=1')).toBe(404)
    expect(await h.status('POST', `/device/figure/read?lease=${lease}`, { window: 'w' })).toBe(404)
    expect(await h.status('GET', '/device/figure/lease')).toBe(404)
    expect(await h.status('POST', '/device/figure/other')).toBe(404)
    expect(h.log).toEqual([])
  })

  it('lease= 缺了或不是数字答 400；请求体读不懂也答 400', async () => {
    const h = harness()
    const { lease } = await opened(h)
    h.take()
    for (const path of ['/device/figure/mode', '/device/figure/hot'])
      for (const query of ['', '?lease=', '?lease=x', '?lease=1.5'])
        expect(
          await h.status('POST', `${path}${query}`, { hold: true, keys: false, rects: [] }),
        ).toBe(400)
    expect(await h.status('POST', `/device/figure/mode?lease=${lease}`, { hold: 'yes' })).toBe(400)
    expect(await h.status('POST', `/device/figure/hot?lease=${lease}`, { rects: [{ x: 1 }] })).toBe(
      400,
    )
    expect(await h.status('POST', `/device/figure/hot?lease=${lease}`, 'not json')).toBe(400)
    expect(h.log).toEqual([])
  })

  it('请求体读不懂答 400，窗口一样不动：不是对象、缺标志、标志不是布尔、矩形不全对', async () => {
    const h = harness()
    const { lease } = await shown(h)
    h.take()
    const modes = [null, 5, { keys: false }, { hold: true }, { hold: 1, keys: false }]
    const said = (path: string, body: unknown) =>
      h.status('POST', `/device/figure/${path}?lease=${lease}`, body)
    for (const body of modes) expect(await said('mode', body), JSON.stringify(body)).toBe(400)
    const rects = [
      null,
      5,
      {},
      { rects: {} },
      { rects: [FIGURE, { x: 1, y: 2, width: 3 }] },
      { rects: [FIGURE, null] },
      { rects: [5] },
      { rects: [{ ...FIGURE, height: '80' }] },
    ]
    for (const body of rects) expect(await said('hot', body), JSON.stringify(body)).toBe(400)
    const raw = new Request(`${APP}/device/figure/hot?lease=${lease}`, {
      method: 'POST',
      body: '{',
    })
    expect((await h.figure.route(raw))?.status).toBe(400)
    expect(h.log).toEqual([])
  })

  it('答复：错误的正文是 { reason }，JSON 都不缓存；租约的流是 ndjson', async () => {
    const h = harness()
    const { response, lease } = await opened(h)
    expect(response?.headers.get('content-type')).toBe('application/x-ndjson')
    const answer = async (method: string, path: string, body?: unknown) => {
      const got = await h.call(method, path, body)
      const headers = [got?.headers.get('content-type'), got?.headers.get('cache-control')]
      return [got?.status, ...headers, await got?.json()]
    }
    const json = (status: number, body: unknown) => [status, 'application/json', 'no-store', body]
    expect(await answer('GET', '/device/figure')).toEqual(json(200, { leave: true, read: false }))
    expect(await answer('POST', '/device/figure/mode', { hold: true, keys: false })).toEqual(
      json(400, { reason: 'no-lease' }),
    )
    expect(await answer('POST', ...mode(lease + 1, true, false))).toEqual(
      json(409, { reason: 'not-current' }),
    )
    expect(await answer('POST', `/device/figure/mode?lease=${lease}`, { hold: 'yes' })).toEqual(
      json(400, { reason: 'unreadable' }),
    )
    expect(await answer('POST', '/device/figure/other')).toEqual(json(404, { reason: 'not-found' }))
    const stays = harness(false)
    const got = await stays.call('POST', '/device/figure/lease')
    expect([got?.status, await got?.json()]).toEqual([404, { reason: 'not-found' }])
  })

  it('租约号由主进程发，应用活着期间只增：窗口没了重建也接着数', async () => {
    const h = harness()
    const numbers = [(await opened(h)).lease, (await opened(h)).lease]
    h.deskGone(1)
    numbers.push((await opened(h)).lease)
    h.figure.pageGone()
    numbers.push((await opened(h)).lease)
    expect(numbers).toEqual([1, 2, 3, 4])
  })

  it('租约的流一行一个 JSON：第一行是租约号与事实；主窗口挪了、藏了、显示了再发一行事实', async () => {
    const h = harness()
    const { response, first, lines } = await opened(h)
    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(first).toEqual({ lease: 1, facts: { screen: MAIN, content: CONTENT, visible: true } })
    h.state.visible = false
    h.figure.moved()
    expect(await lines.next()).toEqual({
      facts: { screen: MAIN, content: CONTENT, visible: false },
    })
  })

  it('把主窗口提到前面不要租约，答 204', async () => {
    const h = harness()
    expect(await h.status('POST', '/device/figure/front')).toBe(204)
    expect(h.log).toEqual(['front'])
  })
})

// 租约的状态（没有、开着没显示、开着显示着）乘请求与事件，每格一条。
describe('租约：没有租约时', () => {
  let h: Harness
  beforeEach(() => {
    h = harness()
  })

  it('开租约：建窗口铺在光标所在的那块屏上，答一条流，不显示', async () => {
    h.state.cursor = { x: 2000, y: 500 }
    const { first } = await opened(h)
    expect(first).toEqual({ lease: 1, facts: { screen: SIDE, content: CONTENT, visible: true } })
    expect(h.log).toEqual(['open #1', 'bounds #1 1440,0,1920,1080'])
  })

  it('mode：答 409，窗口不动', async () => {
    expect(await h.status('POST', ...mode(1, true, true))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('hot：答 409，不显示', async () => {
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    h.figure.pageGone()
    await opened(h)
    h.take()
    h.figure.pageGone()
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('front：照样提主窗口', async () => {
    expect(await h.status('POST', '/device/figure/front')).toBe(204)
    expect(h.log).toEqual(['front'])
  })

  it('请求被放弃：已经结束了的租约的请求被放弃，什么都不做', async () => {
    const { lines } = await opened(h)
    h.figure.pageGone()
    expect(await lines.next()).toEqual({ ended: true })
    h.take()
    await lines.abandon()
    expect(h.log).toEqual([])
    expect((await opened(h)).lease).toBe(2)
  })

  it('主窗口的页面开始加载：窗口不动', async () => {
    h.figure.pageGone()
    await opened(h)
    h.figure.pageGone()
    h.take()
    h.figure.pageGone()
    expect(h.log).toEqual([])
  })

  it('桌面层的页面没了：藏着的窗口销毁，下次开租约再建', async () => {
    const { lines } = await opened(h)
    await lines.abandon()
    h.take()
    h.deskGone(1)
    expect(h.take()).toEqual(['destroy #1'])
    await opened(h)
    expect(h.take()).toEqual(['open #2', 'bounds #2 0,0,1440,900'])
  })

  it('结束了的租约的流没读完就被放弃：什么都不做', async () => {
    const { lines } = await opened(h)
    h.figure.pageGone()
    h.take()
    await lines.abandon()
    expect(h.log).toEqual([])
  })

  it('上一个租约的流在新租约开了之后才被放弃：新租约照旧', async () => {
    const old = await opened(h)
    const next = await opened(h)
    h.take()
    await old.lines.abandon()
    expect(h.log).toEqual([])
    expect(await h.status('POST', ...hot(next.lease, FIGURE))).toBe(204)
  })

  it('旧窗口的「没了」在新窗口建好之后才到：不结束新租约，不销毁新窗口', async () => {
    await opened(h)
    h.figure.closed()
    const next = await opened(h)
    h.take()
    h.deskGone(1)
    expect(h.log).toEqual([])
    expect(await h.status('POST', ...hot(next.lease, FIGURE))).toBe(204)
  })

  it('主窗口挪了：没有租约时不写也不抛，窗口藏着或已经销毁都一样', async () => {
    h.figure.moved()
    const { lines } = await opened(h)
    await lines.abandon()
    h.take()
    h.figure.moved()
    h.figure.closed()
    h.take()
    h.figure.moved()
    expect(h.log).toEqual([])
  })

  it('主窗口关了：有窗口就销毁，没有就什么都不做', async () => {
    h.figure.closed()
    expect(h.take()).toEqual([])
    const { lines } = await opened(h)
    await lines.abandon()
    h.take()
    h.figure.closed()
    expect(h.log).toEqual(['destroy #1'])
  })
})

describe('租约：开着、还没显示时', () => {
  let h: Harness
  let open: Awaited<ReturnType<typeof opened>>
  let opening: string[]
  beforeEach(async () => {
    h = harness()
    h.state.cursor = OUTSIDE
    open = await opened(h)
    opening = h.take()
  })

  it('开租约：先结束上一个（流上发 ended 再收），沿用同一个窗口，新的不显示；上一个迟到的 hot 答 409', async () => {
    const next = await opened(h)
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(await open.lines.next()).toBe('closed')
    expect(next.lease).toBe(2)
    expect(h.take()).toEqual(['bounds #1 0,0,1440,900'])
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('mode：做了答 204；要键盘时窗口变得可聚焦，但不显示也不拿焦点；号不对答 409', async () => {
    expect(await h.status('POST', ...mode(1, true, true))).toBe(204)
    expect(h.take()).toEqual(['focusable #1 true'])
    expect(await h.status('POST', ...mode(2, true, false))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('hot：这个租约的第一份 hot 到了才显示，不抢焦点，开始读光标', async () => {
    expect(opening).toEqual(['open #1', 'bounds #1 0,0,1440,900'])
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(204)
    expect(h.take()).toEqual(['ignore #1 true', 'show #1', `poll ${POINTER_POLL_MS}`])
    expect(POINTER_POLL_MS).toBe(16)
  })

  it('front：提主窗口，租约照旧', async () => {
    expect(await h.status('POST', '/device/figure/front')).toBe(204)
    expect(await h.status('POST', ...mode(1, false, false))).toBe(204)
    expect(h.log).toEqual(['front'])
  })

  it('请求被放弃：租约结束，窗口本来藏着', async () => {
    await open.lines.abandon()
    expect(h.log).toEqual([])
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('主窗口的页面开始加载：流上发 ended 再收，租约结束', async () => {
    h.figure.pageGone()
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(await open.lines.next()).toBe('closed')
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('桌面层的页面没了：流上发 ended，窗口销毁', async () => {
    h.deskGone(1)
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(await open.lines.next()).toBe('closed')
    expect(h.log).toEqual(['destroy #1'])
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
  })

  it('主窗口关了：流上发 ended，窗口销毁', async () => {
    h.figure.closed()
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(h.log).toEqual(['destroy #1'])
  })
})

describe('租约：开着、显示着时', () => {
  let h: Harness
  let open: Awaited<ReturnType<typeof opened>>
  beforeEach(async () => {
    h = harness()
    open = await shown(h)
    h.take()
  })

  it('开租约：先结束上一个、藏起窗口、停读光标；新的等它自己的 hot 才显示', async () => {
    const next = await opened(h)
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(h.take()).toEqual(['stop poll', 'hide #1', 'bounds #1 0,0,1440,900'])
    expect(await h.status('POST', ...hot(1, FIGURE))).toBe(409)
    expect(h.take()).toEqual([])
    expect(await h.status('POST', ...hot(next.lease, FIGURE))).toBe(204)
    expect(h.take()).toEqual(['show #1', `poll ${POINTER_POLL_MS}`])
  })

  it('mode：hold 时整块接指针；keys 开时可聚焦并拿键盘，关时收回且不提主窗口', async () => {
    expect(await h.status('POST', ...mode(1, true, false))).toBe(204)
    expect(h.take()).toEqual(['ignore #1 false'])
    expect(await h.status('POST', ...mode(1, false, true))).toBe(204)
    expect(h.take()).toEqual(['focusable #1 true', 'focus #1', 'ignore #1 true'])
    expect(await h.status('POST', ...mode(1, false, false))).toBe(204)
    expect(h.take()).toEqual(['focusable #1 false'])
    expect(await h.status('POST', ...mode(2, true, true))).toBe(409)
    expect(h.log).toEqual([])
  })

  it('hot：不再显示一次，只换接指针的矩形', async () => {
    h.state.cursor = { x: 310, y: 160 }
    h.tick()
    expect(h.take()).toEqual([])
    expect(await h.status('POST', ...hot(1, FIGURE, BUBBLE))).toBe(204)
    expect(h.take()).toEqual(['ignore #1 false'])
  })

  it('front：提主窗口，窗口与租约照旧', async () => {
    expect(await h.status('POST', '/device/figure/front')).toBe(204)
    expect(h.log).toEqual(['front'])
  })

  it('请求被放弃：停读光标、藏起窗口', async () => {
    await open.lines.abandon()
    expect(h.take()).toEqual(['stop poll', 'hide #1'])
    expect(await h.status('POST', ...mode(1, true, false))).toBe(409)
  })

  it('请求被放弃时要着键盘：收回可聚焦，不提主窗口', async () => {
    await h.status('POST', ...mode(1, false, true))
    h.take()
    await open.lines.abandon()
    expect(h.log).toEqual(['stop poll', 'focusable #1 false', 'hide #1'])
  })

  it('主窗口的页面开始加载：流上发 ended，停读光标、藏起窗口', async () => {
    h.figure.pageGone()
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(await open.lines.next()).toBe('closed')
    expect(h.log).toEqual(['stop poll', 'hide #1'])
  })

  it('桌面层的页面没了：流上发 ended，停读光标、销毁窗口；它迟到的回报不再理', async () => {
    h.deskGone(1)
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(h.take()).toEqual(['stop poll', 'destroy #1'])
    h.deskGone(1)
    expect(h.log).toEqual([])
  })

  it('主窗口关了：流上发 ended，停读光标、销毁窗口', async () => {
    h.figure.closed()
    expect(await open.lines.next()).toEqual({ ended: true })
    expect(h.log).toEqual(['stop poll', 'destroy #1'])
  })
})

describe('点穿', () => {
  it('光标在报上来的矩形里才接指针，出了矩形就放指针过去；没变时不再调', async () => {
    const h = harness()
    await shown(h)
    expect(h.take()).toContain('ignore #1 true')
    h.state.cursor = IN_FIGURE
    h.tick()
    h.tick()
    expect(h.take()).toEqual(['ignore #1 false'])
    h.state.cursor = OUTSIDE
    h.tick()
    expect(h.take()).toEqual(['ignore #1 true'])
  })

  it('hold 时整块接，光标到了另一块屏窗口跟过去并发一行事实；放下之后照矩形判', async () => {
    const h = harness()
    const { lines } = await shown(h)
    await h.status('POST', ...mode(1, true, false))
    h.take()
    h.state.cursor = { x: 2000, y: 500 }
    h.tick()
    expect(h.take()).toEqual(['bounds #1 1440,0,1920,1080'])
    expect(await lines.next()).toEqual({ facts: { screen: SIDE, content: CONTENT, visible: true } })
    await h.status('POST', ...mode(1, false, false))
    expect(h.take()).toEqual(['ignore #1 true'])
    h.state.cursor = { x: 10, y: 10 }
    h.tick()
    expect(h.log).toEqual([])
  })

  it('矩形的边：左与上的边算在里面，右与下的边不算；四边外一格放指针过去', async () => {
    const h = harness()
    await shown(h)
    const takes = (x: number, y: number) => {
      h.state.cursor = IN_FIGURE
      h.tick()
      h.take()
      h.state.cursor = { x, y }
      h.tick()
      return !h.take().includes('ignore #1 true')
    }
    const { x, y, width, height } = FIGURE
    const inside = [
      [x, y + 40],
      [x + 40, y],
      [x, y],
      [x + width - 1, y + 40],
      [x + 40, y + height - 1],
    ] as const
    const outside = [
      [x - 1, y + 40],
      [x + width, y + 40],
      [x + 40, y - 1],
      [x + 40, y + height],
    ] as const
    expect(inside.map(([at, to]) => takes(at, to))).toEqual(inside.map(() => true))
    expect(outside.map(([at, to]) => takes(at, to))).toEqual(outside.map(() => false))
  })

  it('两块矩形：光标在任一块里就接，都不在就放过去', async () => {
    const h = harness()
    await shown(h)
    await h.status('POST', ...hot(1, FIGURE, BUBBLE))
    h.take()
    const visit = (at: Point) => {
      h.state.cursor = at
      h.tick()
      return h.take()
    }
    expect(visit(IN_FIGURE)).toEqual(['ignore #1 false'])
    expect(visit(OUTSIDE)).toEqual(['ignore #1 true'])
    expect(visit({ x: 400, y: 200 })).toEqual(['ignore #1 false'])
    expect(visit({ x: 290, y: 240 })).toEqual(['ignore #1 true'])
  })

  it('在手时屏只差 x、y、宽或高也算另一块：换过去并多发一行事实；同一块不调也不发', async () => {
    const h = harness()
    const { lines } = await shown(h)
    await h.status('POST', ...mode(1, true, false))
    h.take()
    const apart = [{ x: 1 }, { y: 1 }, { width: 1441 }, { height: 901 }]
    for (const screen of apart.flatMap(one => [{ ...MAIN, ...one }, MAIN])) {
      h.state.screen = screen
      h.tick()
      const { x, y, width, height } = screen
      expect(h.take()).toEqual([`bounds #1 ${x},${y},${width},${height}`])
      expect(await lines.next()).toEqual({ facts: { screen, content: CONTENT, visible: true } })
    }
    h.tick()
    expect(h.log).toEqual([])
    h.state.visible = false
    h.figure.moved()
    expect(await lines.next()).toEqual({
      facts: { screen: MAIN, content: CONTENT, visible: false },
    })
  })

  it('不在手时光标到了另一块屏，窗口不动', async () => {
    const h = harness()
    await shown(h)
    h.take()
    h.state.cursor = { x: 2000, y: 500 }
    h.tick()
    expect(h.log).toEqual([])
  })
})

// 屏上的窗口，从前到后。omne 的进程号是 SELF；桌面层是它的一块整屏的窗口，层级 status（25），后端不列。
const SELF = 4100
const TAKEN_AT = 1_764_000_000_000
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const windowIn = (
  id: string,
  pid: number,
  app: string,
  title: string,
  bounds: Rect,
  more: Partial<SceneWindow> = {},
): SceneWindow => ({
  id,
  pid,
  app,
  title,
  layer: 0,
  opacity: 1,
  onScreen: true,
  bounds,
  scale: 2,
  ...more,
})
const DESK = windowIn('1', SELF, 'omne', '', MAIN, { layer: 25 })
const TIP = windowIn('2', 800, 'Clock', 'tip', { x: 650, y: 150, width: 30, height: 20 })
const EDITOR = windowIn('3', 700, 'Editor', 'notes.txt', {
  x: 600,
  y: 100,
  width: 700,
  height: 600,
})
const OMNE = windowIn('4', SELF, 'omne', 'omne', CONTENT)
const BROWSER = windowIn('5', 900, 'Browser', 'docs', MAIN)
const SCENE: WindowScene = { windows: [DESK, TIP, EDITOR, OMNE, BROWSER], permission: 'satisfied' }
const AT_EDITOR = { x: 900, y: 400 }
const AT_TIP = { x: 655, y: 155 }
const AT_OMNE = { x: 200, y: 200 }
const AT_BROWSER = { x: 1350, y: 850 }
const AT_NOTHING = { x: 2000, y: 500 }

/** A window backend over a scene that counts what is asked of it; `loads: false` is a machine without one. */
function windowsOf(scene: Partial<WindowScene> = {}, loads: boolean | 'throws' = true) {
  const calls = { loads: 0, list: 0, capture: [] as string[], asked: 0 }
  const inner = windowBackendOfScene({ ...SCENE, ...scene })
  const backend: WindowBackend = {
    ...inner,
    list: () => ((calls.list += 1), inner.list()),
    capture: id => (calls.capture.push(id), inner.capture(id)),
  }
  const deps: FigureWindowsDeps = {
    backend: async () => {
      calls.loads += 1
      if (loads === 'throws') throw new Error('the library does not load')
      return loads ? backend : undefined
    },
    requestAccess: async () => void (calls.asked += 1),
    ownPid: SELF,
    now: () => TAKEN_AT,
  }
  return { calls, deps }
}

const pointed = (route: 'own' | 'window', at: Point) =>
  `/device/figure/${route}?x=${at.x}&y=${at.y}`
const answered = async (response: Promise<Response> | undefined) => {
  const got = await response
  return [got?.status, await got?.json()]
}

describe('读窗口：这台机器能不能读', () => {
  it('有窗口后端时 read 为真，与许可、后端出不出错无关', async () => {
    for (const scene of [
      {},
      { permission: 'unsatisfied' as const },
      { permission: 'unknown' as const },
      { fault: 'list' as const },
    ]) {
      const h = harness(true, windowsOf(scene).deps)
      expect(await answered(h.call('GET', '/device/figure'))).toEqual([
        200,
        { leave: true, read: true },
      ])
    }
  })

  it('后端没有、或载的时候出错：read 为假，own、window、read 答 404，只载一次', async () => {
    for (const loads of [false, 'throws'] as const) {
      const { calls, deps } = windowsOf({}, loads)
      const h = harness(true, deps)
      expect(await answered(h.call('GET', '/device/figure'))).toEqual([
        200,
        { leave: true, read: false },
      ])
      const { lease } = await opened(h)
      h.take()
      expect(await answered(h.call('GET', pointed('own', AT_OMNE)))).toEqual([
        404,
        { reason: 'not-found' },
      ])
      expect(await h.status('GET', pointed('window', AT_EDITOR))).toBe(404)
      expect(await h.status('POST', `/device/figure/read?lease=${lease}`, { window: '3' })).toBe(
        404,
      )
      expect(calls.loads, String(loads)).toBe(1)
      expect(h.log).toEqual([])
    }
  })

  it('不是 macOS：答 { leave: false, read: false }，own、window、read 答 404，不载后端', async () => {
    const { calls, deps } = windowsOf()
    const h = harness(false, deps)
    expect(await answered(h.call('GET', '/device/figure'))).toEqual([
      200,
      { leave: false, read: false },
    ])
    expect(await h.status('GET', pointed('own', AT_OMNE))).toBe(404)
    expect(await h.status('GET', pointed('window', AT_EDITOR))).toBe(404)
    expect(await h.status('POST', '/device/figure/read?lease=1', { window: '3' })).toBe(404)
    expect(calls.loads).toBe(0)
  })
})

describe('读窗口：own，这一点上最前面的窗口是不是 omne 自己的', () => {
  const own = async (at: Point, scene: Partial<WindowScene> = {}) => {
    const { calls, deps } = windowsOf(scene)
    const got = await harness(true, deps).call('GET', pointed('own', at))
    return { status: got?.status, text: await got?.text(), calls }
  }

  it('是 omne 自己的：答 {"own":true}，只有这一个键，不截图、不要许可', async () => {
    const { status, text, calls } = await own(AT_OMNE)
    expect([status, text]).toEqual([200, '{"own":true}'])
    expect(Object.keys(JSON.parse(text!))).toEqual(['own'])
    expect([calls.capture, calls.asked]).toEqual([[], 0])
  })

  it('别的应用的窗口压在 omne 的窗口上面：答假', async () => {
    expect((await own(AT_EDITOR)).text).toBe('{"own":false}')
  })

  it('最前面的是一块很小的别的应用的窗口：不按大小筛，答假', async () => {
    expect((await own(AT_TIP)).text).toBe('{"own":false}')
  })

  it('这一点上没有窗口：答假', async () => {
    expect((await own(AT_NOTHING)).text).toBe('{"own":false}')
  })

  it('桌面层整块盖着屏也不算：它的层级后端不列', async () => {
    expect((await own(AT_BROWSER)).text).toBe('{"own":false}')
  })

  it('没有读屏幕的许可时照答，不要许可', async () => {
    for (const permission of ['unsatisfied', 'unknown'] as const) {
      const { text, calls } = await own(AT_OMNE, { permission })
      expect(text).toBe('{"own":true}')
      expect(calls.asked).toBe(0)
    }
  })

  it('矩形的边：左与上算在里面，右与下不算', async () => {
    const only = { windows: [OMNE] }
    const { x, y, width, height } = CONTENT
    const inside = [
      { x, y },
      { x: x + width - 1, y: y + height - 1 },
    ]
    const outside = [
      { x: x + width, y: y + 10 },
      { x: x + 10, y: y + height },
      { x: x - 1, y },
    ]
    for (const at of inside)
      expect((await own(at, only)).text, JSON.stringify(at)).toBe('{"own":true}')
    for (const at of outside)
      expect((await own(at, only)).text, JSON.stringify(at)).toBe('{"own":false}')
  })

  it('x、y 缺了或不是数字答 400；后端出错答 500 带一句原因；都不要租约，桌面层不动', async () => {
    const h = harness(true, windowsOf().deps)
    for (const query of ['', '?x=1', '?y=1', '?x=&y=1', '?x=a&y=1', '?x=1&y=Infinity'])
      expect(await answered(h.call('GET', `/device/figure/own${query}`)), query).toEqual([
        400,
        { reason: 'no-point' },
      ])
    const failing = harness(true, windowsOf({ fault: 'list' }).deps)
    const [status, body] = await answered(failing.call('GET', pointed('own', AT_OMNE)))
    expect(status).toBe(500)
    expect(body).toEqual({ reason: 'failed', detail: expect.stringMatching(/\S/) })
    expect([...h.log, ...failing.log]).toEqual([])
  })
})

describe('读窗口：window，这一点上最前面的窗口是谁', () => {
  const look = async (at: Point, scene: Partial<WindowScene> = {}) => {
    const { calls, deps } = windowsOf(scene)
    const [status, body] = await answered(harness(true, deps).call('GET', pointed('window', at)))
    expect(status).toBe(200)
    expect([calls.capture, calls.asked]).toEqual([[], 0])
    return body
  }

  it('别的应用的：标识、应用名、标题、矩形与挡在它前面的矩形', async () => {
    expect(await look(AT_EDITOR)).toEqual({
      kind: 'other',
      id: '3',
      app: 'Editor',
      title: 'notes.txt',
      bounds: EDITOR.bounds,
      covered: [TIP.bounds],
    })
  })

  it('宽或高小于 40 的窗口不算：看它下面那一个，它仍算挡在前面', async () => {
    expect(await look(AT_TIP)).toMatchObject({ kind: 'other', id: '3', covered: [TIP.bounds] })
    const w40 = windowIn('6', 800, 'A', 'a', { x: 0, y: 0, width: 40, height: 40 })
    const narrow = windowIn('7', 800, 'B', 'b', { x: 100, y: 0, width: 39, height: 100 })
    const low = windowIn('8', 800, 'C', 'c', { x: 200, y: 0, width: 100, height: 39 })
    const scene = { windows: [w40, narrow, low, BROWSER] }
    expect(await look({ x: 10, y: 10 }, scene)).toMatchObject({
      kind: 'other',
      id: '6',
      covered: [],
    })
    for (const at of [
      { x: 110, y: 10 },
      { x: 210, y: 10 },
    ])
      expect(await look(at, scene)).toMatchObject({
        kind: 'other',
        id: '5',
        covered: [w40.bounds, narrow.bounds, low.bounds],
      })
  })

  it('omne 自己的：只答 { kind: own }', async () => {
    expect(await look(AT_OMNE)).toEqual({ kind: 'own' })
  })

  it('没有：答 { kind: none }', async () => {
    expect(await look(AT_NOTHING)).toEqual({ kind: 'none' })
  })

  it('桌面层不算挡在前面：后端不列它', async () => {
    expect(await look(AT_BROWSER)).toEqual({
      kind: 'other',
      id: '5',
      app: 'Browser',
      title: 'docs',
      bounds: MAIN,
      covered: [TIP.bounds, EDITOR.bounds, CONTENT],
    })
  })

  it('没有读屏幕的许可：标题照后端给的（空的），应用名照给，不要许可', async () => {
    expect(await look(AT_EDITOR, { permission: 'unsatisfied' })).toMatchObject({
      kind: 'other',
      app: 'Editor',
      title: '',
    })
  })

  describe('挡在前面的矩形：排在它前面而且和它相交的窗口', () => {
    const TARGET = windowIn('10', 700, 'Target', 't', { x: 1000, y: 1000, width: 200, height: 200 })
    const OVER = windowIn('11', 700, 'Over', 'o', { x: 1150, y: 1150, width: 100, height: 100 })
    const AT_TARGET = { x: 1100, y: 1100 }
    const square = (id: string, x: number, y: number) =>
      windowIn(id, 800, 'Other', id, { x, y, width: 100, height: 100 })
    const coveredBy = async (front: readonly SceneWindow[]) =>
      look(AT_TARGET, { windows: [...front, OVER, TARGET, square('19', 1050, 1050)] })

    it('只贴着边的不算：左、右、上、下各一块', async () => {
      const touching = [
        square('12', 900, 1050),
        square('13', 1200, 1050),
        square('14', 1050, 900),
        square('15', 1050, 1200),
      ]
      expect(await coveredBy(touching)).toMatchObject({ id: '10', covered: [OVER.bounds] })
    })

    it('只在一个方向上重叠的不算：上下隔开、左右隔开', async () => {
      const apart = [
        square('12', 1050, 800),
        square('13', 1050, 1300),
        square('14', 800, 1050),
        square('15', 1300, 1050),
      ]
      expect(await coveredBy(apart)).toMatchObject({ id: '10', covered: [OVER.bounds] })
    })

    it('两个方向都隔开的不算；排在它后面的相交也不算', async () => {
      expect(await coveredBy([square('12', 700, 700)])).toMatchObject({
        id: '10',
        covered: [OVER.bounds],
      })
    })
  })

  it('x、y 缺了或不是数字答 400；后端出错答 500 带一句原因；不要租约', async () => {
    const h = harness(true, windowsOf().deps)
    for (const query of ['', '?x=1', '?y=1', '?x=1&y=b'])
      expect(await answered(h.call('GET', `/device/figure/window${query}`)), query).toEqual([
        400,
        { reason: 'no-point' },
      ])
    const failing = harness(true, windowsOf({ fault: 'list' }).deps)
    const [status, body] = await answered(failing.call('GET', pointed('window', AT_EDITOR)))
    expect([status, body]).toEqual([500, { reason: 'failed', detail: expect.stringMatching(/\S/) }])
    expect([...h.log, ...failing.log]).toEqual([])
  })
})

describe('读窗口：read，按标识读一个窗口此刻的图', () => {
  async function reading(scene: Partial<WindowScene> = {}) {
    const { calls, deps } = windowsOf(scene)
    const h = harness(true, deps)
    const open = await shown(h)
    h.take()
    const read = (window: unknown, lease: number | string = open.lease) =>
      h.call(
        'POST',
        `/device/figure/read?lease=${lease}`,
        window === undefined ? undefined : { window },
      )
    return { h, calls, open, read }
  }
  const bytesOf = async (response: Response | undefined) =>
    new Uint8Array(await response!.arrayBuffer())
  const hasPng = (bytes: Uint8Array) =>
    bytes.some((_, at) => PNG_SIGNATURE.every((byte, step) => bytes[at + step] === byte))

  it('有许可、窗口在（前面的窗口盖着它一部分也一样）：答 PNG 与三个头，只截这一个', async () => {
    const { h, calls, read } = await reading()
    const got = await read('3')
    expect(got?.status).toBe(200)
    expect(Object.fromEntries(got!.headers)).toEqual({
      'content-type': 'image/png',
      'cache-control': 'no-store',
      'x-omne-window-bounds': '600,100,700,600',
      'x-omne-window-scale': '2',
      'x-omne-taken-at': String(TAKEN_AT),
    })
    expect(await bytesOf(got)).toEqual(pngOf(1400, 1200))
    expect([calls.capture, calls.asked]).toEqual([['3'], 0])
    expect(h.log).toEqual([])
  })

  it('窗口很小也照截：read 只按标识', async () => {
    const { calls, read } = await reading()
    const got = await read('2')
    expect([got?.status, got?.headers.get('x-omne-window-bounds')]).toEqual([200, '650,150,30,20'])
    expect(calls.capture).toEqual(['2'])
  })

  it('没有读屏幕的许可：请系统要一次许可，答 403 not-authorized，答复里没有图的字节', async () => {
    for (const permission of ['unsatisfied', 'unknown'] as const) {
      const { calls, read } = await reading({ permission })
      const got = await read('3')
      expect(got?.status).toBe(403)
      expect(got?.headers.get('content-type')).toBe('application/json')
      const bytes = await bytesOf(got)
      expect(new TextDecoder().decode(bytes)).toBe('{"reason":"not-authorized"}')
      expect(hasPng(bytes)).toBe(false)
      expect(calls.asked, permission).toBe(1)
    }
  })

  it('窗口不在了：答 404 gone，不要许可', async () => {
    const { calls, read } = await reading()
    expect(await answered(read('99'))).toEqual([404, { reason: 'gone' }])
    expect(await answered(read(''))).toEqual([404, { reason: 'gone' }])
    expect(calls.asked).toBe(0)
  })

  it('标识是 omne 自己的窗口：答 404 gone，不截、不要许可，有没有许可都一样', async () => {
    for (const permission of ['satisfied', 'unsatisfied'] as const) {
      const { calls, read } = await reading({ permission })
      expect(await answered(read('4'))).toEqual([404, { reason: 'gone' }])
      expect([calls.capture, calls.asked]).toEqual([[], 0])
    }
  })

  it('桌面层的标识：后端不列它，答 404 gone', async () => {
    const { read } = await reading()
    expect(await answered(read('1'))).toEqual([404, { reason: 'gone' }])
  })

  it('后端出错：截图或列窗口出错都答 500 带一句原因', async () => {
    for (const fault of ['capture', 'list'] as const) {
      const { calls, read } = await reading({ fault })
      expect(await answered(read('3'))).toEqual([
        500,
        { reason: 'failed', detail: expect.stringMatching(/\S/) },
      ])
      expect(calls.asked, fault).toBe(0)
    }
  })

  it('租约号不是现在这一个、没有租约、租约结束了：答 409，不列、不截', async () => {
    const { calls, open, read } = await reading()
    expect(await answered(read('3', open.lease + 1))).toEqual([409, { reason: 'not-current' }])
    await open.lines.abandon()
    expect(await answered(read('3'))).toEqual([409, { reason: 'not-current' }])
    const none = harness(true, windowsOf().deps)
    expect(await none.status('POST', '/device/figure/read?lease=1', { window: '3' })).toBe(409)
    expect([calls.list, calls.capture, calls.asked]).toEqual([0, [], 0])
  })

  it('lease= 缺了或不是数字答 400；请求体读不懂答 400；不列、不截', async () => {
    const { h, calls, open, read } = await reading()
    for (const query of ['', '?lease=', '?lease=x', '?lease=1.5'])
      expect(
        await answered(h.call('POST', `/device/figure/read${query}`, { window: '3' })),
        query,
      ).toEqual([400, { reason: 'no-lease' }])
    for (const window of [undefined, 3, null, { id: '3' }])
      expect(await answered(read(window)), String(window)).toEqual([400, { reason: 'unreadable' }])
    const raw = new Request(`${APP}/device/figure/read?lease=${open.lease}`, {
      method: 'POST',
      body: '{',
    })
    expect((await h.figure.route(raw))?.status).toBe(400)
    expect([calls.list, calls.capture, calls.asked]).toEqual([0, [], 0])
  })

  it('有窗口后端时，/device/figure 下不认识的路径与方法照答 404 not-found，不列、不截', async () => {
    const { h, calls } = await reading()
    const asked: (readonly [string, string, object?])[] = [
      ['POST', '/device/figure/other?lease=1', { window: '3' }],
      ['GET', '/device/figure/other'],
      ['GET', '/device/figure/read?lease=1'],
      ['POST', '/device/figure/window?x=1&y=1'],
    ]
    for (const [method, path, body] of asked)
      expect(await answered(h.call(method, path, body)), `${method} ${path}`).toEqual([
        404,
        { reason: 'not-found' },
      ])
    expect([calls.list, calls.capture, calls.asked]).toEqual([0, [], 0])
  })

  it('读窗口不动租约与桌面层：读过之后 mode 照旧', async () => {
    const { h, open, read } = await reading()
    await read('3')
    expect(h.log).toEqual([])
    expect(await h.status('POST', ...mode(open.lease, true, false))).toBe(204)
  })
})

describe('/device/ 下的路由', () => {
  it('截屏与 figure 之外仍答 404', async () => {
    const figure: DeviceFigure = harness().figure
    const screen = deviceScreenRoute({
      backend: async () => undefined,
      window: { hide: async () => undefined, show: () => undefined },
      overlays: { open: () => undefined, lock: () => undefined, close: () => undefined },
      requestAccess: null,
      openSettings: null,
      now: () => 0,
    })
    const route = firstRoute([figure.route, screen])
    const at = (method: string, path: string) => route(new Request(`${APP}${path}`, { method }))
    expect((await at('GET', '/device/figure'))?.status).toBe(200)
    expect(await (await at('GET', '/device/screen'))?.json()).toEqual({ available: false })
    expect((await at('GET', '/device/camera'))?.status).toBe(404)
    expect((await at('GET', '/device/figures'))?.status).toBe(404)
    expect(at('GET', '/bridge/login-standing')).toBeUndefined()
  })
})

describe('桌面层的窗口', () => {
  beforeEach(() => {
    vi.stubGlobal('OMNE_BUILD_PROFILE', 'test')
    electron.made.length = 0
  })

  it('选项逐项照规格：panel、透明、无边框、无阴影、不可聚焦、不能改大小与移动、不进任务栏与调度中心，网页偏好与主窗口相同', async () => {
    const { deskWindowOptions } = await import('../src/main/desk-window.ts')
    expect(deskWindowOptions()).toEqual({
      show: false,
      type: 'panel',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hiddenInMissionControl: true,
      acceptFirstMouse: true,
      webPreferences: {
        partition: 'persist:omne',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    })
  })

  it('建出来层级是 status、所有桌面空间可见（含全屏，不闪程序坞），载 desk.html', async () => {
    const { deviceFigureDeps } = await import('../src/main/desk-window.ts')
    deviceFigureDeps(() => undefined).open(() => undefined)
    const [window] = electron.made
    expect(window?.calls).toEqual([
      'setAlwaysOnTop [true,"status"]',
      'setVisibleOnAllWorkspaces [true,{"visibleOnFullScreen":true,"skipTransformProcessType":true}]',
      'loadURL omne-app://app/desk.html',
    ])
  })

  it('它的页面没了、没响应、没加载出来或自己重新加载了，各报一次没了', async () => {
    const { deviceFigureDeps } = await import('../src/main/desk-window.ts')
    const deps = deviceFigureDeps(() => undefined)
    const navigate = { isMainFrame: true, isSameDocument: false }
    const cases: [string, (window: InstanceType<typeof electron.FakeWindow>) => void][] = [
      ['renderer gone', window => window.webContents.emit('render-process-gone', {}, {})],
      ['unresponsive', window => window.emit('unresponsive')],
      ['failed load', window => window.webContents.emit('did-fail-load', {}, -2, '', '', true)],
      [
        'reloaded itself',
        window => {
          window.webContents.emit('did-start-navigation', navigate)
          window.webContents.emit('did-start-navigation', { ...navigate, isSameDocument: true })
          window.webContents.emit('did-start-navigation', { ...navigate, isMainFrame: false })
          window.webContents.emit('did-start-navigation', navigate)
        },
      ],
    ]
    for (const [name, happen] of cases) {
      let gone = 0
      deps.open(() => (gone += 1))
      const window = electron.made.at(-1)!
      window.webContents.emit('did-start-navigation', navigate)
      window.webContents.emit('did-fail-load', {}, -3, '', '', true)
      expect(gone, `${name} before`).toBe(0)
      happen(window)
      happen(window)
      expect(gone, name).toBe(1)
    }
  })

  it('主窗口的页面开始加载或没了、挪了、关了，各告诉租约', async () => {
    const { watchMainWindow } = await import('../src/main/desk-window.ts')
    const told: string[] = []
    const main = new electron.FakeWindow({})
    watchMainWindow(main as never, {
      route: () => undefined,
      pageGone: () => void told.push('page gone'),
      moved: () => void told.push('moved'),
      closed: () => void told.push('closed'),
    })
    main.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    main.webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(told).toEqual([])
    main.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    main.webContents.emit('render-process-gone', {}, {})
    for (const event of ['move', 'resize', 'show', 'hide', 'minimize', 'restore']) main.emit(event)
    main.emit('closed')
    expect(told).toEqual(['page gone', 'page gone', ...Array<string>(6).fill('moved'), 'closed'])
  })
})
