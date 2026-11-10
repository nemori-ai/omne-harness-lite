import { z } from 'zod'
import { SettingsStateSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import {
  SettingsProjectionBindingSchema,
  SettingsTargetProjectionSchema,
  type SettingsProjectionBinding,
} from './projection.ts'
import { failureSchema } from './schema.ts'
import { json } from './encoding.ts'

export const settingsValueProjectionFact = {
  key: 'settings.value-projection',
  protocol: 'settings-value-projection/2',
}
export const SETTINGS_VALUE_PROJECTION = {
  participant: 'settings.value-projection',
  protocol: 'settings-value-projection/2',
}
export const SettingsValueProjectionSchema = z.strictObject({
  binding: SettingsProjectionBindingSchema,
  views: z
    .array(
      z.union([
        z.strictObject({
          view: SettingsTargetProjectionSchema.extend({
            state: SettingsStateSchema,
          }),
          presence: z.enum(['absent', 'present']),
        }),
        z.strictObject({
          presence: z.literal('unavailable'),
          view: SettingsTargetProjectionSchema,
          reason: failureSchema.shape.reason,
        }),
      ]),
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
