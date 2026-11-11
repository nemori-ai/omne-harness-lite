import {
  settingsSourceIdentities,
  type SettingsSourceIdentity,
  type SettingsSourceDescriptor,
} from '@omne-harness/settings'
import { equal } from './encoding.ts'

export function projectSettingsSources(
  sources: readonly SettingsSourceIdentity[],
  ownerRevision: number,
): SettingsSourceDescriptor[] {
  return sources.map(source => ({
    ...source,
    scope: { ...source.scope },
    authorityRevision: String(ownerRevision),
  }))
}
export function matchesSettingsSources(
  stored: readonly SettingsSourceIdentity[],
  current: readonly SettingsSourceDescriptor[],
): boolean {
  return equal(stored, settingsSourceIdentities(current))
}
export function canRetainSettingsSource(
  stored: readonly SettingsSourceIdentity[],
  current: readonly SettingsSourceDescriptor[],
  sourceId: string,
): boolean {
  const previous = stored.find(source => source.sourceId === sourceId)
  const next = settingsSourceIdentities(current).find(source => source.sourceId === sourceId)
  return previous !== undefined && next !== undefined && equal(previous, next)
}
