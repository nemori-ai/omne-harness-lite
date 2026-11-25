import type {
  Access,
  DispatchRecord,
  ModelCallId,
  ModelFailure,
} from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'

export type CallFactsReader<P> = Pick<ModelCommands<P>, 'dispatches'>

export type CallFactsLookup =
  | Readonly<{ kind: 'present'; records: readonly DispatchRecord[] }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

export type CallFactsView = ReadonlyMap<ModelCallId, CallFactsLookup>

function lookupOf(result: Outcome<readonly DispatchRecord[], ModelFailure>): CallFactsLookup {
  if ('ok' in result) return { kind: 'present', records: result.ok }
  const { kind } = result.failure
  return kind === 'denied' || kind === 'invalid' ? { kind: 'absent' } : { kind: 'unavailable' }
}

/** The cited calls of one preparation: each read once, and only when a measurement needs it. */
export type CallFacts = Readonly<{
  view(calls: readonly ModelCallId[]): Promise<CallFactsView>
}>

export function callFacts<P>(reader: CallFactsReader<P>, access: Access<P>): CallFacts {
  const { principal, tenant } = access
  const reads = new Map<ModelCallId, Promise<CallFactsLookup>>()
  const lookup = (call: ModelCallId): Promise<CallFactsLookup> => {
    let read = reads.get(call)
    if (read === undefined) {
      read = reader.dispatches({ principal, tenant, call }).then(lookupOf)
      reads.set(call, read)
    }
    return read
  }
  return Object.freeze({
    async view(calls: readonly ModelCallId[]) {
      const unique = [...new Set(calls)]
      return new Map(
        await Promise.all(unique.map(async call => [call, await lookup(call)] as const)),
      )
    },
  })
}
