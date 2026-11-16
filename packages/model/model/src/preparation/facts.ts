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
