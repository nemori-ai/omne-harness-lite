import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const schema: { readonly $id: string } = require('../schema/governance-center-entry.schema.json')
const iv = require('@omne-harness-lite/identity-values/schema')
const oe = require('@omne-harness-lite/offer-expiry/schema')
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [iv, oe, schema],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      './schema/governance-center-entry.schema.json',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, validateFormats: false },
    keywords: ['x-counterexamples'],
    definitions: [
      { name: 'Envelope', method: 'compile', schema: { $ref: `${schema.$id}#/$defs/Envelope` } },
      { name: 'Exchange', method: 'compile', schema: { $ref: `${schema.$id}#/$defs/Exchange` } },
    ],
  },
] as const
