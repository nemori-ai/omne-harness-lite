import { z } from 'zod'
import { defineSettings } from '@omne-harness/settings'
import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  sourceRequestSchema,
  sourceSnapshotSchema,
  type SourceRequest,
} from './source-retention-schema.ts'
import {
  readStandaloneSettingsRecord,
  projectStandaloneSettingsRecord,
} from './standalone-records.ts'
import { readProjectedSettingsState } from './projected-state.ts'
import type { SettingsTargetProjection } from './projection.ts'
import { digest, equal, json, stateKey, withinBudget } from './encoding.ts'

import {
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
  SOURCE_SNAPSHOT_FACT,
} from './source-retention-schema.ts'
import { projectSourceWrite } from './source-write-projection.ts'
export {
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
  SOURCE_SNAPSHOT_FACT,
} from './source-retention-schema.ts'
export const sourceSnapshotFactSchema = z.strictObject({
  request: sourceRequestSchema,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('captured'), snapshot: sourceSnapshotSchema }),
    z.strictObject({
      kind: z.literal('unavailable'),
      reason: z.enum([
        'unsupported',
        'forbidden',
        'definition_changed',
        'basis_changed',
        'incompatible',
      ]),
    }),
  ]),
})
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
function captureSource(port: ReadPort, request: SourceRequest) {
  const unavailable = (
    reason: 'unsupported' | 'forbidden' | 'definition_changed' | 'basis_changed' | 'incompatible',
  ) => ({ kind: 'unavailable' as const, reason })
  const { source } = request
  if (source.target.policyId !== 'independent') return unavailable('unsupported')
  if (
    source.domain.scope.kind === 'tenant' &&
    source.target.scopeRef !== source.domain.scope.tenant
  )
    return unavailable('forbidden')
  const record = readStandaloneSettingsRecord(port, stateKey(source.domain.scope, source.target))
  if (!record || record.retired) return unavailable('forbidden')
  if (!equal(record.projection.target, source.target))
    throw new Error('Invalid source target binding')
  const projection = projectStandaloneSettingsRecord(record)
  if (!projection) return unavailable('basis_changed')
  if (!hasMatchingDefinition(projection)) return unavailable('definition_changed')
  const value = readProjectedSettingsState(port, source.domain.scope, projection)
  if ('kind' in value) return { kind: 'unavailable' as const, reason: value.reason }
  return {
    kind: 'captured' as const,
    snapshot: { source, projection, state: value.view.state, presence: value.presence },
  }
}
export default {
  participant: SOURCE_SNAPSHOT_PARTICIPANT,
  protocol: SOURCE_SNAPSHOT_PROTOCOL,
  execute(facts, port) {
    if (facts['kind'] === 'write') return projectSourceWrite(facts, port)
    if (!withinBudget(facts))
      return { kind: 'failed', diagnostic: 'settings_source_snapshot_limit' }
    const parsed = sourceRequestSchema.safeParse(facts['request'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_source_snapshot_input' }
    try {
      const fact = sourceSnapshotFactSchema.parse({
        request: parsed.data,
        observation: captureSource(port, parsed.data),
      })
      if (!withinBudget(fact))
        return { kind: 'failed', diagnostic: 'settings_source_snapshot_limit' }
      port.provideFact(SOURCE_SNAPSHOT_FACT, json(fact))
      return { kind: 'participated', response: null }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_source_snapshot_invalid_data' }
    }
  },
} satisfies ParticipantModule
