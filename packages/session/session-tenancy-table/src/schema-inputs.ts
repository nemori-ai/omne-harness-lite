import schema from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }
export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [schema],
    resourceSpecifiers: ['@omne-harness-lite/messages/schema/v2'],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: [
      {
        name: 'SessionRef',
        method: 'compile',
        schema: { $ref: `${schema.$id}#/$defs/SessionRef` },
      },
    ],
  },
] as const
