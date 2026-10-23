// The call facts a preparation lease reads: the dispatch records of every call the lineage names,
// read once at acquire with the access of the caller, through `ModelCommands.dispatches` only.
// A call the caller cannot read and a call that does not exist give the same lookup, so nothing
// downstream can tell them apart. A store that cannot answer stays distinguishable.
import type {
  Access,
  DispatchRecord,
  ModelCallId,
  ModelCommands,
  ModelFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

/** The one door to call facts. `ModelCommands` satisfies it; nothing else of it is read. */
export type CallFactsReader<P> = Pick<ModelCommands<P>, 'dispatches'>

export type CallFactsLookup =
  | Readonly<{ kind: 'present'; records: readonly DispatchRecord[] }>
  /** Denied or not found: the caller cannot learn which. */
  | Readonly<{ kind: 'absent' }>
  /** The store could not answer. Says nothing about the call. */
  | Readonly<{ kind: 'unavailable' }>

/** Immutable after acquire; the lease drops it at release. */
export type CallFactsView = ReadonlyMap<ModelCallId, CallFactsLookup>

function lookupOf(result: Outcome<readonly DispatchRecord[], ModelFailure>): CallFactsLookup {
  if ('ok' in result) return { kind: 'present', records: result.ok }
  switch (result.failure.kind) {
    case 'denied':
    case 'invalid':
      return { kind: 'absent' }
    case 'unavailable':
    case 'commit-unknown':
    case 'conflict':
    case 'capacity':
    case 'unsupported':
    case 'stale-instance':
    case 'not-settled':
    case 'handoff-invalid':
      return { kind: 'unavailable' }
    default: {
      const _exhaustive: never = result.failure
      return _exhaustive
    }
  }
}

/** Reads every named call once, each with the access of the lease. The reads run together. */
export async function readCallFacts<P>(
  input: Readonly<{
    reader: CallFactsReader<P>
    access: Access<P>
    calls: readonly ModelCallId[]
  }>,
): Promise<CallFactsView> {
  const { principal, tenant } = input.access
  const entries = await Promise.all(
    input.calls.map(
      async call =>
        [call, lookupOf(await input.reader.dispatches({ principal, tenant, call }))] as const,
    ),
  )
  return new Map(entries)
}
