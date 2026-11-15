import { type JsonLimits } from '@omne-harness/json-text'
import {
  close,
  createSchemaProvider,
  type SchemaBudget,
  type SchemaProvider,
} from '@omne-harness/schema-provider'

export const ENVIRONMENT_SCHEMA_BUDGET: SchemaBudget = Object.freeze({
  maxSnapshots: 4,
  maxConstructDepth: 40,
  maxConstructNodes: 400,
  failureBackoffMs: 50,
  maxAttempts: 3,
})

export const ENVIRONMENT_DECLARATION_LIMITS: JsonLimits = Object.freeze({
  maxBytes: 100_000,
  maxDepth: 20,
  maxItems: 200,
  maxMembers: 80,
  maxStringLength: 10_000,
  maxNumberLength: 100,
})

export function createEnvironmentSchemaProvider(): SchemaProvider {
  return createSchemaProvider(ENVIRONMENT_SCHEMA_BUDGET)
}

export function closeEnvironmentSchemaProvider(provider: SchemaProvider): void {
  close(provider)
}
