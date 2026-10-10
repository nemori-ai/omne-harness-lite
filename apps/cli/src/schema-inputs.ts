import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const resourceSpecifiers = [
  '@omne-harness-lite/identity-values/schema',
  '@omne-harness-lite/offer-expiry/schema',
  '@omne-harness-lite/governance-center-entry/schema',
  '@omne-harness-lite/governance-client-operations/schema',
  '@omne-harness-lite/governance-client-operations/schema/intents',
]
const resources = resourceSpecifiers.map(name => require(name))
const schema: {
  $id: string
} = require('@omne-harness-lite/governance-client-operations/schema/intents')
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: resources,
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
      { name: 'Intent', method: 'compile', schema: { $ref: `${schema.$id}#/$defs/Intent` } },
      { name: 'Output', method: 'compile', schema: { $ref: `${schema.$id}#/$defs/Output` } },
    ],
  },
] as const
