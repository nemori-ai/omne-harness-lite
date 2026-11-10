// Tool names on the gateway (R2-D234) through the real Anthropic binding: the family shares the
// engine rule `underscore/1` and the length 64 with OpenAI, so a dotted Tool name goes out as a
// gateway name and comes back as the Tool name; a name over 64 is `unsupported`.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { OPENROUTER_ACCOUNTING } from '@omne-harness/pi-ai-transport/chat-completions'
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

function chunk(delta: object, finish: string | null = null): object {
  return {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    model: SONNET.route.model,
    provider: 'Anthropic',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
}

describe('dotted tool names through the Anthropic binding', () => {
  it('go out as gateway names and come back as the Tool names', async () => {
    const binding = await bindingOf(SONNET)
    const request = fixedRequest(SONNET, { tools: [tool('Files.read'), tool('Shell.execute')] })
    const encoded = binding.encode(encodeInput(request))
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
    const body = JSON.parse(writeJsonText(encoded.ok.body)) as {
      tools: { function: { name: string } }[]
    }
    expect(body.tools.map(item => item.function.name)).toEqual(['Files_read', 'Shell_execute'])

    const decoder = binding.createDecoder({ request, accounting: OPENROUTER_ACCOUNTING })
    const facts: TransportFact[] = []
    for (const outcome of [
      decoder.accept(
        data(
          chunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'toolu_1',
                type: 'function',
                function: { name: 'Shell_execute', arguments: '{}' },
              },
            ],
          }),
        ),
      ),
      decoder.accept(data(chunk({}, 'tool_calls'))),
      decoder.accept({ kind: 'end-marker' }),
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
