import { expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import {
  createReleaseBodySchemas,
  TOOL_BODY_SCHEMA_VOCABULARY,
} from '../../../src/entry/tool-body-schemas.ts'
import { tree } from '../tool-host/support.ts'

it('uses the release schema vocabulary and closes each body validation domain independently', async () => {
  const first = createReleaseBodySchemas()
  const second = createReleaseBodySchemas()
  const schema = {
    identity: { id: 'report', revision: '1', digest: 'number-v1' },
    definition: {
      vocabulary: TOOL_BODY_SCHEMA_VOCABULARY,
      schema: tree({
        type: 'object',
        properties: { amount: { type: 'number' } },
        required: ['amount'],
        additionalProperties: false,
      }),
      descriptions: [],
    },
  }
  const read = (text: string) => {
    const value = readJsonText(text, {
      maxBytes: 1024,
      maxDepth: 8,
      maxItems: 32,
      maxMembers: 16,
      maxStringLength: 256,
      maxNumberLength: 32,
    })
    if (value.kind !== 'ok') throw new Error('invalid test document')
    return value
  }
  try {
    expect(await first.schemas.check(schema, read('{"amount":1.00}'))).toHaveProperty('ok')
    expect(await first.schemas.check(schema, read('{"amount":"one"}'))).toHaveProperty(
      'failure.kind',
      'invalid',
    )
    expect(
      await first.schemas.check(
        {
          ...schema,
          definition: {
            ...schema.definition,
            vocabulary: { ...TOOL_BODY_SCHEMA_VOCABULARY, digest: 'different' },
          },
        },
        read('{"amount":1}'),
      ),
    ).toHaveProperty('failure.kind', 'unsupported')
    first.close()
    expect(await first.schemas.check(schema, read('{"amount":1}'))).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    expect(await second.schemas.check(schema, read('{"amount":1}'))).toHaveProperty('ok')
  } finally {
    first.close()
    second.close()
  }
})
