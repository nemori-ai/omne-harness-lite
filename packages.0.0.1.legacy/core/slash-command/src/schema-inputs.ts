import schema from '@omne-harness-lite/slash-command/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'CommandName',
  'ServiceName',
  'CommandBinding',
  'ParameterDeclaration',
  'SlashCommandDefinition',
  'Span',
  'CommandInvocation',
  'Recognition',
  'ParseResult',
] as const)

export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [contentSchema, assetSchema, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/asset-model/schema/v2',
      '@omne-harness-lite/slash-command/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${schemaId}#/$defs/${name}` },
    })),
  },
] as const
