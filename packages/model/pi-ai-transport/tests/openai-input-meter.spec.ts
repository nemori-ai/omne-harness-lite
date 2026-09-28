import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createOpenAiInputMeter } from '../src/openai-input-meter.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { planRequest } from '../src/plan.ts'
import { at, judgedMessage, input as testInput } from './support.ts'

const baseModel = 'openai/gpt-5.6-sol'
const baseModels = [baseModel, 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna']
const proModels = baseModels.map(id => `${id}-pro`)
const image = (name: string) =>
  readFileSync(new URL(`./fixtures/openai-meter/${name}`, import.meta.url))
const url = (name: string) => `data:image/png;base64,${image(name).toString('base64')}`

function definition(modelId: string) {
  const found = openaiDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing definition: ${modelId}`)
  return found
}

function measuredTokens(
  modelId: string,
  body: Parameters<ReturnType<typeof createOpenAiInputMeter>['measure']>[0]['body'],
) {
  const result = createOpenAiInputMeter(definition(modelId)).measure({
    body,
    serialized: writeJsonLossless(body),
  })
  if (result.kind !== 'estimated') throw new Error('expected estimated input')
  return Number(result.tokens)
}

function imageBody(modelId: string, imageUrl: string) {
  return {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
  }
}

describe('OpenAI model-specific input estimator', () => {
  it('matches independent OpenAI tiktoken 0.12.0 o200k_base vectors', () => {
    const encoding = getEncoding('o200k_base')
    expect(encoding.encode('Hello, 世界!')).toEqual([13225, 11, 185558, 0])
    expect(encoding.encode('{"role":"developer","content":"Remember the policy."}')).toEqual([
      10848, 8716, 7534, 77944, 4294, 3252, 7534, 43605, 290, 7562, 3692, 92,
    ])
    expect(encoding.encode('{"role":"tool","tool_call_id":"call_1","content":"sunny"}')).toEqual([
      10848, 8716, 7534, 17952, 4294, 17952, 25158, 1537, 7534, 9925, 62, 16, 4294, 3252, 7534,
      41133, 3008, 18583,
    ])
  })

  it('binds only six exact GPT-5.6 leaves and the fixed OpenAI provider', () => {
    for (const modelId of [...baseModels, ...proModels]) {
      const meter = createOpenAiInputMeter(definition(modelId))
      expect(meter).toMatchObject({ modelId, provider: 'openai', definitionRevision: '1' })
      expect(meter.algorithmRevision).toContain('gpt-5.6')
    }
    expect(() => createOpenAiInputMeter(definition('openai/gpt-6-astra'))).toThrow(TypeError)
    expect(() => createOpenAiInputMeter({ ...definition(baseModel), revision: '2' })).toThrow(
      TypeError,
    )
    expect(() => createOpenAiInputMeter({ ...definition(baseModel), routes: {} })).toThrow(
      TypeError,
    )
  })

  it('estimates full multi-turn, developer, tools, results and reasoning contribution', () => {
    const modelId = baseModel
    const body = {
      model: modelId,
      provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
      stream: true,
      store: false,
      reasoning: { effort: 'medium' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'You are a weather assistant.' }] },
        {
          role: 'developer',
          content: [{ type: 'text', text: 'Always cite the forecast source.' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris?' }] },
        {
          role: 'assistant',
          content: '',
          reasoning: 'Need the weather tool.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'Sunny, 22 C' },
        { role: 'user', content: [{ type: 'text', text: 'And tomorrow?' }] },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'weather',
            description: 'Read weather forecasts',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    }
    const complete = measuredTokens(modelId, body)
    expect(complete).toBeGreaterThan(0)
    expect(
      measuredTokens(modelId, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'developer'),
      }),
    ).not.toBe(complete)
    expect(measuredTokens(modelId, { ...body, tools: [] })).not.toBe(complete)
    expect(
      measuredTokens(modelId, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'tool'),
      }),
    ).not.toBe(complete)
    const { reasoning: _reasoning, ...withoutReasoning } = body
    expect(measuredTokens(modelId, withoutReasoning)).not.toBe(complete)
    const meter = createOpenAiInputMeter(definition(modelId))
    expect(meter.measure({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
  })

  it('applies official named-model image patch calculation; variants without a rule refuse images', () => {
    for (const modelId of baseModels) {
      const small = measuredTokens(modelId, imageBody(modelId, url('1x1.png')))
      const square = measuredTokens(modelId, imageBody(modelId, url('1024x1024.png')))
      // OpenAI's published 1024-square example is 1,229 tokens; 1x1 is ceil(1.2)=2.
      expect(square - small).toBe(1227)
    }
    for (const modelId of proModels) {
      const body = imageBody(modelId, url('1x1.png'))
      expect(
        createOpenAiInputMeter(definition(modelId)).measure({
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        measuredTokens(modelId, { model: modelId, messages: [{ role: 'user', content: 'hello' }] }),
      ).toBeGreaterThan(0)
    }
    const modelId = baseModel
    const remote = imageBody(modelId, 'https://example.invalid/a.png')
    const invalid = imageBody(modelId, 'data:image/png;base64,eA==')
    const meter = createOpenAiInputMeter(definition(modelId))
    expect(meter.measure({ body: remote, serialized: writeJsonLossless(remote) })).toEqual({
      kind: 'unavailable',
    })
    expect(meter.measure({ body: invalid, serialized: writeJsonLossless(invalid) })).toEqual({
      kind: 'unavailable',
    })
  })

  it('admits a real projected developer reminder and image, with external margin and exact bytes', () => {
    const selected = definition(baseModel)
    const profile = createOfficialProfileContent(selected, {
      providers: ['openai'],
      allowFallback: false,
      configuration: openaiConfiguration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const request = testInput()
    const inline = image('1024x1024.png')
    const visual = judgedMessage({
      type: 'user',
      id: 'visual',
      createdAt: at,
      blocks: [
        {
          id: 'visual-text',
          kind: 'text',
          text: 'Describe this image',
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'visual-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: inline.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const input = {
      ...request,
      routeName: selected.modelId,
      provider: 'openai',
      tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
      messages: [...request.messages, visual],
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
    const meter = createOpenAiInputMeter(selected)
    const planned = planRequest(input, [selected], meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.body.messages).toContainEqual({
      role: 'developer',
      content: [
        { type: 'text', text: '[system_reminder "system_reminder"]' },
        { type: 'text', text: 'keep going' },
      ],
    })
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.images).toBe(1)
    expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([inline.length])
    expect(planned.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(planned.planned.serialized),
    )
    const refused = planRequest(
      { ...input, tokenMargin: { multiplier: 1, reserveTokens: 922000 } },
      [selected],
      meter,
    )
    expect(refused).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
    })
  })
})
