import type { RuntimeContextOperations, RuntimeContextTrust, ScopeRef } from '../index.js'
import { createWorld } from './memory-world.js'
import { createSupplier } from './memory-producer.js'
import { createHolder } from './memory-holder.js'
import { createReplay } from './memory-replay.js'
import { createReaders } from './memory-reader.js'

/**
 * The two authority ports are required: the double has no unchecked mode. Bounds are configurable
 * initial values, not product numbers.
 */
export type MemoryRuntimeContextOptions<P = unknown> = RuntimeContextTrust<P> &
  Readonly<{
    /** Retained view revisions per cursor; an older cursor is invalidated. Default 64. */
    retention?: number
    /** Upper bound of one recovery material: registrations, checkpoint blocks and the end. Default 10000. */
    replayCapacity?: number
    /** How long one supply call may take before it reads as unknown. Default 30000 ms. */
    supplyBoundMs?: number
    /** How long `dispose` waits for the generation's reads in flight. Default 1000 ms. */
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

/** A non-durable double of the whole contract. It proves the contract shape, not real concurrency or durability. */
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
