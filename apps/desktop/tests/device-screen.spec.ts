import type { Monitor, ScreenBackend, ScreenPermission, Shot } from '@omne-harness/screen'
import { describe, expect, it, vi } from 'vitest'
import { deviceScreenRoute, type DeviceScreenDeps } from '../src/main/device-screen.ts'

const APP = 'app://omne'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])

const monitor = (id: string, primary: boolean, x: number, y: number): Monitor => ({
  id,
  name: id,
  primary,
  pixels: { width: 100, height: 50 },
  scale: 2,
  origin: { x, y },
})
const SCREENS = [monitor('main', true, 0, 0), monitor('side', false, -1080, 0)]

type Log = string[]

function backendOf(
  log: Log,
  permission: ScreenPermission = 'satisfied',
  capture: (screen: string) => Promise<Shot | 'not-found'> = async () => ({
    width: 100,
    height: 50,
    png: PNG,
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

function depsOf(log: Log, overrides: Partial<DeviceScreenDeps> = {}): DeviceScreenDeps {
  return {
    backend: async () => backendOf(log),
    window: {
      origin: () => ({ x: -1080, y: 0 }),
      hide: async () => void log.push('hide'),
      show: () => void log.push('show'),
    },
    requestAccess: async () => void log.push('request access'),
    openSettings: async () => void log.push('open settings'),
    now: () => 1_700_000_000_000,
    ...overrides,
  }
}

const call = (route: ReturnType<typeof deviceScreenRoute>, method: string, path: string) =>
  route(new Request(`${APP}${path}`, { method }))

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

  it('gets out of the way, captures the whole screen the window is on, and comes back', async () => {
    const log: Log = []
    const route = deviceScreenRoute(depsOf(log))
    const answer = await call(route, 'POST', '/device/screen')
    expect(answer?.status).toBe(200)
    expect(answer?.headers.get('content-type')).toBe('image/png')
    expect(answer?.headers.get('x-omne-taken-at')).toBe('1700000000000')
    expect(new Uint8Array(await answer!.arrayBuffer())).toEqual(PNG)
    expect(log).toEqual(['hide', 'list', 'capture side null', 'show'])
  })

  it('takes the primary screen when the window is on no screen it lists', async () => {
    const log: Log = []
    const lost = {
      origin: () => null,
      hide: async () => void log.push('hide'),
      show: () => void log.push('show'),
    }
    await call(deviceScreenRoute(depsOf(log, { window: lost })), 'POST', '/device/screen')
    const elsewhere = { ...lost, origin: () => ({ x: 5000, y: 5000 }) }
    await call(deviceScreenRoute(depsOf(log, { window: elsewhere })), 'POST', '/device/screen')
    expect(log.filter(line => line.startsWith('capture'))).toEqual([
      'capture main null',
      'capture main null',
    ])
  })

  it('without the permission it asks the system once, stays in place and gives no picture', async () => {
    const log: Log = []
    const route = deviceScreenRoute(
      depsOf(log, { backend: async () => backendOf(log, 'unsatisfied') }),
    )
    const answer = await call(route, 'POST', '/device/screen')
    expect(answer?.status).toBe(403)
    expect(await answer?.json()).toEqual({ reason: 'not-authorized' })
    expect(log).toEqual(['request access'])
  })

  it('comes back and says so when the capture fails or the screen went away', async () => {
    const log: Log = []
    const thrown = deviceScreenRoute(
      depsOf(log, {
        backend: async () => backendOf(log, 'unknown', () => Promise.reject(new Error('x'))),
      }),
    )
    const failed = await call(thrown, 'POST', '/device/screen')
    expect(failed?.status).toBe(500)
    expect(await failed?.json()).toEqual({ reason: 'failed', detail: '屏幕后端出错' })
    expect(log.at(-1)).toBe('show')
    log.length = 0
    const gone = deviceScreenRoute(
      depsOf(log, { backend: async () => backendOf(log, 'satisfied', async () => 'not-found') }),
    )
    const missing = await call(gone, 'POST', '/device/screen')
    expect(missing?.status).toBe(409)
    expect(await missing?.json()).toEqual({ reason: 'failed', detail: '这块屏幕在截图时不见了' })
    expect(log).toEqual(['hide', 'list', 'capture side null', 'show'])
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
