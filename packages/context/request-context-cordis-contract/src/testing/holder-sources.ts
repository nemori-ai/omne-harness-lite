// The in-memory holder double of `contextHolderSources`. It lends four given reads, asks `admits`
// on every call, calls the settlement function of a lease once when the lease ends, and closes its
// reads only after every settlement has ended. Not durable; never install it as a production holder.
import type { Context } from '@deepseek-ai/cordis'
import type { Access, SourceSettlement } from '@omne-harness/request-context-contract'
import { ContextHolderSourcesService } from '../cordis.js'
import type {
  ContextHolderLeaseResult,
  ContextHolderParts,
  LeaseSettlement,
} from '../holder-sources.js'

export type MemoryContextHolderOptions<P> = Readonly<{
  /** The reads the holder lends. The double adds the access check and nothing else. */
  parts: ContextHolderParts<P>
  /** The current eligibility of one access, asked on every call of every part. */
  admits(access: Access<P>): boolean
}>

export interface MemoryContextHolder<P> {
  readonly durability: 'none'
  /** The plugin that provides `contextHolderSources` from this holder. Plug it once. */
  readonly plugin: new (ctx: Context) => ContextHolderSourcesService<P>
  /** True once the plugin has unloaded and every lease has ended and settled. */
  readonly readsClosed: boolean
  /** The settlements the holder obtained, in the order they ended. */
  settlements(): readonly SourceSettlement[]
}

const DENIED = { kind: 'denied' } as const

function admitted<P>(
  parts: ContextHolderParts<P>,
  admits: (access: Access<P>) => boolean,
): ContextHolderParts<P> {
  const { history, adopted, eligibility, resolveHistory } = parts
  return {
    history: {
      read: async input => (admits(input.access) ? history.read(input) : DENIED),
      compactionContext: async input =>
        admits(input.access) ? history.compactionContext(input) : DENIED,
    },
    adopted: {
      authority: adopted.authority,
      readCount: async input => (admits(input.access) ? adopted.readCount(input) : DENIED),
      readSource: async input => (admits(input.access) ? adopted.readSource(input) : DENIED),
    },
    eligibility: {
      check: async input => (admits(input.access) ? eligibility.check(input) : DENIED),
    },
    resolveHistory: async input => (admits(input.access) ? resolveHistory(input) : DENIED),
  }
}

/** Calls `settle` now; a synchronous throw becomes a rejected settlement. */
function pull(settle: LeaseSettlement): Promise<SourceSettlement> {
  try {
    return settle()
  } catch (error) {
    return Promise.reject(error)
  }
}

export function createMemoryContextHolder<P>(
  options: MemoryContextHolderOptions<P>,
): MemoryContextHolder<P> {
  const parts = admitted(options.parts, options.admits)
  const pending: Promise<SourceSettlement>[] = []
  const obtained: SourceSettlement[] = []
  let closing = false
  let readsClosed = false

  function lease(ctx: Context, settle: LeaseSettlement): ContextHolderLeaseResult<P> {
    if (closing) return { kind: 'unavailable', diagnostic: 'The holder is closing its reads' }
    const settled = Promise.withResolvers<SourceSettlement>()
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      pull(settle).then(result => {
        obtained.push(result)
        settled.resolve(result)
      }, settled.reject)
    }
    // The effect belongs to the caller's fiber: its unload ends the lease like `release`.
    const remove = ctx.effect(() => end, 'contextHolderSources.lease')
    pending.push(settled.promise)
    // A failed settlement is reported by the close; this only keeps it from being unhandled here.
    settled.promise.catch(() => undefined)
    return {
      kind: 'leased',
      lease: {
        parts,
        release() {
          end()
          void remove()
        },
      },
    }
  }

  // A borrower fiber can unload while this runs; every lease ends that way at the latest.
  async function close(): Promise<void> {
    closing = true
    await Promise.all(pending)
    readsClosed = true
  }

  class MemoryContextHolderService extends ContextHolderSourcesService<P> {
    constructor(ctx: Context) {
      super(ctx)
      ctx.effect(() => close, 'contextHolderSources.close')
    }
    lease(input: Readonly<{ settle: LeaseSettlement }>): ContextHolderLeaseResult<P> {
      return lease(this.ctx, input.settle)
    }
  }

  return {
    durability: 'none',
    plugin: MemoryContextHolderService,
    get readsClosed() {
      return readsClosed
    },
    settlements: () => [...obtained],
  }
}
