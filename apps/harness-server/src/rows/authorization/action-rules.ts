import { z } from 'zod'
import { maintenanceGrantsSchema } from './grant-tightening.ts'

const text = z.string().min(1)
const adoption = z
  .strictObject({ owner: text, name: text, revision: text, digest: text })
  .readonly()
const rule = z
  .strictObject({
    id: text,
    effect: z.enum(['allow', 'deny']),
    tool: text,
    definition: adoption.nullish(),
  })
  .readonly()

export const actionRulesSchema = z
  .strictObject({
    revision: text,
    rules: z
      .array(rule)
      .refine(rules => new Set(rules.map(item => item.id)).size === rules.length, {
        message: 'action rule ids must be unique',
      })
      .readonly(),
  })
  .readonly()

export const authorizationConfig = z.strictObject({
  actionRules: actionRulesSchema.optional(),
  maintenanceGrants: maintenanceGrantsSchema.optional(),
})
export type ActionRules = z.output<typeof actionRulesSchema>
