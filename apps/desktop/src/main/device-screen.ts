import type { Monitor, ScreenBackend } from '@omne-harness/screen'

export const DEVICE_SCREEN = '/device/screen'
const DEVICE = '/device/'

type Point = Readonly<{ x: number; y: number }>

export type DeviceScreenDeps = Readonly<{
  /** The screen backend of this machine, the one agent screenshots use; nothing where the system has none. */
  backend: () => Promise<ScreenBackend | undefined>
  window: Readonly<{
    /** Where the screen the window is on starts on the desktop, in points; null when none matches. */
    origin(): Point | null
    /** Resolves once the app is out of sight. */
    hide(): Promise<void>
    show(): void
  }>
  /** Asks the system for the screen recording permission, which lists the app in its settings; null where there is no such thing. */
  requestAccess: (() => Promise<void>) | null
  openSettings: (() => Promise<void>) | null
  now: () => number
}>

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1

function screenOf(monitors: readonly Monitor[], origin: Point | null): Monitor | undefined {
  const under = origin === null ? undefined : monitors.find(each => near(each.origin, origin))
  return under ?? monitors.find(each => each.primary) ?? monitors[0]
}

/** Answers the page's requests under /device/ on this machine; every other path is the forwarding's. */
export function deviceScreenRoute(
  deps: DeviceScreenDeps,
): (request: Request) => Promise<Response> | undefined {
  let loading: Promise<ScreenBackend | undefined> | undefined
  const backend = () => (loading ??= deps.backend().catch(() => undefined))

  async function capture(): Promise<Response> {
    const screen = await backend()
    if (screen === undefined) return json(404, { reason: 'unavailable' })
    if ((await screen.permission()) === 'unsatisfied') {
      await deps.requestAccess?.()
      return json(403, { reason: 'not-authorized' })
    }
    const origin = deps.window.origin()
    await deps.window.hide()
    try {
      const target = screenOf(await screen.list(), origin)
      const shot =
        target === undefined
          ? 'not-found'
          : await screen.capture({ screen: target.id, region: null })
      if (shot === 'not-found')
        return json(409, { reason: 'failed', detail: '这块屏幕在截图时不见了' })
      return new Response(shot.png.slice(), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'no-store',
          'x-omne-taken-at': String(deps.now()),
        },
      })
    } catch {
      return json(500, { reason: 'failed', detail: '屏幕后端出错' })
    } finally {
      deps.window.show()
    }
  }

  async function settings(): Promise<Response> {
    if (deps.openSettings === null) return json(404, { reason: 'unavailable' })
    await deps.openSettings()
    return new Response(null, { status: 204 })
  }

  return request => {
    const path = new URL(request.url).pathname
    if (!path.startsWith(DEVICE)) return undefined
    if (path === DEVICE_SCREEN && request.method === 'GET')
      return backend().then(screen => json(200, { available: screen !== undefined }))
    if (path === DEVICE_SCREEN && request.method === 'POST') return capture()
    if (path === `${DEVICE_SCREEN}/settings` && request.method === 'POST') return settings()
    return Promise.resolve(json(404, { reason: 'not-found' }))
  }
}
