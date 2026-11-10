import type { SettingsSourceIdentity } from '@omne-harness/settings'

export function ownerSources(...ids: string[]): SettingsSourceIdentity[] {
  return ids.map(sourceId => ({
    sourceId,
    ownerRef: 'fixture-owner',
    scope: { kind: 'owner', subjectRef: 'fixture-settings' },
  }))
}
