import type { BodyContract, CapabilityId } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import schema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import type { ActionSnapshot, McpEndpoint } from './types.ts'
import { deriveMcpDeclarations } from './declarations.ts'
import { jsonValue, object } from './json.ts'
import { judgeMcpEndpoint, judgeMcpValue } from './judge.ts'

function endpoint(value: unknown): value is McpEndpoint {
  return 'ok' in judgeMcpEndpoint(value)
}
function snapshot(value: unknown): value is ActionSnapshot {
  return 'ok' in judgeMcpValue('ActionSnapshot', value)
}
const noReferences: readonly CapabilityId[] = Object.freeze([])
// The port owns a complete resource: relative refs keep its base URI and shared definitions.
const resource = jsonValue({ ...schema, $ref: '#/$defs/McpEndpoint' })
if (!object(resource)) throw new Error('MCP Schema resource must be an object')
export const mcpBodyContract: BodyContract<'mcp'> = Object.freeze({
  category: 'mcp',
  schema: resource,
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
