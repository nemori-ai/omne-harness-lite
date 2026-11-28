import { DEVICE_SHOT } from '../shared/view.ts'
import type { LocalRoute } from './app-protocol.ts'
import { pngOf, type Shot } from './device-view.ts'

export type Box = Readonly<{ x: number; y: number; w: number; h: number }>

/** The window the person uses, as the route needs it: a picture of it now, of one box of it or all of it; undefined while there is none. */
export type ShotWindow = () => ((box: Box | undefined) => Promise<Shot>) | undefined

const whole = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0

function boxOf(value: unknown): Box | undefined | 'bad' {
  if (typeof value !== 'object' || value === null) return 'bad'
  const { box } = value as Record<string, unknown>
  if (box === undefined) return undefined
  if (typeof box !== 'object' || box === null) return 'bad'
  const { x, y, w, h } = box as Record<string, unknown>
  if (!whole(x) || !whole(y) || !whole(w) || !whole(h) || w === 0 || h === 0) return 'bad'
  return { x, y, w, h }
}

const said = (reason: string): Response =>
  new Response(JSON.stringify({ reason }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/** `POST /device/shot`: a picture of the window the person uses, now, without changing anything in it. */
export function deviceShotRoute(window: ShotWindow): LocalRoute {
  return request => {
    if (new URL(request.url).pathname !== DEVICE_SHOT) return undefined
    if (request.method !== 'POST') return Promise.resolve(new Response(null, { status: 405 }))
    return (async () => {
      const box = boxOf(await request.json().catch(() => undefined))
      if (box === 'bad') return said('bad-mode')
      const capture = window()
      if (capture === undefined) return said('unsupported')
      return pngOf(await capture(box))
    })()
  }
}

/** A picture of an Electron window's contents, of one box of it or all of it. */
export function captureOf(
  contents: Readonly<{
    capturePage(rect?: Readonly<{ x: number; y: number; width: number; height: number }>): Promise<{
      toPNG(): Buffer
      getSize(): Readonly<{ width: number; height: number }>
    }>
  }>,
) {
  return async (box: Box | undefined): Promise<Shot> => {
    const rect = box === undefined ? undefined : { x: box.x, y: box.y, width: box.w, height: box.h }
    const image = await contents.capturePage(rect)
    const { width, height } = image.getSize()
    return { png: new Uint8Array(image.toPNG()), width, height }
  }
}
