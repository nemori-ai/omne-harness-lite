import type {
  LibraryWindow,
  WindowBackend,
  WindowLibrary,
  WindowSources,
} from '@omne-harness/screen'
import { windowBackendFor } from '@omne-harness/screen'
import { pngOf, type SceneWindow, type WindowScene } from '@omne-harness/screen/testing'

/** One row as `CGWindowListCopyWindowInfo` gives it; the name is there only with the permission. */
export function cgRowOf(window: SceneWindow, named: boolean): Record<string, unknown> {
  const { id, pid, app, title, layer, opacity, onScreen, bounds } = window
  return {
    ...(named ? { kCGWindowName: title } : {}),
    kCGWindowLayer: layer,
    kCGWindowMemoryUsage: 2432,
    kCGWindowIsOnscreen: onScreen,
    kCGWindowSharingState: 1,
    kCGWindowOwnerPID: pid,
    kCGWindowOwnerName: app,
    kCGWindowNumber: Number(id),
    kCGWindowStoreType: 1,
    kCGWindowBounds: { X: bounds.x, Height: bounds.height, Y: bounds.y, Width: bounds.width },
    kCGWindowAlpha: opacity,
  }
}

export function libraryWindowOf(window: SceneWindow, fails = false): LibraryWindow {
  const { bounds, scale } = window
  const width = bounds.width * scale
  const height = bounds.height * scale
  const image = {
    width,
    height,
    toPng: async () => pngOf(width, height),
  }
  return {
    id: () => Number(window.id),
    x: () => bounds.x,
    y: () => bounds.y,
    width: () => bounds.width,
    height: () => bounds.height,
    currentMonitor: () => ({ scaleFactor: () => scale }),
    captureImage: () =>
      fails ? Promise.reject(new Error('the system cannot capture')) : Promise.resolve(image),
  }
}

const ANSWERS = { satisfied: 'true', unsatisfied: 'false' } as const

export type Clock = { at: number }

/** The macOS backend over stand-ins of the system it calls: the listing script, the library, the permission, the clock. */
export async function macosOverScene(scene: WindowScene, clock: Clock = { at: 0 }) {
  const scripts: string[] = []
  const named = scene.permission === 'satisfied'
  const sources: WindowSources = {
    run: async script => {
      scripts.push(script)
      if (scene.fault === 'list') throw new Error('osascript failed')
      return `${JSON.stringify(scene.windows.map(window => cgRowOf(window, named)))}\n`
    },
    load: async (): Promise<WindowLibrary> => ({
      windows: () => scene.windows.map(each => libraryWindowOf(each, scene.fault === 'capture')),
    }),
    ask: async () => {
      if (scene.permission === 'unknown') throw new Error('osascript failed')
      return ANSWERS[scene.permission]
    },
    now: () => clock.at,
  }
  const backend = await windowBackendFor('darwin', sources)
  if (backend === undefined) throw new Error('macOS has a window backend')
  return { backend: backend satisfies WindowBackend, scripts, sources }
}

const row = (
  id: number,
  pid: number,
  owner: string,
  name: string,
  layer: number,
  [X, Y, Width, Height]: readonly [number, number, number, number],
) => ({
  kCGWindowName: name,
  kCGWindowLayer: layer,
  kCGWindowMemoryUsage: 2432,
  kCGWindowIsOnscreen: true,
  kCGWindowSharingState: 1,
  kCGWindowOwnerPID: pid,
  kCGWindowOwnerName: owner,
  kCGWindowNumber: id,
  kCGWindowStoreType: 1,
  kCGWindowBounds: { X, Height, Y, Width },
  kCGWindowAlpha: 1,
})

/** Recorded on this machine (macOS 27.2.1, arm64) with the permission, trimmed to six rows in their order. */
export const MACOS_RECORDED_WINDOWS: readonly Record<string, unknown>[] = [
  row(45012, 606, 'Window Server', 'StatusIndicator', 2147483630, [-26, 324, 28, 28]),
  row(43087, 606, 'Window Server', 'Menubar', 24, [0, 0, 2560, 30]),
  row(44604, 12257, 'ChatGPT', 'ChatGPT', 3, [-1728, 323, 1728, 1117]),
  row(44276, 39828, 'System Settings', '', 0, [918, 649, 740, 625]),
  row(42098, 1316, 'Finder', 'Downloads', 0, [682, 195, 1440, 1050]),
  row(21207, 12775, 'Music', 'Music', 0, [738, 410, 980, 600]),
]

// NOT recorded: the rows above as the system gives them without the permission (R3 of the design: no layer-0 row has a name).
export const MACOS_WINDOWS_WITHOUT_PERMISSION = MACOS_RECORDED_WINDOWS.map(recorded =>
  Object.fromEntries(Object.entries(recorded).filter(([key]) => key !== 'kCGWindowName')),
)
