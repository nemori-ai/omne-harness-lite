import { z } from 'zod'
import { maintenanceGrantsSchema } from './grant-tightening.ts'

const text = z.string().min(1)
const adoption = z
  .strictObject({ owner: text, name: text, revision: text, digest: text })
  .readonly()
const effect = z.enum(['allow', 'deny'])
// A rule names one tool, or a source: the capability behind an action, by its category and, optionally, its name.
const rule = z.union([
  z.strictObject({ id: text, effect, tool: text, definition: adoption.nullish() }).readonly(),
  z
    .strictObject({
      id: text,
      effect,
      source: z.strictObject({ category: text, name: text.optional() }).readonly(),
    })
    .readonly(),
])

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

export function toolActionRule(
  rules: ActionRules,
  definition: z.output<typeof adoption>,
  capability: Readonly<{ category: string; name: string }>,
) {
  const matches = rules.rules.filter(rule =>
    'source' in rule
      ? rule.source.category === capability.category &&
        (rule.source.name === undefined || rule.source.name === capability.name)
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
