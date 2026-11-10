// The one place of this application that turns a tool definition into its Settings holding and a
// secret item of that holding into the custody binding key. The `settings` row uses it to register
// the holdings it resolves; the Web attachment of `tool-bindings` uses it to read the same binding
// the public `omne setting` operations wrote. The target encoding is `@omne-harness/settings`'s
// `secretItemTarget`: this file derives the holding and composes the key, it repeats no encoding.
import {
  SETTING_SECRET_PURPOSE,
  secretItemTarget,
  type SecretBindingKey,
  type SecretScope,
  type SettingDefinitions,
  type SettingsHolding,
} from '@omne-harness/settings'
import { toolSettingDefinitions, type ToolDefinition } from '@omne-harness/tool-contract'

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

/** The binding key the custody keeps for one secret item of one scope. */
export function toolSettingSecretKey(
  scope: SecretScope,
  holding: SettingsHolding,
  itemId: string,
): SecretBindingKey {
  return { scope, target: secretItemTarget(holding, itemId), purpose: SETTING_SECRET_PURPOSE }
}
