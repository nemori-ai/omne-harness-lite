import schema from '@omne-harness-lite/slash-command/schema' with { type: 'json' }
import type { BodyContract, BodyJudgeContext } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { snapshot, object } from './json.ts'
import { isSlashCommandDefinition, judgeSlashCommandValue } from './judge.ts'
import { slashCommandAttributeDeclarations, slashCommandReferences } from './declarations.ts'
import { SCHEMA_DEF_NAMES } from './schema.ts'

const capturedSchema = snapshot(schema)
if (!object(capturedSchema)) throw new Error('Slash-command Schema is not an object')
export const slashCommandBodyContract: BodyContract<'slash_command'> = Object.freeze({
  category: 'slash_command',
  schema: capturedSchema,
  judge(body: unknown, context?: BodyJudgeContext) {
    const definition =
      context?.definition === undefined
        ? 'SlashCommandDefinition'
        : SCHEMA_DEF_NAMES.find(name => name === context.definition)
    if (definition === undefined) throw new TypeError('unknown slash-command Schema definition')
    return judgeSlashCommandValue(definition, body, context)
  },
  deriveDeclarations(body: JsonValue) {
    if (!isSlashCommandDefinition(body))
      throw new TypeError('valid SlashCommandDefinition required')
    return Object.freeze({ declarations: slashCommandAttributeDeclarations(body) })
  },
  references(body: JsonValue) {
    if (!isSlashCommandDefinition(body))
      throw new TypeError('valid SlashCommandDefinition required')
    return slashCommandReferences(body)
  },
})
