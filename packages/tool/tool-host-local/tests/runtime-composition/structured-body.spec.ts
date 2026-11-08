import { expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { close, createSchemaProvider } from '@omne-harness/schema-provider'
import { createLocalToolBodySchemas } from '@omne-harness/tool-host-local'
import type { ToolBodyDeclaration } from '@omne-harness/tool-contract'
import { adoption } from '../coordinator-values.ts'
import { accepted, fixture, configuration, unbox } from './fixture.ts'

it.each([
  { text: '{"amount":1.0}', valid: true },
  { text: '{"amount":"one"}', valid: false },
])('settles the author after JSON schema validation: $text', async scenario => {
  const provider = createSchemaProvider({
    maxSnapshots: 4,
    maxConstructDepth: 16,
    maxConstructNodes: 256,
    failureBackoffMs: 1,
    maxAttempts: 2,
  })
  const vocabulary = adoption('json-schema')
  const schema = readJsonText(
    '{"type":"object","properties":{"amount":{"type":"number"}},"required":["amount"]}',
    configuration.offloading.jsonDocument,
  )
  if (schema.kind !== 'ok') throw new Error('invalid schema fixture')
  const declaration: Extract<ToolBodyDeclaration, { kind: 'json-document' }> = {
    kind: 'json-document',
    codec: adoption('json-document'),
    document: {
      identity: { id: 'report', revision: '1', digest: 'report-v1' },
      definition: { schema: schema.value, vocabulary, descriptions: [] },
    },
  }
  let checked = false
  const world = await fixture(
    async (_value, _environment, context) => {
      unbox(
        await context.body.begin('report', {
          kind: 'json-document',
          codec: declaration.codec,
          schema: declaration.document.identity,
        }),
      )
      unbox(
        await context.body.append('report', '1', { kind: 'json-fragment', text: scenario.text }),
      )
      const sealed = await context.body.seal('report', '1')
      expect('ok' in sealed).toBe(scenario.valid)
      if (!scenario.valid) expect(sealed).toHaveProperty('failure.kind', 'invalid')
      checked = true
      return 'author returned'
    },
    undefined,
    32,
    false,
    undefined,
    undefined,
    {
      declaration,
      schemas: createLocalToolBodySchemas({ provider, vocabulary }),
    },
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('structured-body')))
    const result = await world.settled(reference)
    expect(checked).toBe(true)
    expect(result.terminal.kind).toBe(scenario.valid ? 'completed' : 'failed')
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
    close(provider)
  }
})
