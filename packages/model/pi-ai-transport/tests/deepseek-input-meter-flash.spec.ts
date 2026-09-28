import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { planRequest } from '../src/plan.ts'
import { at, judgedMessage, input as testInput } from './support.ts'
import {
  createDeepSeekV41FlashInputMeter,
  renderDeepSeekV41Prompt,
} from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { object } from '../src/json.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/deepseek-v41-flash/${name}`, import.meta.url), 'utf8')

function source(name: string) {
  const copied = copyJsonValue(JSON.parse(fixture(name)))
  if ('failed' in copied) throw new Error('invalid official fixture')
  return object(copied.ok) ? copied.ok : { messages: copied.ok }
}

describe('DeepSeek V4.1 Flash public encoder projection', () => {
  it('matches official complete tool history and plain multi-turn vectors', () => {
    const tools = source('test_input_1.json')
    expect(renderDeepSeekV41Prompt(tools, 'thinking')).toBe(fixture('test_output_1.txt'))
    const chat = source('test_input_2.json')
    expect(renderDeepSeekV41Prompt(chat, 'chat')).toBe(fixture('test_output_2.txt'))
  })

  it('matches official two-image prompt with explicit max effort', () => {
    const vision = source('test_input_5.json')
    expect(renderDeepSeekV41Prompt(vision, 'thinking', 'max')).toBe(fixture('test_output_5.txt'))
  })

  it('pins Flash tokenizer vectors separately from V4 Pro', () => {
    const root = new URL('../tokenizers/deepseek-v41-flash/', import.meta.url)
    const tokenizer = new Tokenizer(
      JSON.parse(readFileSync(new URL('tokenizer.json', root), 'utf8')),
      JSON.parse(readFileSync(new URL('tokenizer_config.json', root), 'utf8')),
    )
    const expected = [
      [1, 548, '94df0d491972bd51a5804ffc7dfc5f21e2b1255d669ab41a59a90c571dbfc2fe'],
      [2, 40, '2e79f7fe8a294dc014eddf99efec4f74cdf889692ab6048187b9d3a82fc57b65'],
      [5, 74, '3d7b799e20cf20908f9369e66a12e6e207fef49ba36f07733b1c2666506e2ef2'],
    ] as const
    for (const [index, count, digest] of expected) {
      const ids = tokenizer.encode(fixture(`test_output_${index}.txt`), {
        add_special_tokens: false,
      }).ids
      expect(ids).toHaveLength(count)
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(digest)
    }
  })

  it('binds exact fixed route and covers every final body contribution', () => {
    const meter = createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)
    const official = source('test_input_1.json')
    if (!Array.isArray(official.messages) || !Array.isArray(official.tools))
      throw new Error('invalid official tool vector')
    const body = {
      model: deepseekV41FlashDefinition.modelId,
      provider: { order: ['deepinfra/fp8'], allow_fallbacks: false },
      messages: official.messages,
      tools: official.tools,
      stream: true,
    }
    const first = meter.measure({ body, serialized: writeJsonLossless(body) })
    expect(first.kind).toBe('estimated')
    if (first.kind === 'unavailable') throw new Error('estimator unavailable')
    const changed = { ...body, provider: { ...body.provider, require_parameters: true } }
    const second = meter.measure({ body: changed, serialized: writeJsonLossless(changed) })
    expect(second.kind).toBe('estimated')
    if (second.kind === 'unavailable') throw new Error('estimator unavailable')
    expect(Number(second.tokens)).toBeGreaterThan(Number(first.tokens))
    expect(meter.measure({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(() =>
      createDeepSeekV41FlashInputMeter({ ...deepseekV41FlashDefinition, revision: '2' }),
    ).toThrow(TypeError)
    expect(() =>
      createDeepSeekV41FlashInputMeter({
        ...deepseekV41FlashDefinition,
        modelId: 'deepseek/deepseek-v4-pro-0813',
      }),
    ).toThrow(TypeError)
    expect(() =>
      createDeepSeekV41FlashInputMeter({ ...deepseekV41FlashDefinition, routes: {} }),
    ).toThrow(TypeError)
  })

  it('uses documented vision token estimate for inline images and refuses unknown URLs', () => {
    const meter = createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)
    const makeBody = (url: string) => ({
      model: deepseekV41FlashDefinition.modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            { type: 'image_url', image_url: { url } },
          ],
        },
      ],
    })
    const inline = makeBody('data:image/png;base64,aGVsbG8=')
    const measured = meter.measure({ body: inline, serialized: writeJsonLossless(inline) })
    expect(measured.kind).toBe('estimated')
    const textOnly = {
      model: deepseekV41FlashDefinition.modelId,
      messages: [{ role: 'user', content: 'describe' }],
    }
    const baseline = meter.measure({ body: textOnly, serialized: writeJsonLossless(textOnly) })
    if (measured.kind === 'unavailable' || baseline.kind === 'unavailable')
      throw new Error('estimate unavailable')
    expect(Number(measured.tokens) - Number(baseline.tokens)).toBeGreaterThanOrEqual(1024)
    const remote = makeBody('https://example.invalid/a.png')
    expect(meter.measure({ body: remote, serialized: writeJsonLossless(remote) })).toEqual({
      kind: 'unavailable',
    })
  })

  it('admits complete fixed Flash plan with estimated margin', () => {
    const definition = deepseekV41FlashDefinition
    const profile = createOfficialProfileContent(definition, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: deepseekV41FlashConfiguration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const request = testInput()
    const imageMessage = judgedMessage({
      type: 'user',
      id: 'vision-user',
      createdAt: at,
      blocks: [
        {
          id: 'vision-text',
          kind: 'text',
          text: 'Describe the image',
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'vision-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: 'eA==' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const result = planRequest(
      {
        ...request,
        messages: [...request.messages, imageMessage],
        routeName: definition.modelId,
        provider: 'deepinfra/fp8',
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
      },
      [definition],
      createDeepSeekV41FlashInputMeter(definition),
    )
    if ('rejected' in result) throw new Error(JSON.stringify(result))
    expect(result.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(result.planned.inputLimitEvidence.tokenMargin).toEqual({
      multiplier: 1.1,
      reserveTokens: 64,
    })
    expect(result.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(result.planned.serialized),
    )
    expect(result.planned.inputLimitEvidence.images).toBe(1)
    expect(result.planned.inputLimitEvidence.imageBytes).toEqual([1])
  })
})
