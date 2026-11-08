import { afterEach, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { close, createSchemaProvider } from '@omne-harness/schema-provider'
import { createLocalToolBodySchemas } from '@omne-harness/tool-host-local'
import type { ToolPublishedSchema } from '@omne-harness/tool-contract'

const limits: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1024,
  maxNumberLength: 64,
}
const vocabulary = { owner: 'test', name: 'json-schema', revision: '1', digest: 'v1' }
const providers: ReturnType<typeof createSchemaProvider>[] = []
afterEach(() => {
  for (const provider of providers.splice(0)) close(provider)
})

function read(text: string) {
  const result = readJsonText(text, limits)
  if (result.kind !== 'ok') throw new Error('invalid test JSON')
  return result
}

it.each(['1e0', '1.0', '-0', '1.2300e+4', '0.00000100'])(
  'validates %s numerically without changing the supplied lexeme',
  async text => {
    const provider = createSchemaProvider({
      maxSnapshots: 4,
      maxConstructDepth: 16,
      maxConstructNodes: 256,
      failureBackoffMs: 1,
      maxAttempts: 2,
    })
    providers.push(provider)
    const checker = createLocalToolBodySchemas({ provider, vocabulary })
    const schema: ToolPublishedSchema = {
      identity: { id: 'amount', revision: '1', digest: 'amount-v1' },
      definition: { schema: read('{"type":"number"}').value, vocabulary, descriptions: [] },
    }
    const value = read(text)
    expect(await checker.check(schema, value)).toEqual({ ok: undefined })
    expect(writeJsonText(value.value)).toBe(text)
    expect(
      await checker.check(
        {
          ...schema,
          definition: { ...schema.definition, schema: read('{"type":"string"}').value },
        },
        value,
      ),
    ).toHaveProperty('failure.kind', 'invalid')
  },
)

it.each(['9007199254740993', '1.0000000000000001', '1e999', '-1e-999'])(
  'refuses a lossy numeric projection in values and schema constants: %s',
  async text => {
    const provider = createSchemaProvider({
      maxSnapshots: 4,
      maxConstructDepth: 16,
      maxConstructNodes: 256,
      failureBackoffMs: 1,
      maxAttempts: 2,
    })
    providers.push(provider)
    const checker = createLocalToolBodySchemas({ provider, vocabulary })
    const schema: ToolPublishedSchema = {
      identity: { id: 'amount', revision: '1', digest: 'amount-v1' },
      definition: { schema: read('{"type":"number"}').value, vocabulary, descriptions: [] },
    }
    expect(await checker.check(schema, read(text))).toHaveProperty('failure.kind', 'unsupported')
    expect(
      await checker.check(
        {
          ...schema,
          definition: { ...schema.definition, schema: read(`{"const":${text}}`).value },
        },
        read('1'),
      ),
    ).toHaveProperty('failure.kind', 'unsupported')
  },
)

it('fixes schema content independently of its label and rejects an unknown vocabulary or closed provider', async () => {
  const provider = createSchemaProvider({
    maxSnapshots: 4,
    maxConstructDepth: 16,
    maxConstructNodes: 256,
    failureBackoffMs: 1,
    maxAttempts: 2,
  })
  providers.push(provider)
  const checker = createLocalToolBodySchemas({ provider, vocabulary })
  const original: ToolPublishedSchema = {
    identity: { id: 'amount', revision: '1', digest: 'amount-v1' },
    definition: { schema: read('{"const":1.0}').value, vocabulary, descriptions: [] },
  }
  expect(await checker.check(original, read('1e0'))).toEqual({ ok: undefined })
  const replacement = {
    ...original,
    definition: { ...original.definition, schema: read('{"const":2}').value },
  }
  expect(await checker.check(replacement, read('1'))).toHaveProperty('failure.kind', 'invalid')
  expect(await checker.check(original, read('1'))).toEqual({ ok: undefined })
  expect(
    await checker.check(
      {
        ...original,
        definition: { ...original.definition, vocabulary: { ...vocabulary, digest: 'different' } },
      },
      read('1'),
    ),
  ).toHaveProperty('failure.kind', 'unsupported')
  close(provider)
  expect(await checker.check(original, read('1'))).toHaveProperty('failure.kind', 'unavailable')
})
