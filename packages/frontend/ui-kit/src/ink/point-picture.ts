import { strokeSpine, type Point } from '../icons/brush.ts'
import { OWN_CANVAS } from './brush-weight.ts'
import { CENTRE, circleLine, DEFAULT_HAND } from './ink.ts'
import { readPng, writePng, type Pixels } from './png.ts'

export const NEAR_LOOK = 480

export const PICTURE_INK = {
  ink: [0x14, 0x14, 0x13],
  paper: [0xf5, 0xf4, 0xed],
  breath: 5,
  breathStrength: 0.6,
} as const

export interface PicturePoint {
  readonly x: number
  readonly y: number
}

export type PointedPictures = readonly [Uint8Array] | readonly [Uint8Array, Uint8Array]

interface Ring {
  readonly points: readonly Point[]
  readonly half: readonly number[]
  readonly reach: number
}

function ringAt(centre: Point, scale: number): Ring {
  const k = (OWN_CANVAS.px / OWN_CANVAS.units) * scale
  const spine = strokeSpine(circleLine(DEFAULT_HAND), DEFAULT_HAND.weight, {
    spacing: 1,
    most: 400,
  })
  const points = spine.points.map(([x, y]): Point => [
    centre[0] + (x - CENTRE[0]) * k,
    centre[1] + (y - CENTRE[1]) * k,
  ])
  const half = spine.half.map(h => h * k)
  const reach = DEFAULT_HAND.radius * 1.2 * k + Math.max(...half) + PICTURE_INK.breath * scale
  return { points, half, reach }
}

function inkDistance([px, py]: Point, { points, half }: Ring): number {
  let best = Infinity
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]!
    const [bx, by] = points[i]!
    const [dx, dy] = [bx - ax, by - ay]
    const length = dx * dx + dy * dy
    const t =
      length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length))
    const reach = half[i - 1]! + (half[i]! - half[i - 1]!) * t
    best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t) - reach)
  }
  return best
}

function lay(data: Uint8Array, at: number, channels: 3 | 4, colour: readonly number[], a: number) {
  if (a <= 0) return
  const under = channels === 4 ? data[at + 3]! / 255 : 1
  const out = a + under * (1 - a)
  for (let c = 0; c < 3; c += 1)
    data[at + c] = Math.round((colour[c]! * a + data[at + c]! * under * (1 - a)) / out)
  if (channels === 4) data[at + 3] = Math.round(out * 255)
}

function circled(picture: Pixels, centre: Point, scale: number): Pixels {
  const { width, height, channels } = picture
  const data = Uint8Array.from(picture.data)
  const ring = ringAt(centre, scale)
  const breath = PICTURE_INK.breath * scale
  const [x0, x1] = [
    Math.max(0, Math.floor(centre[0] - ring.reach)),
    Math.min(width, Math.ceil(centre[0] + ring.reach)),
  ]
  const [y0, y1] = [
    Math.max(0, Math.floor(centre[1] - ring.reach)),
    Math.min(height, Math.ceil(centre[1] + ring.reach)),
  ]
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const d = inkDistance([x + 0.5, y + 0.5], ring)
      if (d >= breath) continue
      const at = (y * width + x) * channels
      const paper = d <= 0 ? 1 : 1 - d / breath
      lay(data, at, channels, PICTURE_INK.paper, paper * PICTURE_INK.breathStrength)
      lay(data, at, channels, PICTURE_INK.ink, Math.min(1, Math.max(0, 0.5 - d)))
    }
  return { ...picture, data }
}

function nearLook(picture: Pixels, centre: Point, scale: number): Pixels {
  const { width, height, channels } = picture
  const side = (NEAR_LOOK / 2) * scale
  const [left, right] = [
    Math.max(0, Math.round(centre[0] - side)),
    Math.min(width, Math.round(centre[0] + side)),
  ]
  const [top, bottom] = [
    Math.max(0, Math.round(centre[1] - side)),
    Math.min(height, Math.round(centre[1] + side)),
  ]
  const cut = { width: right - left, height: bottom - top }
  const data = new Uint8Array(cut.width * cut.height * channels)
  for (let row = 0; row < cut.height; row += 1) {
    const from = ((top + row) * width + left) * channels
    data.set(picture.data.subarray(from, from + cut.width * channels), row * cut.width * channels)
  }
  return { ...cut, channels, data }
}

export async function pointPicture(
  picture: Uint8Array,
  point: PicturePoint,
  scale: number,
): Promise<PointedPictures> {
  const read = await readPng(picture)
  const centre: Point = [point.x * scale, point.y * scale]
  const inside =
    centre[0] >= 0 && centre[0] < read.width && centre[1] >= 0 && centre[1] < read.height
  if (!inside) return [picture]
  return [
    await writePng(circled(read, centre, scale)),
    await writePng(nearLook(read, centre, scale)),
  ]
}
