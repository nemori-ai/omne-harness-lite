import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deviceFigure,
  POINTER_POLL_MS,
  type DeviceFigure,
  type DeviceFigureDeps,
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

/** Records every call on the desk windows it makes and on the main window; ticks the pointer poll by hand. */
function harness(leave = true) {
  const log: string[] = []
  const gone: (() => void)[] = []
  const state = {
    cursor: { x: 10, y: 10 } as Point,
    visible: true,
    tick: null as (() => void) | null,
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
    screenAt: at => (contains(SIDE, at) ? SIDE : MAIN),
    every(ms, tick) {
      log.push(`poll ${ms}`)
      state.tick = tick
      return () => {
        log.push('stop poll')
        state.tick = null
      }
    },
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

  it('不在手时光标到了另一块屏，窗口不动', async () => {
    const h = harness()
    await shown(h)
    h.take()
    h.state.cursor = { x: 2000, y: 500 }
    h.tick()
    expect(h.log).toEqual([])
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
