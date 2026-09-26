import type { BodyContract, CapabilityId } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { ActionSnapshot, McpEndpoint } from './types.ts'
import { deriveMcpDeclarations } from './declarations.ts'
import { jsonValue } from './json.ts'
import { judgeMcpEndpoint, judgeMcpValue } from './judge.ts'
import { schemaId } from './schema.ts'

function endpoint(value: unknown): value is McpEndpoint {
  return 'ok' in judgeMcpEndpoint(value)
}
function snapshot(value: unknown): value is ActionSnapshot {
  return 'ok' in judgeMcpValue('ActionSnapshot', value)
}
const noReferences: readonly CapabilityId[] = Object.freeze([])
export const mcpBodyContract: BodyContract<'mcp'> = Object.freeze({
  category: 'mcp',
  schema: Object.freeze({ $ref: `${schemaId}#/$defs/McpEndpoint` }),
  judge: judgeMcpEndpoint,
  deriveDeclarations(body: JsonValue, actionSnapshot?: JsonValue) {
    const data = jsonValue(body)
    if (!endpoint(data)) throw new TypeError('MCP declarations require a valid endpoint body')
    if (actionSnapshot === undefined) return deriveMcpDeclarations(data)
    const actualSnapshot = jsonValue(actionSnapshot)
    if (!snapshot(actualSnapshot))
      throw new TypeError('MCP declarations require a valid action snapshot')
    return deriveMcpDeclarations(data, actualSnapshot)
  },
  references(body: JsonValue) {
    if (!endpoint(body)) throw new TypeError('MCP references require a valid endpoint body')
    return noReferences
  },
})
