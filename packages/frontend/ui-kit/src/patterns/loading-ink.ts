import { brush, HAND, type Point, type Stroke } from '../icons/brush.ts'

export interface Drop {
  readonly stroke: Stroke

  readonly reach: number
}

function drop([x, y]: Point, weight: number, length: number): Drop {
  const half = length / 2 / Math.SQRT2
  return {
    stroke: brush(
      [
        [x - half, y - half * 0.8],
        [x + half, y + half * 1.2],
      ],
      weight,
    ),
    reach: HAND.width * weight + 1,
  }
}

export const DROPS: readonly Drop[] = [
  drop([5.6, 5.5], 1.8, 3.6),
  drop([12.1, 11.9], 1.7, 3.4),
  drop([18.5, 18.3], 1.6, 3.2),
]

export const COUNTED_DROPS: readonly Drop[] = [
  drop([3.6, 3.5], 1.3, 2.6),
  drop([20.4, 20.4], 1.2, 2.4),
]
