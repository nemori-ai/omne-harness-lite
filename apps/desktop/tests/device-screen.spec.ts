import type { Monitor, ScreenBackend, ScreenPermission, Shot } from '@omne-harness/screen'
import { describe, expect, it, vi } from 'vitest'
import { deviceScreenRoute, type DeviceScreenDeps } from '../src/main/device-screen.ts'

const APP = 'app://omne'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])
const CHOSEN = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9])

const monitor = (id: string, primary: boolean, x: number): Monitor => ({
  id,
  name: id,
  primary,
  pixels: { width: 100, height: 50 },
  scale: 1,
  origin: { x, y: 0 },
})
const SCREENS = [monitor('main', true, 0), monitor('side', false, -100)]

type Log = string[]

function backendOf(
  log: Log,
  permission: ScreenPermission = 'satisfied',
  capture: (screen: string) => Promise<Shot | 'not-found'> = async screen => ({
    width: 100,
    height: 50,
    png: new Uint8Array([...PNG, screen.length]),
  }),
): ScreenBackend {
  return {
    name: 'fake',
    verification: 'contract-suite',
    permission: async () => permission,
    list: async () => {
      log.push('list')
      return SCREENS
    },
    capture: async ({ screen, region }) => {
      log.push(`capture ${screen} ${String(region)}`)
      return capture(screen)
    },
  }
}

/** Overlays that record what they were asked; `gone` stands for the overlay on one screen going away from outside. */
function overlaysOf(log: Log) {
  let gone: (screen: string) => void = () => undefined
  const overlays: DeviceScreenDeps['overlays'] = {
    open: (screens, capture, whenGone) => {
      log.push(`open ${screens.map(each => each.id).join(',')} #${String(capture)}`)
      gone = whenGone
    },
    lock: screen => void log.push(`lock ${screen}`),
    close: () => void log.push('close'),
  }
  return { overlays, gone: (screen: string) => gone(screen) }
}

function depsOf(log: Log, overrides: Partial<DeviceScreenDeps> = {}): DeviceScreenDeps {
  return {
    backend: async () => backendOf(log),
    window: { hide: async () => void log.push('hide'), show: () => void log.push('show') },
    overlays: overlaysOf(log).overlays,
    requestAccess: async () => void log.push('request access'),
    openSettings: async () => void log.push('open settings'),
    now: () => 1_700_000_000_000,
    ...overrides,
  }
}

const call = (
  route: ReturnType<typeof deviceScreenRoute>,
  method: string,
  path: string,
  body?: Uint8Array,
) =>
  route(
    new Request(`${APP}${path}`, {
      method,
      ...(body === undefined ? {} : { body: body.slice() }),
    }),
  )

/** Starts a capture and waits until its overlays are open; the answer comes once the person chose. */
async function choosing(route: ReturnType<typeof deviceScreenRoute>, log: Log, capture = 1) {
  const answer = call(route, 'POST', '/device/screen')
  await vi.waitFor(() => expect(log).toContain(`open main,side #${String(capture)}`))
  return { answer }
}

/** The query an overlay page sends with every request: its screen and the capture that opened it. */
const of = (screen: string, capture = 1) => `?screen=${screen}&capture=${String(capture)}`

describe('the device screen route', () => {
  it('leaves every path outside /device/ to the forwarding', () => {
    const route = deviceScreenRoute(depsOf([]))
    expect(call(route, 'GET', '/api/protocols')).toBeUndefined()
    expect(call(route, 'POST', '/devices')).toBeUndefined()
  })

  it('says whether this machine has a screen backend, loading it once', async () => {
    const backend = vi.fn(async () => backendOf([]))
    const route = deviceScreenRoute(depsOf([], { backend }))
    expect(await (await call(route, 'GET', '/device/screen'))?.json()).toEqual({ available: true })
    await call(route, 'GET', '/device/screen')
    expect(backend).toHaveBeenCalledTimes(1)
    const none = deviceScreenRoute(depsOf([], { backend: async () => undefined }))
    expect(await (await call(none, 'GET', '/device/screen'))?.json()).toEqual({ available: false })
    const broken = deviceScreenRoute(
      depsOf([], { backend: () => Promise.reject(new Error('no binary')) }),
    )
    expect(await (await call(broken, 'GET', '/device/screen'))?.json()).toEqual({
      available: false,
    })
  })

  it('gets out of the way, freezes every screen, opens a numbered overlay on each and answers the picture the person chose', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    const { answer } = await choosing(route, log)
    expect(log).toEqual([
      'hide',
      'list',
      'capture main null',
      'capture side null',
      'open main,side #1',
    ])
    const frame = await call(route, 'GET', `/device/screen/frame${of('side')}`)
    expect(frame?.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await frame!.arrayBuffer())).toEqual(new Uint8Array([...PNG, 4]))
    expect((await call(route, 'POST', `/device/screen/active${of('main')}`))?.status).toBe(204)
    expect(log.at(-1)).toBe('lock main')
    expect((await call(route, 'POST', `/device/screen/choice${of('main')}`, CHOSEN))?.status).toBe(
      204,
    )
    const done = await answer
    expect(done?.status).toBe(200)
    expect(done?.headers.get('x-omne-taken-at')).toBe('1700000000000')
    expect(new Uint8Array(await done!.arrayBuffer())).toEqual(CHOSEN)
    expect(log.slice(-2)).toEqual(['close', 'show'])
  })

  it('answers nothing and comes back when the person cancels, or the overlay in use goes away', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    const { answer: cancelled } = await choosing(route, log)
    await call(route, 'POST', `/device/screen/choice${of('side')}`, new Uint8Array())
    expect((await cancelled)?.status).toBe(204)
    expect(log.slice(-2)).toEqual(['close', 'show'])
    log.length = 0
    const { overlays, gone } = overlaysOf(log)
    const closing = deviceScreenRoute(depsOf(log, { overlays }))
    const { answer: lost } = await choosing(closing, log)
    gone('main')
    expect((await lost)?.status).toBe(204)
    expect(log.slice(-2)).toEqual(['close', 'show'])
  })

  it('takes one capture at a time; frames, reports and choices outside it are refused', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    expect((await call(route, 'GET', `/device/screen/frame${of('main')}`))?.status).toBe(404)
    expect((await call(route, 'POST', `/device/screen/active${of('main')}`))?.status).toBe(409)
    expect((await call(route, 'POST', `/device/screen/choice${of('main')}`, CHOSEN))?.status).toBe(
      409,
    )
    const { answer: first } = await choosing(route, log)
    expect((await call(route, 'POST', '/device/screen'))?.status).toBe(409)
    expect((await call(route, 'GET', `/device/screen/frame${of('gone')}`))?.status).toBe(404)
    expect((await call(route, 'GET', '/device/screen/frame?screen=main'))?.status).toBe(404)
    expect((await call(route, 'GET', '/device/screen/frame?screen=main&capture=x'))?.status).toBe(
      404,
    )
    expect((await call(route, 'POST', '/device/screen/choice?screen=main', CHOSEN))?.status).toBe(
      409,
    )
    expect(
      (await call(route, 'POST', `/device/screen/choice${of('main')}`, new Uint8Array([1, 2])))
        ?.status,
    ).toBe(400)
    await call(route, 'POST', `/device/screen/choice${of('main')}`, CHOSEN)
    expect((await first)?.status).toBe(200)
    expect((await call(route, 'GET', `/device/screen/frame${of('main')}`))?.status).toBe(404)
  })

  it('answers each capture once: a second choice after it settled is refused', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    const { answer } = await choosing(route, log)
    await call(route, 'POST', `/device/screen/choice${of('main')}`, CHOSEN)
    expect(
      (await call(route, 'POST', `/device/screen/choice${of('side')}`, new Uint8Array()))?.status,
    ).toBe(409)
    const done = await answer
    expect(done?.status).toBe(200)
    expect(new Uint8Array(await done!.arrayBuffer())).toEqual(CHOSEN)
  })

  it('takes answers only from the overlays this capture opened, never a late one from an earlier capture', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    const { answer: first } = await choosing(route, log)
    await call(route, 'POST', `/device/screen/choice${of('main')}`, new Uint8Array())
    await first
    const { answer: second } = await choosing(route, log, 2)
    expect((await call(route, 'POST', `/device/screen/active${of('main', 1)}`))?.status).toBe(409)
    expect(
      (await call(route, 'POST', `/device/screen/choice${of('main', 1)}`, CHOSEN))?.status,
    ).toBe(409)
    expect((await call(route, 'GET', `/device/screen/frame${of('main', 1)}`))?.status).toBe(404)
    expect(log).not.toContain('lock main')
    await call(route, 'POST', `/device/screen/choice${of('side', 2)}`, CHOSEN)
    expect((await second)?.status).toBe(200)
  })

  it('once a screen is in use, shuts the others out and takes no answer from them', async () => {
    const log: Log = []
    const { overlays, gone } = overlaysOf(log)
    const route = deviceScreenRoute(depsOf(log, { overlays }))
    const { answer } = await choosing(route, log)
    await call(route, 'POST', `/device/screen/active${of('main')}`)
    expect((await call(route, 'POST', `/device/screen/active${of('side')}`))?.status).toBe(204)
    expect(log.filter(line => line.startsWith('lock'))).toEqual(['lock main'])
    expect((await call(route, 'POST', `/device/screen/choice${of('side')}`, CHOSEN))?.status).toBe(
      409,
    )
    gone('side')
    expect(log).not.toContain('close')
    await call(route, 'POST', `/device/screen/choice${of('main')}`, CHOSEN)
    expect((await answer)?.status).toBe(200)
  })

  it('without the permission it asks the system once, stays in place and opens nothing', async () => {
    const log: Log = []
    const route = deviceScreenRoute(
      depsOf(log, { backend: async () => backendOf(log, 'unsatisfied') }),
    )
    const answer = await call(route, 'POST', '/device/screen')
    expect(answer?.status).toBe(403)
    expect(await answer?.json()).toEqual({ reason: 'not-authorized' })
    expect(log).toEqual(['request access'])
  })

  it('comes back and says so when freezing a screen fails, without opening any overlay', async () => {
    const log: Log = []
    const thrown = deviceScreenRoute(
      depsOf(log, {
        backend: async () => backendOf(log, 'unknown', () => Promise.reject(new Error('x'))),
      }),
    )
    const failed = await call(thrown, 'POST', '/device/screen')
    expect(failed?.status).toBe(500)
    expect(await failed?.json()).toEqual({ reason: 'failed', detail: '屏幕后端出错' })
    expect(log).toEqual(['hide', 'list', 'capture main null', 'show'])
    log.length = 0
    const gone = deviceScreenRoute(
      depsOf(log, { backend: async () => backendOf(log, 'satisfied', async () => 'not-found') }),
    )
    const missing = await call(gone, 'POST', '/device/screen')
    expect(missing?.status).toBe(409)
    expect(await missing?.json()).toEqual({ reason: 'failed', detail: '这块屏幕在截图时不见了' })
    expect(log).toEqual(['hide', 'list', 'capture main null', 'show'])
  })

  it('answers no backend and unknown device paths without touching the window', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log, { backend: async () => undefined }))
    const answer = await call(route, 'POST', '/device/screen')
    expect(answer?.status).toBe(404)
    expect(await answer?.json()).toEqual({ reason: 'unavailable' })
    expect((await call(route, 'GET', '/device/camera'))?.status).toBe(404)
    expect(log).toEqual([])
  })

  it('opens the screen recording settings where the system has them', async () => {
    const log: Log = []
    const answer = await call(deviceScreenRoute(depsOf(log)), 'POST', '/device/screen/settings')
    expect(answer?.status).toBe(204)
    expect(log).toEqual(['open settings'])
    const none = await call(
      deviceScreenRoute(depsOf(log, { openSettings: null })),
      'POST',
      '/device/screen/settings',
    )
    expect(none?.status).toBe(404)
  })
})
