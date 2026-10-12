import schema from '@omne-harness-lite/agent-definition/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema/v3' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [
      schema,
      assetSchema,
      toolSchema,
      profileSchema,
      contentSchema,
      retainedContentSchema,
      identitySchema,
      expirySchema,
    ],
    resourceSpecifiers: [
      '@omne-harness-lite/agent-definition/schema',
      '@omne-harness-lite/asset-model/schema',
      '@omne-harness-lite/tool-definition/schema',
      '@omne-harness-lite/model-profile/schema/v3',
      '@omne-harness-lite/content-blocks/schema',
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema/v1',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: [
      {
        name: 'AgentDefinitionBody',
        method: 'compile',
        schema: { $ref: `${schema.$id}#/$defs/AgentDefinitionBody` },
      },
    ],
  },
] as const
