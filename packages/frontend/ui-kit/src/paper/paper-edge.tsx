import { useDeferredValue } from 'react'

import { HAND } from '../icons/brush.ts'
import { bubbleRests, BUBBLE_WEIGHT, edgeLines, type EdgeShape, unitOf } from '../ink/note-ink.ts'
import { FIGURE_SIZE } from '../ink/store.ts'
import { usePaperFrame } from './paper-surface.tsx'

const LEAF_RADIUS = 2
const LEAST_SCREEN = 1
const SCALE_STEPS = 4
const REMEMBERED = 512

type Size = Readonly<{ width: number; height: number }>

export type PaperEdgeShape = EdgeShape & Readonly<{ weight: number; screen: number }>

function seedOf(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const stepped = (scale: number): number =>
  scale > 0 ? 2 ** (Math.floor(Math.log2(scale) * SCALE_STEPS) / SCALE_STEPS) : 1

export function edgeShape(size: Size, key: string, scale: number): PaperEdgeShape {
  const unit = unitOf(FIGURE_SIZE)
  const weight = Math.max(BUBBLE_WEIGHT.rest, LEAST_SCREEN / (HAND.width * unit * stepped(scale)))
  return {
    width: size.width,
    height: size.height,
    radius: LEAF_RADIUS,
    unit,
    seed: seedOf(key),
    ink: 'full',
    weight,
    screen: HAND.width * weight * unit * scale,
  }
}

const drawn = new Map<string, readonly [string, string]>()

function remembered(shape: PaperEdgeShape): readonly [string, string] {
  const key = `${shape.width}x${shape.height}:${shape.seed}:${shape.weight}`
  const known = drawn.get(key)
  if (known !== undefined) return known
  const made = bubbleRests(edgeLines(shape), shape.unit, shape.ink, shape.weight)
  if (drawn.size >= REMEMBERED) drawn.delete(drawn.keys().next().value!)
  drawn.set(key, made)
  return made
}

export function PaperEdge({
  width,
  height,
  edgeKey,
}: Size & { readonly edgeKey: string }): React.JSX.Element {
  const scale = useDeferredValue(usePaperFrame().scale)
  const [first, second] = remembered(edgeShape({ width, height }, edgeKey, scale))
  return (
    <svg
      aria-hidden="true"
      data-slot="paper-edge"
      className="omne-paper-edge"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={first} />
      <path d={second} />
    </svg>
  )
}
