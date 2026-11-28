import { describe, expect, it } from 'vitest'
import {
  diagnoseScreen,
  macosRequestScreenAccess,
  macosScreenPermission,
  screenBackendFor,
  windowBackendFor,
  type WindowSources,
} from '@omne-harness/screen'
import {
  libraryOf,
  MACOS_RECORDED,
  MACOS_TWO_SCREENS,
  PIXELS_TWO_SCREENS,
} from './fixtures/libraries.ts'
import {
  libraryWindowOf,
  MACOS_RECORDED_WINDOWS,
  MACOS_WINDOWS_WITHOUT_PERMISSION,
  macosOverScene,
} from './fixtures/windows.ts'

const loaded = async () => libraryOf(MACOS_RECORDED).library
const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv

describe('the permission of macOS to read the screen, asked of the system', () => {
  const asked = (answer: () => Promise<string>) => macosScreenPermission(answer)()

  it.each([
    ['true\n', 'satisfied'],
    ['false\n', 'unsatisfied'],
    ['', 'unknown'],
    ['maybe', 'unknown'],
  ])('the system answering %j is %s', async (stdout, permission) => {
    expect(await asked(async () => stdout)).toBe(permission)
  })

  it('is unknown, not satisfied, when the system cannot be asked', async () => {
    expect(await asked(() => Promise.reject(new Error('no osascript')))).toBe('unknown')
  })

  it('asks again after an answer that was not satisfied, and keeps a satisfied one', async () => {
    const answers = ['false', 'true', 'false']
    let calls = 0
    const permission = macosScreenPermission(async () => answers[calls++] ?? 'false')
    expect([await permission(), await permission(), await permission()]).toEqual([
      'unsatisfied',
      'satisfied',
      'satisfied',
    ])
    expect(calls).toBe(2)
  })
})

describe('asking macOS for the permission to read the screen', () => {
  it('asks the system with its own scripting tool to request the permission, which shows its prompt and lists the app', async () => {
    const scripts: string[] = []
    await macosRequestScreenAccess(async script => {
      scripts.push(script)
      return 'false'
    })
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain('CGRequestScreenCaptureAccess')
  })

  it('does not fail when the system cannot be asked', async () => {
    await expect(
      macosRequestScreenAccess(() => Promise.reject(new Error('no osascript'))),
    ).resolves.toBeUndefined()
  })
})

describe('the backend is chosen by the operating system', () => {
  it('macOS: the library in logical points, the permission asked of the system, verified on a device', async () => {
    const backend = await screenBackendFor('darwin', { load: loaded, ask: async () => 'false' })
    expect(backend).toMatchObject({ name: 'node-screenshots/darwin', verification: 'device' })
    expect(await backend?.permission()).toBe('unsatisfied')
    expect(await backend?.list()).toMatchObject([{ id: '2', pixels: { width: 1024, height: 768 } }])
  })

  it('Windows: no permission to ask for; the backend passed the contract suite only', async () => {
    const backend = await screenBackendFor('win32', { load: loaded })
    expect(backend).toMatchObject({
      name: 'node-screenshots/win32',
      verification: 'contract-suite',
    })
    expect(await backend?.permission()).toBe('satisfied')
  })

  it('Linux: satisfied on an X display, unknown elsewhere', async () => {
    const on = (environment: NodeJS.ProcessEnv) =>
      screenBackendFor('linux', { load: loaded, env: environment }).then(backend =>
        backend?.permission(),
      )
    expect(await on(env({ DISPLAY: ':0' }))).toBe('satisfied')
    expect(await on(env({ DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' }))).toBe('unknown')
    expect(await on(env({}))).toBe('unknown')
    const backend = await screenBackendFor('linux', { load: loaded, env: env({}) })
    expect(backend).toMatchObject({
      name: 'node-screenshots/linux',
      verification: 'contract-suite',
    })
  })

  it('reads the sizes the library gives as logical points on macOS and as pixels elsewhere', async () => {
    const sizes = async (platform: NodeJS.Platform, raws: Parameters<typeof libraryOf>[0]) => {
      const load = async () => libraryOf(raws).library
      const backend = await screenBackendFor(platform, { load, env: env({ DISPLAY: ':0' }) })
      return (await backend!.list()).map(monitor => monitor.pixels)
    }
    expect((await sizes('darwin', MACOS_TWO_SCREENS))[0]).toEqual({ width: 3024, height: 1964 })
    const given = PIXELS_TWO_SCREENS.map(raw => ({ width: raw.width, height: raw.height }))
    expect(await sizes('win32', PIXELS_TWO_SCREENS)).toEqual(given)
    expect(await sizes('linux', PIXELS_TWO_SCREENS)).toEqual(given)
  })

  it('a system with no backend, and a system whose library does not load, have none', async () => {
    expect(await screenBackendFor('freebsd', { load: loaded })).toBeUndefined()
    expect(await screenBackendFor('darwin', { load: async () => undefined })).toBeUndefined()
    const throwing = () => Promise.reject(new Error('no prebuilt binary'))
    expect(await screenBackendFor('linux', { load: throwing })).toBeUndefined()
  })
})

describe('the diagnosis one runs on a machine', () => {
  it('says the backend, how it was verified, the permission, the check and the screens', async () => {
    expect(await diagnoseScreen('darwin', { load: loaded, ask: async () => 'true' })).toEqual({
      platform: 'darwin',
      backend: 'node-screenshots/darwin',
      verification: 'device',
      permission: 'satisfied',
      check: { kind: 'passed' },
      screens: [
        {
          id: '2',
          name: 'AWS Nitro D-1',
          primary: true,
          pixels: { width: 1024, height: 768 },
          scale: 1,
          origin: { x: 0, y: 0 },
        },
      ],
    })
  })

  it('lists no screen, and says the check could not be done, when the library cannot list', async () => {
    const load = async () => ({
      monitors: (): never => {
        throw new Error('no display')
      },
    })
    expect(await diagnoseScreen('win32', { load })).toMatchObject({
      backend: 'node-screenshots/win32',
      check: { kind: 'unknown', reason: 'the screens cannot be listed: no display' },
      screens: [],
    })
  })

  it('says so when the system has no backend', async () => {
    expect(await diagnoseScreen('freebsd', { load: loaded })).toEqual({
      platform: 'freebsd',
      backend: null,
    })
  })
})

describe('the window backend is chosen by the operating system', () => {
  it('macOS has one, verified on a device; no other system has one', async () => {
    const { backend } = await macosOverScene({ windows: [], permission: 'satisfied' })
    expect(backend).toMatchObject({ name: 'core-graphics/darwin', verification: 'device' })
    for (const platform of ['win32', 'linux', 'freebsd'] as const)
      expect(await windowBackendFor(platform)).toBeUndefined()
  })

  it('macOS has none when its screenshot library does not load', async () => {
    expect(await windowBackendFor('darwin', { load: async () => undefined })).toBeUndefined()
    const throwing = () => Promise.reject(new Error('no prebuilt binary'))
    expect(await windowBackendFor('darwin', { load: throwing })).toBeUndefined()
  })
})

describe('the windows of macOS, read from CGWindowListCopyWindowInfo', () => {
  const printing = (rows: unknown, scripts: string[] = []): WindowSources => ({
    run: async script => {
      scripts.push(script)
      return `${JSON.stringify(rows)}\n`
    },
    load: async () => ({ windows: () => [] }),
  })
  const listed = async (sources: WindowSources) =>
    (await windowBackendFor('darwin', sources))!.list()

  it('asks the system for the windows on the screen, without the desktop elements', async () => {
    const scripts: string[] = []
    await listed(printing([], scripts))
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain('CGWindowListCopyWindowInfo')
    expect(scripts[0]).toContain('kCGWindowListOptionOnScreenOnly')
    expect(scripts[0]).toContain('kCGWindowListExcludeDesktopElements')
  })

  it('reads a recorded listing: the windows of the normal layer in the order the system gave', async () => {
    expect(await listed(printing(MACOS_RECORDED_WINDOWS))).toEqual([
      {
        id: '44276',
        pid: 39828,
        app: 'System Settings',
        title: '',
        bounds: { x: 918, y: 649, width: 740, height: 625 },
      },
      {
        id: '42098',
        pid: 1316,
        app: 'Finder',
        title: 'Downloads',
        bounds: { x: 682, y: 195, width: 1440, height: 1050 },
      },
      {
        id: '21207',
        pid: 12775,
        app: 'Music',
        title: 'Music',
        bounds: { x: 738, y: 410, width: 980, height: 600 },
      },
    ])
  })

  it('gives every title empty when the system gives no names, as it does without the permission', async () => {
    const answer = await listed(printing(MACOS_WINDOWS_WITHOUT_PERMISSION))
    expect(answer.map(window => [window.app, window.title])).toEqual([
      ['System Settings', ''],
      ['Finder', ''],
      ['Music', ''],
    ])
  })

  it('leaves out a row it cannot read, and fails on what is no list of windows', async () => {
    const [, , , settings] = MACOS_RECORDED_WINDOWS
    const broken = [
      { ...settings, kCGWindowNumber: undefined },
      { ...settings, kCGWindowAlpha: 'opaque' },
      { ...settings, kCGWindowBounds: { X: 0, Y: 0, Width: 10 } },
      { ...settings, kCGWindowIsOnscreen: undefined },
    ]
    expect(await listed(printing(broken))).toEqual([])
    await expect(listed(printing({ windows: [] }))).rejects.toThrow('no list of windows')
    const garbled = { ...printing([]), run: async () => 'execution error' }
    await expect(listed(garbled)).rejects.toThrow()
  })
})

describe('a listing of the windows counts as now for 350 milliseconds', () => {
  const window = { id: '7', pid: 1, app: 'A', title: 'T', layer: 0, opacity: 1, onScreen: true }
  const scene = (permission: 'satisfied' = 'satisfied') => ({
    windows: [{ ...window, bounds: { x: 0, y: 0, width: 10, height: 10 }, scale: 2 }],
    permission,
  })

  it('asks the system again only after 350 milliseconds', async () => {
    const clock = { at: 1000 }
    const { backend, scripts } = await macosOverScene(scene(), clock)
    await backend.list()
    clock.at = 1349
    await backend.list()
    await backend.capture('7')
    expect(scripts).toHaveLength(1)
    clock.at = 1350
    await backend.list()
    expect(scripts).toHaveLength(2)
  })

  it('asks once for calls that come while the system is being asked', async () => {
    const { backend, scripts } = await macosOverScene(scene())
    await Promise.all([backend.list(), backend.list(), backend.capture('7')])
    expect(scripts).toHaveLength(1)
  })

  it('keeps no failure: the next call asks the system again', async () => {
    const clock = { at: 0 }
    let calls = 0
    const backend = await windowBackendFor('darwin', {
      run: async () => {
        calls += 1
        if (calls === 1) throw new Error('osascript failed')
        return '[]'
      },
      load: async () => ({ windows: () => [] }),
      now: () => clock.at,
    })
    await expect(backend!.list()).rejects.toThrow('osascript failed')
    expect(await backend!.list()).toEqual([])
    expect(calls).toBe(2)
  })
})

describe('the capture of a macOS window', () => {
  it('answers not-found when the window is listed and gone from the library by the time it is taken', async () => {
    const [front] = MACOS_RECORDED_WINDOWS.slice(3)
    const backend = await windowBackendFor('darwin', {
      run: async () => JSON.stringify([front]),
      load: async () => ({ windows: () => [] }),
      ask: async () => 'true',
    })
    expect(await backend!.list()).toHaveLength(1)
    expect(await backend!.capture('44276')).toBe('not-found')
  })

  it('asks the permission anew at every capture: taken away while the app runs, the next one hands out no picture', async () => {
    let answer = 'true'
    const window = {
      id: '44276',
      pid: 1,
      app: 'A',
      title: '',
      layer: 0,
      opacity: 1,
      onScreen: true,
    }
    const bounds = { x: 918, y: 649, width: 740, height: 625 }
    const backend = await windowBackendFor('darwin', {
      run: async () => JSON.stringify([MACOS_RECORDED_WINDOWS[3]]),
      load: async () => ({ windows: () => [libraryWindowOf({ ...window, scale: 2, bounds })] }),
      ask: async () => answer,
    })
    expect(await backend!.capture('44276')).toMatchObject({ width: 1480 })
    answer = 'false'
    expect(await backend!.capture('44276')).toBe('not-authorized')
  })

  it('takes the place of the window and the scale of its screen from the library when it is taken', async () => {
    const at = { x: 918, y: 649, width: 740, height: 625 }
    const moved = { x: 10, y: 20, width: 740, height: 625 }
    const window = {
      id: '44276',
      pid: 1,
      app: 'A',
      title: '',
      layer: 0,
      opacity: 1,
      onScreen: true,
      scale: 2,
    }
    const backend = await windowBackendFor('darwin', {
      run: async () => JSON.stringify([MACOS_RECORDED_WINDOWS[3]]),
      load: async () => ({ windows: () => [libraryWindowOf({ ...window, bounds: moved })] }),
      ask: async () => 'true',
    })
    expect((await backend!.list())[0]?.bounds).toEqual(at)
    expect(await backend!.capture('44276')).toMatchObject({
      width: 1480,
      height: 1250,
      scale: 2,
      bounds: moved,
    })
  })
})
