import type { Point, Stroke } from './brush.ts'

export const MOTIONS = ['tilt', 'turn', 'rise', 'drift-left', 'drift-right', 'draw'] as const
type Motion = (typeof MOTIONS)[number]

export interface Glyph {
  readonly still: readonly Stroke[]
  readonly moving: readonly Stroke[]
  readonly motion: Motion | 'none'
  readonly origin?: Point
}
