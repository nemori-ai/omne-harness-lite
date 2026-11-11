import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { SettingsProjectionBindingSchema, settingsAssetsProjectionFact } from './projection.ts'
import { json } from './encoding.ts'
export default {
  participant: 'settings.without-assets',
  protocol: 'settings-projection/1',
  execute(facts, port) {
    const parsed = SettingsProjectionBindingSchema.safeParse(facts['binding'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_invalid_projection' }
    port.provideFact(settingsAssetsProjectionFact, json({ binding: parsed.data, views: [] }))
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
