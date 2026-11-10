import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import {
  GovernanceTargetBindingSchema,
  type GovernanceTargetBinding,
} from '@omne-harness/governance-local'
import {
  SettingsPreparationCurrentSchema,
  type SettingsPreparationOptions,
  type PreparationRegistration,
} from '@omne-harness/settings-local/preparation'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { targetSnapshotCommands } from './target-snapshot.ts'
import { settingsCurrentParticipant, type SettingsCurrentPhase } from './settings-current.ts'

const planSchema = SettingsPreparationCurrentSchema.omit({ binding: true }).extend({
  kind: z.literal('planned'),
  purpose: z.strictObject({ kind: z.literal('target-change') }),
})
type CurrentOptions<Context> = Pick<SettingsPreparationOptions<Context>, 'plan' | 'currentCommands'>
export function createSettingsCurrentProjection<Context>(options: {
  storage: SqlStorage
  domain: DomainRef
  capture: PreparationRegistration
  location: Omit<GovernanceTargetBinding, 'principalRef' | 'captureId' | 'transactionDomain'>
}): CurrentOptions<Context> {
  const location = structuredClone(options.location)
  const domain = structuredClone(options.domain)
  const capture = structuredClone(options.capture)
  if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== location.scope.tenantRef)
    throw new TypeError('Settings current location requires its tenant domain')
  function snapshot(
    principalRef: string,
    captureId: string,
    target: GovernanceTargetBinding['target'],
  ) {
    if (canonicalText(target) !== canonicalText(location.target))
      throw new Error('Settings current target mismatch')
    return GovernanceTargetBindingSchema.parse({
      ...location,
      principalRef,
      captureId,
      transactionDomain: domain.transactionDomain,
    })
  }
  function commands(
    phase: SettingsCurrentPhase,
    bound: GovernanceTargetBinding,
    attempt: z.infer<typeof SettingsPreparationCurrentSchema>['binding'] | null,
  ) {
    return [
      ...targetSnapshotCommands(bound),
      {
        participant: settingsCurrentParticipant(phase),
        facts: { request: z.json().parse({ snapshot: bound, attempt }) },
      },
    ]
  }
  return {
    async plan(_context, { identity }) {
      const captureId = randomUUID()
      const bound = snapshot(identity.principalRef, captureId, identity.operation.target)
      if (canonicalText(identity.domain) !== canonicalText(domain))
        return { kind: 'rejected', reason: 'forbidden' }
      const result = await options.storage.commit({
        identity: {
          ...domain,
          operation: 'harness.settings-capture',
          protocolVersion: '2',
          operationKey: captureId,
        },
        ...capture,
        commands: commands('capture', bound, null),
      })
      if (result.kind !== 'committed') return { kind: 'rejected', reason: 'unavailable' }
      return planSchema.parse(
        result.responses.find(value => value.participant === settingsCurrentParticipant('capture'))
          ?.reply.response,
      )
    },
    currentCommands(_context, { phase, binding }) {
      const bound = snapshot(
        binding.identity.principalRef,
        canonicalDigest({ phase, binding }).slice(7),
        binding.identity.operation.target,
      )
      return commands(phase, bound, binding)
    },
  }
}
