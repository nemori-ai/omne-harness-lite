import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import type { BodyContract, BodyJudgeContext } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { isLoopExtensionDefinition, judgeDefinition } from './judge.ts'
import { loopExtensionAttributeDeclarations, loopExtensionReferences } from './declarations.ts'
import { SCHEMA_DEF_NAMES, validate } from './schema.ts'
import { object, snapshot } from './json.ts'

const resource = snapshot(schema)
if (!object(resource)) throw new Error('owned loop Schema is not an object')
export const loopExtensionBodyContract: BodyContract<'loop_extension'> = Object.freeze({
  category: 'loop_extension',
  schema: resource,
  judge(body: unknown, context?: BodyJudgeContext) {
    if (context?.definition !== undefined) {
      const definition = SCHEMA_DEF_NAMES.find(name => name === context.definition)
      if (definition === undefined) throw new TypeError('unknown loop Schema definition')
      return validate(definition, body).valid
        ? Object.freeze({ ok: true })
        : Object.freeze({ rejected: 'malformed' })
    }
    const result = judgeDefinition(body)
    if ('rejected' in result) return result
    if (context?.capabilityName !== undefined && result.ok.name !== context.capabilityName)
      return Object.freeze({ rejected: 'malformed' })
    return Object.freeze({ ok: true })
  },
  deriveDeclarations(body: JsonValue) {
    if (!isLoopExtensionDefinition(body)) throw new TypeError('loop definition required')
    return Object.freeze({ declarations: loopExtensionAttributeDeclarations(body) })
  },
  references(body: JsonValue) {
    if (!isLoopExtensionDefinition(body)) throw new TypeError('loop definition required')
    return loopExtensionReferences(body)
  },
})
