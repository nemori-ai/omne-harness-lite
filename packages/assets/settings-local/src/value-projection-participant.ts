import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { SettingsProjectionBindingSchema } from './projection.ts'
import { readProjectedSettingsState } from './projected-state.ts'
import { targetViews } from './target-guard.ts'
import { equal, json, withinBudget } from './encoding.ts'
import {
  SETTINGS_VALUE_PROJECTION,
  settingsValueProjectionFact,
  type SettingsValueProjection,
} from './value-projection.ts'

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
        views.push({ presence: 'unavailable', view: projection, reason: value.reason })
      else
        views.push({ presence: value.presence, view: { ...projection, state: value.view.state } })
    }
    const result = json({ binding, views })
    if (!withinBudget(result)) return { kind: 'unsupported', basis: { reason: 'limit_exceeded' } }
    port.provideFact(settingsValueProjectionFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
