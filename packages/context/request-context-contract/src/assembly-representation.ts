import type { Message } from '@omne-harness/message'
import type { AssemblyInput, AssemblyFailure, AssemblyUnknown } from './values.js'
import type { AssemblyPorts, AssemblyPolicies } from './ports.js'
import { chooseRepresentations, type RepresentationResult } from './representation.js'
export async function representLayers<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
  messages: readonly Message[],
): Promise<Extract<RepresentationResult, { kind: 'chosen' }> | AssemblyFailure | AssemblyUnknown> {
  const conversions = await ports.conversions.read(
    input.identity.access,
    messages.flatMap(m => m.blocks.map(b => b.id)),
  )
  if (conversions.kind === 'denied')
    return { kind: 'denied', action: 'read-conversions', diagnostic: 'Conversion access refused' }
  if (conversions.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: 'Conversion result unknown' }
  if (conversions.kind === 'unavailable')
    return { kind: 'unavailable', owner: 'conversion-results', diagnostic: conversions.diagnostic }
  const represented = chooseRepresentations({
    messages,
    conversions: conversions.entries,
    modalities: input.selection.profile.definition.input,
    policy: policies.representation,
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
