import schema from '@omne-harness-lite/skill-package/schema' with { type: 'json' }
import previousSchema from '@omne-harness-lite/skill-package/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
export const SCHEMA_DEF_NAMES = [
  'SkillName',
  'SkillManifest',
  'ResourceEntry',
  'SkillDefinitionRecord',
  'SkillPackage',
] as const

export { schema, previousSchema }
export const previousResources = [contentSchema, assetSchema, toolSchema, previousSchema]
export const resources = [...previousResources, schema]
export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: resources,
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/asset-model/schema/v2',
      '@omne-harness-lite/tool-definition/schema/v2',
      '@omne-harness-lite/skill-package/schema/v2',
      '@omne-harness-lite/skill-package/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${schema.$id}#/$defs/${name}` },
    })),
  },
  {
    name: 'previous',
    kind: 'exact',
    resources: previousResources,
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/asset-model/schema/v2',
      '@omne-harness-lite/tool-definition/schema/v2',
      '@omne-harness-lite/skill-package/schema/v2',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${previousSchema.$id}#/$defs/${name}` },
    })),
  },
  {
    name: 'numeric-one',
    kind: 'exact',
    resources: resources,
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/asset-model/schema/v2',
      '@omne-harness-lite/tool-definition/schema/v2',
      '@omne-harness-lite/skill-package/schema/v2',
      '@omne-harness-lite/skill-package/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: [{ name: 'NumericOne', method: 'compile', schema: { const: 1 } }],
  },
] as const
