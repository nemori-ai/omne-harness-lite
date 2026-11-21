import { crc32, deflateSync } from 'node:zlib'
import type {
  FacilityReason,
  FacilityResult,
  ScreenFacility,
  ScreenInfo,
  ScreenRegion,
} from '../index.ts'

/** `takenAt` is the instant every scripted frame carries; a fixed one when absent. */
export type ScreenScript = Readonly<{ screens: readonly ScreenInfo[]; takenAt?: string }>
export type ScriptedScreenFacility = Readonly<{
  facility: ScreenFacility<unknown>
  /** Takes away the permission of the system to read the screen. */
  revoke(): void
}>

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type), data])
  const framed = Buffer.alloc(8 + data.length + 4)
  framed.writeUInt32BE(data.length, 0)
  body.copy(framed, 4)
  framed.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return framed
}

/** A grey PNG of the given size: what a scripted screen shows. */
export function scriptedScreenPng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 0, 0, 0, 0], 8)
  const rows = Buffer.alloc(height * (1 + width), 0x80)
  for (let row = 0; row < height; row += 1) rows[row * (1 + width)] = 0
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', new Uint8Array()),
    ]),
  )
}

const whole = (value: number) => Number.isSafeInteger(value)

function inside(region: ScreenRegion, screen: ScreenInfo): boolean {
  const { x, y, width, height } = region
  return (
    [x, y, width, height].every(whole) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= screen.pixels.width &&
    y + height <= screen.pixels.height
  )
}

/** A screen facility over a fixed list of screens; it never reads a real screen. */
export function createScriptedScreenFacility(script: ScreenScript): ScriptedScreenFacility {
  let permitted = true
  const rejected = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
    kind: 'rejected',
    requestId,
    reason,
  })
  const facility: ScreenFacility<unknown> = {
    async list({ requestId }) {
      if (!permitted) return rejected(requestId, 'notAuthorized')
      return { kind: 'done', requestId, value: script.screens }
    },
    async capture({ requestId, screen: wanted, region: asked }) {
      if (!permitted) return rejected(requestId, 'notAuthorized')
      const screen = script.screens.find(each =>
        wanted === null ? each.primary : each.id === wanted,
      )
      if (screen === undefined) return rejected(requestId, 'notFound')
      const region = asked ?? { x: 0, y: 0, ...screen.pixels }
      if (!inside(region, screen)) return rejected(requestId, 'invalidInput')
      const { width, height } = region
      return {
        kind: 'done',
        requestId,
        value: {
          screen,
          region,
          image: { mediaType: 'image/png', bytes: scriptedScreenPng(width, height), width, height },
          takenAt: script.takenAt ?? '2026-01-01T00:00:00.000Z',
        },
      }
    },
  }
  return {
    facility,
    revoke() {
      permitted = false
    },
  }
}
