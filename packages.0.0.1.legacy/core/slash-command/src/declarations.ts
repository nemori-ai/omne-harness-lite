import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import type { CapabilityId } from '@omne-harness-lite/content-blocks'
import type { SlashCommandDefinition } from './types.ts'

/** S-11: reserved declarations are supplied by asset-model, never this body rule. */
export function slashCommandAttributeDeclarations(
  _definition: SlashCommandDefinition,
): readonly AttributeDeclaration[] {
  return Object.freeze([])
}
export function slashCommandReferences(
  definition: SlashCommandDefinition,
): readonly CapabilityId[] {
  return definition.binding.kind === 'skill'
    ? Object.freeze([
        Object.freeze({ category: 'skill' as const, name: definition.binding.skill.name }),
      ])
    : Object.freeze([])
}
