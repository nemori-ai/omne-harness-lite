import schema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import offerSchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
export const schemaId: string = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'McpEndpoint',
  'McpTransport',
  'ActionSnapshot',
  'McpToolDescriptor',
  'McpActionName',
  'McpEndpointName',
  'OAuthBinding',
] as const)

export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [contentSchema, identitySchema, offerSchema, assetSchema, toolSchema, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema/v1',
      '@omne-harness-lite/asset-model/schema/v2',
      '@omne-harness-lite/tool-definition/schema/v2',
      '@omne-harness-lite/mcp-endpoint/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${schemaId}#/$defs/${name}` },
    })),
  },
] as const
