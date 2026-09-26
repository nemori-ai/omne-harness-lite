import schema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import offerSchema from '@omne-harness-lite/offer-expiry/schema' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { jsonValue } from './json.ts'

export const schemaId: string = schema.$id
export const SCHEMA_DEF_NAMES = [
  'McpEndpoint',
  'McpTransport',
  'ActionSnapshot',
  'McpToolDescriptor',
  'McpActionName',
  'McpEndpointName',
  'OAuthBinding',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

// Fixed, package-owned schemas only; remote descriptor inputSchema is data, never a compile input.
const runtime = createSchemaRuntime([
  contentSchema,
  identitySchema,
  offerSchema,
  assetSchema,
  toolSchema,
  schema,
])
const validators = new Map(
  SCHEMA_DEF_NAMES.map(name => [name, runtime.compile({ $ref: `${schemaId}#/$defs/${name}` })]),
)

export function validate(definition: SchemaDefName, value: unknown): { readonly valid: boolean } {
  const validator = validators.get(definition)
  if (validator === undefined) throw new TypeError(`unknown MCP Schema definition ${definition}`)
  const data = jsonValue(value)
  return Object.freeze({ valid: data !== undefined && validator.validate(data) })
}
