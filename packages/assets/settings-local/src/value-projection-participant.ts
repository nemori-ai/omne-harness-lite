import type { SettingsFailure } from '@omne-harness/settings'
import type { StorageScope } from '@omne-harness/sql-contract'
import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { SettingsProjectionBindingSchema, type SettingsTargetProjection } from './projection.ts'
import { readProjectedSettingsState } from './projected-state.ts'
import { readStateRecord } from './records.ts'
import { targetViews } from './target-views.ts'
import { equal, json, withinBudget } from './encoding.ts'
import {
  SETTINGS_VALUE_PROJECTION,
  settingsValueProjectionFact,
  type SettingsValueProjection,
} from './value-projection.ts'

function unavailableView(
  port: ReadPort,
  scope: StorageScope,
  view: SettingsTargetProjection,
  reason: SettingsFailure['reason'],
): SettingsValueProjection['views'][number] {
  if (reason !== 'definition_changed') return { presence: 'unavailable', view, reason }
  const record = readStateRecord(port, scope, view.target)
  if (record === null) throw new Error('A changed Settings definition has no stored state')
  return {
    presence: 'unavailable',
    view,
    reason,
    stored: { definitionRef: record.definitionRef, state: record.state },
  }
}

export default {
  ...SETTINGS_VALUE_PROJECTION,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'unsupported', basis: { reason: 'limit_exceeded' } }
    const binding = SettingsProjectionBindingSchema.parse(facts['binding'])
    const projections = targetViews(port, binding)
    if (
      binding.request.targets.some(target => !projections.some(view => equal(view.target, target)))
    )
      return { kind: 'unsupported', basis: { reason: 'target_unavailable' } }
    const views: SettingsValueProjection['views'] = []
    for (const projection of projections) {
      const value = readProjectedSettingsState(port, binding.domain.scope, projection)
      if ('kind' in value)
        views.push(unavailableView(port, binding.domain.scope, projection, value.reason))
      else
        views.push({ presence: value.presence, view: { ...projection, state: value.view.state } })
    }
    const result = json({ binding, views })
    if (!withinBudget(result)) return { kind: 'unsupported', basis: { reason: 'limit_exceeded' } }
    port.provideFact(settingsValueProjectionFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
