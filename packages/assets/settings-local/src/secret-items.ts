import type { SettingDefinitions } from '@omne-harness/settings'

export function secretItemsOf(definition: SettingDefinitions): string[] {
  return definition.items.filter(item => item.sensitivity === 'secret').map(item => item.id)
}
