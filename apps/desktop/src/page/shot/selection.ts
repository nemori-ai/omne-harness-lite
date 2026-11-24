export type Point = Readonly<{ x: number; y: number }>
export type Size = Readonly<{ width: number; height: number }>
export type Region = Readonly<{ x: number; y: number; width: number; height: number }>
export type Pick = Readonly<{ kind: 'screen' }> | Readonly<{ kind: 'region'; region: Region }>

/** A press and release closer than this, in CSS pixels, is a click. */
export const CLICK_SLOP = 4

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** What a press at `start` and a release at `end` on an overlay of `view` picks, in the pixels of the frozen `image`. */
export function pickOf(start: Point, end: Point, view: Size, image: Size): Pick {
  if (Math.hypot(end.x - start.x, end.y - start.y) < CLICK_SLOP) return { kind: 'screen' }
  const scaleX = image.width / view.width
  const scaleY = image.height / view.height
  const left = Math.round(clamp(Math.min(start.x, end.x), 0, view.width) * scaleX)
  const top = Math.round(clamp(Math.min(start.y, end.y), 0, view.height) * scaleY)
  const right = Math.round(clamp(Math.max(start.x, end.x), 0, view.width) * scaleX)
  const bottom = Math.round(clamp(Math.max(start.y, end.y), 0, view.height) * scaleY)
  return {
    kind: 'region',
    region: {
      x: left,
      y: top,
      width: Math.max(right - left, 1),
      height: Math.max(bottom - top, 1),
    },
  }
}
