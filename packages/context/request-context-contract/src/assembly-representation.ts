import type { Message } from '@omne-harness/message'
import type { AssemblyInput, AssemblyFailure } from './values.js'
import type { OperationContext } from './operation-context.js'
import { chooseRepresentations, type RepresentationResult } from './representation.js'
export function representLayers<P>(
  input: AssemblyInput<P>,
  context: OperationContext<P>,
  messages: readonly Message[],
): Extract<RepresentationResult, { kind: 'chosen' }> | AssemblyFailure {
  const represented = chooseRepresentations({
    messages,
    capability: input.selection.profile.definition,
    policy: context.policies.representation,
  })
  if (represented.kind === 'chosen') return represented
  const { message, block } = represented
  return {
    kind: 'unavailable',
    owner: 'representation',
    diagnostic: `modality: the model takes no representation of block ${block} of message ${message}`,
    block: { message, block },
  }
}
