import { createCanvas, observed, type CanvasChanges, type CanvasConfig } from '@omne-harness/canvas'
import {
  context,
  createMemoryStore,
  fakeAuthority,
  fakeClock,
  fakeKinds,
  fakeMovers,
  type MemoryStore,
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

/** A canvas over the memory store with every port faked; with `changes`, its store tells them. */
export function world(
  options: { store?: MemoryStore; config?: Partial<CanvasConfig>; changes?: CanvasChanges } = {},
) {
  const store = options.store ?? createMemoryStore()
  const authority = fakeAuthority()
  const kinds = fakeKinds()
  const movers = fakeMovers()
  const clock = fakeClock()
  const config = { ...CONFIG, ...options.config }
  const written = options.changes === undefined ? store : observed(store, options.changes)
  const canvas = createCanvas({ store: written, authority, movers, kinds, clock, config })
  return { store, authority, kinds, movers, clock, canvas, ctx: context() }
}

export const media = (ref: string) => ({ kind: 'media.object', ref })
