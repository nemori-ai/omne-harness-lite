import type { Region } from './backend.ts'
import { macosScreenPermission, runMacos } from './platforms.ts'
import { windowLibraryBackend, type WindowLibrary } from './window-library.ts'
import { listable, type ScreenWindow, type WindowBackend } from './windows.ts'

const ON_SCREEN = `ObjC.import("CoreGraphics"); JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject(
  $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID))))`

/** How long a listing of the windows counts as now, in milliseconds. */
export const FRESH_FOR = 350

type Row = Readonly<Record<string, unknown>>
const numberIn = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const textIn = (value: unknown) => (typeof value === 'string' ? value : '')

function boundsIn(value: unknown): Region | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { X, Y, Width, Height } = value as Row
  const [x, y, width, height] = [X, Y, Width, Height].map(numberIn)
  if (x === undefined || y === undefined || width === undefined || height === undefined)
    return undefined
  return { x, y, width, height }
}

function windowIn(row: Row): ScreenWindow | undefined {
  const id = numberIn(row['kCGWindowNumber'])
  const pid = numberIn(row['kCGWindowOwnerPID'])
  const layer = numberIn(row['kCGWindowLayer'])
  const opacity = numberIn(row['kCGWindowAlpha'])
  const bounds = boundsIn(row['kCGWindowBounds'])
  if (id === undefined || pid === undefined || layer === undefined || opacity === undefined)
    return undefined
  if (bounds === undefined) return undefined
  if (!listable({ layer, opacity, onScreen: row['kCGWindowIsOnscreen'] === true })) return undefined
  const app = textIn(row['kCGWindowOwnerName'])
  return { id: String(id), pid, app, title: textIn(row['kCGWindowName']), bounds }
}

/** The windows of what `CGWindowListCopyWindowInfo` printed, in its order; a row that cannot be read is left out. */
export function macosWindowsIn(printed: string): readonly ScreenWindow[] {
  const rows: unknown = JSON.parse(printed)
  if (!Array.isArray(rows)) throw new Error('the system printed no list of windows')
  return rows.flatMap((row: Row) => windowIn(row) ?? [])
}

function freshFor<T>(fetch: () => Promise<T>, now: () => number): () => Promise<T> {
  let held: Readonly<{ at: number; answer: Promise<T> }> | undefined
  return () => {
    const at = now()
    if (held !== undefined && at - held.at < FRESH_FOR) return held.answer
    const entry = { at, answer: fetch() }
    held = entry
    entry.answer.catch(() => {
      if (held === entry) held = undefined
    })
    return entry.answer
  }
}

async function loadLibrary(): Promise<WindowLibrary | undefined> {
  const { Window: windows } = await import('node-screenshots')
  return { windows: () => windows.all() }
}

export type WindowSources = Readonly<{
  run?: (script: string) => Promise<string>
  load?: () => Promise<WindowLibrary | undefined>
  ask?: () => Promise<string>
  now?: () => number
}>

/** The window backend of a system, or none: only macOS has one. */
export async function windowBackendFor(
  platform: NodeJS.Platform,
  sources: WindowSources = {},
): Promise<WindowBackend | undefined> {
  if (platform !== 'darwin') return undefined
  let library: WindowLibrary | undefined
  try {
    library = await (sources.load ?? loadLibrary)()
  } catch {
    return undefined
  }
  if (library === undefined) return undefined
  const loaded = library
  const run = sources.run ?? runMacos
  return windowLibraryBackend({
    name: 'core-graphics/darwin',
    verification: 'device',
    list: freshFor(
      async () => macosWindowsIn(await run(ON_SCREEN)),
      sources.now ??
        (() =>
          /* wall-clock: operation-timing -- how old a listing of the windows is, a monotonic duration */ performance.now()),
    ),
    library: () => loaded,
    permission: () => macosScreenPermission(sources.ask)(),
  })
}
