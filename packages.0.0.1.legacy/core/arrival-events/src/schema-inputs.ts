import schema from '@omne-harness-lite/arrival-events/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }
export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'ArrivalEnvelope',
  'ArrivalTarget',
  'ArrivalEvent',
  'OpenEvent',
  'FillEvent',
  'CloseEvent',
  'TrimEvent',
  'AccountEvent',
  'FinishEvent',
  'BlockKind',
  'FillMode',
  'BlockHead',
  'PresentationHint',
  'FinishReason',
] as const)

export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [contentSchema, accountsSchema, loopSchema, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/call-accounts/schema/v2',
      '@omne-harness-lite/loop-extension/schema/v2',
      '@omne-harness-lite/arrival-events/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${schemaId}#/$defs/${name}` },
    })),
  },
] as const
