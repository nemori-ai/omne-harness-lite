import { describe, expect, it } from 'vitest'
import {
  imagePointOnScreen,
  screenFacility,
  screenPointOnDesktop,
  type ScreenFrame,
} from '@omne-harness/execution-environment-contract'

describe('the screen facility declaration', () => {
  it('names two operations, and both need authorization', () => {
    expect(screenFacility.key).toBe('screen')
    expect([...screenFacility.operations].sort()).toEqual(['capture', 'list'])
    expect([...screenFacility.guarded].sort()).toEqual(['capture', 'list'])
    expect(Object.isFrozen(screenFacility)).toBe(true)
  })
})

describe('a frame carries its coordinate system', () => {
  const frame: Pick<ScreenFrame, 'image' | 'region'> = {
    image: { mediaType: 'image/png', bytes: new Uint8Array(), width: 100, height: 50 },
    region: { x: 200, y: 100, width: 400, height: 200 },
  }

  it.each([
    [
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ],
    [
      { x: 100, y: 50 },
      { x: 600, y: 300 },
    ],
    [
      { x: 25, y: 10 },
      { x: 300, y: 140 },
    ],
  ])('a point %o of the image is %o on the screen, in physical pixels', (point, onScreen) => {
    expect(imagePointOnScreen(frame, point)).toEqual(onScreen)
  })

  it('a point of an image that was not scaled is the same distance from the corner of its region', () => {
    const whole = {
      image: { ...frame.image, width: 400, height: 200 },
      region: frame.region,
    }
    expect(imagePointOnScreen(whole, { x: 7, y: 9 })).toEqual({ x: 207, y: 109 })
  })

  it('a point of the screen is a point of the desktop: divided by the scale, from the origin of the screen', () => {
    const second = { scale: 2, origin: { x: -1280, y: 40 } }
    expect(screenPointOnDesktop(second, { x: 200, y: 100 })).toEqual({ x: -1180, y: 90 })
    expect(screenPointOnDesktop({ scale: 1, origin: { x: 0, y: 0 } }, { x: 5, y: 6 })).toEqual({
      x: 5,
      y: 6,
    })
  })
})
