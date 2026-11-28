import { describe, expect, it } from 'vitest'
import { captureOf, deviceShotRoute, type Box } from '../src/main/device-shot.ts'
import { DEVICE_SHOT } from '../src/shared/view.ts'

const post = (body: unknown, path = DEVICE_SHOT) =>
  new Request(`omne-app://app${path}`, { method: 'POST', body: JSON.stringify(body) })

describe('a picture of the window the person uses, now', () => {
  const asked: (Box | undefined)[] = []
  const route = deviceShotRoute(() => async box => {
    asked.push(box)
    return { png: new Uint8Array([137, 80, 78, 71]), width: box?.w ?? 1280, height: box?.h ?? 800 }
  })

  it('is the whole window, or the one box named, as a PNG with its size', async () => {
    const whole = await route(post({}))
    expect(whole?.headers.get('content-type')).toBe('image/png')
    expect(whole?.headers.get('x-omne-width')).toBe('1280')
    const part = await route(post({ box: { x: 10, y: 20, w: 300, h: 100 } }))
    expect(part?.headers.get('x-omne-height')).toBe('100')
    expect(asked).toEqual([undefined, { x: 10, y: 20, w: 300, h: 100 }])
  })

  it('says bad-mode for a box it cannot take, unsupported while there is no window, and is not the route of other paths', async () => {
    expect(await (await route(post({ box: { x: 0, y: 0, w: 0, h: 5 } })))?.json()).toEqual({
      reason: 'bad-mode',
    })
    const none = deviceShotRoute(() => undefined)
    expect(await (await none(post({})))?.json()).toEqual({ reason: 'unsupported' })
    expect(route(post({}, '/device/view'))).toBeUndefined()
    const got = await route(new Request(`omne-app://app${DEVICE_SHOT}`))
    expect(got?.status).toBe(405)
  })

  it('asks Electron for the box as a rectangle of the page', async () => {
    const rects: unknown[] = []
    const shot = captureOf({
      async capturePage(rect) {
        rects.push(rect)
        return { toPNG: () => Buffer.from([1]), getSize: () => ({ width: 3, height: 4 }) }
      },
    })
    expect(await shot({ x: 1, y: 2, w: 3, h: 4 })).toEqual({
      png: new Uint8Array([1]),
      width: 3,
      height: 4,
    })
    await shot(undefined)
    expect(rects).toEqual([{ x: 1, y: 2, width: 3, height: 4 }, undefined])
  })
})
