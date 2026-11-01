// The result receiver table behind `ModelRuntimeService.registerResultReceiver`. A consumer, the
// Agent host, registers its receiver under its consumer owner from inside its own plugin body. The
// push stage of the Model host resolves the receiver by the owner that was frozen at admission.
// The table lives in one process: the guarantee that the push stage can resolve a receiver holds
// because both sides share this object. It is not a push protocol.
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import { registerInCallerFiber, type Admission } from '@omne-harness/kernel-basis/cordis'
import type { ConsumerRef, ModelResultReceiver } from '@omne-harness/model-contract'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

// A fiber that is failed, disposed or unloading no longer keeps its registration alive. Cordis runs
// the effect disposers of one fiber concurrently, so the entry can outlive the fiber state change.
const FAILED = 3 satisfies CordisFiberState['FAILED']
const DISPOSED = 4 satisfies CordisFiberState['DISPOSED']
const UNLOADING = 5 satisfies CordisFiberState['UNLOADING']

type Owner = ConsumerRef['owner']

/**
 * Thrown by `registerResultReceiver` when a second live fiber, or the same fiber a second time,
 * registers an owner that a live registration already holds. The caller is an assembly error: the
 * plugin that lets it escape ends in `FAILED`.
 * @owner packages/model/model-cordis-contract
 */
export class ModelResultReceiverConflictError extends Error {
  readonly owner: Owner

  constructor(owner: Owner) {
    super(`A live registration already holds the result receiver of owner "${owner}"`)
    this.name = 'ModelResultReceiverConflictError'
    this.owner = owner
  }
}

/**
 * The table of result receivers, one per consumer owner. `register` must be called with the
 * Context of the registering plugin, so that the registration ends with that plugin's fiber.
 * `resolve` is for the push stage of the provider and is not exposed on the service.
 * @owner packages/model/model-cordis-contract
 */
export interface ModelResultReceiverTable<P> {
  /**
   * Registers `receiver` under `owner` in an effect of `ctx`'s fiber and returns the removal
   * function. The registration takes effect at once. Removal is synchronous and idempotent, and
   * only removes the registration it belongs to. An existing registration of a fiber that is
   * unloading, disposed or failed is replaced. An existing registration of a live fiber is
   * refused with `ModelResultReceiverConflictError`.
   */
  register(ctx: CordisContext, owner: Owner, receiver: ModelResultReceiver<P>): () => void
  /** The receiver of the live registration under `owner`, or `null`. */
  resolve(owner: Owner): ModelResultReceiver<P> | null
}

type Entry<P> = {
  readonly owner: Owner
  readonly receiver: ModelResultReceiver<P>
  readonly fiber: CordisContext['fiber']
  readonly registration: () => void
}

function isLive(fiber: CordisContext['fiber']): boolean {
  const { state } = fiber
  return state !== FAILED && state !== DISPOSED && state !== UNLOADING
}

/** @owner packages/model/model-cordis-contract */
export function createModelResultReceiverTable<P>(): ModelResultReceiverTable<P> {
  const entries = new Map<Owner, Entry<P>>()

  // Removes the entry only while it is still the one under its owner: a late removal of a replaced
  // registration finds its successor there and leaves it alone.
  function remove(entry: Entry<P>): void {
    if (entries.get(entry.owner) === entry) entries.delete(entry.owner)
  }

  return {
    register(ctx, owner, receiver) {
      if (typeof owner !== 'string' || owner === '')
        throw new TypeError('The consumer owner must be a non-empty string')
      if (typeof receiver?.push !== 'function')
        throw new TypeError('The result receiver must have a push function')
      const outcome = registerInCallerFiber<Entry<P>, Owner>(
        ctx,
        (dropEffect): Admission<Entry<P>, Owner> => {
          const held = entries.get(owner)
          if (held !== undefined && isLive(held.fiber)) return { kind: 'refused', failure: owner }
          const entry: Entry<P> = {
            owner,
            receiver,
            fiber: ctx.fiber,
            registration: () => {
              remove(entry)
              dropEffect()
            },
          }
          entries.set(owner, entry)
          return { kind: 'entered', entry }
        },
        remove,
      )
      if ('failure' in outcome) throw new ModelResultReceiverConflictError(outcome.failure)
      return outcome.ok
    },

    resolve(owner) {
      const entry = entries.get(owner)
      return entry !== undefined && isLive(entry.fiber) ? entry.receiver : null
    },
  }
}
