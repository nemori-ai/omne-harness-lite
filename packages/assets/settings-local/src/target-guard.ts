import { RebaseBindingSchema, projectionForRebase, rebaseOperation } from './rebase-schema.ts'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { bindingSchema, GUARD_FACT, type Binding } from './schema.ts'
import {
  SettingsOwnerProjectionSchema,
  settingsAssetsProjectionFact,
  settingsStandaloneProjectionFact,
  type SettingsProjectionBinding,
} from './projection.ts'
import { equal, json, settingsSqlOperationBinding } from './encoding.ts'
export const TARGET_GUARD = 'settings.target-guard'
export const TARGET_GUARD_PROTOCOL = 'settings-target-guard/1'
export function projectionForChange(binding: Binding): SettingsProjectionBinding {
  return {
    domain: binding.domain,
    principalRef: binding.principalRef,
    captureId: binding.command.operationId,
    request: {
      deploymentRef: 'settings-write',
      mode: 'management',
      targets: [binding.command.target],
      selectionRef: null,
    },
  }
}
export function targetViews(port: ParticipantPort, binding: SettingsProjectionBinding) {
  const sources = [settingsStandaloneProjectionFact, settingsAssetsProjectionFact].map(key =>
    SettingsOwnerProjectionSchema.parse(port.requireFact(key)),
  )
  if (sources.some(source => !equal(source.binding, binding)))
    throw new Error('Settings projection binding mismatch')
  const views = sources.flatMap(source => source.views)
  const keys = views.map(view => JSON.stringify(view.target))
  if (new Set(keys).size !== keys.length) throw new Error('Settings target has multiple owners')
  if (views.length > 128) throw new Error('Settings projection limit exceeded')
  return views
}
export default {
  participant: TARGET_GUARD,
  protocol: TARGET_GUARD_PROTOCOL,
  execute(facts, port) {
    try {
      const rebase = facts['kind'] === 'rebase' ? RebaseBindingSchema.parse(facts['binding']) : null
      const binding = rebase ?? bindingSchema.parse(facts['binding'])
      const views = targetViews(
        port,
        rebase ? projectionForRebase(rebase) : projectionForChange(bindingSchema.parse(binding)),
      )
      const view = views.find(view => equal(view.target, binding.command.target))
      if (!view)
        return {
          kind: 'conflict',
          basis: json({
            binding: rebase
              ? rebaseOperation(rebase)
              : settingsSqlOperationBinding(bindingSchema.parse(binding)),
            failure: { kind: 'rejected', reason: 'forbidden' },
          }),
        }
      const { definition, definitionRef, sourceIds, grants } = view
      port.provideFact(GUARD_FACT, json({ binding, definition, definitionRef, sourceIds, grants }))
      return { kind: 'participated', response: null }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_target_projection_invalid' }
    }
  },
} satisfies ParticipantModule
