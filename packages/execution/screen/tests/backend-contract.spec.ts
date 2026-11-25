import { describe, expect, it } from 'vitest'
import {
  libraryBackend,
  monitorsProblem,
  regionWithin,
  selfCheck,
  type ScreenBackend,
} from '@omne-harness/screen'
import {
  libraryOf,
  MACOS_RECORDED,
  MACOS_TWO_SCREENS,
  PIXELS_TWO_SCREENS,
} from './fixtures/libraries.ts'

const granted = async () => 'satisfied' as const

/** The three backends over stand-in library calls: the same contract for every system. */
const BACKENDS = [
  ['macOS, as recorded', 'points', MACOS_RECORDED],
  ['macOS, two screens', 'points', MACOS_TWO_SCREENS],
  ['Windows and Linux, two screens', 'pixels', PIXELS_TWO_SCREENS],
] as const

function backendOver(units: 'points' | 'pixels', raws: Parameters<typeof libraryOf>[0]) {
  const { library, crops } = libraryOf(raws)
  const backend = libraryBackend({
    name: 'fixture',
    verification: 'contract-suite',
    units,
    library: () => library,
    permission: granted,
  })
  return { backend, crops }
}

describe.each(BACKENDS)('the backend contract on %s', (_, units, raws) => {
  it('lists every screen once, with one primary and a geometry that holds together', async () => {
    const { backend } = backendOver(units, raws)
    const monitors = await backend.list()
    expect(monitors).toHaveLength(raws.length)
    expect(monitorsProblem(monitors)).toBeNull()
    expect(monitors.map(monitor => monitor.id)).toEqual(raws.map(raw => String(raw.id)))
  })

  it('gives each screen in physical pixels: a frame of it is exactly that size', async () => {
    const { backend } = backendOver(units, raws)
    for (const monitor of await backend.list()) {
      const shot = await backend.capture({ screen: monitor.id, region: null })
      expect(shot).toMatchObject(monitor.pixels)
    }
  })

  it('takes a region of a screen as the library crops it, and answers not-found for a stranger', async () => {
    const { backend, crops } = backendOver(units, raws)
    const [first] = await backend.list()
    const region = { x: 3, y: 4, width: 10, height: 20 }
    expect(await backend.capture({ screen: first!.id, region })).toMatchObject({
      width: 10,
      height: 20,
    })
    expect(crops).toEqual([[3, 4, 10, 20]])
    expect(await backend.capture({ screen: 'no-such-screen', region: null })).toBe('not-found')
  })

  it('passes its own check', async () => {
    expect(await selfCheck(backendOver(units, raws).backend)).toEqual({ kind: 'passed' })
  })
})

describe('what the library gives becomes one geometry', () => {
  it('on macOS: sizes in logical points become physical pixels; the origin stays in points', async () => {
    const [, external] = await backendOver('points', MACOS_TWO_SCREENS).backend.list()
    const [builtIn] = await backendOver('points', MACOS_TWO_SCREENS).backend.list()
    expect(builtIn).toEqual({
      id: '1',
      name: 'Built-in Retina Display',
      primary: true,
      pixels: { width: 3024, height: 1964 },
      scale: 2,
      origin: { x: 0, y: 0 },
    })
    expect(external).toMatchObject({
      pixels: { width: 1920, height: 1080 },
      origin: { x: -1920, y: 0 },
    })
  })

  it('on Windows and Linux: sizes are physical pixels already; the origin becomes logical points', async () => {
    const [first, second] = await backendOver('pixels', PIXELS_TWO_SCREENS).backend.list()
    expect(first).toMatchObject({
      pixels: { width: 3840, height: 2160 },
      scale: 1.5,
      origin: { x: 0, y: 0 },
    })
    expect(second).toMatchObject({
      pixels: { width: 1920, height: 1080 },
      origin: { x: 3840, y: 0 },
    })
  })

  it('on Windows and Linux: the origin of a scaled screen away from the corner is in points', async () => {
    const [primary, raw] = PIXELS_TWO_SCREENS
    const scaled = { ...raw!, x: 3840, y: -1080, scaleFactor: 2 }
    const [, second] = await backendOver('pixels', [primary!, scaled]).backend.list()
    expect(second).toMatchObject({
      pixels: { width: 1920, height: 1080 },
      scale: 2,
      origin: { x: 1920, y: -540 },
    })
  })
})

describe('the geometry of a listing holds together, or it says what does not', () => {
  const screen = {
    id: 'a',
    name: 'A',
    primary: true,
    pixels: { width: 10, height: 10 },
    scale: 1,
    origin: { x: 0, y: 0 },
  }
  it.each([
    ['no screen', [], 'no screen is listed'],
    ['no primary', [{ ...screen, primary: false }], '0 screens are primary, not exactly one'],
    ['two primaries', [screen, { ...screen, id: 'b' }], '2 screens are primary, not exactly one'],
    [
      'a repeated identifier',
      [screen, { ...screen, primary: false }],
      'the identifier "a" is listed twice',
    ],
    ['an empty identifier', [{ ...screen, id: '' }], 'a screen has no identifier'],
    [
      'a width of zero',
      [{ ...screen, pixels: { width: 0, height: 10 } }],
      'screen "a" is 0x10 pixels',
    ],
    [
      'a height that is no whole number',
      [{ ...screen, pixels: { width: 10, height: 2.5 } }],
      'screen "a" is 10x2.5 pixels',
    ],
    ['a scale of zero', [{ ...screen, scale: 0 }], 'screen "a" has the scale 0'],
    [
      'a second screen that is wrong behind a first that is right',
      [screen, { ...screen, id: 'b', primary: false, scale: 0 }],
      'screen "b" has the scale 0',
    ],
    [
      'an origin that is no number',
      [{ ...screen, origin: { x: Number.NaN, y: 0 } }],
      'screen "a" has no place on the desktop',
    ],
  ])('%s', (_, monitors, problem) => {
    expect(monitorsProblem(monitors)).toBe(problem)
  })

  it('a region is within a screen when it is whole, positive and inside', () => {
    const pixels = { width: 10, height: 8 }
    expect(regionWithin({ x: 0, y: 0, width: 10, height: 8 }, pixels)).toBe(true)
    expect(regionWithin({ x: 9, y: 7, width: 1, height: 1 }, pixels)).toBe(true)
    for (const region of [
      { x: 0, y: 0, width: 11, height: 8 },
      { x: 0, y: 1, width: 10, height: 8 },
      { x: -1, y: 0, width: 1, height: 1 },
      { x: 0, y: -1, width: 1, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0, y: 0, width: 1, height: 0 },
      { x: 0.5, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1.5 },
    ])
      expect(regionWithin(region, pixels)).toBe(false)
  })
})

describe('the check a backend runs on itself: it fails closed', () => {
  const sound = (): ScreenBackend => backendOver('points', MACOS_RECORDED).backend
  const over = (change: Partial<ScreenBackend>): ScreenBackend => ({ ...sound(), ...change })
  const fails = () => Promise.reject(new Error('the library threw'))

  it('fails when the listing does not hold together, with what does not', async () => {
    expect(await selfCheck(over({ list: async () => [] }))).toEqual({
      kind: 'failed',
      reason: 'no screen is listed',
    })
  })

  it('fails when the listing names a primary screen and still does not hold together', async () => {
    const [only] = await sound().list()
    const twice = [only!, { ...only!, primary: false }]
    expect(await selfCheck(over({ list: async () => twice }))).toEqual({
      kind: 'failed',
      reason: 'the identifier "2" is listed twice',
    })
  })

  it('fails when a frame of the primary screen is not the size the listing gives', async () => {
    const wrongUnits = backendOver('pixels', MACOS_TWO_SCREENS).backend
    expect(await selfCheck(wrongUnits)).toEqual({
      kind: 'failed',
      reason: 'a frame of screen "1" is 3024x1964 pixels, the listing says 1512x982',
    })
  })

  it('fails when the bytes of the frame declare another size than the frame says', async () => {
    const shot = { png: new Uint8Array(await pngBytes(4, 4)), width: 1024, height: 768 }
    expect(await selfCheck(over({ capture: async () => shot }))).toEqual({
      kind: 'failed',
      reason: 'the image of a frame declares 4x4 pixels, the frame says 1024x768',
    })
    const noPng = { png: new Uint8Array([1, 2, 3]), width: 1024, height: 768 }
    expect(await selfCheck(over({ capture: async () => noPng }))).toEqual({
      kind: 'failed',
      reason: 'the image of a frame is not a PNG',
    })
  })

  it('takes bytes for a PNG only by the whole signature, and only when the size can be read', async () => {
    const whole = new Uint8Array(await pngBytes(1024, 768))
    const oneByteOff = Uint8Array.from(whole)
    oneByteOff[1] = 0x51
    const signatureOnly = whole.slice(0, 8)
    for (const png of [oneByteOff, signatureOnly])
      expect(
        await selfCheck(over({ capture: async () => ({ png, width: 1024, height: 768 }) })),
      ).toEqual({ kind: 'failed', reason: 'the image of a frame is not a PNG' })
  })

  it('fails when the primary screen it listed cannot be captured by its identifier', async () => {
    expect(await selfCheck(over({ capture: async () => 'not-found' }))).toEqual({
      kind: 'failed',
      reason: 'the primary screen "2" cannot be captured by its identifier',
    })
  })

  it('is unknown, not passed, when listing or capturing cannot be done', async () => {
    expect(await selfCheck(over({ list: fails }))).toEqual({
      kind: 'unknown',
      reason: 'the screens cannot be listed: the library threw',
    })
    expect(await selfCheck(over({ capture: fails }))).toEqual({
      kind: 'unknown',
      reason: 'a frame cannot be taken: the library threw',
    })
  })
})

async function pngBytes(width: number, height: number) {
  const { pngOf } = await import('./fixtures/libraries.ts')
  return pngOf(width, height)
}

it('hands on the error of a library that cannot write a frame as PNG; its self-check is unknown and names it', async () => {
  const { library } = libraryOf(MACOS_RECORDED)
  const [monitor] = library.monitors()
  if (monitor === undefined) throw new Error('the fixture has a screen')
  const unwritable = async () => {
    const image = await monitor.captureImage()
    const toPng = async (): Promise<Uint8Array> => {
      throw new Error('the PNG writer failed')
    }
    return { width: image.width, height: image.height, crop: image.crop, toPng }
  }
  const backend = libraryBackend({
    name: 'fixture',
    verification: 'contract-suite',
    units: 'points',
    library: () => ({ monitors: () => [{ ...monitor, captureImage: unwritable }] }),
    permission: granted,
  })
  await expect(backend.capture({ screen: '2', region: null })).rejects.toThrow(
    'the PNG writer failed',
  )
  expect(await selfCheck(backend)).toEqual({
    kind: 'unknown',
    reason: 'a frame cannot be taken: the PNG writer failed',
  })
})
