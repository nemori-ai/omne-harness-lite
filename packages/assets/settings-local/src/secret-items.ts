import type { SettingDefinitions } from '@omne-harness/settings'

/**
 * The ids of the secret items of a definition. A preparation plan names them so that the engine
 * refuses a change of one of them before it allocates anything: a secret value reaches neither an
 * intent nor a receipt (SPEC "One-target persistence").
 */
export function secretItemsOf(definition: SettingDefinitions): string[] {
  return definition.items.filter(item => item.sensitivity === 'secret').map(item => item.id)
}
