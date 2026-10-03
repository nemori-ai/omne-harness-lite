import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ec: { readonly $id: string } = require('@omne-harness-lite/governance-center-client/schema')
const iv: { readonly $id: string } = require('@omne-harness-lite/identity-values/schema')
const oe: { readonly $id: string } = require('@omne-harness-lite/offer-expiry/schema')
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [iv, oe, ec],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      '@omne-harness-lite/governance-center-client/schema',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, validateFormats: false },
    keywords: ['x-counterexamples'],
    definitions: [
      {
        name: 'GovernanceCenterId',
        method: 'compile',
        schema: { $ref: `${ec.$id}#/$defs/GovernanceCenterId` },
      },
      {
        name: 'LoginStatePresentation',
        method: 'compile',
        schema: { $ref: `${ec.$id}#/$defs/LoginStatePresentation` },
      },
      { name: 'AccountId', method: 'compile', schema: { $ref: `${iv.$id}#/$defs/AccountId` } },
      {
        name: 'LoginStateId',
        method: 'compile',
        schema: { $ref: `${iv.$id}#/$defs/LoginStateId` },
      },
      { name: 'TenantId', method: 'compile', schema: { $ref: `${iv.$id}#/$defs/TenantId` } },
      { name: 'Envelope', method: 'compile', schema: { $ref: `${ec.$id}#/$defs/Envelope` } },
      { name: 'Exchange', method: 'compile', schema: { $ref: `${ec.$id}#/$defs/Exchange` } },
    ],
  },
] as const
