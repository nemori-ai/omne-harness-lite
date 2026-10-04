import schema from '@omne-harness-lite/model-invocation-minimal-demo/tool-driver-schema' with { type: 'json' }

export const schemaGraphs = [
  {
    name: 'tool-driver',
    kind: 'ordinary',
    resources: [schema],
    resourceSpecifiers: ['@omne-harness-lite/model-invocation-minimal-demo/tool-driver-schema'],
    sourceFiles: ['src/schema-inputs.ts'],
    options: { strict: true, strictTypes: false, strictRequired: false, ownProperties: true },
    definitions: ['Value', 'Payload'].map(name => ({
      name,
      method: 'getSchema',
      schema: `${schema.$id}#/$defs/${name}`,
    })),
  },
] as const
