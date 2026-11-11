import { close, createSchemaProvider, type SchemaBudget } from '@omne-harness/schema-provider'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { createLocalToolBodySchemas } from '@omne-harness/tool-host-local'

export const TOOL_BODY_SCHEMA_VOCABULARY = describedAdoption({
  owner: '@omne-harness/harness-server',
  name: 'tool-body-json-schema-static',
  revision: '1',
})

const budget: SchemaBudget = Object.freeze({
  maxSnapshots: 32,
  maxConstructDepth: 32,
  maxConstructNodes: 256,
  failureBackoffMs: 50,
  maxAttempts: 3,
})

export function createReleaseBodySchemas() {
  const provider = createSchemaProvider(budget)
  return {
    schemas: createLocalToolBodySchemas({ provider, vocabulary: TOOL_BODY_SCHEMA_VOCABULARY }),
    close: () => close(provider),
  }
}
