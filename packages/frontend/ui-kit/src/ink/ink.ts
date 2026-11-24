import { arc, type Point } from '../icons/brush.ts'
import { BRUSH, FINE, PRESS } from './brush-weight.ts'
import { designed, seeded, vary, VARIETY, type InkStroke } from './writing.ts'

export const CANVAS = 64
export const CENTRE: Point = [32, 32]

export interface Hand {
  readonly weight: number
  readonly radius: number
  readonly gap: number
  readonly gapAt: number
  readonly wobble: number
  readonly flyingWhite: number
}

export const DEFAULT_HAND: Hand = {
  weight: BRUSH,
  radius: 21,
  gap: 50,
  gapAt: -52,
  wobble: 0.035,
  flyingWhite: 0.55,
}

const rad = (degrees: number): number => (degrees * Math.PI) / 180

export function circleLine(hand: Hand = DEFAULT_HAND, phase = 0): Point[] {
  const start = hand.gapAt + hand.gap / 2
  const sweep = 360 - hand.gap
  const count = Math.max(8, Math.round(sweep / 20))
  return Array.from({ length: count + 1 }, (_, i) => {
    const turned = (i / count) * sweep
    const angle = rad(start + turned)
    const r =
      hand.radius *
      (1 +
        hand.wobble * Math.sin(rad(turned) * 2 + 0.6 + phase) +
        hand.wobble * 0.6 * Math.sin(rad(turned) * 3 + 1.9 + phase))
    return [CENTRE[0] + r * Math.cos(angle), CENTRE[1] + r * Math.sin(angle)] as const
  })
}

export function circleStroke(hand: Hand = DEFAULT_HAND, seed = 0): InkStroke {
  const k = seed === 0 ? 0 : VARIETY.amount
  const random = seeded(seed ^ 0x5bd1e995)
  const span = (lo: number, hi: number): number => (lo + (hi - lo) * random()) * k
  const shaped: Hand = {
    ...hand,
    gapAt: hand.gapAt + span(-7, 7),
    gap: hand.gap + span(-8, 8),
    radius: hand.radius + span(-0.5, 0.5),
    wobble: hand.wobble * (1 + span(-0.25, 0.3)),
  }
  return vary(
    designed(circleLine(shaped, span(0, Math.PI * 2)), hand.weight, { dry: hand.flyingWhite }),
    seed,
  )
}

export function closingStroke(hand: Hand = DEFAULT_HAND, seed = 0): InkStroke {
  const k = seed === 0 ? 0 : VARIETY.amount
  const random = seeded(seed ^ 0x27d4eb2f)
  const span = (lo: number, hi: number): number => (lo + (hi - lo) * random()) * k
  const line = arc(
    CENTRE,
    hand.radius * 0.95,
    hand.gapAt - hand.gap / 2 - 4 + span(-4, 3),
    hand.gapAt + hand.gap / 2 + 6 + span(-3, 4),
    0.15,
  )
  return vary(designed(line, hand.weight * PRESS.light), seed, {
    freedom: 0.7,
    endings: { taper: 0.5, stop: 0.3, turn: 0.2 },
  })
}

export const EYE_WEIGHT = BRUSH * PRESS.dot

export const dab = (t: number): number =>
  t < 0.4 ? 0.8 + 0.2 * Math.sin((t / 0.4) * (Math.PI / 2)) : 1 - 0.36 * ((t - 0.4) / 0.6) ** 1.4

export function eyeStroke(seed = 0): InkStroke {
  const k = seed === 0 ? 0 : VARIETY.amount
  const random = seeded(seed ^ 0x165667b1)
  const span = (lo: number, hi: number): number => (lo + (hi - lo) * random()) * k
  const [x, y] = CENTRE
  const angle = Math.atan2(0.7, 0.9) + span(-0.45, 0.45)
  const reach = 1.14 * (1 + span(-0.25, 0.3))
  const at: Point = [x + span(-0.4, 0.4), y + span(-0.4, 0.4)]
  const line: Point[] = [
    [at[0] - Math.cos(angle) * reach, at[1] - Math.sin(angle) * reach],
    [at[0] + Math.cos(angle) * reach, at[1] + Math.sin(angle) * reach],
  ]
  return {
    ...designed(line, EYE_WEIGHT * (1 + span(-0.1, 0.1)), {
      ink: 1 - Math.abs(span(0, 0.08)),
      press: dab,
      wet: 0.85,
    }),
    seed,
    ending: seed === 0 ? 'plain' : 'stop',
  }
}

export function mouth(hand: Hand = DEFAULT_HAND): Point {
  return [
    CENTRE[0] + hand.radius * Math.cos(rad(hand.gapAt)),
    CENTRE[1] + hand.radius * Math.sin(rad(hand.gapAt)),
  ]
}

const DIGITS: Readonly<Record<string, readonly (readonly Point[])[]>> = {
  '0': [
    [
      [0.62, 0.02],
      [0.24, 0.12],
      [0.08, 0.5],
      [0.22, 0.9],
      [0.55, 1],
      [0.86, 0.8],
      [0.92, 0.42],
      [0.74, 0.08],
      [0.5, 0.04],
    ],
  ],
  '1': [
    [
      [0.22, 0.24],
      [0.42, 0.12],
      [0.56, 0.02],
      [0.55, 0.5],
      [0.56, 1],
    ],
  ],
  '2': [
    [
      [0.1, 0.26],
      [0.32, 0.05],
      [0.66, 0.03],
      [0.86, 0.24],
      [0.76, 0.5],
      [0.42, 0.78],
      [0.1, 0.98],
      [0.5, 0.95],
      [0.94, 0.97],
    ],
  ],
  '3': [
    [
      [0.12, 0.12],
      [0.48, 0.01],
      [0.84, 0.16],
      [0.74, 0.38],
      [0.42, 0.48],
      [0.8, 0.58],
      [0.9, 0.82],
      [0.6, 1],
      [0.1, 0.92],
    ],
  ],
  '4': [
    [
      [0.64, 0.02],
      [0.34, 0.38],
      [0.06, 0.7],
      [0.5, 0.69],
      [0.96, 0.68],
    ],
    [
      [0.68, 0.32],
      [0.67, 0.66],
      [0.68, 1],
    ],
  ],
  '5': [
    [
      [0.86, 0.03],
      [0.5, 0.03],
      [0.22, 0.04],
      [0.16, 0.46],
      [0.56, 0.38],
      [0.88, 0.6],
      [0.8, 0.9],
      [0.46, 1],
      [0.1, 0.9],
    ],
  ],
  '6': [
    [
      [0.8, 0.04],
      [0.42, 0.14],
      [0.14, 0.52],
      [0.22, 0.9],
      [0.54, 1],
      [0.86, 0.8],
      [0.8, 0.54],
      [0.48, 0.46],
      [0.16, 0.62],
    ],
  ],
  '7': [
    [
      [0.08, 0.05],
      [0.5, 0.03],
      [0.93, 0.04],
      [0.62, 0.48],
      [0.4, 1],
    ],
  ],
  '8': [
    [
      [0.8, 0.16],
      [0.5, 0.01],
      [0.2, 0.16],
      [0.3, 0.38],
      [0.7, 0.58],
      [0.84, 0.84],
      [0.5, 1],
      [0.16, 0.84],
      [0.28, 0.58],
      [0.7, 0.38],
      [0.8, 0.16],
    ],
  ],
  '9': [
    [
      [0.84, 0.32],
      [0.54, 0.47],
      [0.2, 0.36],
      [0.22, 0.08],
      [0.56, 0.01],
      [0.86, 0.24],
      [0.8, 0.66],
      [0.52, 1],
    ],
  ],
}

const NUMERAL_HEIGHT = 18
const DIGIT_WIDTH = 0.62
const DIGIT_ADVANCE = 0.74
export const NUMERAL_WEIGHT = FINE

export function numeralLines(count: number, hand: Hand = DEFAULT_HAND): Point[][] {
  const text = String(Math.min(99, Math.max(0, Math.round(count))))
  const [mx, my] = mouth(hand)
  const left = mx + 3
  const top = my - NUMERAL_HEIGHT * 0.86
  return [...text].flatMap((digit, index) =>
    (DIGITS[digit] ?? []).map(stroke =>
      stroke.map(([x, y]): Point => [
        left + (index * DIGIT_ADVANCE + x * DIGIT_WIDTH) * NUMERAL_HEIGHT,
        top + y * NUMERAL_HEIGHT,
      ]),
    ),
  )
}

export function numeralStrokes(count: number, hand: Hand = DEFAULT_HAND, seed = 0): InkStroke[] {
  return numeralLines(count, hand).map((line, i) =>
    vary(designed(line, NUMERAL_WEIGHT, { wet: 0.8 }), seed === 0 ? 0 : seed + i * 7919, {
      wander: 0.22,
      freedom: 0.4,
      endings: { taper: 0.5, stop: 0.5 },
    }),
  )
}
