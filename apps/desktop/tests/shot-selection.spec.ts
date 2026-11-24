import { describe, expect, it } from 'vitest'
import { pickOf } from '../src/page/shot/selection.ts'

const VIEW = { width: 1000, height: 500 }
const IMAGE = { width: 2000, height: 1000 }

describe('what a press and release on an overlay picks', () => {
  it('a click, or a drag shorter than the slop, picks the whole screen', () => {
    expect(pickOf({ x: 10, y: 10 }, { x: 10, y: 10 }, VIEW, IMAGE)).toEqual({ kind: 'screen' })
    expect(pickOf({ x: 10, y: 10 }, { x: 13, y: 12 }, VIEW, IMAGE)).toEqual({ kind: 'screen' })
  })

  it('a drag picks the rectangle between the two points, in the pixels of the frozen picture', () => {
    expect(pickOf({ x: 100, y: 50 }, { x: 300, y: 150 }, VIEW, IMAGE)).toEqual({
      kind: 'region',
      region: { x: 200, y: 100, width: 400, height: 200 },
    })
  })

  it('a drag in any direction picks the same rectangle', () => {
    expect(pickOf({ x: 300, y: 150 }, { x: 100, y: 50 }, VIEW, IMAGE)).toEqual(
      pickOf({ x: 100, y: 50 }, { x: 300, y: 150 }, VIEW, IMAGE),
    )
  })

  it('a drag past the edge of the screen is cut at the edge', () => {
    expect(pickOf({ x: 900, y: 400 }, { x: 1200, y: -40 }, VIEW, IMAGE)).toEqual({
      kind: 'region',
      region: { x: 1800, y: 0, width: 200, height: 800 },
    })
  })

  it('each axis scales by its own ratio, so a view that is not the picture in shape still crops right', () => {
    expect(
      pickOf({ x: 100, y: 50 }, { x: 300, y: 150 }, VIEW, { width: 2000, height: 1500 }),
    ).toEqual({
      kind: 'region',
      region: { x: 200, y: 150, width: 400, height: 300 },
    })
  })

  it('a straight vertical or horizontal drag still picks a strip at least a pixel wide', () => {
    expect(pickOf({ x: 100, y: 50 }, { x: 100, y: 150 }, VIEW, IMAGE)).toEqual({
      kind: 'region',
      region: { x: 200, y: 100, width: 1, height: 200 },
    })
    expect(pickOf({ x: 100, y: 50 }, { x: 300, y: 50 }, VIEW, IMAGE)).toEqual({
      kind: 'region',
      region: { x: 200, y: 100, width: 400, height: 1 },
    })
  })
})
