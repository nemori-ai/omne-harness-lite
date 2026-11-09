// The one place of this application that turns a tool definition into its Settings holding and a
// secret item of that holding into the custody binding key. The `settings` row uses it to register
// the holdings it resolves; the Web attachment of `tool-bindings` uses it to read the same binding
// the public `omne setting` operations wrote. `@omne-harness/settings` keeps its own encoding of the
// target private (`secret-items.ts`, `targetOf`), so this file repeats it in one place, and the row
// test proves the two agree by writing through the entry and reading through this key.
import {
  SETTING_SECRET_PURPOSE,
  type SecretBindingKey,
  type SecretScope,
  type SecretTarget,
  type SettingDefinitions,
  type SettingsHolding,
} from '@omne-harness/settings'
import { toolSettingDefinitions, type ToolDefinition } from '@omne-harness/tool-contract'

/** The owner of every asset secret setting target (settings `secret-items.ts`). */
const TARGET_OWNER = 'setting'

/**
 * The Settings definition a tool definition projects to, or `null` when the tool declares no
 * settings. The projection may throw on a declaration whose schema does not describe an item
 * path; the caller decides what that means.
 */
export function toolSettingProjection(definition: ToolDefinition): SettingDefinitions | null {
  return toolSettingDefinitions({
    adoption: definition.adoption,
    name: definition.name,
    declaration: definition.declarations.settings,
  })
}

/**
 * The holding of a tool definition: the provider id and the definition id of its projection,
 * which `toolSettingDefinitions` derives from the adoption owner and the tool name. `null` when
 * the tool declares no settings; it then has no holding and no secret item.
 */
export function toolSettingHolding(definition: ToolDefinition): SettingsHolding | null {
  const projected = toolSettingProjection(definition)
  return projected === null
    ? null
    : { providerId: projected.providerId, definitionId: projected.definitionId }
}

/** The target of one secret item: the holding and the item id as one JSON array of three strings. */
export function toolSettingTarget(holding: SettingsHolding, itemId: string): SecretTarget {
  return {
    owner: TARGET_OWNER,
    key: JSON.stringify([holding.providerId, holding.definitionId, itemId]),
  }
}

/** The binding key the custody keeps for one secret item of one scope. */
export function toolSettingSecretKey(
  scope: SecretScope,
  holding: SettingsHolding,
  itemId: string,
): SecretBindingKey {
  return { scope, target: toolSettingTarget(holding, itemId), purpose: SETTING_SECRET_PURPOSE }
}
