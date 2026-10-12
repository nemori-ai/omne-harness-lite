import type { JsonValue, CapabilityId } from '@omne-harness-lite/content-blocks'
import type { AssetContent, AssetCategory, BodyContractSupply, DeclarationResult } from './types.ts'
import { bindBodyContracts, type AssetModelJudge } from './judge.ts'
import { connectorContract } from './availability.ts'
export { DISABLED_DECLARATION, USABLE_BY_DECLARATION } from './declaration-rules.ts'

export function attributeDeclarationsOf<C extends AssetCategory>(
  content: AssetContent & { readonly category: C },
  owner: AssetModelJudge,
  actionSnapshot?: JsonValue,
): DeclarationResult<C> {
  return owner.attributeDeclarationsOf<C>(content, actionSnapshot)
}
function pinReference(reference: CapabilityId): CapabilityId {
  return Object.freeze({ category: reference.category, name: reference.name })
}
export function referencesOf(
  content: AssetContent,
  bodyContracts: BodyContractSupply,
): { readonly references: readonly CapabilityId[] } | { readonly underivable: 'agent_definition' } {
  const bodies = bindBodyContracts(bodyContracts)
  if (content.category === 'agent_definition')
    return Object.freeze({ underivable: 'agent_definition' } as const)
  if (content.category === 'plugin')
    return Object.freeze({ references: Object.freeze(content.members.map(pinReference)) })
  const references =
    content.category === 'tool'
      ? bodies.tool.references(content.definition)
      : content.category === 'loop_extension'
        ? bodies.loop_extension.references(content.extension)
        : content.category === 'connector'
          ? connectorContract(bodies).references(content.body)
          : bodies[content.category].references(content.body)
  return Object.freeze({ references: Object.freeze(references.map(pinReference)) })
}
