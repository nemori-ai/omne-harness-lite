import schema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'Unknown',
  'ResponseId',
  'Usage',
  'Cost',
  'CostItem',
  'ToolCallAccount',
  'FrameAccount',
  'TrimReason',
  'TrimSummary',
  'CostCorrection',
  'RunId',
  'AttemptId',
  'ModelCallId',
] as const

function structuralSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuralSchema)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['minimum', 'if', 'then', 'else', 'allOf'].includes(key))
        .map(([key, item]) => [key, structuralSchema(item)]),
    )
  return value
}

export const schemaGraphs = [false, true].map(structure => ({
  name: structure ? 'structural' : 'full',
  kind: 'ordinary',
  resources: [contentSchema, identitySchema, expirySchema, schema].map(resource => {
    const selected = structure ? structuralSchema(resource) : resource
    if (selected === null || typeof selected !== 'object' || Array.isArray(selected))
      throw new Error('owned Schema is not an object')
    return selected
  }),
  resourceSpecifiers: [
    '@omne-harness-lite/content-blocks/schema/v2',
    '@omne-harness-lite/identity-values/schema',
    '@omne-harness-lite/offer-expiry/schema/v1',
    '@omne-harness-lite/call-accounts/schema',
  ],
  sourceFiles: ['src/schema-inputs.ts'],
  options: {
    strict: true,
    strictTypes: false,
    strictRequired: false,
    validateFormats: false,
    ownProperties: true,
  },
  keywords: [{ keyword: 'x-counterexamples', valid: true }],
  definitions: SCHEMA_DEF_NAMES.map(name => ({
    name,
    method: 'getSchema',
    schema: `${schemaId}#/$defs/${name}`,
  })),
}))
