import { readProjectedSettingsState } from './projected-state.ts'
import { defineSettings } from '@omne-harness/settings'
import type { SettingsBasis, SettingsTargetView, SettingsFailure } from '@omne-harness/settings'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { targetViews } from './target-guard.ts'
import { canonical, digest, equal, json, withinBudget } from './encoding.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import {
  SNAPSHOT_PARTICIPANT,
  SNAPSHOT_PROTOCOL,
  SnapshotInputSchema,
  snapshotOperation,
} from './snapshot-schema.ts'
function captureValues(
  port: ParticipantPort,
  input: ReturnType<typeof SnapshotInputSchema.parse>,
  projected: ReturnType<typeof targetViews>,
): SettingsBasis | SettingsFailure {
  const rejected = (reason: SettingsFailure['reason']): SettingsFailure => ({
    kind: 'rejected',
    reason,
  })
  const operation = snapshotOperation(input)
  const views: SettingsTargetView[] = [],
    unavailableProviders: string[] = []
  for (const projection of projected) {
    const { definition, definitionRef } = projection
    const defined = defineSettings(definition)
    if (defined.kind !== 'defined' || digest(defined.definition) !== definitionRef.digest)
      return rejected('definition_changed')
    if (!input.availability.some(ref => equal(ref, definitionRef))) {
      unavailableProviders.push(definitionRef.providerId)
      continue
    }
    const value = readProjectedSettingsState(port, input.binding.domain.scope, projection)
    if ('kind' in value) return value
    views.push(value.view)
  }
  if (input.binding.request.mode === 'runtime' && unavailableProviders.length)
    return rejected('unavailable')
  const basis: SettingsBasis = {
    scopeKey: digest([
      operation.domain,
      operation.principalRef,
      input.binding.request.deploymentRef,
    ]),
    revision: digest([
      projected,
      views,
      input.incarnation,
      input.registryRevision,
      input.expiryEpoch,
      input.selectionDigest,
    ]),
    views,
    completeness: unavailableProviders.length ? 'partial' : 'complete',
    unavailableProviders: [...new Set(unavailableProviders)].sort(),
  }
  if (Buffer.byteLength(canonical(basis)) > 512 * 1024) return rejected('limit_exceeded')
  return basis
}
export default {
  participant: SNAPSHOT_PARTICIPANT,
  protocol: SNAPSHOT_PROTOCOL,
  execute(facts, port) {
    const fail = (reason: string) => ({
      kind: 'conflict' as const,
      basis: { kind: 'rejected', reason },
    })
    if (!withinBudget(facts)) return fail('limit_exceeded')
    try {
      const input = SnapshotInputSchema.parse(facts['input'])
      const operation = snapshotOperation(input)
      if (!equal(port.requireFact(TERMINAL_FACT), { binding: operation, kind: 'consume' }))
        return fail('forbidden')
      const projected = targetViews(port, input.binding)
      if (
        input.binding.request.targets.some(
          target => !projected.some(view => equal(view.target, target)),
        )
      )
        return fail('forbidden')
      if (input.purpose === 'authority')
        return {
          kind: 'participated',
          response: json({ operation, authority: projected.map(view => view.target) }),
        }
      const basis = captureValues(port, input, projected)
      if ('kind' in basis) return fail(basis.reason)
      return { kind: 'participated', response: json({ operation, basis }) }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_snapshot_invalid_data' }
    }
  },
} satisfies ParticipantModule
