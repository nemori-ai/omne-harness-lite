import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cg: { readonly $id: string } = require('../schema/governance-client-operations.schema.json')
const cg2: {
  readonly $id: string
} = require('../schema/governance-client-operations-v2.schema.json')
const oe: { readonly $id: string } = require('@omne-harness-lite/offer-expiry/schema')
const iv = require('@omne-harness-lite/identity-values/schema')
const ec = require('@omne-harness-lite/governance-center-client/schema')
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [iv, oe, ec, cg, cg2],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      '@omne-harness-lite/governance-center-client/schema',
      './schema/governance-client-operations.schema.json',
      './schema/governance-client-operations-v2.schema.json',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, validateFormats: false },
    keywords: ['x-counterexamples'],
    definitions: [
      { name: 'Intent', method: 'compile', schema: { $ref: `${cg2.$id}#/$defs/Intent` } },
      { name: 'Preview', method: 'compile', schema: { $ref: `${cg2.$id}#/$defs/Preview` } },
      {
        name: 'PromptExchange',
        method: 'compile',
        schema: { $ref: `${cg2.$id}#/$defs/PromptExchange` },
      },
      { name: 'Input', method: 'compile', schema: { $ref: `${cg.$id}#/$defs/Input` } },
      { name: 'Output', method: 'compile', schema: { $ref: `${cg.$id}#/$defs/Output` } },
      { name: 'Instant', method: 'compile', schema: { $ref: `${oe.$id}#/$defs/Instant` } },
    ],
  },
] as const
