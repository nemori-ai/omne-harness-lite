import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const schema = require('../schema/offer-expiry.schema.json') as {
  $id: string
  $defs: Record<string, unknown>
}
export const schemaId: string = schema.$id
export const SCHEMA_DEF_NAMES = ['Instant', 'OfferTiming', 'OfferState', 'SettledState'] as const

export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [schema],
    resourceSpecifiers: ['@omne-harness-lite/offer-expiry/schema'],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, allErrors: false, validateFormats: false },
    keywords: ['x-counterexamples'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'getSchema',
      schema: `${schemaId}#/$defs/${name}`,
    })),
  },
] as const
