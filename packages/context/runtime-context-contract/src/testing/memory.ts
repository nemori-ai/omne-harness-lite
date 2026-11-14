import type { RuntimeContextOperations, RuntimeContextTrust, ScopeRef } from '../index.js'
import { createWorld } from './memory-world.js'
import { createSupplier } from './memory-producer.js'
import { createHolder } from './memory-holder.js'
import { createReplay } from './memory-replay.js'
import { createReaders } from './memory-reader.js'

export type MemoryRuntimeContextOptions<P = unknown> = RuntimeContextTrust<P> &
  Readonly<{
    retention?: number
    replayCapacity?: number
    supplyBoundMs?: number
    settleBoundMs?: number
  }>

export type MemoryRuntimeContext<P = unknown> = RuntimeContextOperations<P> &
  Readonly<{
    durability: 'none'
    close(): Promise<void>
    onChange(listener: (scope: ScopeRef, revision: number) => void): () => void
  }>

function bound(name: string, value: number | undefined, fallback: number): number {
  const chosen = value ?? fallback
  if (!Number.isSafeInteger(chosen) || chosen < 0)
    throw new RangeError(`${name} must be a non-negative safe integer`)
  return chosen
}

export function createMemoryRuntimeContext<P = unknown>(
  options: MemoryRuntimeContextOptions<P>,
): MemoryRuntimeContext<P> {
  const world = createWorld<P>({
    authority: options.authority,
    bindings: options.bindings,
    retention: bound('retention', options.retention, 64),
    replayCapacity: bound('replayCapacity', options.replayCapacity, 10000),
    supplyBoundMs: bound('supplyBoundMs', options.supplyBoundMs, 30000),
    settleBoundMs: bound('settleBoundMs', options.settleBoundMs, 1000),
  })
  const supplier = createSupplier(world)
  const holder = createHolder(world, supplier)
  const replay = createReplay(world)
  const readers = createReaders(world, supplier)
  return {
    durability: 'none',
    registerProducer: supplier.registerProducer,
    prepareRegistration: holder.prepareRegistration,
    issueEligibility: holder.issueEligibility,
    revokeEligibility: holder.revokeEligibility,
    applyCommit: holder.applyCommit,
    beginReplay: replay.beginReplay,
    finishReplay: replay.finishReplay,
    bind: readers.bind,
    async close() {
      world.closed = true
      world.listeners.clear()
    },
    onChange(listener) {
      world.listeners.add(listener)
      return () => {
        world.listeners.delete(listener)
      }
    },
  }
}
