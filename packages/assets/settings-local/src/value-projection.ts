import { z } from 'zod'
import { SettingsStateSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import {
  SettingsProjectionBindingSchema,
  SettingsTargetProjectionSchema,
  type SettingsProjectionBinding,
} from './projection.ts'
import { json } from './encoding.ts'

export const settingsValueProjectionFact = {
  key: 'settings.value-projection',
  protocol: 'settings-value-projection/1',
}
export const SETTINGS_VALUE_PROJECTION = {
  participant: 'settings.value-projection',
  protocol: 'settings-value-projection/1',
}
export const SettingsValueProjectionSchema = z.strictObject({
  binding: SettingsProjectionBindingSchema,
  views: z
    .array(
      z.strictObject({
        view: SettingsTargetProjectionSchema.extend({
          state: SettingsStateSchema,
        }),
        presence: z.enum(['absent', 'present']),
      }),
    )
    .max(128),
})
export type SettingsValueProjection = z.infer<typeof SettingsValueProjectionSchema>

export function settingsValueProjectionCommand(binding: SettingsProjectionBinding): FactCommandV2 {
  return {
    participant: SETTINGS_VALUE_PROJECTION.participant,
    facts: { binding: json(SettingsProjectionBindingSchema.parse(binding)) },
  }
}
