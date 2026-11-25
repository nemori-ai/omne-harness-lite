import type { ScreenWindow, WindowBackend, WindowCapture, WindowShot } from '@omne-harness/screen'
import { contains, coveringOf, frontAt, lookable } from './window-at.ts'

export const DEVICE_FIGURE = '/device/figure'
export const POINTER_POLL_MS = 16

export type Point = Readonly<{ x: number; y: number }>
/** In logical points on the screen. */
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

export type FigureFacts = Readonly<{ screen: Rect; content: Rect; visible: boolean }>

export type DeskWindow = Readonly<{
  showInactive(): void
  hide(): void
  destroy(): void
  setBounds(bounds: Rect): void
  setIgnoreMouseEvents(ignore: boolean): void
  setFocusable(focusable: boolean): void
  focus(): void
}>

export type FigureWindowsDeps = Readonly<{
  backend(): Promise<WindowBackend | undefined>
  requestAccess(): Promise<void>
  ownPid: number
  now(): number
}>

export type DeviceFigureDeps = Readonly<{
  leave: boolean
  /** Builds the desk window, hidden, on its page; `gone` once that page went away, did not load or reloaded itself. */
  open(gone: () => void): DeskWindow
  main: Readonly<{
    content(): Rect
    visible(): boolean
    front(): void
  }>
  cursor(): Point
  screenAt(point: Point): Rect
  every(ms: number, tick: () => void): () => void
  windows: FigureWindowsDeps
}>

export type DeviceFigure = Readonly<{
  route(request: Request): Promise<Response> | undefined
  pageGone(): void
  moved(): void
  closed(): void
}>

type Desk = { readonly window: DeskWindow; screen: Rect; ignoring: boolean | undefined }

type Lease = {
  readonly number: number
  readonly write: (line: object) => void
  readonly finish: () => void
  shown: boolean
  hold: boolean
  keys: boolean
  rects: readonly Rect[]
  stop?: () => void
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
const done = () => new Response(null, { status: 204 })

type Mode = Readonly<{ hold: boolean; keys: boolean }>
type Hot = Readonly<{ rects: readonly Rect[] }>
type Read = Readonly<{ window: string }>

const fields = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
const isRect = (value: unknown): value is Rect => {
  const rect = fields(value)
  return (
    rect !== undefined && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))
  )
}
const isMode = (body: unknown): body is Mode => {
  const mode = fields(body)
  return typeof mode?.['hold'] === 'boolean' && typeof mode['keys'] === 'boolean'
}
const isHot = (body: unknown): body is Hot => {
  const rects = fields(body)?.['rects']
  return Array.isArray(rects) && rects.every(isRect)
}
const isRead = (body: unknown): body is Read => typeof fields(body)?.['window'] === 'string'
const same = (one: Rect, other: Rect) =>
  one.x === other.x && one.y === other.y && one.width === other.width && one.height === other.height

function leaseOf(url: URL): number | undefined {
  const text = url.searchParams.get('lease') ?? ''
  const number = Number(text)
  return text !== '' && Number.isSafeInteger(number) ? number : undefined
}

function coordinateOf(url: URL, key: 'x' | 'y'): number {
  const text = url.searchParams.get(key) ?? ''
  return text === '' ? NaN : Number(text)
}

function pointOf(url: URL): Point | undefined {
  const x = coordinateOf(url, 'x')
  const y = coordinateOf(url, 'y')
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
}

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text())
  } catch {
    return undefined
  }
}

function leaseStream(cancelled: () => void) {
  const encoder = new TextEncoder()
  let stream!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start: controller => void (stream = controller),
    cancel: cancelled,
  })
  const write = (line: object) => stream.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
  const finish = () => {
    write({ ended: true })
    stream.close()
  }
  return { body, write, finish }
}

const notFound = () => json(404, { reason: 'not-found' })
const gone = () => json(404, { reason: 'gone' })
const failed = (detail: string) => json(500, { reason: 'failed', detail })

function seenAt(windows: readonly ScreenWindow[], at: Point, self: number) {
  const front = frontAt(windows.filter(lookable), at)
  if (front === undefined) return { kind: 'none' }
  if (front.pid === self) return { kind: 'own' }
  const { id, app, title, bounds } = front
  return { kind: 'other', id, app, title, bounds, covered: coveringOf(windows, front) }
}

function picture(shot: WindowShot, takenAt: number): Response {
  const { x, y, width, height } = shot.bounds
  return new Response(shot.png.slice(), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
      'x-omne-window-bounds': `${x},${y},${width},${height}`,
      'x-omne-window-scale': String(shot.scale),
      'x-omne-taken-at': String(takenAt),
    },
  })
}

function figureWindows(deps: FigureWindowsDeps) {
  let loading: Promise<WindowBackend | undefined> | undefined
  const backend = () => (loading ??= deps.backend().catch(() => undefined))

  async function atPoint(
    url: URL,
    answer: (windows: readonly ScreenWindow[], at: Point) => unknown,
  ): Promise<Response> {
    const windows = await backend()
    if (windows === undefined) return notFound()
    const at = pointOf(url)
    if (at === undefined) return json(400, { reason: 'no-point' })
    let listed: readonly ScreenWindow[]
    try {
      listed = await windows.list()
    } catch {
      return failed('读不到屏上有哪些窗口')
    }
    return json(200, answer(listed, at))
  }

  async function capture(windows: WindowBackend, id: string): Promise<Response> {
    let shot: WindowCapture
    try {
      if ((await windows.list()).some(each => each.id === id && each.pid === deps.ownPid))
        return gone()
      shot = await windows.capture(id)
    } catch {
      return failed('截这个窗口时出错')
    }
    if (shot === 'not-found') return gone()
    if (shot === 'not-authorized') {
      await deps.requestAccess()
      return json(403, { reason: 'not-authorized' })
    }
    return picture(shot, deps.now())
  }

  return {
    backend,
    capture,
    own: (url: URL) =>
      atPoint(url, (windows, at) => ({ own: frontAt(windows, at)?.pid === deps.ownPid })),
    window: (url: URL) => atPoint(url, (windows, at) => seenAt(windows, at, deps.ownPid)),
  }
}

/** The desk layer's window and its lease: the main process numbers leases and shows the window only for the current one's first `hot`. */
export function deviceFigure(deps: DeviceFigureDeps): DeviceFigure {
  let issued = 0
  let lease: Lease | null = null
  let desk: Desk | null = null
  const windows = figureWindows(deps.windows)

  const facts = (on: Desk): FigureFacts => ({
    screen: on.screen,
    content: deps.main.content(),
    visible: deps.main.visible(),
  })

  function place(on: Desk, screen: Rect) {
    on.window.setBounds(screen)
    on.screen = screen
  }

  // In the hand the whole window takes the pointer and follows the cursor to its screen; otherwise only the reported rectangles do.
  function steer(open: Lease) {
    if (!open.shown || desk === null) return
    const at = deps.cursor()
    const screen = open.hold ? deps.screenAt(at) : desk.screen
    if (!same(screen, desk.screen)) {
      place(desk, screen)
      open.write({ facts: facts(desk) })
    }
    const ignore = !(open.hold || open.rects.some(rect => contains(rect, at)))
    if (desk.ignoring === ignore) return
    desk.window.setIgnoreMouseEvents(ignore)
    desk.ignoring = ignore
  }

  /** Ends the current lease; the stream says so unless the shell gave it up. The window hides, or goes. */
  function end(told: boolean, window: 'hide' | 'destroy') {
    const open = lease
    lease = null
    if (open !== null) {
      open.stop?.()
      if (open.keys) desk?.window.setFocusable(false)
      if (told) open.finish()
    }
    if (desk === null) return
    if (window === 'destroy') {
      desk.window.destroy()
      desk = null
    } else if (open?.shown === true) desk.window.hide()
  }

  function deskOf(): Desk {
    if (desk !== null) return desk
    const made: Desk = {
      window: deps.open(() => {
        if (desk === made) end(true, 'destroy')
      }),
      screen: { x: 0, y: 0, width: 0, height: 0 },
      ignoring: undefined,
    }
    return (desk = made)
  }

  function openLease(): Response {
    if (lease !== null) end(true, 'hide')
    const on = deskOf()
    place(on, deps.screenAt(deps.cursor()))
    const number = (issued += 1)
    const stream = leaseStream(() => {
      if (lease?.number === number) end(false, 'hide')
    })
    const open: Lease = { number, ...stream, shown: false, hold: false, keys: false, rects: [] }
    lease = open
    open.write({ lease: number, facts: facts(on) })
    return new Response(stream.body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
    })
  }

  /** Reads the body first: checking the lease and acting on it then happen in one step, as the model's do. */
  async function onLease<Body>(
    request: Request,
    url: URL,
    valid: (body: unknown) => body is Body,
    act: (open: Lease, body: Body) => Promise<Response> | void,
  ): Promise<Response> {
    const number = leaseOf(url)
    if (number === undefined) return json(400, { reason: 'no-lease' })
    const body = await bodyOf(request)
    const open = lease
    if (open === null || open.number !== number) return json(409, { reason: 'not-current' })
    if (!valid(body)) return json(400, { reason: 'unreadable' })
    return (await act(open, body)) ?? done()
  }

  function mode(open: Lease, { hold, keys }: Mode) {
    open.hold = hold
    if (keys !== open.keys) {
      open.keys = keys
      desk?.window.setFocusable(keys)
      if (keys && open.shown) desk?.window.focus()
    }
    steer(open)
  }

  function hot(open: Lease, { rects }: Hot) {
    open.rects = rects
    if (open.shown) return steer(open)
    open.shown = true
    steer(open)
    desk?.window.showInactive()
    open.stop = deps.every(POINTER_POLL_MS, () => steer(open))
  }

  async function read(request: Request, url: URL): Promise<Response> {
    const screen = await windows.backend()
    if (screen === undefined) return notFound()
    return onLease(request, url, isRead, (_open, { window }) => windows.capture(screen, window))
  }

  function route(request: Request): Promise<Response> | undefined {
    const url = new URL(request.url)
    const path = url.pathname
    if (path !== DEVICE_FIGURE && !path.startsWith(`${DEVICE_FIGURE}/`)) return undefined
    const route = `${request.method} ${path}`
    if (route === `GET ${DEVICE_FIGURE}`)
      return (deps.leave ? windows.backend() : Promise.resolve(undefined)).then(screen =>
        json(200, { leave: deps.leave, read: screen !== undefined }),
      )
    if (!deps.leave) return Promise.resolve(notFound())
    if (route === `POST ${DEVICE_FIGURE}/lease`) return Promise.resolve(openLease())
    if (route === `POST ${DEVICE_FIGURE}/mode`) return onLease(request, url, isMode, mode)
    if (route === `POST ${DEVICE_FIGURE}/hot`) return onLease(request, url, isHot, hot)
    if (route === `POST ${DEVICE_FIGURE}/front`) {
      deps.main.front()
      return Promise.resolve(done())
    }
    if (route === `GET ${DEVICE_FIGURE}/own`) return windows.own(url)
    if (route === `GET ${DEVICE_FIGURE}/window`) return windows.window(url)
    if (route === `POST ${DEVICE_FIGURE}/read`) return read(request, url)
    return Promise.resolve(notFound())
  }

  return {
    route,
    pageGone: () => end(true, 'hide'),
    moved: () => {
      if (lease !== null && desk !== null) lease.write({ facts: facts(desk) })
    },
    closed: () => end(true, 'destroy'),
  }
}
