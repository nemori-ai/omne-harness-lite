import { z } from 'zod'
import {
  SettingsIdSchema,
  SettingsSourceIdentitiesSchema,
  settingsSourceIdentities,
  type SettingsSourceIdentity,
  type SettingsSourceDescriptor,
} from '@omne-harness/settings'
import { equal } from './encoding.ts'

export const StoredSettingsSourceLayoutSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bound'), sources: SettingsSourceIdentitiesSchema }),
  z.strictObject({
    kind: z.literal('unmapped'),
    sourceIds: z
      .array(SettingsIdSchema)
      .min(1)
      .max(32)
      .refine(ids => new Set(ids).size === ids.length),
  }),
])
export type StoredSettingsSourceLayout = z.infer<typeof StoredSettingsSourceLayoutSchema>

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
  stored: StoredSettingsSourceLayout,
  current: readonly SettingsSourceDescriptor[],
): boolean {
  return stored.kind === 'bound' && equal(stored.sources, settingsSourceIdentities(current))
}
export function canRetainSettingsSource(
  stored: StoredSettingsSourceLayout,
  current: readonly SettingsSourceDescriptor[],
  sourceId: string,
): boolean {
  if (stored.kind !== 'bound') return false
  const previous = stored.sources.find(source => source.sourceId === sourceId)
  const next = settingsSourceIdentities(current).find(source => source.sourceId === sourceId)
  return previous !== undefined && next !== undefined && equal(previous, next)
}
