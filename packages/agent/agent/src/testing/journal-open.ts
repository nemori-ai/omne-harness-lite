import type {
  AcceptedInput,
  AgentOperationId,
  Failure,
  InvokeRuntimeContext,
  OriginalInputAcceptance,
} from '@omne-harness/agent-contract'
import { copy, invalid, sameValue } from './journal-compaction-caller.ts'
import { revisionOf } from './journal-values.ts'

type Originals = readonly OriginalInputAcceptance[]

export const initialInputs = (originals: Originals): AcceptedInput[] =>
  originals.map(({ entry }) => (entry.kind === 'invoke' ? entry.initial : entry.value))

/** Why the originals are not the batch of one invoke under this runtime; undefined when they are. */
export function openRefusal(
  originals: Originals,
  runtime: Pick<InvokeRuntimeContext, 'scope' | 'definition'>,
): Failure | undefined {
  const ids = initialInputs(originals).map(value => value.id)
  if (new Set(ids).size !== ids.length) return invalid('originals', 'an input appears twice')
  if (originals.some(({ entry }) => entry.kind !== 'invoke'))
    return invalid('originals.entry', 'not an invoke')
  if (originals.some(({ outcome }) => foreignOrigin(outcome.origin, runtime)))
    return invalid('runtime', 'not the scope and definition of the invoke origin')
  return undefined
}

function foreignOrigin(
  origin: OriginalInputAcceptance['outcome']['origin'],
  runtime: Pick<InvokeRuntimeContext, 'scope' | 'definition'>,
): boolean {
  return (
    origin?.kind === 'invoke' &&
    (!sameValue(origin.scope, runtime.scope) || !sameValue(origin.definition, runtime.definition))
  )
}

export const openedHandoffs = (originals: Originals, operation: AgentOperationId) =>
  originals.map(acceptance => ({
    handoff: copy(acceptance.handoff),
    request: copy(acceptance.outcome.request),
    prepared: null,
    resolution: { kind: 'recorded' as const, outcome: copy(acceptance.outcome) },
    history: { kind: 'committed' as const, operation, revision: revisionOf(1) },
    retirement: null,
  }))
