import type { Monitor, ScreenBackend } from '@omne-harness/screen'

export const DEVICE_SCREEN = '/device/screen'
const DEVICE = '/device/'
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export type DeviceScreenDeps = Readonly<{
  /** The screen backend of this machine, the one agent screenshots use; nothing where the system has none. */
  backend: () => Promise<ScreenBackend | undefined>
  window: Readonly<{
    /** Resolves once the app is out of sight. */
    hide(): Promise<void>
    show(): void
  }>
  /** One overlay per screen for one capture; `gone` names the screen whose overlay went away, `lock` shuts out all but one. */
  overlays: Readonly<{
    open(screens: readonly Monitor[], capture: number, gone: (screen: string) => void): void
    lock(screen: string): void
    close(): void
  }>
  /** Asks the system for the screen recording permission, which lists the app in its settings; null where there is no such thing. */
  requestAccess: (() => Promise<void>) | null
  openSettings: (() => Promise<void>) | null
  now: () => number
}>

type Choice =
  | Readonly<{ kind: 'picture'; png: Uint8Array<ArrayBuffer> }>
  | Readonly<{ kind: 'cancel' }>

type Ticket = Readonly<{ screen: string; capture: number }>

type Choosing = Readonly<{
  capture: number
  frames: ReadonlyMap<string, Uint8Array>
  takenAt: number
  active: string | null
  settle: (choice: Choice) => void
}>

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const png = (bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
  new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store', ...headers },
  })

const isPng = (bytes: Uint8Array) => PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)

function ticketOf(url: URL): Ticket | null {
  const screen = url.searchParams.get('screen') ?? ''
  const capture = Number(url.searchParams.get('capture'))
  return screen !== '' && Number.isSafeInteger(capture) && capture > 0 ? { screen, capture } : null
}

/** Answers the page's requests under /device/ on this machine; every other path is the forwarding's. */
export function deviceScreenRoute(
  deps: DeviceScreenDeps,
): (request: Request) => Promise<Response> | undefined {
  let loading: Promise<ScreenBackend | undefined> | undefined
  let choosing: Choosing | null = null
  let captures = 0
  const backend = () => (loading ??= deps.backend().catch(() => undefined))
  const current = (ticket: Ticket | null): Choosing | null =>
    ticket !== null && choosing?.capture === ticket.capture ? choosing : null
  const mayAnswer = (open: Choosing, screen: string) =>
    open.active === null || open.active === screen

  async function freeze(screen: ScreenBackend, screens: readonly Monitor[]) {
    const frames = new Map<string, Uint8Array>()
    for (const each of screens) {
      const shot = await screen.capture({ screen: each.id, region: null })
      if (shot === 'not-found') return 'not-found'
      frames.set(each.id, shot.png)
    }
    return frames
  }

  async function choose(screen: ScreenBackend): Promise<Response> {
    const screens = await screen.list()
    const frames = await freeze(screen, screens)
    if (frames === 'not-found')
      return json(409, { reason: 'failed', detail: '这块屏幕在截图时不见了' })
    const takenAt = deps.now()
    const capture = (captures += 1)
    const choice = await new Promise<Choice>(settle => {
      choosing = { capture, frames, takenAt, active: null, settle }
      deps.overlays.open(screens, capture, screen => {
        const open = current({ screen, capture })
        if (open !== null && mayAnswer(open, screen)) open.settle({ kind: 'cancel' })
      })
    })
    if (choice.kind === 'cancel') return new Response(null, { status: 204 })
    return png(choice.png, { 'x-omne-taken-at': String(takenAt) })
  }

  async function capture(): Promise<Response> {
    if (choosing !== null) return json(409, { reason: 'busy' })
    const screen = await backend()
    if (screen === undefined) return json(404, { reason: 'unavailable' })
    if ((await screen.permission()) === 'unsatisfied') {
      await deps.requestAccess?.()
      return json(403, { reason: 'not-authorized' })
    }
    await deps.window.hide()
    try {
      return await choose(screen)
    } catch {
      return json(500, { reason: 'failed', detail: '屏幕后端出错' })
    } finally {
      if (choosing !== null) deps.overlays.close()
      choosing = null
      deps.window.show()
    }
  }

  function frame(url: URL): Response {
    const ticket = ticketOf(url)
    const bytes = ticket === null ? undefined : current(ticket)?.frames.get(ticket.screen)
    return bytes === undefined ? json(404, { reason: 'not-found' }) : png(bytes.slice())
  }

  function active(url: URL): Response {
    const ticket = ticketOf(url)
    const open = current(ticket)
    if (ticket === null || open === null) return json(409, { reason: 'not-choosing' })
    if (open.active === null) {
      choosing = { ...open, active: ticket.screen }
      deps.overlays.lock(ticket.screen)
    }
    return new Response(null, { status: 204 })
  }

  // The body is read first: checking and settling then happen in one step, as the model's Deliver does.
  async function chosen(request: Request, url: URL): Promise<Response> {
    const bytes = new Uint8Array(await request.arrayBuffer())
    const ticket = ticketOf(url)
    const open = current(ticket)
    if (ticket === null || open === null) return json(409, { reason: 'not-choosing' })
    if (!mayAnswer(open, ticket.screen)) return json(409, { reason: 'not-in-use' })
    if (bytes.byteLength > 0 && !isPng(bytes)) return json(400, { reason: 'not-a-png' })
    open.settle(bytes.byteLength === 0 ? { kind: 'cancel' } : { kind: 'picture', png: bytes })
    return new Response(null, { status: 204 })
  }

  async function settings(): Promise<Response> {
    if (deps.openSettings === null) return json(404, { reason: 'unavailable' })
    await deps.openSettings()
    return new Response(null, { status: 204 })
  }

  return request => {
    const url = new URL(request.url)
    const path = url.pathname
    if (!path.startsWith(DEVICE)) return undefined
    const route = `${request.method} ${path}`
    if (route === `GET ${DEVICE_SCREEN}`)
      return backend().then(screen => json(200, { available: screen !== undefined }))
    if (route === `POST ${DEVICE_SCREEN}`) return capture()
    if (route === `GET ${DEVICE_SCREEN}/frame`) return Promise.resolve(frame(url))
    if (route === `POST ${DEVICE_SCREEN}/active`) return Promise.resolve(active(url))
    if (route === `POST ${DEVICE_SCREEN}/choice`) return chosen(request, url)
    if (route === `POST ${DEVICE_SCREEN}/settings`) return settings()
    return Promise.resolve(json(404, { reason: 'not-found' }))
  }
}
