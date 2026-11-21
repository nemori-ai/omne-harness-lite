export type ScreenPermission = 'satisfied' | 'unsatisfied' | 'unknown'
export type Size = Readonly<{ width: number; height: number }>
export type Region = Readonly<{ x: number; y: number; width: number; height: number }>

/** One screen: its size in physical pixels, its scale, and its place on the desktop in logical points. */
export type Monitor = Readonly<{
  id: string
  name: string
  primary: boolean
  pixels: Size
  scale: number
  origin: Readonly<{ x: number; y: number }>
}>

export type Shot = Size & Readonly<{ png: Uint8Array }>

/** What every operating system's backend does: the same case maps to the same answer on each. */
export interface ScreenBackend {
  readonly name: string
  /** `device`: checked on a real machine of this system; `contract-suite`: on stand-in calls only. */
  readonly verification: 'device' | 'contract-suite'
  permission(): Promise<ScreenPermission>
  list(): Promise<readonly Monitor[]>
  capture(input: Readonly<{ screen: string; region: Region | null }>): Promise<Shot | 'not-found'>
}

const whole = (value: number) => Number.isSafeInteger(value)
const positive = (value: number) => whole(value) && value > 0

export function regionWithin(region: Region, pixels: Size): boolean {
  const { x, y, width, height } = region
  return (
    whole(x) &&
    whole(y) &&
    x >= 0 &&
    y >= 0 &&
    positive(width) &&
    positive(height) &&
    x + width <= pixels.width &&
    y + height <= pixels.height
  )
}

function monitorProblem(monitor: Monitor): string | null {
  const { id, pixels, scale, origin } = monitor
  if (!positive(pixels.width) || !positive(pixels.height))
    return `screen "${id}" is ${String(pixels.width)}x${String(pixels.height)} pixels`
  if (!Number.isFinite(scale) || scale <= 0) return `screen "${id}" has the scale ${String(scale)}`
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y))
    return `screen "${id}" has no place on the desktop`
  return null
}

/** What does not hold together in a listing of screens, or null. */
export function monitorsProblem(monitors: readonly Monitor[]): string | null {
  if (monitors.length === 0) return 'no screen is listed'
  const seen = new Set<string>()
  for (const { id } of monitors) {
    if (id === '') return 'a screen has no identifier'
    if (seen.has(id)) return `the identifier "${id}" is listed twice`
    seen.add(id)
  }
  const primaries = monitors.filter(monitor => monitor.primary).length
  if (primaries !== 1) return `${String(primaries)} screens are primary, not exactly one`
  return monitors.map(monitorProblem).find(problem => problem !== null) ?? null
}

export type SelfCheck =
  | Readonly<{ kind: 'passed' }>
  | Readonly<{ kind: 'failed' | 'unknown'; reason: string }>

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
function declared(png: Uint8Array): Size | undefined {
  if (png.byteLength < 24 || PNG.some((byte, at) => png[at] !== byte)) return undefined
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
const sized = ({ width, height }: Size) => `${String(width)}x${String(height)}`
const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

function shotProblem(shot: Shot, monitor: Monitor): string | null {
  if (sized(shot) !== sized(monitor.pixels))
    return `a frame of screen "${monitor.id}" is ${sized(shot)} pixels, the listing says ${sized(monitor.pixels)}`
  const inside = declared(shot.png)
  if (inside === undefined) return 'the image of a frame is not a PNG'
  return sized(inside) === sized(shot)
    ? null
    : `the image of a frame declares ${sized(inside)} pixels, the frame says ${sized(shot)}`
}

/** A backend checks itself before it is offered: a wrong one is unavailable, not a wrong picture. */
export async function selfCheck(backend: ScreenBackend): Promise<SelfCheck> {
  let monitors: readonly Monitor[]
  try {
    monitors = await backend.list()
  } catch (error) {
    return { kind: 'unknown', reason: `the screens cannot be listed: ${said(error)}` }
  }
  const problem = monitorsProblem(monitors)
  const primary = monitors.find(monitor => monitor.primary)
  if (problem !== null || primary === undefined)
    return { kind: 'failed', reason: problem ?? 'no screen is primary' }
  let shot: Shot | 'not-found'
  try {
    shot = await backend.capture({ screen: primary.id, region: null })
  } catch (error) {
    return { kind: 'unknown', reason: `a frame cannot be taken: ${said(error)}` }
  }
  if (shot === 'not-found')
    return {
      kind: 'failed',
      reason: `the primary screen "${primary.id}" cannot be captured by its identifier`,
    }
  const wrong = shotProblem(shot, primary)
  return wrong === null ? { kind: 'passed' } : { kind: 'failed', reason: wrong }
}
