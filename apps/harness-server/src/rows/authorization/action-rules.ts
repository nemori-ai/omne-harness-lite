import { z } from 'zod'
import { maintenanceGrantsSchema } from './grant-tightening.ts'

const text = z.string().min(1)
const adoption = z
  .strictObject({ owner: text, name: text, revision: text, digest: text })
  .readonly()
const named = z
  .strictObject({
    id: text,
    effect: z.enum(['allow', 'deny']),
    tool: text,
    definition: adoption.nullish(),
  })
  .readonly()
/** Every tool whose definition one owner adopts: the tools a tenant holds have no names a deployment can list. */
const owned = z
  .strictObject({ id: text, effect: z.enum(['allow', 'deny']), definitionOwner: text })
  .readonly()
const rule = z.union([named, owned])

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

export function toolActionRule(rules: ActionRules, definition: z.output<typeof adoption>) {
  const matches = rules.rules.filter(rule =>
    'definitionOwner' in rule
      ? rule.definitionOwner === definition.owner
      : rule.tool === definition.name &&
        (rule.definition == null ||
          (rule.definition.owner === definition.owner &&
            rule.definition.name === definition.name &&
            rule.definition.revision === definition.revision &&
            rule.definition.digest === definition.digest)),
  )
  return (
    matches.find(rule => rule.effect === 'deny') ?? matches.find(rule => rule.effect === 'allow')
  )
}
