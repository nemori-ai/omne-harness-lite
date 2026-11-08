import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  defineSchema,
  jsonSchemaDefinition,
  validate,
  type SchemaProvider,
} from '@omne-harness/schema-provider'
import type { Adoption } from '@omne-harness/tool-contract'
import { canonicalDigest, type ToolLedgerPorts } from '@omne-harness/tool'
import { schemaNumberProjection } from './body-schema-numbers.ts'

export function createLocalToolBodySchemas(
  input: Readonly<{
    provider: SchemaProvider
    vocabulary: Adoption
  }>,
): NonNullable<ToolLedgerPorts<unknown>['bodySchemas']> {
  const vocabulary = canonicalDigest(input.vocabulary)
  return {
    async check(schema, read) {
      if (canonicalDigest(schema.definition.vocabulary) !== vocabulary)
        return fail({
          kind: 'unsupported',
          adoption: schema.definition.vocabulary,
          reason: 'body schema vocabulary is not supported',
        })
      const projectedSchema = schemaNumberProjection(schema.definition.schema)
      const value = schemaNumberProjection(read.value)
      if (projectedSchema === null || value === null)
        return fail({
          kind: 'unsupported',
          adoption: schema.definition.vocabulary,
          reason: 'body schema check requires lossless decimal number projection',
        })
      if (projectedSchema.kind !== 'object')
        return fail({
          kind: 'unsupported',
          adoption: schema.definition.vocabulary,
          reason: 'body schema must be an object document',
        })
      const reference = defineSchema({
        id: `tool-body:${canonicalDigest(schema)}`,
        load: async () =>
          jsonSchemaDefinition({
            document: JSON.parse(writeJsonText(projectedSchema)),
            numbers: 'exact-or-reject',
          }),
      })
      const verdict = await validate(input.provider, reference, { kind: 'ok', value })
      switch (verdict.kind) {
        case 'valid':
          return succeed(undefined)
        case 'invalid':
        case 'unreadable':
          return fail({
            kind: 'invalid',
            field: 'body',
            reason: 'body does not satisfy the fixed schema',
          })
        case 'refused':
          return verdict.reason === 'unsupported-construct' ||
            verdict.reason === 'runtime-path-closed'
            ? fail({
                kind: 'unsupported',
                adoption: schema.definition.vocabulary,
                reason: `body schema ${verdict.reason}`,
              })
            : fail({ kind: 'unavailable', dependency: 'body-schema', diagnostic: verdict.reason })
        case 'unavailable':
          return fail({
            kind: 'unavailable',
            dependency: 'body-schema',
            diagnostic: verdict.reason,
          })
        case 'cancelled':
          return fail({ kind: 'unavailable', dependency: 'body-schema', diagnostic: 'cancelled' })
      }
    },
  }
}
