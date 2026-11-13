// The ready and the commit participant of a tenant-layer Settings write. Each reads the target
// snapshot of its own transaction and states the current material from it. The commit decision of
// Settings then checks the revision, the definition, the grants, the lock and the value against
// this material, in the same transaction.
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
} from '@omne-harness/settings-local/preparation'
import { targetSnapshotFact, targetSnapshotSchema } from './target-snapshot.ts'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  tenantSettingsCurrentConfigurationSchema,
  tenantSettingsCurrentMaterial,
  tenantSettingsCurrentParticipant,
  tenantSettingsCurrentProtocol,
  tenantSettingsCurrentRequestSchema,
  TENANT_SETTINGS_PHASES,
} from './tenant-settings-current.ts'

const parameters = new URL(import.meta.url).searchParams
const phase = z.enum(TENANT_SETTINGS_PHASES).parse(parameters.get('phase'))
const configurationText = parameters.get('configuration') ?? 'null'
const configuration = tenantSettingsCurrentConfigurationSchema.parse(JSON.parse(configurationText))

export default {
  participant: tenantSettingsCurrentParticipant(phase),
  protocol: tenantSettingsCurrentProtocol(phase, configuration),
  execute(facts, port) {
    const request = tenantSettingsCurrentRequestSchema.parse(facts['request'])
    const snapshot = targetSnapshotSchema.parse(port.requireFact(targetSnapshotFact))
    const material =
      canonicalText(snapshot.binding) === canonicalText(request.snapshot)
        ? tenantSettingsCurrentMaterial(snapshot, configuration)
        : undefined
    if (phase === 'ready') {
      if (material === undefined)
        return { kind: 'unsupported', basis: { reason: 'tenant-settings-current' } }
      const { basis, standing, sources } = material
      port.provideFact(
        settingsPreparationCurrentFact,
        z.json().parse(
          SettingsPreparationCurrentSchema.parse({
            binding: request.binding,
            basis,
            standing,
            sources,
          }),
        ),
      )
    } else {
      port.provideFact(
        settingsCommitCurrentFact,
        z.json().parse(
          SettingsCommitCurrentSchema.parse({
            binding: request.binding,
            observation:
              material === undefined ? { kind: 'unavailable' } : { kind: 'available', material },
          }),
        ),
      )
    }
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
