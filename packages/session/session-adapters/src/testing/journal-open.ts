import type {
  AcceptedInput,
  Failure,
  InputBatch,
  InvokeRuntimeContext,
  OriginalInputAcceptance,
  StepId,
} from '@omne-harness/agent-contract'
import { blobOf, type Blob } from '../journal/decide.ts'
import { refOf, type FactBody } from '../journal/facts.ts'
import { copy, invalid, sameValue } from './journal-handoff-checks.ts'

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
  for (const { entry, outcome } of originals) {
    if (entry.kind !== 'invoke') return invalid('originals.entry', 'not an invoke')
    const origin = outcome.origin
    if (
      origin?.kind === 'invoke' &&
      (!sameValue(origin.scope, runtime.scope) || !sameValue(origin.definition, runtime.definition))
    )
      return invalid('runtime', 'not the scope and definition of the invoke origin')
  }
  return undefined
}

export const openedFacts = (originals: Originals): FactBody[] =>
  originals.flatMap(({ entry, handoff, outcome }): FactBody[] => {
    const value = entry.kind === 'invoke' ? entry.initial : entry.value
    return [
      {
        kind: 'input.accepted',
        input: value.id,
        entry: handoff.entry,
        message: refOf(value.content),
        source: value.source,
        priority: value.priority,
        watermark: outcome.record,
      },
      {
        kind: 'handoff.resolved',
        handoff,
        resolution: 'recorded',
        outcome: refOf(outcome),
        history: outcome.record,
      },
    ]
  })

export const openedBlobs = (originals: Originals): Blob[] => [
  ...initialInputs(originals).map(value => blobOf(value.content)),
  ...originals.map(({ outcome }) => blobOf(outcome)),
]

export const stepBegun = (step: StepId, { id, watermark }: InputBatch): FactBody => ({
  kind: 'step.begun',
  step,
  batch: { id, watermark: copy(watermark) },
})
