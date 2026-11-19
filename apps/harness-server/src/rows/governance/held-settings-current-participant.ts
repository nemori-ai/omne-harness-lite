import { z } from 'zod'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  SettingsValueProjectionSchema,
  settingsValueProjectionFact,
} from '@omne-harness/settings-local'
import {
  SettingsCommitCurrentSchema,
  SettingsPreparationCurrentSchema,
  settingsCommitCurrentFact,
  settingsPreparationCurrentFact,
} from '@omne-harness/settings-local/preparation'
import {
  HELD_SETTINGS_PHASES,
  heldSettingsCurrentMaterial,
  heldSettingsCurrentParticipant,
  heldSettingsCurrentProtocol,
  heldSettingsCurrentRequestSchema,
} from './held-settings-current.ts'
import { tenantSettingsCurrentConfigurationSchema } from './tenant-settings-current.ts'

const parameters = new URL(import.meta.url).searchParams
const phase = z.enum(HELD_SETTINGS_PHASES).parse(parameters.get('phase'))
const configuration = tenantSettingsCurrentConfigurationSchema.parse(
  JSON.parse(parameters.get('configuration') ?? 'null'),
)

export default {
  participant: heldSettingsCurrentParticipant(phase),
  protocol: heldSettingsCurrentProtocol(phase, configuration),
  execute(facts, port) {
    const request = heldSettingsCurrentRequestSchema.parse(facts['request'])
    const values = SettingsValueProjectionSchema.parse(
      port.requireFact(settingsValueProjectionFact),
    )
    const material = heldSettingsCurrentMaterial(values, request.capture, configuration)
    if (phase === 'ready') {
      if (material === undefined)
        return { kind: 'unsupported', basis: { reason: 'held-settings-current' } }
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
