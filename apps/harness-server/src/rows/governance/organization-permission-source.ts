import {
  readPermissionSettingsSource,
  type PermissionDefinition,
  type PermissionScope,
  type PermissionSource,
} from '@omne-harness/permissions'
import type { SettingsSourceReading } from '@omne-harness/settings-local'
import { canonicalDigest } from '@omne-harness/tool'

const missing = (): PermissionSource => ({
  kind: 'unavailable',
  sourceRef: 'settings.organization',
})

export function organizationPermissionSource(
  read: SettingsSourceReading,
  definition: PermissionDefinition,
  scope: PermissionScope,
): PermissionSource {
  if (read.kind !== 'captured') return missing()
  const { snapshot } = read
  const candidates = snapshot.projection.sources.filter(
    source =>
      source.scope.kind === 'organization' && source.scope.subjectRef === scope.organizationId,
  )
  if (candidates.length !== 1) return missing()
  const descriptor = candidates[0]!
  const source = snapshot.state.sources.find(item => item.id === descriptor.sourceId)
  if (source === undefined) return missing()
  const result = readPermissionSettingsSource({
    definition,
    scope,
    layer: 'organization',
    sourceRef: canonicalDigest(snapshot.source),
    revision: canonicalDigest({
      state: snapshot.state.revision,
      descriptor,
      definition: snapshot.projection.definitionRef,
      owner: snapshot.projection.ownerRevision,
    }),
    observation: {
      kind: 'available',
      definition: snapshot.projection.definition,
      descriptor,
      source,
    },
  })
  return result.kind === 'invalid-input' ? missing() : result
}
