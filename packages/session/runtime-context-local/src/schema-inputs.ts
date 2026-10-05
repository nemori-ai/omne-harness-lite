import schema from '@omne-harness-lite/runtime-context-local/schema' with { type: 'json' }
export const schemaGraphs = [
  {
    name: 'ordinary',
    kind: 'ordinary',
    resources: [schema],
    resourceSpecifiers: ['@omne-harness-lite/runtime-context-local/schema'],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, ownProperties: true },
    definitions: ['Registration', 'Value', 'Seed', 'Event'].map(name => ({
      name,
      method: 'getSchema',
      schema: `${schema.$id}#/$defs/${name}`,
    })),
  },
] as const
