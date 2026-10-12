import schema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'ToolDefinition',
  'SingleFunctionTool',
  'MultiCommandTool',
  'CommandDefinition',
  'ToolName',
  'ModelToolName',
  'ModelToolEntry',
  'ToolNeeds',
  'ToolSettings',
  'SettingDeclaration',
  'TargetEnvironment',
  'BindingLayer',
  'Facility',
  'Duration',
  'ExecutePermission',
  'ToolSource',
  'DependencyName',
  'ToolReturn',
  'ToolResult',
  'Offload',
  'JsonSchema',
] as const

export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [contentSchema, assetSchema, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema',
      '@omne-harness-lite/asset-model/schema',
      '@omne-harness-lite/tool-definition/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, ownProperties: true },
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'getSchema',
      schema: `${schemaId}#/$defs/${name}`,
    })),
  },
] as const
