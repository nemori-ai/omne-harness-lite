import type { Message } from '@omne-harness/message'
import type { AssemblyInput, AssemblyFailure, AssemblyUnknown } from './values.js'
import type { OperationContext } from './operation-context.js'
import { chooseRepresentations, type RepresentationResult } from './representation.js'
export async function representLayers<P>(
  input: AssemblyInput<P>,
  context: OperationContext<P>,
  messages: readonly Message[],
): Promise<Extract<RepresentationResult, { kind: 'chosen' }> | AssemblyFailure | AssemblyUnknown> {
  const conversions = await context.sources.conversions.read({
    access: context.access,
    target: context.target,
    blocks: messages.flatMap(m => m.blocks.map(b => b.id)),
  })
  if (conversions.kind === 'denied')
    return { kind: 'denied', action: 'read-conversions', diagnostic: 'Conversion access refused' }
  if (conversions.kind === 'invalid')
    return {
      kind: 'invalid',
      field: `conversions.${conversions.field}`,
      reason: conversions.reason,
    }
  if (conversions.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: 'Conversion result unknown' }
  if (conversions.kind === 'unavailable')
    return { kind: 'unavailable', owner: 'conversion-results', diagnostic: conversions.diagnostic }
  const represented = chooseRepresentations({
    messages,
    conversions: conversions.entries,
    modalities: input.selection.profile.definition.input,
    policy: context.policies.representation,
  })
  if (represented.kind === 'unavailable')
    return {
      kind: 'unavailable',
      owner: 'representation',
      diagnostic: `No accepted representation for ${represented.block}`,
      original: represented.original,
    }
  return represented
}
