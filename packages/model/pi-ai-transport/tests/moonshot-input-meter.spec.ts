import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createMoonshotInputMeter } from '../src/input-meters/moonshot.ts'
import { moonshotTokenizer } from '../src/input-meters/moonshot-tokenizer.ts'
import {
  moonshotDefinitions,
  moonshotAutomaticConfiguration,
} from '../src/official-models/moonshot.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import { input, networkPolicy } from './support.ts'

function request(index: 0 | 1): PlanInput {
  const definition = moonshotDefinitions[index]
  if (!definition) throw new Error('missing Moonshot definition')
  const provider = index === 0 ? 'moonshotai/mxfp4' : 'moonshotai/int4'
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration: moonshotAutomaticConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider,
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    parameters: { maxOutputTokens: 128, ...(index === 0 ? { reasoningEffort: 'high' } : {}) },
    snapshot: {
      ...base.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
}

describe('Moonshot pinned public tokenizers and route templates', () => {
  it.each(['k3', 'k27'] as const)('matches Python tiktoken 0.7.0 golden IDs for %s', route => {
    // Regenerate against the pinned tiktoken.model with tokenization_kimi.py's
    // pat_str, no special tokens allowed for ordinary user text.
    const vectors = [
      ['Hello world', '830960b76fc1f73f576717067dffe2ee477c446ee52fca951ab55dd4994c202d'],
      ['你好，Moonshot!', 'e1afaf3414bbf50e8cc0e872db9aaa7320c202f783e29be08556e372aaab90c7'],
      ['A+B\n12345', '418071d3921e576665d7d46c401d15bc9d0a47cc4885a994ae4e0beff56cf183'],
      [
        '<|open|> should be ordinary text',
        '12fc2260097f9cf89e0fbae0a2550d607b2beef2bf3ecf3219a92b408102610c',
      ],
    ] as const
    for (const [sample, hash] of vectors) {
      const ids = moonshotTokenizer(route).encode(sample, [], [])
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(hash)
    }
  })

  it.each([
    [0, 'k3', 23],
    [1, 'k27', 10],
  ] as const)('matches pinned %s one-turn template golden', (index, route, expected) => {
    const definition = moonshotDefinitions[index]
    if (!definition) throw new Error('missing Moonshot definition')
    const body = { model: definition.modelId, messages: [{ role: 'user', content: 'Hello world' }] }
    const serialized = writeJsonLossless(body)
    const measurement = createMoonshotInputMeter(definition).measure({ body, serialized })
    if (measurement.kind === 'unavailable') throw new Error('meter unavailable')
    const envelope = moonshotTokenizer(route).encode(serialized, [], []).length
    expect(Number(measurement.tokens) - envelope).toBe(expected)
  })

  it.each([0, 1] as const)('admits model %i with actual final body and caller margin', index => {
    const definition = moonshotDefinitions[index]
    if (!definition) throw new Error('missing Moonshot definition')
    const meter = createMoonshotInputMeter(definition)
    const planned = planRequest(request(index), moonshotDefinitions, meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.tokenMargin).toEqual({
      multiplier: 1.2,
      reserveTokens: 32,
    })
    expect(planned.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(planned.planned.serialized),
    )
    expect(planned.planned.body.provider).toEqual({
      order: [meter.provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(planned.planned.serialized).toContain('[system_reminder')
    expect(planned.planned.serialized).not.toContain('cache_control')
    expect(planned.planned.body).not.toHaveProperty('temperature')
    expect(planned.planned.body).not.toHaveProperty('top_p')
    expect(planned.planned.body.reasoning).toEqual(index === 0 ? { effort: 'high' } : undefined)
  })

  it.each([0, 1] as const)(
    'accounts for tools, results, history and rejects unsupported image on model %i',
    index => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const meter = createMoonshotInputMeter(definition)
      const base = {
        model: definition.modelId,
        messages: [
          { role: 'system', content: 'Follow the instructions' },
          { role: 'user', content: 'Search now' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Find a value',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          },
        ],
      }
      const toolHistory = {
        ...base,
        messages: [
          ...base.messages,
          {
            role: 'assistant',
            content: '',
            reasoning: 'I should search',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'search', arguments: '{"query":"example"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'Found example' },
          { role: 'user', content: 'Summarize it' },
        ],
      }
      const simple = meter.measure({ body: base, serialized: writeJsonLossless(base) })
      const detailed = meter.measure({
        body: toolHistory,
        serialized: writeJsonLossless(toolHistory),
      })
      expect(simple.kind).toBe('estimated')
      expect(detailed.kind).toBe('estimated')
      if (simple.kind === 'unavailable' || detailed.kind === 'unavailable')
        throw new Error('meter unavailable')
      expect(Number(detailed.tokens)).toBeGreaterThan(Number(simple.tokens))
      const image = {
        ...base,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }],
          },
        ],
      }
      expect(meter.measure({ body: image, serialized: writeJsonLossless(image) })).toEqual({
        kind: 'unavailable',
      })
      expect(meter.measure({ body: base, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    },
  )

  it('rejects mismatched definition and prevents unmeasured model dispatch', async () => {
    const selected = moonshotDefinitions[0]
    if (!selected) throw new Error('missing Moonshot definition')
    expect(() => createMoonshotInputMeter({ ...selected, revision: '2' })).toThrow(TypeError)
    expect(() => createMoonshotInputMeter({ ...selected, routes: {} })).toThrow(TypeError)
    const absent = planRequest(request(0), moonshotDefinitions)
    expect(absent).toEqual({ rejected: 'unavailable' })
    const transport = createPiAiTransport({
      definitions: moonshotDefinitions,
      inputMeters: moonshotDefinitions.map(createMoonshotInputMeter),
      policy: networkPolicy,
    })
    try {
      const planned = transport.plan(request(0))
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    } finally {
      await transport.close()
    }
  })
})
