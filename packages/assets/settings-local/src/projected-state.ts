import {
  evaluateSettings,
  type SettingsFailure,
  type SettingsTargetView,
} from '@omne-harness/settings'
import type { StorageScope } from '@omne-harness/sql-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import type { SettingsTargetProjection } from './projection.ts'
import { readStateRecord } from './records.ts'
import { equal } from './encoding.ts'
import { matchesSettingsSources } from './source-layout.ts'

export function readProjectedSettingsState(
  port: ReadPort,
  scope: StorageScope,
  projection: SettingsTargetProjection,
): { view: SettingsTargetView; presence: 'absent' | 'present' } | SettingsFailure {
  const { target, enabled, definition, definitionRef, grants, sources } = projection
  const fail = (reason: SettingsFailure['reason']): SettingsFailure => ({
    kind: 'rejected',
    reason,
  })
  const current = readStateRecord(port, scope, target)
  if (current && !equal(current.definitionRef, definitionRef)) return fail('definition_changed')
  if (current && !matchesSettingsSources(current.sourceLayout, sources))
    return fail('basis_changed')
  const state = current?.state ?? {
    revision: 0,
    sources: sources.map(({ sourceId: id }) => ({ id, values: [] })),
  }
  if (evaluateSettings({ definition, sources: state.sources }).kind !== 'complete')
    return fail('incompatible')
  return {
    view: { target, enabled, definition, definitionRef, grants, state, sources },
    presence: current ? 'present' : 'absent',
  }
}
