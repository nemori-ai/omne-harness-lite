import type { Monitor, ScreenBackend, ScreenPermission } from './backend.ts'

/** The calls of the screenshot library a backend makes, and nothing else of it. */
export type LibraryImage = Readonly<{
  width: number
  height: number
  crop(x: number, y: number, width: number, height: number): Promise<LibraryImage>
  toPng(): Promise<Uint8Array>
}>
export type LibraryMonitor = Readonly<{
  id(): number
  name(): string
  x(): number
  y(): number
  width(): number
  height(): number
  scaleFactor(): number
  isPrimary(): boolean
  captureImage(): Promise<LibraryImage>
}>
export type ScreenLibrary = Readonly<{ monitors(): readonly LibraryMonitor[] }>

/** Whether the library gives positions and sizes in logical points (macOS) or in physical pixels. */
export type LibraryUnits = 'points' | 'pixels'

function monitorOf(raw: LibraryMonitor, units: LibraryUnits): Monitor {
  const scale = raw.scaleFactor()
  const [inPixels, inPoints] = units === 'points' ? [scale, 1] : [1, 1 / scale]
  return {
    id: String(raw.id()),
    name: raw.name(),
    primary: raw.isPrimary(),
    pixels: {
      width: Math.round(raw.width() * inPixels),
      height: Math.round(raw.height() * inPixels),
    },
    scale,
    origin: { x: raw.x() * inPoints, y: raw.y() * inPoints },
  }
}

export type LibraryBackendInput = Readonly<{
  name: string
  verification: ScreenBackend['verification']
  units: LibraryUnits
  library(): ScreenLibrary
  permission(): Promise<ScreenPermission>
}>

/** A thin shell over the library: every judgement is in the shared functions, none is here. */
export function libraryBackend(input: LibraryBackendInput): ScreenBackend {
  return {
    name: input.name,
    verification: input.verification,
    permission: input.permission,
    async list() {
      return input
        .library()
        .monitors()
        .map(raw => monitorOf(raw, input.units))
    },
    async capture({ screen, region }) {
      const raw = input
        .library()
        .monitors()
        .find(each => String(each.id()) === screen)
      if (raw === undefined) return 'not-found'
      const whole = await raw.captureImage()
      const image =
        region === null ? whole : await whole.crop(region.x, region.y, region.width, region.height)
      return { png: await image.toPng(), width: image.width, height: image.height }
    },
  }
}
