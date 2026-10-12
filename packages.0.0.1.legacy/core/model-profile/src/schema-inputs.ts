import schema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'ModelProfile',
  'ModelAdaptationBinding',
  'ModelProfileContent',
  'ModelProfileSnapshot',
  'ModelProfileRef',
  'RouteName',
  'ProfileOrigin',
  'ProviderName',
  'InputConstraints',
  'Registration',
  'ModelRequestParameters',
  'ReasoningEffort',
  'InputLimitFact',
  'UpstreamInputLimits',
] as const

export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [identitySchema, expirySchema, contentSchema, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema/v1',
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/model-profile/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: {
      strict: true,
      strictTypes: false,
      strictRequired: false,
      validateFormats: false,
      ownProperties: true,
    },
    keywords: ['x-counterexamples'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'getSchema',
      schema: `${schemaId}#/$defs/${name}`,
    })),
  },
] as const
