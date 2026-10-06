import { imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { input as testInput, networkPolicy } from './support.ts'
import {
  createDeepSeekV4ProInputMeter,
  renderDeepSeekV4Prompt,
} from '../src/input-meters/deepseek-v4-pro.ts'
import {
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
} from '../src/official-models/deepseek.ts'
import { object } from '../src/json.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/deepseek-v4/${name}`, import.meta.url), 'utf8')

function input(name: string) {
  const copied = copyJsonValue(JSON.parse(fixture(name)))
  if ('failed' in copied) throw new Error('invalid official fixture')
  return copied.ok
}

describe('DeepSeek V4 public encoder projection', () => {
  it('matches the official multi-turn tool-call and tool-result vector', () => {
    const source = input('test_input_1.json')
    if (!object(source) || !Array.isArray(source.messages) || !Array.isArray(source.tools))
      throw new Error('invalid official vector')
    const messages = [...source.messages]
    expect(renderDeepSeekV4Prompt({ messages, tools: source.tools }, 'thinking')).toBe(
      fixture('test_output_1.txt'),
    )
  })

  it('matches the official multi-turn reasoning vector without tools', () => {
    const messages = input('test_input_2.json')
    if (!Array.isArray(messages)) throw new Error('invalid official vector')
    expect(renderDeepSeekV4Prompt({ messages }, 'thinking')).toBe(fixture('test_output_2.txt'))
  })

  it('pins the model tokenizer against independent Rust tokenizers 0.22.1 vectors', () => {
    const root = new URL('../resources/tokenizers/deepseek-v4/', import.meta.url)
    const tokenizer = new Tokenizer(
      JSON.parse(readFileSync(new URL('tokenizer.json', root), 'utf8')),
      JSON.parse(readFileSync(new URL('tokenizer_config.json', root), 'utf8')),
    )
    const expected = [
      [541, '6fd32c00188d8ec20dacdfcd81b054528f077e85ee671a1e4773b1b9ad810c9b'],
      [53, '7ed512cf8417da74f533c254430f039d4d19189619182c9c7803244c048faedf'],
    ] as const
    for (const [index, [count, sha256]] of expected.entries()) {
      const ids = tokenizer.encode(fixture(`test_output_${index + 1}.txt`), {
        add_special_tokens: false,
      }).ids
      expect(ids).toHaveLength(count)
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(sha256)
    }
  })

  it('binds a pinned estimator to the exact official model/provider and rejects wrong definition', () => {
    const meter = createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)
    const source = input('test_input_1.json')
    if (!object(source) || !Array.isArray(source.messages) || !Array.isArray(source.tools))
      throw new Error('invalid official vector')
    const body = {
      model: deepseekV4Pro0813Definition.modelId,
      provider: { order: ['deepinfra/fp8'], allow_fallbacks: false },
      messages: source.messages,
      tools: source.tools,
      stream: true,
    }
    const measurement = directFull(meter, { body, serialized: writeJsonLossless(body) })
    expect(measurement).toMatchObject({ kind: 'estimated' })
    if (measurement.kind === 'unavailable') throw new Error('pinned estimator unavailable')
    expect(Number(measurement.tokens)).toBeGreaterThan(541)
    expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(() =>
      createDeepSeekV4ProInputMeter({ ...deepseekV4Pro0813Definition, revision: 'wrong' }),
    ).toThrow(TypeError)
  })

  it('admits a complete fixed DeepSeek request through the bound transport factory', async () => {
    const definition = deepseekV4Pro0813Definition
    const profile = createOfficialProfileContent(definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV4Pro0813Configuration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const request = testInput()
    const plannedInput = {
      ...request,
      routeName: definition.modelId,
      provider: 'deepinfra/fp8',
      calibration: { kind: 'none' as const, reason: 'no_observation' as const },
      tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
      snapshot: {
        ...request.snapshot,
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
    const meter = createDeepSeekV4ProInputMeter(definition)
    const transport = createPiAiTransport({
      imagePreparation,
      policy: networkPolicy,
      definitions: [definition],
      inputMeters: [meter],
    })
    const result = await transport.plan(plannedInput, { signal: new AbortController().signal })
    await transport.close()
    if ('rejected' in result) throw new Error(JSON.stringify(result))
    expect(result.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(result.planned.inputLimitEvidence.tokenMargin).toEqual({
      multiplier: 1.1,
      reserveTokens: 64,
    })
    expect(Number(result.planned.inputLimitEvidence.admissionTokens)).toBeGreaterThan(64)
    expect(result.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(result.planned.serialized),
    )
  })
})
