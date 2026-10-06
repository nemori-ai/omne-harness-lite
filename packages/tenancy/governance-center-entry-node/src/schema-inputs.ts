import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
interface SchemaDocument {
  readonly document: object
  readonly id: string
}

function schemaDocument(value: unknown): SchemaDocument {
  if (typeof value === 'object' && value !== null && '$id' in value) {
    const id = value.$id
    if (typeof id === 'string') return { document: value, id }
  }
  throw new Error('governance-center-entry: a bundled JSON Schema has no $id')
}

const entrySchema = schemaDocument(require('../schema/governance-center-entry.schema.json'))
const identityValuesSchema = schemaDocument(require('@omne-harness-lite/identity-values/schema'))
const offerExpirySchema = schemaDocument(require('@omne-harness-lite/offer-expiry/schema'))

const definitions: unknown =
  '$defs' in entrySchema.document ? entrySchema.document.$defs : undefined
if (definitions === null || typeof definitions !== 'object' || Array.isArray(definitions))
  throw new Error('governance-center-entry: bundled JSON Schema has no definitions')
export const entryDefinitions = definitions as Readonly<Record<string, unknown>>
export const ENTRY_SCHEMA_ID: string = entrySchema.id
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    includeSchema: true,
    resources: [identityValuesSchema.document, offerExpirySchema.document, entrySchema.document],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      './schema/governance-center-entry.schema.json',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    options: {
      strict: true,
      strictTypes: false,
      strictRequired: false,
      allErrors: false,
      validateFormats: false,
    },
    keywords: ['x-counterexamples'],
    definitions: Object.keys(entryDefinitions).map(name => ({
      name,
      method: 'getSchema',
      schema: `${ENTRY_SCHEMA_ID}#/$defs/${name}`,
    })),
  },
] as const
