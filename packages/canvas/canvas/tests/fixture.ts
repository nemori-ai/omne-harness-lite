import { createCanvas, type CanvasConfig, type CanvasStore } from '@omne-harness/canvas'
import {
  context,
  createMemoryStore,
  fakeAuthority,
  fakeClock,
  fakeKinds,
  fakeMovers,
} from '@omne-harness/canvas/testing'
import type { KindDeclaration, KindName } from '@omne-harness/canvas-contract'

export const CONFIG: CanvasConfig = {
  sheet: { width: 4800, height: 3200, grid: 8 },
  limits: { placed: 50, away: 50, batch: 20 },
  size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
  footprint: { width: 160, height: 80 },
  admitTimeoutMs: 50,
}

export const kind = (name: string, admit?: KindDeclaration['admit']): KindDeclaration => ({
  name: name as KindName,
  label: name,
  summary: `${name} is a thing`,
  reference: `the identity of a ${name}`,
  ...(admit === undefined ? {} : { admit }),
})

/** A canvas over the memory store with every port faked, the kinds media.object and canvas.app declared. */
export function world(options: { store?: CanvasStore; config?: Partial<CanvasConfig> } = {}) {
  const store = options.store ?? createMemoryStore()
  const authority = fakeAuthority()
  const kinds = fakeKinds()
  const movers = fakeMovers()
  const clock = fakeClock()
  const config = { ...CONFIG, ...options.config }
  const canvas = createCanvas({ store, authority, movers, kinds, clock, config })
  return { store, authority, kinds, movers, clock, canvas, ctx: context() }
}

export const media = (ref: string) => ({ kind: 'media.object', ref })
