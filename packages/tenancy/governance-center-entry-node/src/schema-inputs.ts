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

const entrySchema = schemaDocument(require('@omne-harness-lite/governance-center-entry/schema'))
const maintenanceSchema = schemaDocument(require('../schema/governance-maintenance.schema.json'))
const identityValuesSchema = schemaDocument(require('@omne-harness-lite/identity-values/schema'))
const offerExpirySchema = schemaDocument(require('@omne-harness-lite/offer-expiry/schema'))

function definitionsOf(document: object): Readonly<Record<string, unknown>> {
  const definitions: unknown = '$defs' in document ? document.$defs : undefined
  if (definitions === null || typeof definitions !== 'object' || Array.isArray(definitions))
    throw new Error('governance-center-entry: bundled JSON Schema has no definitions')
  return definitions as Readonly<Record<string, unknown>>
}
const maintenanceDefinitions = definitionsOf(maintenanceSchema.document)
export const entryDefinitions = {
  ...definitionsOf(entrySchema.document),
  ...maintenanceDefinitions,
}
export const ENTRY_SCHEMA_ID: string = entrySchema.id
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    includeSchema: true,
    resources: [
      identityValuesSchema.document,
      offerExpirySchema.document,
      entrySchema.document,
      maintenanceSchema.document,
    ],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema',
      '@omne-harness-lite/governance-center-entry/schema',
      './schema/governance-maintenance.schema.json',
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
      schema: `${Object.hasOwn(maintenanceDefinitions, name) ? maintenanceSchema.id : ENTRY_SCHEMA_ID}#/$defs/${name}`,
    })),
  },
] as const
