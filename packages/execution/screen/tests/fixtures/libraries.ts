import type { LibraryImage, LibraryMonitor, ScreenLibrary } from '@omne-harness/screen'

type Raw = Readonly<{
  id: number
  name: string
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  isPrimary: boolean
  /** The pixel size of the image the library hands out for this monitor. */
  image: readonly [number, number]
}>

/** A PNG header that declares the given size: enough for what reads the size of a frame. */
export function pngOf(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return new Uint8Array(bytes)
}

function imageOf(width: number, height: number, crops: unknown[]): LibraryImage {
  return {
    width,
    height,
    crop: async (x, y, w, h) => {
      crops.push([x, y, w, h])
      return imageOf(w, h, crops)
    },
    toPng: async () => pngOf(width, height),
  }
}

export function libraryOf(raws: readonly Raw[]) {
  const crops: unknown[] = []
  const monitors: LibraryMonitor[] = raws.map(raw => ({
    id: () => raw.id,
    name: () => raw.name,
    x: () => raw.x,
    y: () => raw.y,
    width: () => raw.width,
    height: () => raw.height,
    scaleFactor: () => raw.scaleFactor,
    isPrimary: () => raw.isPrimary,
    captureImage: async () => imageOf(...raw.image, crops),
  }))
  const library: ScreenLibrary = { monitors: () => monitors }
  return { library, crops }
}

/** Recorded on this machine (macOS 15.8, arm64, node-screenshots 0.2.8): one screen, scale 1. */
export const MACOS_RECORDED: readonly Raw[] = [
  {
    id: 2,
    name: 'AWS Nitro D-1',
    x: 0,
    y: 0,
    width: 1024,
    height: 768,
    scaleFactor: 1,
    isPrimary: true,
    image: [1024, 768],
  },
]

// NOT recorded: from the library's types and its upstream's sources (macOS gives logical points).
// A built-in screen at scale 2 with a second screen to its left.
export const MACOS_TWO_SCREENS: readonly Raw[] = [
  {
    id: 1,
    name: 'Built-in Retina Display',
    x: 0,
    y: 0,
    width: 1512,
    height: 982,
    scaleFactor: 2,
    isPrimary: true,
    image: [3024, 1964],
  },
  {
    id: 3,
    name: 'External',
    x: -1920,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    isPrimary: false,
    image: [1920, 1080],
  },
]

/** NOT recorded: from the library's types. On Windows and Linux it gives physical pixels. */
export const PIXELS_TWO_SCREENS: readonly Raw[] = [
  {
    id: 65537,
    name: '\\\\.\\DISPLAY1',
    x: 0,
    y: 0,
    width: 3840,
    height: 2160,
    scaleFactor: 1.5,
    isPrimary: true,
    image: [3840, 2160],
  },
  {
    id: 65539,
    name: '\\\\.\\DISPLAY2',
    x: 3840,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    isPrimary: false,
    image: [1920, 1080],
  },
]
