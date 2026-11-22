import { HAND } from '../icons/brush.ts'

export const OWN_CANVAS = { units: 64, px: 56 } as const

export const BRUSH = 3.1

export const FINE = 1.25

export const PRESS = {
  dot: 0.75,
  light: 0.55,
  way: 1.05,
  thread: 0.6,
} as const

export const widthPx = (weight: number): number =>
  (HAND.width * weight * OWN_CANVAS.px) / OWN_CANVAS.units
