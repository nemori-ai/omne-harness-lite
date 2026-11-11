import { expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { readJsonText } from '@omne-harness/json-text'
import { close, createSchemaProvider } from '@omne-harness/schema-provider'
import { createLocalToolBodySchemas } from '@omne-harness/tool-host-local'
import type { ToolBodyDeclaration } from '@omne-harness/tool-contract'
import { adoption } from '../coordinator-values.ts'
import { accepted, configuration, fixture } from './fixture.ts'

function schemaFixture(format: 'json-document' | 'json-lines') {
  const provider = createSchemaProvider({
    maxSnapshots: 4,
    maxConstructDepth: 16,
    maxConstructNodes: 256,
    failureBackoffMs: 1,
    maxAttempts: 2,
  })
  const vocabulary = adoption('json-schema')
  const read = readJsonText(
    '{"type":"object","properties":{"amount":{"type":"number"}},"required":["amount"]}',
    configuration.offloading.jsonDocument,
  )
  if (read.kind !== 'ok') throw new Error('invalid schema fixture')
  const schema = {
    identity: { id: 'amount', revision: '1', digest: 'amount-v1' },
    definition: { schema: read.value, vocabulary, descriptions: [] },
  }
  const declaration: ToolBodyDeclaration =
    format === 'json-document'
      ? { kind: format, codec: adoption(format), document: schema }
      : { kind: format, codec: adoption(format), record: schema }
  return {
    declaration,
    schemas: createLocalToolBodySchemas({ provider, vocabulary }),
    close: () => close(provider),
  }
}

it.each([
  { format: 'json-document', text: '{"amount":1.00}', valid: true },
  { format: 'json-document', text: '{"amount":"one"}', valid: false },
  { format: 'json-document', text: '{"amount":1,"amount":2}', valid: false },
  { format: 'json-document', text: '\uFEFF{"amount":1}', valid: false },
  { format: 'json-document', text: '{"amount":', valid: false },
  { format: 'json-lines', text: '{"amount":1.00}\n{"amount":2e0}\n', valid: true },
  { format: 'json-lines', text: '{"amount":1}\n{"amount":"one"}\n', valid: false },
  { format: 'json-lines', text: '{"amount":1}\n\n', valid: false },
  { format: 'json-lines', text: '{"amount":1}', valid: false },
] as const)('validates inline $format before publishing its final: $text', async sample => {
  const body = schemaFixture(sample.format)
  const world = await fixture(
    async () => sample.text,
    undefined,
    32,
    false,
    undefined,
    undefined,
    body,
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('direct-body')))
    const result = await world.settled(reference)
    expect(result.terminal.kind).toBe(sample.valid ? 'completed' : 'failed')
    expect(world.launches()).toBe(1)
    if (sample.valid) {
      expect(result.value.original.kind).toBe('none')
      expect(
        result.value.content.map(block => (block.kind === 'text' ? block.text : '')).join(''),
      ).toBe(sample.text)
    }
  } finally {
    await world.close()
    body.close()
  }
})

it('retries unavailable validation without rerunning the author or publishing an early final', async () => {
  const body = schemaFixture('json-document')
  const entered = Promise.withResolvers<void>()
  let available = false
  let attempts = 0
  const world = await fixture(
    async () => '{"amount":1.00}',
    undefined,
    32,
    false,
    undefined,
    undefined,
    {
      declaration: body.declaration,
      schemas: {
        async check(schema, value) {
          attempts++
          entered.resolve()
          return available
            ? body.schemas.check(schema, value)
            : fail({
                kind: 'unavailable',
                dependency: 'schema-fixture',
                diagnostic: 'temporarily unavailable',
              })
        },
      },
    },
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('direct-retry')))
    await entered.promise
    expect(await world.authorLookup(reference)).toMatchObject({ kind: 'live' })
    expect(world.launches()).toBe(1)
    available = true
    expect((await world.settled(reference)).terminal.kind).toBe('completed')
    expect(attempts).toBeGreaterThan(1)
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
    body.close()
  }
})
