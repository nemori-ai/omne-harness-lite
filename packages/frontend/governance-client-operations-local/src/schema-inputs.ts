import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cg: {
  readonly $id: string
} = require('@omne-harness-lite/governance-client-operations/schema')
const cg2: {
  readonly $id: string
} = require('@omne-harness-lite/governance-client-operations/schema/intents')
const oe: { readonly $id: string } = require('@omne-harness-lite/offer-expiry/schema')
const iv = require('@omne-harness-lite/identity-values/schema')
const ec = require('@omne-harness-lite/governance-center-entry/schema')
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [iv, oe, ec, cg, cg2],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      '@omne-harness-lite/governance-center-entry/schema',
      '@omne-harness-lite/governance-client-operations/schema',
      '@omne-harness-lite/governance-client-operations/schema/intents',
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
