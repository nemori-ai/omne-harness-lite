import { defineSettings } from '@omne-harness/settings'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { digest, equal, stateKey } from './encoding.ts'
import { readProjectedSettingsState } from './projected-state.ts'
import type { SettingsTargetProjection } from './projection.ts'
import type { SettingsFailure } from '@omne-harness/settings'
import type { SourceReference } from './source-retention-schema.ts'
import {
  isIndependentTargetInDomain,
  projectStandaloneSettingsRecord,
  readStandaloneSettingsRecord,
} from './standalone-records.ts'

function hasMatchingDefinition(projection: SettingsTargetProjection) {
  const defined = defineSettings(projection.definition)
  return (
    defined.kind === 'defined' &&
    equal(projection.definitionRef, {
      providerId: defined.definition.providerId,
      definitionId: defined.definition.definitionId,
      version: defined.definition.version,
      digest: digest(defined.definition),
    })
  )
}

export function captureSource(port: ReadPort, source: SourceReference) {
  const unavailable = (reason: SettingsFailure['reason'] | 'unsupported') => ({
    kind: 'unavailable' as const,
    reason,
  })
  if (source.target.policyId !== 'independent') return unavailable('unsupported')
  if (!isIndependentTargetInDomain(source.domain, source.target)) return unavailable('forbidden')
  const record = readStandaloneSettingsRecord(port, stateKey(source.domain.scope, source.target))
  if (!record || record.retired) return unavailable('forbidden')
  if (!equal(record.projection.target, source.target))
    throw new Error('Invalid source target binding')
  const projection = projectStandaloneSettingsRecord(record)
  if (!hasMatchingDefinition(projection)) return unavailable('definition_changed')
  const value = readProjectedSettingsState(port, source.domain.scope, projection)
  if ('kind' in value) return unavailable(value.reason)
  return {
    kind: 'captured' as const,
    snapshot: { source, projection, state: value.view.state, presence: value.presence },
  }
}
