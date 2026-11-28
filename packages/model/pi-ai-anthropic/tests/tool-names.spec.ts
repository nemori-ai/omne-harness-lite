import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { OPENROUTER_ACCOUNTING } from '@omne-harness/pi-ai-transport/testing'
import {
  bindingOf,
  encodeInput,
  fixedRequest,
  recordNamed,
  supplierOf,
  tool,
} from './support/anthropic.ts'

const SONNET = recordNamed('anthropic/claude-sonnet-5')

function data(value: object) {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 1_024,
    maxMembers: 256,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') throw new Error('not JSON')
  return { kind: 'data', value: read.value } as const
}

describe('dotted tool names through the Anthropic binding', () => {
  it('go out as gateway names and come back as the Tool names', async () => {
    const binding = await bindingOf(SONNET)
    const request = fixedRequest(SONNET, { tools: [tool('Files.read'), tool('Shell.execute')] })
    const encoded = binding.encode(encodeInput(request))
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
    const body = JSON.parse(writeJsonText(encoded.ok.body)) as { tools: { name: string }[] }
    expect(body.tools.map(item => item.name)).toEqual(['Files_read', 'Shell_execute'])

    const decoder = binding.createDecoder({ request, accounting: OPENROUTER_ACCOUNTING })
    const facts: TransportFact[] = []
    for (const outcome of [
      decoder.accept(
        data({
          type: 'message_start',
          message: { model: SONNET.route.model, provider: 'Anthropic', usage: {} },
        }),
      ),
      decoder.accept(
        data({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'Shell_execute', input: {} },
        }),
      ),
      decoder.accept(
        data({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{}' },
        }),
      ),
      decoder.accept(data({ type: 'content_block_stop', index: 0 })),
      decoder.accept(
        data({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} }),
      ),
      decoder.accept(data({ type: 'message_stop' })),
      decoder.end(),
    ]) {
      if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
      facts.push(...outcome.ok)
    }
    await binding.release()
    expect(
      facts.flatMap(fact =>
        fact.kind === 'block-seal' && fact.block.kind === 'tool_call' ? [fact.block.name] : [],
      ),
    ).toEqual(['Shell.execute'])
  })

  it('refuses a name longer than 64 as unsupported', async () => {
    const binding = await bindingOf(SONNET)
    const request = fixedRequest(SONNET, { tools: [tool(`F.${'x'.repeat(63)}`)] })
    const encoded = binding.encode(encodeInput(request))
    await binding.release()
    expect(encoded).toEqual({
      failure: {
        kind: 'unsupported',
        field: '/tools/0/name',
        adapter: supplierOf(SONNET).adoption,
      },
    })
  })
})
