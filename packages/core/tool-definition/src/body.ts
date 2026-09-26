import schema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import type { BodyContract, BodyJudgeContext } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { isToolDefinition, judgeToolDefinition } from './judge.ts'
import { toolAttributeDeclarations, toolReferences } from './declarations.ts'
import { SCHEMA_DEF_NAMES, validate } from './schema.ts'
import { copyJson, object } from './json.ts'

const resource = copyJson(schema)
if (!object(resource)) throw new Error('owned tool Schema resource is not an object')

export const toolBodyContract: BodyContract<'tool'> = Object.freeze({
  category: 'tool',
  schema: resource,
  judge(body: unknown, context?: BodyJudgeContext) {
    if (context?.definition !== undefined) {
      const definition = SCHEMA_DEF_NAMES.find(name => name === context.definition)
      if (definition === undefined) throw new TypeError('unknown tool Schema definition')
      return validate(definition, body).valid
        ? Object.freeze({ ok: true })
        : Object.freeze({ rejected: 'malformed' })
    }
    const result = judgeToolDefinition(body)
    if ('rejected' in result) return result
    if (!isToolDefinition(body)) throw new Error('inconsistent tool definition judgment')
    if (
      body.origin.kind !== 'authored' ||
      (context?.capabilityName !== undefined && body.name !== context.capabilityName)
    )
      return Object.freeze({ rejected: 'malformed' })
    return Object.freeze({ ok: true })
  },
  deriveDeclarations(body: JsonValue) {
    if (!isToolDefinition(body) || body.origin.kind !== 'authored')
      throw new TypeError('authored tool definition required')
    return Object.freeze({ declarations: toolAttributeDeclarations(body) })
  },
  references(body: JsonValue) {
    if (!isToolDefinition(body) || body.origin.kind !== 'authored')
      throw new TypeError('authored tool definition required')
    return toolReferences(body)
  },
})
