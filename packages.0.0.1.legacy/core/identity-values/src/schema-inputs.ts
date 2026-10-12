import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const schema = require('../schema/identity-values.schema.json') as {
  $id: string
  $defs: Record<string, unknown>
}

export const schemaId: string = schema.$id
export const SCHEMA_DEF_NAMES = [
  'OpaqueIdentifier',
  'HandoffWarrant',
  'LoginIdentifier',
  'AccountId',
  'OrganizationId',
  'LoginStateId',
  'OrganizationKind',
  'TenantRole',
  'TenantId',
  'MembershipStanding',
  'MembershipStandingResult',
  'ScopeLayerIdentity',
] as const

export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [schema],
    options: { strict: true, allErrors: false },
    keywords: [],
    resourceSpecifiers: ['./schema/identity-values.schema.json'],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'getSchema',
      schema: `${schemaId}#/$defs/${name}`,
    })),
  },
] as const
