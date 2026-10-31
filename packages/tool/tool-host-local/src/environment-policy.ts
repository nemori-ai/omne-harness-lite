import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolEnvironment } from '@omne-harness/tool-contract/provider'

export type EnvironmentPreparationInput<P> = Parameters<ToolEnvironment<P, unknown>['prepare']>[0]
export type EnvironmentReleaseInput<P> = Parameters<ToolEnvironment<P, unknown>['release']>[0]

/** Trusted host configuration. The environment provider retains quota and admission authority. */
export interface ToolEnvironmentSchedulingPolicy<P> {
  readonly quantum: number
  readonly capacity: number
  readonly inFlight: number
  tenant(tenant: TenantId): Readonly<{ weight: number; inFlight: number }>
  /** This promise may delay the caller's authorized retry. It cannot create a new operation. */
  retry(input: EnvironmentPreparationInput<P>): Promise<'wait' | 'inspect' | 'recognize'>
  /** Delay or forward an already authorized release; never infer physical completion. */
  release(input: EnvironmentReleaseInput<P>): Promise<'wait' | 'release'>
}

export function positive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${field}: positive finite value required`)
}

export function capacity(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${field}: nonnegative integer required`)
}

export type DrrQueue = {
  credit: number
  readonly weight: number
  readonly limit: number
  occupied: number
  readonly pending: string[]
}

/** One new submission costs one credit. Slots and pending work are owned by the caller. */
export function createDrrSelector(quantum: number) {
  let position = 0
  let credited = false
  return (queues: readonly DrrQueue[]): DrrQueue | undefined => {
    const eligible = (queue: DrrQueue) => queue.pending.length > 0 && queue.occupied < queue.limit
    if (!queues.some(eligible)) return undefined
    for (;;) {
      for (let scanned = 0; scanned < queues.length; scanned += 1) {
        position %= queues.length
        const queue = queues[position]
        if (queue === undefined) return undefined
        if (eligible(queue)) {
          if (!credited) {
            queue.credit += Math.min(queue.pending.length, quantum * queue.weight)
            credited = true
          }
          if (queue.credit >= 1) {
            queue.credit -= 1
            return queue
          }
        }
        if (queue.pending.length === 0) queue.credit = 0
        position = (position + 1) % queues.length
        credited = false
      }
      // Skip empty virtual rounds. Even subnormal weights must not spin the event loop.
      const active = queues.filter(eligible)
      const rounds = Math.min(
        ...active.map(queue =>
          Math.ceil((1 - queue.credit) / Math.max(Number.MIN_VALUE, quantum * queue.weight)),
        ),
      )
      for (const queue of active) {
        const added = rounds * Math.max(Number.MIN_VALUE, quantum * queue.weight)
        queue.credit += Math.min(queue.pending.length, added)
      }
      credited = true
    }
  }
}
