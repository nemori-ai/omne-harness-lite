import { imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Tokenizer } from '@huggingface/tokenizers'
import { imageSize } from 'image-size'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { at, judgedMessage, input as testInput, networkPolicy } from './support.ts'
import {
  createDeepSeekV41FlashInputMeter,
  referenceImageTokens,
  renderDeepSeekV41Prompt,
} from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { object } from '../src/json.ts'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/deepseek-v41-flash/${name}`, import.meta.url), 'utf8')
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

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
    const first = directFull(meter, { body, serialized: writeJsonLossless(body) })
    expect(first.kind).toBe('estimated')
    if (first.kind === 'unavailable') throw new Error('estimator unavailable')
    const changed = { ...body, provider: { ...body.provider, require_parameters: true } }
    const second = directFull(meter, { body: changed, serialized: writeJsonLossless(changed) })
    expect(second.kind).toBe('estimated')
    if (second.kind === 'unavailable') throw new Error('estimator unavailable')
    expect(Number(second.tokens)).toBeGreaterThan(Number(first.tokens))
    expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(() =>
      createDeepSeekV41FlashInputMeter({ ...deepseekV41FlashDefinition, revision: '1' }),
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

  it('matches official image processor grid vectors before private route transforms', () => {
    for (const [width, height, tokens] of [
      [1, 1, 184],
      [42, 42, 184],
      [600, 800, 322],
      [1024, 1024, 652],
      [4000, 6000, 990],
      [65535, 1, 1024],
      [1, 65535, 1024],
    ] as const)
      expect(referenceImageTokens(width, height)).toBe(tokens)
    expect(referenceImageTokens(0, 10)).toBeUndefined()
    expect(referenceImageTokens(65536, 1)).toBeUndefined()
  })

  it('counts each earlier and current decoded PNG image span across complete history', () => {
    const meter = createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)
    const images = [
      [
        'public-red-544.png',
        544,
        544,
        184,
        '25d49a363289e427414a8cc4ede861499569431630135063c3c4e09ba192b5ce',
      ],
      [
        'public-blue-1024.png',
        1024,
        1024,
        652,
        'cd282082985dd7623f38d4bf0d082314c7b0f519da0891dee14930247b4cf9f2',
      ],
      [
        'reference-green-1920x1080.png',
        1920,
        1080,
        968,
        '061a4c1a21c521cdb447d3bfa31e3d7f1f9cb0dda92b93a48cb4d1425c5434d0',
      ],
    ] as const
    const dataUrls = images.map(([name, width, height, span, digest]) => {
      const bytes = readFileSync(new URL(`./fixtures/deepseek-v41-flash/${name}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest)
      expect(imageSize(bytes)).toMatchObject({ width, height, type: 'png' })
      expect(referenceImageTokens(width, height)).toBe(span)
      return `data:image/png;base64,${bytes.toString('base64')}`
    })
    const measure = (earlier: string, current: string) => {
      const image = (url: string) => ({ type: 'image_url', image_url: { url } })
      const body = {
        model: deepseekV41FlashDefinition.modelId,
        messages: [
          { role: 'system', content: 'Describe colors accurately.' },
          { role: 'user', content: [{ type: 'text', text: 'First image.' }, image(earlier)] },
          { role: 'assistant', content: 'I see the first image.' },
          { role: 'user', content: [{ type: 'text', text: 'Second image.' }, image(current)] },
        ],
      }
      return directFull(meter, { body, serialized: writeJsonLossless(body) })
    }
    const [smallImage, mediumImage, largeImage] = dataUrls
    if (!smallImage || !mediumImage || !largeImage) throw new Error('missing PNG fixture')
    const baseline = measure(smallImage, smallImage)
    const changed = measure(smallImage, mediumImage)
    const large = measure(smallImage, largeImage)
    const changedEarlier = measure(mediumImage, smallImage)
    expect(measure('https://example.invalid/earlier.png', smallImage)).toEqual({
      kind: 'unavailable',
    })
    for (const result of [baseline, changed, large, changedEarlier])
      expect(result.kind).toBe('estimated')
    if (
      baseline.kind === 'unavailable' ||
      changed.kind === 'unavailable' ||
      large.kind === 'unavailable' ||
      changedEarlier.kind === 'unavailable'
    )
      throw new Error('known PNG spans were unavailable')
    expect(Number(changed.tokens) - Number(baseline.tokens)).toBe(652 - 184)
    expect(Number(large.tokens) - Number(baseline.tokens)).toBe(968 - 184)
    expect(Number(changedEarlier.tokens) - Number(baseline.tokens)).toBe(652 - 184)
  })

  it('uses documented dimension-based inline image projection and refuses unknown material', () => {
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
    const inline = makeBody(`data:image/png;base64,${tinyPng}`)
    const measured = directFull(meter, { body: inline, serialized: writeJsonLossless(inline) })
    expect(measured.kind).toBe('estimated')
    const textOnly = {
      model: deepseekV41FlashDefinition.modelId,
      messages: [{ role: 'user', content: 'describe' }],
    }
    const baseline = directFull(meter, { body: textOnly, serialized: writeJsonLossless(textOnly) })
    if (measured.kind === 'unavailable' || baseline.kind === 'unavailable')
      throw new Error('estimate unavailable')
    expect(Number(measured.tokens) - Number(baseline.tokens)).toBeGreaterThanOrEqual(183)
    expect(Number(measured.tokens) - Number(baseline.tokens)).toBeLessThan(1024)
    const invalid = makeBody('data:image/png;base64,aGVsbG8=')
    expect(directFull(meter, { body: invalid, serialized: writeJsonLossless(invalid) })).toEqual({
      kind: 'unavailable',
    })
    const remote = makeBody('https://example.invalid/a.png')
    expect(directFull(meter, { body: remote, serialized: writeJsonLossless(remote) })).toEqual({
      kind: 'unavailable',
    })
  })

  it('admits complete fixed Flash plan through bound transport factory', async () => {
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
          data: { inline: tinyPng },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const plannedInput = {
      ...request,
      messages: [...request.messages, imageMessage],
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
    const meter = createDeepSeekV41FlashInputMeter(definition)
    expect(() =>
      createPiAiTransport({
        imagePreparation,
        policy: networkPolicy,
        definitions: [
          { ...definition, implementation: { ...definition.implementation, revision: 'mp4-1' } },
        ],
        inputMeters: [meter],
      }),
    ).toThrow(TypeError)
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
    expect(result.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(result.planned.serialized),
    )
    expect(result.planned.inputLimitEvidence.images).toBe(1)
    expect(result.planned.inputLimitEvidence.imageBytes).toEqual([
      Buffer.from(tinyPng, 'base64').length,
    ])
  })
})
